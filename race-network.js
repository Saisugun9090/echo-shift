import { validInput, validName, validSnapshot } from './race-engine.js';

const PREFIX = 'sugun-formula-v1-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const validCode = code => typeof code === 'string' && /^[A-HJKMNP-Z2-9]{6}$/.test(code);
const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => ALPHABET[byte % ALPHABET.length]).join('');
const validRoster = roster => Array.isArray(roster) && roster.length >= 1 && roster.length <= 4 && new Set(roster.map(driver => driver?.id)).size === roster.length && roster.every(driver => driver && typeof driver.id === 'string' && driver.id.length <= 100 && validName(driver.name));

export function createRaceRoom({ host, name, code, onReady, onRoster, onStart, onState, onInput, onLeave, onError, onStatus }) {
  if (!validName(name)) throw new Error('Enter a driver name using 1–18 characters.');
  if (!host && !validCode(code)) throw new Error('Enter the six-character room code.');
  if (!globalThis.Peer) throw new Error('The room service did not load. Refresh the page, or choose Practice.');
  code = host ? makeCode() : code;
  let closed = false, ready = false, started = false, opened = false, server = null, ownId = host ? 'host' : null;
  let roster = host ? [{ id: 'host', name: name.trim() }] : [];
  let lastHostMessage = Date.now(), lastPing = 0, inputSequence = 0;
  const connections = new Map(), pendingClose = new Set();
  const peer = host ? new Peer(PREFIX + code) : new Peer();
  const send = (connection, message) => {
    if (!closed && connection?.open) {
      try { connection.send(message); } catch { connection.close(); }
    }
  };
  const broadcast = message => { for (const record of connections.values()) if (record.ready) send(record.connection, message); };
  const publishRoster = () => { onRoster(roster); broadcast({ type: 'roster', roster }); };
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat); clearTimeout(deadline);
    for (const timer of pendingClose) clearTimeout(timer);
    for (const record of connections.values()) record.connection.close();
    connections.clear(); server?.close(); peer.destroy();
  };
  const fail = message => { if (!closed) { close(); onError(message); } };
  const remove = id => {
    const record = connections.get(id);
    if (!record || closed) return;
    connections.delete(id);
    record.connection.close();
    if (!record.ready) return;
    if (started) onLeave(id);
    else { roster = roster.filter(driver => driver.id !== id); publishRoster(); }
  };
  const reject = (connection, reason) => {
    send(connection, { type: 'rejected', reason });
    // Give the rejection packet a chance to arrive before the channel is closed.
    const timer = setTimeout(() => { pendingClose.delete(timer); connection.close(); }, 250);
    pendingClose.add(timer);
  };
  const deadline = setTimeout(() => fail('Could not open the room. Check the code and connection, then try again. Some work or school networks block game connections.'), 18000);
  const heartbeat = setInterval(() => {
    if (closed) return;
    const now = Date.now();
    if (host) {
      for (const [id, record] of connections) {
        if (now - record.lastSeen > 18000) { remove(id); continue; }
        if (record.ready && started && now - record.lastInput > 600) onInput(id, { steer: 0, throttle: 0, brake: 0 });
      }
      if (now - lastPing > 3000) { broadcast({ type: 'ping' }); lastPing = now; }
    } else if (ready && now - lastHostMessage > 20000) fail('The host stopped responding. Return to the lobby and create a new room.');
  }, 500);

  peer.on('open', () => {
    if (closed) return;
    if (opened) { onStatus('Room service reconnected.'); return; }
    opened = true;
    if (host) { ready = true; clearTimeout(deadline); onReady({ code, id: ownId }); publishRoster(); }
    else {
      server = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      server.on('open', () => send(server, { type: 'hello', name: name.trim() }));
      server.on('data', message => {
        if (closed || !message || typeof message !== 'object' || Array.isArray(message)) return;
        if (message.type === 'rejected') { fail(['This room is full.', 'This race has already started.', 'Choose a valid driver name.'].includes(message.reason) ? message.reason : 'The host could not accept this connection.'); return; }
        if (message.type === 'welcome' && !ready && validRoster(message.roster) && typeof message.id === 'string' && message.id === peer.id && message.roster.some(driver => driver.id === message.id)) {
          ready = true; ownId = message.id; roster = message.roster; lastHostMessage = Date.now(); clearTimeout(deadline);
          onReady({ code, id: ownId }); onRoster(roster);
        } else if (ready && message.type === 'ping') { lastHostMessage = Date.now(); send(server, { type: 'pong' }); }
        else if (ready && message.type === 'roster' && !started && validRoster(message.roster)) { lastHostMessage = Date.now(); roster = message.roster; onRoster(roster); }
        else if (ready && ['start', 'state'].includes(message.type) && validSnapshot(message.state) && message.state.cars.some(car => car.id === ownId) && (typeof message.state.paused === 'undefined' || typeof message.state.paused === 'boolean')) {
          lastHostMessage = Date.now();
          if (!started && message.type === 'start') { started = true; onStart(message.state); }
          else if (started && message.type === 'state') onState(message.state);
        }
      });
      server.on('close', () => fail('The host left the room. Return to the lobby and create or join a new room.'));
      server.on('error', () => fail('Could not connect to the host. Ask them to keep the room open, or try another network.'));
    }
  });
  peer.on('connection', connection => {
    if (!host || closed) { connection.close(); return; }
    if (typeof connection.peer !== 'string' || !connection.peer.length || connection.peer.length > 100 || connections.size >= 8 || connections.has(connection.peer) || roster.some(driver => driver.id === connection.peer)) { connection.close(); return; }
    const record = { connection, ready: false, lastSeen: Date.now(), lastInput: 0, sequence: -1 };
    connections.set(connection.peer, record);
    connection.on('data', message => {
      if (closed || !message || typeof message !== 'object' || Array.isArray(message)) return;
      if (message.type === 'hello' && !record.ready) {
        if (started) { reject(connection, 'This race has already started.'); return; }
        if (roster.length >= 4) { reject(connection, 'This room is full.'); return; }
        if (!validName(message.name)) { reject(connection, 'Choose a valid driver name.'); return; }
        record.ready = true; record.lastSeen = Date.now();
        roster = [...roster, { id: connection.peer, name: message.name.trim() }];
        send(connection, { type: 'welcome', id: connection.peer, roster }); publishRoster();
      } else if (record.ready && message.type === 'pong') record.lastSeen = Date.now();
      else if (record.ready && started && message.type === 'input' && validInput(message.input) && Number.isSafeInteger(message.sequence) && message.sequence > record.sequence && message.sequence < 2147483647) {
        record.sequence = message.sequence; record.lastInput = record.lastSeen = Date.now(); onInput(connection.peer, message.input);
      }
    });
    connection.on('close', () => remove(connection.peer));
    connection.on('error', () => remove(connection.peer));
  });
  peer.on('error', error => {
    const messages = {
      'peer-unavailable': 'Room not found. Check the code and ask the host to keep their room open.',
      'unavailable-id': 'That room code is in use. Create a room again for a fresh code.',
      'network': 'The room service is unreachable. Check your connection, then try again or choose Practice.',
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
    start(state) { if (host && ready && !started && roster.length >= 2 && validSnapshot(state)) { started = true; broadcast({ type: 'start', state }); onStart(state); } },
    broadcastState(state) { if (host && started) broadcast({ type: 'state', state }); },
    sendInput(input) { if (!host && ready && started && validInput(input)) send(server, { type: 'input', input, sequence: ++inputSequence }); },
  };
}
