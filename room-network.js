export const MAX_PLAYERS = 6;
export const validName = name => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 18 && !/[\u0000-\u001f\u007f]/.test(name);
export const validCode = code => typeof code === 'string' && /^[A-HJKMNP-Z2-9]{6}$/.test(code);
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 100;
const validRoster = roster => Array.isArray(roster) && roster.length >= 1 && roster.length <= MAX_PLAYERS && roster[0]?.id === 'host' && new Set(roster.map(player => player?.id)).size === roster.length && roster.every(player => player && validId(player.id) && validName(player.name));
const makeCode = () => {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => alphabet[byte % alphabet.length]).join('');
};

// One host owns the game. Doodle supplies a view per player to keep tasks private.
export function createRoom({ game, host, name, code, validState, validAction, onReady, onRoster, onStart, onState, onAction, onLeave = () => {}, onError, onStatus = () => {} }) {
  if (!['bumper', 'doodle', 'doodle-classic', 'bowling'].includes(game)) throw new Error('Unknown game.');
  if (!validName(name)) throw new Error('Enter a name using 1–18 characters.');
  if (!host && !validCode(code)) throw new Error('Enter the six-character room code.');
  if (!globalThis.Peer) throw new Error('The room service did not load. Refresh the page and try again.');
  code = host ? makeCode() : code;
  const prefix = `sugun-${game}-v1-`;
  let closed = false, ready = false, opened = false, started = false, server = null;
  let ownId = host ? 'host' : null, roster = host ? [{ id: 'host', name: name.trim() }] : [];
  let lastHostMessage = Date.now(), lastPing = 0, actionSequence = 0, stateSequence = 0, receivedState = -1;
  const connections = new Map(), pendingClose = new Set();
  const peer = host ? new globalThis.Peer(prefix + code) : new globalThis.Peer();
  const send = (connection, message) => {
    if (!closed && connection?.open) {
      try { connection.send(message); } catch { connection.close(); }
    }
  };
  const broadcast = message => { for (const record of connections.values()) if (record.ready) send(record.connection, message); };
  const publishRoster = () => { onRoster(roster); broadcast({ type: 'roster', roster }); };
  const close = () => {
    if (closed) return;
    closed = true; clearInterval(heartbeat); clearTimeout(deadline);
    for (const timer of pendingClose) clearTimeout(timer);
    for (const record of connections.values()) record.connection.close();
    connections.clear(); server?.close(); peer.destroy();
  };
  const fail = message => { if (!closed) { close(); onError(message); } };
  const remove = (id, expected) => {
    const record = connections.get(id);
    if (!record || closed || expected && record !== expected) return;
    connections.delete(id); record.connection.close();
    if (!record.ready) return;
    if (started) onLeave(id);
    else { roster = roster.filter(player => player.id !== id); publishRoster(); }
  };
  const reject = (record, reason) => {
    record.rejected = true;
    send(record.connection, { type: 'rejected', reason });
    const timer = setTimeout(() => { pendingClose.delete(timer); remove(record.connection.peer, record); }, 250);
    pendingClose.add(timer);
  };
  const stateFor = (value, id) => typeof value === 'function' ? value(id) : value;
  const sendStates = (type, value) => {
    const sequence = ++stateSequence;
    for (const [id, record] of connections) if (record.ready) {
      const state = stateFor(value, id);
      if (validState(state)) send(record.connection, { type, state, sequence });
    }
  };
  const deadline = setTimeout(() => fail('Could not open the room. Check the code and connection, then try again. Some networks block game connections.'), 18000);
  const heartbeat = setInterval(() => {
    if (closed) return;
    const now = Date.now();
    if (host) {
      for (const [id, record] of connections) if (now - record.lastSeen > 18000) remove(id);
      if (now - lastPing > 3000) { broadcast({ type: 'ping' }); lastPing = now; }
    } else if (ready && now - lastHostMessage > 20000) fail('The host stopped responding. Return to the lobby and create a new room.');
  }, 500);

  peer.on('open', () => {
    if (closed) return;
    if (opened) { onStatus('Room service reconnected.'); return; }
    opened = true;
    if (host) { ready = true; clearTimeout(deadline); onReady({ code, id: ownId }); publishRoster(); }
    else {
      server = peer.connect(prefix + code, { reliable: true, serialization: 'json' });
      server.on('open', () => send(server, { type: 'hello', name: name.trim() }));
      server.on('data', message => {
        if (closed || !message || typeof message !== 'object' || Array.isArray(message)) return;
        if (message.type === 'rejected') {
          const reasons = ['This room is full.', 'This game has already started.', 'Choose a valid player name.'];
          fail(reasons.includes(message.reason) ? message.reason : 'The host could not accept this connection.'); return;
        }
        if (message.type === 'welcome' && !ready && validRoster(message.roster) && message.id === peer.id && message.roster.some(player => player.id === message.id)) {
          ready = true; ownId = message.id; roster = message.roster; lastHostMessage = Date.now(); clearTimeout(deadline);
          onReady({ code, id: ownId }); onRoster(roster);
        } else if (ready && message.type === 'ping') { lastHostMessage = Date.now(); send(server, { type: 'pong' }); }
        else if (ready && message.type === 'roster' && !started && validRoster(message.roster) && message.roster.some(player => player.id === ownId)) { lastHostMessage = Date.now(); roster = message.roster; onRoster(roster); }
        else if (ready && ['start', 'state'].includes(message.type) && Number.isSafeInteger(message.sequence) && message.sequence > receivedState && validState(message.state)) {
          if (!started && message.type !== 'start') return;
          receivedState = message.sequence; lastHostMessage = Date.now();
          if (!started) { started = true; onStart(message.state); }
          else onState(message.state);
        }
      });
      server.on('close', () => fail('The host left the room. Return to the lobby and create or join a new room.'));
      server.on('error', () => fail('Could not connect to the host. Ask them to keep the room open, or try another network.'));
    }
  });
  peer.on('connection', connection => {
    if (!host || closed || !validId(connection.peer) || connections.size >= 12 || connections.has(connection.peer) || roster.some(player => player.id === connection.peer)) { connection.close(); return; }
    const record = { connection, ready: false, rejected: false, lastSeen: Date.now(), sequence: -1, window: Date.now(), count: 0 };
    connections.set(connection.peer, record);
    connection.on('data', message => {
      if (closed || connections.get(connection.peer) !== record || record.rejected || !message || typeof message !== 'object' || Array.isArray(message)) return;
      const now = Date.now();
      if (now - record.window >= 1000) { record.window = now; record.count = 0; }
      if (++record.count > 90) return;
      if (message.type === 'hello' && !record.ready) {
        if (started) { reject(record, 'This game has already started.'); return; }
        if (roster.length >= MAX_PLAYERS) { reject(record, 'This room is full.'); return; }
        if (!validName(message.name)) { reject(record, 'Choose a valid player name.'); return; }
        record.ready = true; record.lastSeen = now;
        roster = [...roster, { id: connection.peer, name: message.name.trim() }];
        send(connection, { type: 'welcome', id: connection.peer, roster }); publishRoster();
      } else if (record.ready && message.type === 'pong') record.lastSeen = now;
      else if (record.ready && started && message.type === 'action' && Number.isSafeInteger(message.sequence) && message.sequence > record.sequence && message.sequence < 2147483647 && validAction(message.action)) {
        record.sequence = message.sequence; record.lastSeen = now; onAction(connection.peer, message.action);
      }
    });
    connection.on('close', () => remove(connection.peer, record));
    connection.on('error', () => remove(connection.peer, record));
  });
  peer.on('error', error => {
    const messages = {
      'peer-unavailable': 'Room not found. Check the code and ask the host to keep their room open.',
      'unavailable-id': 'That room code is in use. Create a room again for a fresh code.',
      'network': 'The room service is unreachable. Check your connection and try again.',
      'browser-incompatible': 'This browser cannot open a game connection. Try a current version of Chrome, Safari, Firefox or Edge.',
    };
    fail(messages[error.type] ?? 'The game connection failed. Return to the lobby and try again.');
  });
  peer.on('disconnected', () => {
    if (closed) return;
    onStatus('Room service reconnecting. Keep this tab open.');
    if (!peer.destroyed) peer.reconnect();
  });
  return {
    code, host, close,
    start(value) {
      if (closed || !host || !ready || started || roster.length < 2 || !validState(stateFor(value, ownId))) return;
      started = true; sendStates('start', value); onStart(stateFor(value, ownId));
    },
    broadcastState(value) { if (host && started && !closed) sendStates('state', value); },
    sendAction(action) {
      if (!ready || !started || closed || !validAction(action)) return;
      if (host) onAction(ownId, action);
      else send(server, { type: 'action', action, sequence: ++actionSequence });
    },
  };
}
