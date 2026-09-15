import { COLORS, createRace, LAPS, neutralInput, rankCars, stepRace, TRACK, trackPoint, validName } from './race-engine.js';
import { createRaceRoom } from './race-network.js';

const $ = id => document.getElementById(id);
const canvas = $('race-canvas'), context = canvas.getContext('2d');
const previewCars = createRace([{ id: 'preview', name: '01' }]).cars;
const held = new Set(), remoteInputs = Object.create(null), visualCars = new Map();
let state = null, room = null, mode = 'menu', myId = 'host', roster = [], paused = false, finishedShown = false;
let simulation = null, transfer = null, lastSimulation = 0, accumulator = 0, lastFrame = 0, lastHud = 0, lastSnapshot = 0, lastBanner = '';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const timeText = time => {
  const milliseconds = Math.max(0, Math.floor(time * 1000));
  return `${String(Math.floor(milliseconds / 60000)).padStart(2, '0')}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`;
};
const input = () => ({ steer: Number(held.has('right')) - Number(held.has('left')), throttle: Number(held.has('throttle')), brake: Number(held.has('brake')) });
function clearInput() { held.clear(); document.querySelectorAll('[data-control]').forEach(button => button.classList.remove('held')); if (mode === 'guest') room?.sendInput(neutralInput()); }
function status(message, error = false) { $('connection-status').textContent = message; $('connection-status').classList.toggle('error', error); }
function setBusy(busy) { $('create-room').disabled = busy; $('join-form').querySelector('button').disabled = busy; $('practice').disabled = busy; }
function banner(label, title, detail = '', kind = '') {
  const value = `${label}|${title}|${detail}|${kind}`;
  if (value === lastBanner) return;
  lastBanner = value;
  const element = $('track-banner');
  element.hidden = !title;
  element.className = `track-banner ${kind}`;
  element.querySelector('span').textContent = label;
  element.querySelector('strong').textContent = title;
  element.querySelector('p').textContent = detail;
}
function stopSession() {
  clearInterval(simulation); clearInterval(transfer); simulation = transfer = null;
  room?.close(); room = null; clearInput();
  for (const key of Object.keys(remoteInputs)) delete remoteInputs[key];
  state = null; visualCars.clear(); roster = []; paused = false; mode = 'menu'; finishedShown = false;
  document.body.classList.remove('playing');
  $('setup').hidden = false; $('room-panel').hidden = true; $('session-panel').hidden = true; setBusy(false);
  $('race-status').textContent = 'Ready.';
  $('mode-label').textContent = 'SUGUN PARK'; $('race-time').textContent = '00:00.000';
  $('lap-display').innerHTML = '03 <small>LAPS</small>'; $('speed-display').innerHTML = '000 <small>KM/H</small>';
  banner('THE CIRCUIT', 'Sugun Park', 'Three laps · Clockwise');
}
function toLobby(message = 'Choose practice or create a room.', error = false) { stopSession(); status(message, error); }
function driverName() {
  const name = $('driver-name').value.trim();
  if (!validName(name)) { status('Enter a driver name using 1–18 characters.', true); $('driver-name').focus(); return null; }
  return name;
}
function drawRoster(list, target, racing = false) {
  target.replaceChildren(...list.map((driver, index) => {
    const row = document.createElement('li'), swatch = document.createElement('span'), name = document.createElement('span'), detail = document.createElement('span');
    swatch.className = 'swatch'; swatch.style.background = COLORS[driver.color ?? index];
    name.textContent = `${racing ? `${index + 1}. ` : ''}${driver.name}${driver.id === myId ? ' (you)' : ''}`;
    detail.className = 'driver-detail';
    detail.textContent = racing ? !driver.connected ? 'LEFT' : driver.finishedAt !== null ? timeText(driver.finishedAt) : `LAP ${Math.min(LAPS, driver.laps + 1)}` : driver.id === 'host' ? 'HOST' : 'READY';
    row.append(swatch, name, detail); return row;
  }));
}
function connect(host) {
  const name = driverName(); if (!name) return;
  setBusy(true); status(host ? 'Opening your room…' : 'Connecting to the room…');
  mode = host ? 'host' : 'guest';
  try {
    room = createRaceRoom({
      host, name, code: $('join-code').value.trim().toUpperCase(),
      onReady: ({ code, id }) => {
        myId = id; $('setup').hidden = true; $('room-panel').hidden = false; $('session-panel').hidden = true;
        $('room-code').value = code; $('copy-code').textContent = 'Copy'; $('start-race').hidden = !host;
        status(host ? 'Room open. Share the code with a friend.' : 'Connected. Wait for the host to start.');
      },
      onRoster: drivers => {
        roster = drivers; drawRoster(roster, $('roster'));
        $('start-race').disabled = drivers.length < 2;
        $('room-help').textContent = `${drivers.length}/4 drivers. ${host ? drivers.length < 2 ? 'Waiting for a friend to join.' : 'Everyone here? Start when you are ready.' : 'The host starts the race.'}`;
      },
      onStart: initial => beginRace(initial),
      onState: snapshot => { state = snapshot; },
      onInput: (id, controls) => { remoteInputs[id] = controls; },
      onLeave: id => {
        if (!state) return;
        const car = state.cars.find(candidate => candidate.id === id);
        if (car) { car.connected = false; car.speed = 0; remoteInputs[id] = neutralInput(); status(`${car.name} left the race.`); }
      },
      onError: message => toLobby(message, true),
      onStatus: message => status(message),
    });
  } catch (error) { toLobby(error.message, true); }
}
function beginRace(initial) {
  state = initial; finishedShown = false; paused = false; clearInput(); visualCars.clear(); accumulator = 0;
  $('setup').hidden = true; $('room-panel').hidden = true; $('session-panel').hidden = false;
  $('restart-race').hidden = true; $('pause-race').hidden = mode !== 'practice'; $('pause-race').textContent = 'Pause practice';
  $('session-title').textContent = 'Race';
  $('mode-label').textContent = mode === 'practice' ? 'SOLO TIME TRIAL' : `ROOM ${room.code}`;
  document.body.classList.add('playing');
  $('race-status').textContent = 'Clockwise. Use gas to launch, steer right into the first turn.';
  status(mode === 'practice' ? 'Solo time trial. Complete three laps.' : mode === 'host' ? 'Hosting. Keep this tab open; hiding it pauses the race for everyone.' : 'Connected to host. Three laps to the finish.');
  clearInterval(simulation); clearInterval(transfer);
  if (mode !== 'guest') {
    lastSimulation = performance.now();
    simulation = setInterval(() => {
      if (!state) return;
      const now = performance.now(), elapsed = Math.min(.1, (now - lastSimulation) / 1000); lastSimulation = now;
      state.paused = paused || document.hidden;
      if (!state.paused) {
        accumulator += elapsed;
        while (accumulator >= 1 / 60) {
          remoteInputs[myId] = input(); stepRace(state, remoteInputs); accumulator -= 1 / 60;
        }
      } else accumulator = 0;
      if (mode === 'host' && now - lastSnapshot > 80) { room?.broadcastState(state); lastSnapshot = now; }
    }, 1000 / 60);
  } else transfer = setInterval(() => room?.sendInput(document.hidden ? neutralInput() : input()), 50);
  canvas.focus({ preventScroll: true });
  if (matchMedia('(max-width: 760px)').matches) canvas.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
}
function practice() { const name = driverName(); if (!name) return; stopSession(); mode = 'practice'; myId = 'host'; beginRace(createRace([{ id: myId, name }])); }
function togglePause() {
  if (mode !== 'practice' || !state || state.phase === 'finished') return;
  paused = !paused; clearInput(); $('pause-race').textContent = paused ? 'Resume practice' : 'Pause practice';
}
function updateHUD() {
  if (!state) return;
  const car = state.cars.find(candidate => candidate.id === myId), ranked = rankCars(state);
  if (!car) return;
  $('lap-display').innerHTML = `${Math.min(LAPS, car.laps + 1)} <small>/ ${LAPS} LAPS</small>`;
  $('race-time').textContent = timeText(car.finishedAt ?? state.time);
  $('speed-display').innerHTML = `${String(Math.round(car.finishedAt === null ? car.speed : 0)).padStart(3, '0')} <small>KM/H</small>`;
  drawRoster(ranked, $('positions'), true);
  if (state.phase === 'finished') {
    const winner = ranked.find(driver => driver.finishedAt !== null);
    banner('CHEQUERED FLAG', mode === 'practice' ? 'Trial complete.' : winner ? `${winner.name} wins!` : 'Race ended.', winner ? timeText(winner.finishedAt) : 'Return to the lobby for a new race.', 'result');
    if (!finishedShown) {
      finishedShown = true; clearInput(); $('pause-race').hidden = true; $('restart-race').hidden = mode !== 'practice';
      $('session-title').textContent = 'Final classification.';
      $('race-status').textContent = mode === 'practice' ? `Three laps complete in ${timeText(car.finishedAt)}.` : winner ? `${winner.name} wins in ${timeText(winner.finishedAt)}. Return to the lobby to race again.` : 'Race ended. Return to the lobby to race again.';
    }
  } else if (state.paused) banner('RACE PAUSED', mode === 'guest' ? 'Host tab paused.' : 'Paused.', mode === 'guest' ? 'The race resumes when the host returns.' : 'Return to this tab or resume practice.');
  else if (state.time < 0) banner('LIGHTS OUT IN', String(Math.ceil(-state.time)), 'Gas + steer. Follow the circuit clockwise.', 'countdown');
  else if (car.finishedAt !== null) banner('FINISHED', timeText(car.finishedAt), 'Waiting for the other drivers.', 'result');
  else banner('', '', '');
}

function ellipsePath(rx, ry) { context.beginPath(); context.ellipse(TRACK.cx, TRACK.cy, rx, ry, 0, 0, Math.PI * 2); }
function drawTrack() {
  const ctx = context;
  ctx.fillStyle = '#477b62'; ctx.fillRect(0, 0, TRACK.width, TRACK.height);
  ctx.fillStyle = '#4c8166';
  for (let x = -800; x < 1800; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 45, 0); ctx.lineTo(x + 845, 800); ctx.lineTo(x + 800, 800); ctx.fill(); }
  // Grandstands and paddock sit beyond the run-off area.
  for (const [x, y, width, height] of [[390, 23, 370, 37], [360, 741, 480, 37], [35, 210, 29, 340], [1210, 205, 29, 340]]) {
    ctx.fillStyle = '#294d46'; ctx.fillRect(x + 5, y + 6, width, height);
    ctx.fillStyle = '#83918d'; ctx.fillRect(x, y, width, height);
    ctx.fillStyle = '#c7bba4';
    for (let bx = x + 5; bx < x + width - 4; bx += 9) for (let by = y + 5; by < y + height - 4; by += 9) ctx.fillRect(bx, by, 4, 4);
  }
  for (const [x, y] of [[113, 83], [155, 69], [1080, 65], [1157, 105], [88, 677], [166, 733], [1090, 728], [1195, 673]]) {
    ctx.fillStyle = '#305b48'; ctx.beginPath(); ctx.ellipse(x + 8, y + 9, 28, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2f6952'; ctx.beginPath(); ctx.arc(x, y, 23, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#568b68'; ctx.beginPath(); ctx.arc(x - 7, y - 6, 15, 0, Math.PI * 2); ctx.fill();
  }
  ellipsePath(TRACK.rx, TRACK.ry); ctx.strokeStyle = '#365e50'; ctx.lineWidth = 161; ctx.stroke();
  ellipsePath(TRACK.rx, TRACK.ry); ctx.strokeStyle = '#d9d9c5'; ctx.lineWidth = 136; ctx.stroke();
  ctx.setLineDash([24, 24]); ctx.strokeStyle = '#d26e5d'; ctx.stroke(); ctx.setLineDash([]);
  ellipsePath(TRACK.rx, TRACK.ry); ctx.strokeStyle = '#3d464b'; ctx.lineWidth = 116; ctx.stroke();
  ellipsePath(TRACK.rx, TRACK.ry); ctx.strokeStyle = '#929b93'; ctx.lineWidth = 2; ctx.setLineDash([13, 20]); ctx.stroke(); ctx.setLineDash([]);
  for (let x = TRACK.cx + TRACK.rx - 57; x < TRACK.cx + TRACK.rx + 58; x += 10) for (let row = 0; row < 2; row++) {
    ctx.fillStyle = (Math.round(x) + row * 10) % 20 < 10 ? '#e9e3cf' : '#242c32'; ctx.fillRect(x, TRACK.cy - 9 + row * 9, 10, 9);
  }
  ctx.save(); ctx.translate(1040, 405); ctx.rotate(-Math.PI / 2); ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#ecdfc7'; ctx.textAlign = 'center'; ctx.fillText('START / FINISH', 0, 0); ctx.restore();
  ctx.strokeStyle = '#647f6e'; ctx.lineWidth = 2; ctx.strokeRect(465, 311, 350, 172);
  ctx.fillStyle = '#80a18a'; ctx.font = '800 48px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('SUGUN', 640, 384); ctx.font = 'bold 12px sans-serif'; ctx.fillText('P A R K   C I R C U I T', 640, 418);
  ctx.fillStyle = '#88a58e'; ctx.font = '10px monospace'; ctx.fillText('EST. 2026  /  THREE LAPS', 640, 451);
  for (const angle of [.8, 2.4, 3.95, 5.5]) {
    const point = trackPoint(angle); ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(Math.atan2(TRACK.ry * Math.cos(angle), -TRACK.rx * Math.sin(angle)));
    ctx.strokeStyle = '#a6b3a1'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-11, -7); ctx.lineTo(-2, 0); ctx.lineTo(-11, 7); ctx.stroke(); ctx.restore();
  }
  const me = state?.cars.find(car => car.id === myId);
  if (me && me.finishedAt === null && state.phase !== 'finished') {
    const point = trackPoint(me.nextCheckpoint * Math.PI / 2);
    ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(me.nextCheckpoint * Math.PI / 2); ctx.strokeStyle = '#b8dfb9'; ctx.globalAlpha = .6; ctx.lineWidth = 3; ctx.setLineDash([5, 6]); ctx.beginPath(); ctx.moveTo(-51, 0); ctx.lineTo(51, 0); ctx.stroke(); ctx.restore();
  }
}
function drawCar(car, delta) {
  let visual = visualCars.get(car.id);
  if (!visual) { visual = { x: car.x, y: car.y, angle: car.angle }; visualCars.set(car.id, visual); }
  const amount = mode === 'guest' && !reducedMotion ? 1 - Math.exp(-18 * delta) : 1;
  visual.x += (car.x - visual.x) * amount; visual.y += (car.y - visual.y) * amount;
  visual.angle += Math.atan2(Math.sin(car.angle - visual.angle), Math.cos(car.angle - visual.angle)) * amount;
  const ctx = context; ctx.save(); ctx.translate(visual.x, visual.y); ctx.rotate(visual.angle); ctx.globalAlpha = car.connected ? 1 : .35;
  if (car.id === myId) { ctx.strokeStyle = '#f8edcd'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.stroke(); }
  ctx.fillStyle = '#1d2c29'; ctx.fillRect(-19, -13, 41, 29);
  ctx.fillStyle = '#191f25'; for (const x of [-15, 9]) { ctx.fillRect(x, -16, 10, 9); ctx.fillRect(x, 7, 10, 9); }
  ctx.fillStyle = COLORS[car.color]; ctx.fillRect(-22, -12, 6, 24); ctx.fillRect(17, -13, 5, 26);
  ctx.beginPath(); ctx.moveTo(-17, -8); ctx.lineTo(6, -6); ctx.lineTo(21, -3); ctx.lineTo(21, 3); ctx.lineTo(6, 6); ctx.lineTo(-17, 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e9e2cb'; ctx.fillRect(7, -2, 13, 4); ctx.fillStyle = '#263440'; ctx.beginPath(); ctx.ellipse(-3, 0, 6, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#f4dfb5'; ctx.beginPath(); ctx.arc(-2, 0, 3, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.font = `${car.id === myId ? 'bold ' : ''}12px sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#172b24'; ctx.fillText(car.name, visual.x + 1, visual.y - 34 + 1); ctx.fillStyle = car.connected ? '#fff5da' : '#a6b8ac'; ctx.fillText(car.id === myId ? `${car.name} · YOU` : car.name, visual.x, visual.y - 34);
}
function render(now) {
  const delta = Math.min(.1, (now - lastFrame) / 1000 || 1 / 60); lastFrame = now;
  drawTrack();
  const cars = state?.cars ?? previewCars;
  cars.forEach(car => drawCar(car, delta));
  if (now - lastHud > 90) { updateHUD(); lastHud = now; }
  requestAnimationFrame(render);
}

$('practice').addEventListener('click', practice);
$('create-room').addEventListener('click', () => connect(true));
$('join-form').addEventListener('submit', event => { event.preventDefault(); connect(false); });
$('join-code').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase().replace(/\s/g, ''); });
$('start-race').addEventListener('click', () => { if (mode === 'host' && roster.length >= 2) room.start(createRace(roster)); });
$('leave-room').addEventListener('click', () => toLobby());
$('back-lobby').addEventListener('click', () => toLobby());
$('pause-race').addEventListener('click', togglePause);
$('restart-race').addEventListener('click', practice);
$('copy-code').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('room-code').value); $('copy-code').textContent = 'Copied'; }
  catch { $('room-code').focus(); $('room-code').select(); status('Code selected. Copy it with Ctrl+C, or press and hold to copy.'); }
});
const keyControls = { ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right', ArrowUp: 'throttle', w: 'throttle', ArrowDown: 'brake', s: 'brake' };
addEventListener('keydown', event => {
  if (!state || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (keyControls[key]) { event.preventDefault(); held.add(keyControls[key]); }
  else if (key === 'p' && !event.repeat) { event.preventDefault(); togglePause(); }
});
addEventListener('keyup', event => { const key = event.key.length === 1 ? event.key.toLowerCase() : event.key; if (keyControls[key]) held.delete(keyControls[key]); });
for (const button of document.querySelectorAll('[data-control]')) {
  button.addEventListener('pointerdown', event => { if (!state) return; event.preventDefault(); held.add(button.dataset.control); button.classList.add('held'); button.setPointerCapture(event.pointerId); });
  const release = () => { held.delete(button.dataset.control); button.classList.remove('held'); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
}
addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => { clearInput(); if (mode === 'practice' && document.hidden && state?.phase !== 'finished') { paused = true; $('pause-race').textContent = 'Resume practice'; } });
addEventListener('pagehide', () => stopSession());
requestAnimationFrame(render);
