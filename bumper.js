import { ARENA, COLORS, ROUND_SECONDS, createBash, neutralAction, rankPlayers, stepBash, validAction, validState } from './bumper-engine.js?v=party-20260916';
import { createRoom } from './room-network.js?v=party-20260916';

const $ = id => document.getElementById(id);
const canvas = $('bumper-canvas'), ctx = canvas.getContext('2d');
const held = new Set(), inputs = Object.create(null), visuals = new Map();
const preview = createBash(COLORS.map((_, index) => ({ id: `preview-${index}`, name: String(index + 1).padStart(2, '0') })));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let state = null, room = null, mode = 'menu', myId = 'host', roster = [], practicePaused = false;
let simulation = null, transfer = null, lastSimulation = 0, lastSnapshot = 0, accumulator = 0, lastFrame = 0, lastHud = 0, shownFinish = false, lastBanner = '';
const action = () => ({ x: Number(held.has('right')) - Number(held.has('left')), y: Number(held.has('down')) - Number(held.has('up')) });
function status(message, error = false) { $('connection-status').textContent = message; $('connection-status').classList.toggle('error', error); }
function clearInput() {
  held.clear(); document.querySelectorAll('[data-control]').forEach(button => button.classList.remove('held'));
  if (mode === 'guest') room?.sendAction(neutralAction());
  if (mode !== 'guest') inputs[myId] = { action: neutralAction(), receivedAt: performance.now() };
}
function setBusy(busy) { $('create-room').disabled = busy; $('join-form').querySelector('button').disabled = busy; $('practice').disabled = busy; }
function showBanner(label, title, detail = '', kind = '') {
  const value = `${label}|${title}|${detail}|${kind}`;
  if (value === lastBanner) return;
  lastBanner = value;
  const element = $('arena-banner'); element.hidden = !title; element.className = `arena-banner ${kind}`;
  element.querySelector('span').textContent = label; element.querySelector('strong').textContent = title; element.querySelector('p').textContent = detail;
}
function toLobby(message = 'Create a room, join your friends or try a solo round.', error = false) {
  clearInterval(simulation); clearInterval(transfer); simulation = transfer = null;
  clearInput(); room?.close(); room = null; state = null; mode = 'menu'; roster = []; practicePaused = false; visuals.clear();
  for (const id of Object.keys(inputs)) delete inputs[id];
  $('setup').hidden = false; $('room-panel').hidden = true; $('session-panel').hidden = true; setBusy(false);
  document.body.classList.remove('playing'); $('mode-label').textContent = 'THE STAR YARD'; $('time-left').textContent = '01:30'; $('my-score').textContent = '0 ★';
  $('game-status').textContent = 'One point per star. Everyone stays in.'; $('time-left').parentElement.classList.remove('urgent');
  showBanner('WELCOME TO THE STAR YARD', 'Make some room.', 'Bump your friends. Keep the stars.'); status(message, error);
}
function playerName() {
  const name = $('player-name').value.trim();
  if (!name || name.length > 18 || /[\u0000-\u001f\u007f]/.test(name)) { status('Enter a name using 1–18 characters.', true); $('player-name').focus(); return null; }
  return name;
}
function drawRoster(players, target, scoring = false) {
  target.replaceChildren(...players.map((player, index) => {
    const row = document.createElement('li'), swatch = document.createElement('span'), name = document.createElement('span'), detail = document.createElement('span');
    swatch.className = 'swatch'; swatch.style.background = COLORS[player.color ?? index];
    name.textContent = `${player.name}${player.id === myId ? ' (you)' : ''}`;
    detail.className = 'score-detail'; detail.textContent = scoring ? `${player.score} ★${player.connected ? '' : ' · LEFT'}` : player.id === 'host' ? 'HOST' : 'READY';
    row.append(swatch, name, detail); return row;
  }));
}
function connect(host) {
  const name = playerName(); if (!name) return;
  setBusy(true); mode = host ? 'host' : 'guest'; status(host ? 'Opening your room…' : 'Connecting to the room…');
  try {
    room = createRoom({ game: 'bumper', host, name, code: $('join-code').value.trim().toUpperCase(), validState, validAction,
      onReady: ({ code, id }) => {
        myId = id; $('setup').hidden = true; $('room-panel').hidden = false; $('session-panel').hidden = true;
        $('room-code').value = code; $('copy-code').textContent = 'Copy'; $('start-game').hidden = !host;
        status(host ? 'Your room is open. Share the code with your friends.' : 'You are in! The host will start the round.');
      },
      onRoster: players => {
        roster = players; drawRoster(players, $('roster')); $('start-game').disabled = players.length < 2;
        $('room-help').textContent = `${players.length}/6 players. ${host ? players.length < 2 ? 'Waiting for a friend.' : 'Ready when your crew is.' : 'The host starts the bash.'}`;
      },
      onStart: beginGame,
      onState: snapshot => { if (state && snapshot.phase === 'countdown' && snapshot.time < state.time) beginGame(snapshot); else state = snapshot; },
      onAction: (id, input) => { inputs[id] = { action: { x: input.x, y: input.y }, receivedAt: performance.now() }; },
      onLeave: id => {
        roster = roster.filter(player => player.id !== id);
        if (!state) return;
        const car = state.cars.find(player => player.id === id);
        if (car) { car.connected = false; car.vx = car.vy = 0; delete inputs[id]; status(`${car.name} left. The rest of you can keep playing.`); }
      },
      onError: message => toLobby(message, true), onStatus: message => status(message),
    });
  } catch (error) { toLobby(error.message, true); }
}
function beginGame(initial) {
  state = initial; shownFinish = false; practicePaused = false; clearInput(); visuals.clear(); accumulator = 0;
  for (const id of Object.keys(inputs)) delete inputs[id];
  $('setup').hidden = true; $('room-panel').hidden = true; $('session-panel').hidden = false; $('session-title').textContent = 'Star chasers.';
  $('pause-game').hidden = mode !== 'practice'; $('pause-game').textContent = 'Pause practice'; $('rematch').hidden = true;
  $('mode-label').textContent = mode === 'practice' ? 'SOLO WARM-UP' : `ROOM ${room.code}`; document.body.classList.add('playing');
  $('game-status').textContent = 'Collect gold stars. Bump your friends. Everyone stays in.';
  status(mode === 'practice' ? 'Solo warm-up. Collect as many stars as you can.' : mode === 'host' ? 'Hosting. Keep this tab visible; hiding it pauses everyone.' : 'Connected. Use the arrow keys or direction pad to move.');
  clearInterval(simulation); clearInterval(transfer);
  if (mode !== 'guest') {
    lastSimulation = performance.now(); lastSnapshot = 0;
    simulation = setInterval(() => {
      if (!state) return;
      const now = performance.now(), elapsed = Math.min(.1, (now - lastSimulation) / 1000); lastSimulation = now;
      state.paused = practicePaused || document.hidden;
      inputs[myId] = { action: action(), receivedAt: now };
      if (!state.paused) {
        accumulator += elapsed;
        while (accumulator >= 1 / 60) { stepBash(state, inputs, 1 / 60, now); accumulator -= 1 / 60; }
      } else accumulator = 0;
      if (mode === 'host' && now - lastSnapshot >= 80) { room?.broadcastState(state); lastSnapshot = now; }
    }, 1000 / 60);
  } else transfer = setInterval(() => { if (state && state.phase !== 'finished') room?.sendAction(document.hidden ? neutralAction() : action()); }, 50);
  canvas.focus({ preventScroll: true });
  if (matchMedia('(max-width: 760px)').matches) canvas.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
}
function practice() {
  const name = playerName(); if (!name) return;
  toLobby(); mode = 'practice'; myId = 'host'; beginGame(createBash([{ id: myId, name }]));
}
function rematch() {
  if (mode === 'practice') { beginGame(createBash([{ id: myId, name: state.cars[0].name }])); return; }
  if (mode !== 'host') return;
  if (roster.length < 2) { status('A new online round needs at least two players. Leave this game to open a new room.', true); return; }
  beginGame(createBash(roster)); room.broadcastState(state);
}
function togglePause() {
  if (mode !== 'practice' || !state || state.phase === 'finished') return;
  practicePaused = !practicePaused; clearInput(); $('pause-game').textContent = practicePaused ? 'Resume practice' : 'Pause practice';
}
function updateHud() {
  if (!state) return;
  const car = state.cars.find(player => player.id === myId), seconds = Math.max(0, Math.ceil(ROUND_SECONDS - Math.max(0, state.time)));
  $('time-left').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('time-left').parentElement.classList.toggle('urgent', seconds <= 10); $('my-score').textContent = `${car?.score ?? 0} ★`;
  const ranked = rankPlayers(state); drawRoster(ranked, $('scores'), true);
  if (state.phase === 'finished') {
    const eligible = ranked.filter(player => player.connected), leaders = eligible.filter(player => player.score === eligible[0]?.score);
    const title = mode === 'practice' ? `${car.score} stars. Nice run!` : leaders.length > 1 ? 'A shared victory!' : leaders.length ? `${leaders[0].name} wins!` : 'Round complete.';
    const detail = mode === 'practice' ? 'Ready to beat your score?' : leaders.length ? `${leaders.map(player => player.name).join(' + ')} · ${leaders[0].score} stars` : 'Thanks for playing.';
    showBanner('THE STARS HAVE SPOKEN', title, detail, 'result');
    if (!shownFinish) {
      shownFinish = true; clearInput(); $('session-title').textContent = 'Final scores.'; $('pause-game').hidden = true; $('rematch').hidden = mode === 'guest';
      $('game-status').textContent = `${title} ${mode === 'guest' ? 'The host can start another round.' : 'Play again for a rematch.'}`;
    }
  } else if (state.paused) showBanner('TAKE A BREATHER', 'Paused.', mode === 'guest' ? 'The round resumes when the host returns.' : practicePaused ? 'Press Resume practice or P.' : 'Return to this tab to resume.');
  else if (state.time < 0) showBanner('GET READY TO BUMP', String(Math.ceil(-state.time)), 'Move with arrow keys, WASD or the direction pad.', 'countdown');
  else showBanner('', '');
}

function star(x, y, size, color) {
  ctx.beginPath();
  for (let index = 0; index < 10; index++) { const angle = index * Math.PI / 5 - Math.PI / 2, radius = index % 2 ? size * .45 : size; const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius; if (index === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}
function drawArena() {
  ctx.fillStyle = '#223b3d'; ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  ctx.fillStyle = '#37635b'; ctx.beginPath(); ctx.roundRect(31, 31, 1138, 698, 48); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.roundRect(42, 42, 1116, 676, 38); ctx.clip();
  ctx.strokeStyle = '#426e64'; ctx.lineWidth = 1;
  for (let x = 0; x < ARENA.width; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ARENA.height); ctx.stroke(); }
  for (let y = 0; y < ARENA.height; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ARENA.width, y); ctx.stroke(); }
  ctx.strokeStyle = '#568075'; ctx.lineWidth = 2; ctx.setLineDash([7, 12]); ctx.beginPath(); ctx.arc(600, 380, 170, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#467368'; ctx.textAlign = 'center'; ctx.font = '900 66px "Segoe UI",sans-serif'; ctx.fillText('STAR YARD', 600, 393); ctx.font = '700 12px "Segoe UI",sans-serif'; ctx.fillText('B U M P   /   C O L L E C T   /   R E P E A T', 600, 424);
  ctx.restore();
  ctx.strokeStyle = '#92bca0'; ctx.lineWidth = 9; ctx.beginPath(); ctx.roundRect(34, 34, 1132, 692, 46); ctx.stroke();
  ctx.strokeStyle = '#f2c88a'; ctx.lineWidth = 9; ctx.setLineDash([32, 50]); ctx.stroke(); ctx.setLineDash([]);
  for (const [x, y] of [[30, 30], [1170, 30], [30, 730], [1170, 730]]) { ctx.fillStyle = '#ff816d'; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill(); }
  for (const item of (state ?? preview).stars) { ctx.fillStyle = '#253e3480'; ctx.beginPath(); ctx.ellipse(item.x + 2, item.y + 10, 13, 6, 0, 0, Math.PI * 2); ctx.fill(); star(item.x, item.y, 15, '#ffdc85'); star(item.x - 2, item.y - 2, 8, '#fff0b1'); }
}
function drawCar(car, delta) {
  let visual = visuals.get(car.id);
  if (!visual) { visual = { x: car.x, y: car.y, angle: car.angle }; visuals.set(car.id, visual); }
  const amount = mode === 'guest' && !reducedMotion ? 1 - Math.exp(-20 * delta) : 1;
  visual.x += (car.x - visual.x) * amount; visual.y += (car.y - visual.y) * amount;
  visual.angle += Math.atan2(Math.sin(car.angle - visual.angle), Math.cos(car.angle - visual.angle)) * amount;
  ctx.save(); ctx.globalAlpha = car.connected ? 1 : .25; ctx.translate(visual.x, visual.y);
  if (car.id === myId && state) { ctx.strokeStyle = '#fff5d7'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 31, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = '#162f2c80'; ctx.beginPath(); ctx.ellipse(4, 9, 29, 24, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.rotate(visual.angle); ctx.fillStyle = '#233339'; ctx.beginPath(); ctx.roundRect(-29, -23, 58, 46, 18); ctx.fill();
  ctx.strokeStyle = '#72988d'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = COLORS[car.color]; ctx.beginPath(); ctx.roundRect(-23, -18, 46, 36, 14); ctx.fill();
  ctx.fillStyle = '#f4f0d8'; ctx.beginPath(); ctx.roundRect(13, -11, 5, 22, 2); ctx.fill(); ctx.fillStyle = '#243e42'; ctx.beginPath(); ctx.roundRect(-12, -12, 19, 24, 7); ctx.fill();
  ctx.fillStyle = '#ecd1b2'; ctx.beginPath(); ctx.arc(-4, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.textAlign = 'center'; ctx.font = '700 13px "Segoe UI",sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = '#244d44'; ctx.strokeText(car.name, 0, -40); ctx.fillStyle = '#fff6dc'; ctx.fillText(car.name, 0, -40);
  ctx.restore();
}
function frame(now) {
  const delta = Math.min(.05, (now - lastFrame) / 1000 || 1 / 60); lastFrame = now;
  drawArena(); for (const car of (state ?? preview).cars) drawCar(car, delta);
  if (now - lastHud > 120) { updateHud(); lastHud = now; }
  requestAnimationFrame(frame);
}

$('create-room').addEventListener('click', () => connect(true));
$('join-form').addEventListener('submit', event => { event.preventDefault(); connect(false); });
$('practice').addEventListener('click', practice);
$('start-game').addEventListener('click', () => { if (room?.host && roster.length >= 2) room.start(createBash(roster)); });
$('leave-room').addEventListener('click', () => toLobby()); $('back-lobby').addEventListener('click', () => toLobby());
$('pause-game').addEventListener('click', togglePause); $('rematch').addEventListener('click', rematch);
$('copy-code').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('room-code').value); $('copy-code').textContent = 'Copied'; }
  catch { $('room-code').select(); status('Select and copy the room code above.'); }
});
const keyControls = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
addEventListener('keydown', event => {
  if (!state || /INPUT|TEXTAREA/.test(event.target.tagName)) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key, direction = keyControls[key];
  if (direction) { event.preventDefault(); held.add(direction); }
  if (key === 'p' && !event.repeat) { event.preventDefault(); togglePause(); }
});
addEventListener('keyup', event => { const key = event.key.length === 1 ? event.key.toLowerCase() : event.key; if (keyControls[key]) { held.delete(keyControls[key]); if (mode === 'guest') room?.sendAction(action()); } });
document.querySelectorAll('[data-control]').forEach(button => {
  button.addEventListener('pointerdown', event => { event.preventDefault(); if (!state) return; button.setPointerCapture(event.pointerId); held.add(button.dataset.control); button.classList.add('held'); });
  const release = () => { held.delete(button.dataset.control); button.classList.remove('held'); if (mode === 'guest') room?.sendAction(action()); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
});
addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => {
  clearInput(); lastSimulation = performance.now(); accumulator = 0;
  if (state && mode !== 'guest') { state.paused = practicePaused || document.hidden; if (mode === 'host') room?.broadcastState(state); }
});
addEventListener('pagehide', () => toLobby());
requestAnimationFrame(frame);
