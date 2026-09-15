import { COURSE, CHECKPOINTS, carConfig, newDrive, drive } from './bricks-engine.js';

const $ = id => document.getElementById(id);
const colours = { coral: '#df6954', blue: '#5781a1', yellow: '#e9b441', mint: '#79a88c' };
const names = { roadster: 'The Roadster', buggy: 'The Buggy', truck: 'The Pickup' };
const storageKey = 'sugun-brick-garage-v1';
let saved = {};
try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch { /* Play without storage. */ }
let config = carConfig(saved.car);
let best = Number.isFinite(saved.best) && saved.best > 0 && saved.best <= COURSE.limit ? saved.best : null;
let state = newDrive(config);
let mode = 'garage';
let frameId = 0;
let lastFrame = 0;
const keys = new Set();
const touch = new Map();
const preview = $('preview').getContext('2d');
const ctx = $('course').getContext('2d');
const paint = () => colours[config.paint];

function save() {
  try { localStorage.setItem(storageKey, JSON.stringify({ car: config, best })); } catch { /* Storage can be disabled. */ }
}
function rounded(context, x, y, w, h, r, fill) {
  context.fillStyle = fill; context.beginPath(); context.roundRect(x, y, w, h, r); context.fill();
}
function disc(context, x, y, radius, fill) {
  context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fillStyle = fill; context.fill();
}
function polygon(context, points, fill) {
  context.beginPath(); context.moveTo(...points[0]); points.slice(1).forEach(point => context.lineTo(...point)); context.closePath(); context.fillStyle = fill; context.fill();
}
function tint(hex, amount) {
  return '#' + hex.slice(1).match(/../g).map(channel => Math.max(0, Math.min(255, parseInt(channel, 16) + amount)).toString(16).padStart(2, '0')).join('');
}
function previewCar() {
  preview.clearRect(0, 0, 800, 550);
  const p = (x, y, z = 0) => [400 + (x - y) * 4, 335 + (x + y) * 1.75 - z * 4];
  const face = (points, fill) => polygon(preview, points.map(point => p(...point)), fill);
  face([[-63, -43, -3], [63, -43, -3], [63, 43, -3], [-63, 43, -3]], '#b4a184');
  face([[-63, -43, -1], [63, -43, -1], [63, 43, -1], [-63, 43, -1]], '#c9b999');
  for (let x = -57; x < 64; x += 12) for (let y = -37; y < 44; y += 12) {
    const [sx, sy] = p(x, y, -1); preview.fillStyle = '#b7a587'; preview.beginPath(); preview.ellipse(sx, sy + 2, 10, 5, 0, 0, Math.PI * 2); preview.fill(); preview.fillStyle = '#d2c3a6'; preview.beginPath(); preview.ellipse(sx, sy, 10, 5, 0, 0, Math.PI * 2); preview.fill();
  }
  preview.fillStyle = '#433b2c25'; preview.beginPath(); preview.ellipse(400, 355, 180, 59, 0, 0, Math.PI * 2); preview.fill();
  const boxes = [];
  const box = (x, y, z, w, d, h, colour, studs = false) => boxes.push({ x, y, z, w, d, h, colour, studs });
  const tyre = config.wheels === 'offroad' ? 16 : 12;
  const base = config.wheels === 'offroad' ? 8 : 6;
  for (const x of [-25, 20]) for (const y of [-22, 15]) {
    box(x, y, 0, tyre, 7, tyre, '#343a36');
    box(x + 4, y - (y < 0 ? 1 : -5), 4, tyre - 8, 3, tyre - 8, '#b9b9a9');
  }
  box(-29, -15, base, 65, 30, 7, '#48534d');
  box(-29, -15, base + 7, 64, 30, 8, paint(), true);
  box(16, -14, base + 15, 18, 28, 5, paint(), true);
  box(34, -14, base + 5, 5, 28, 6, '#d3d2bc');
  box(34, -12, base + 11, 3, 7, 6, '#fff0b8'); box(34, 5, base + 11, 3, 7, 6, '#fff0b8');
  if (config.body === 'truck') {
    box(-28, -14, base + 15, 24, 28, 2, '#6d7366');
    box(-29, -15, base + 17, 25, 4, 8, paint(), true); box(-29, 11, base + 17, 25, 4, 8, paint(), true);
    box(-30, -15, base + 17, 4, 30, 8, paint(), true);
    box(-2, -13, base + 15, 18, 26, 13, '#a1c4c0');
  } else {
    box(-13, -12, base + 15, 22, 24, 3, '#353d38');
    box(-15, -10, base + 17, 8, 8, 10, '#cbb791'); box(-15, 2, base + 17, 8, 8, 10, '#cbb791');
    box(9, -13, base + 16, 3, 26, 10, '#a1c4c0');
  }
  if (config.body === 'buggy') {
    for (const y of [-15, 12]) box(-12, y, base + 15, 4, 3, 21, '#dedcc4');
    box(-12, -15, base + 33, 4, 30, 4, '#dedcc4');
  }
  if (config.roof === 'canopy') { box(-15, -14, base + 20, 29, 28, 11, '#9fc5be'); box(-17, -15, base + 31, 33, 30, 4, paint(), true); }
  if (config.roof === 'wing') { box(-25, -11, base + 17, 5, 22, 14, '#39423c'); box(-30, -23, base + 30, 13, 46, 5, paint(), true); }
  boxes.sort((a, b) => a.x + a.y - b.x - b.y).forEach(({ x, y, z, w, d, h, colour, studs }) => {
    face([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], tint(colour, -22));
    face([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], tint(colour, -44));
    face([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], colour);
    if (studs) for (let sx = x + 6; sx < x + w - 2; sx += 11) for (let sy = y + 6; sy < y + d - 2; sy += 11) {
      const [px, py] = p(sx, sy, z + h); preview.fillStyle = tint(colour, -20); preview.beginPath(); preview.ellipse(px, py, 10, 4.5, 0, 0, Math.PI * 2); preview.fill(); preview.fillStyle = tint(colour, 20); preview.beginPath(); preview.ellipse(px, py - 3, 10, 4.5, 0, 0, Math.PI * 2); preview.fill();
    }
  });
}
function updateBuild() {
  $('model-name').textContent = names[config.body];
  $('build-summary').textContent = `${{ open: 'Open top', canopy: 'Canopy', wing: 'Rear wing' }[config.roof]} · ${config.wheels === 'street' ? 'Street' : 'All-terrain'} wheels`;
  $('preview').setAttribute('aria-label', `${config.paint} ${names[config.body].toLowerCase()}, ${config.roof} top, ${config.wheels} wheels`);
  $('build-note').textContent = `${{ roadster: 'The roadster is quick on tarmac.', buggy: 'The buggy balances pace and control.', truck: 'The pickup is slower and easier to steer.' }[config.body]} All-terrain wheels keep more speed on grass.`;
  previewCar(); save();
}
for (const [key, value] of Object.entries(config)) document.querySelector(`input[name="${key}"][value="${value}"]`).checked = true;
$('builder').addEventListener('change', () => { config = carConfig(Object.fromEntries(new FormData($('builder')))); updateBuild(); });

function tree(x, y) {
  disc(ctx, x + 4, y + 8, 20, '#52694235'); rounded(ctx, x - 3, y - 2, 6, 23, 2, '#89715a'); disc(ctx, x, y, 20, '#668555'); disc(ctx, x - 5, y - 5, 14, '#7e9c64'); disc(ctx, x - 7, y - 8, 5, '#93ad72');
}
function village() {
  rounded(ctx, 252, 235, 396, 130, 16, '#59694330');
  rounded(ctx, 260, 245, 380, 110, 12, '#d5cbb0');
  for (let x = 278; x < 640; x += 24) for (let y = 259; y < 355; y += 24) disc(ctx, x, y, 5, '#e4dbc3');
  for (const [x, colour, roof] of [[282, '#eac875', '#ba664d'], [403, '#afc4b1', '#597f82'], [524, '#e4a389', '#735c75']]) {
    rounded(ctx, x + 8, 264, 92, 77, 3, '#00000022'); rounded(ctx, x, 255, 92, 76, 3, colour); rounded(ctx, x - 5, 248, 102, 29, 4, roof);
    for (let sx = x + 6; sx < x + 90; sx += 20) disc(ctx, sx, 260, 5, tint(roof, 22));
    rounded(ctx, x + 11, 289, 21, 22, 2, '#5c797e'); rounded(ctx, x + 60, 289, 21, 22, 2, '#5c797e'); rounded(ctx, x + 39, 296, 16, 35, 2, '#89785f');
  }
}
function track() {
  ctx.fillStyle = '#a7b990'; ctx.fillRect(0, 0, 900, 600);
  for (let x = 15; x < 900; x += 30) for (let y = 15; y < 600; y += 30) { disc(ctx, x, y + 1, 3, '#98ab80'); disc(ctx, x, y - 1, 3, '#b4c49e'); }
  rounded(ctx, 49, 37, 802, 526, 130, '#e5d5b9');
  rounded(ctx, 56, 44, 788, 512, 125, '#777e76');
  ctx.setLineDash([16, 16]); ctx.lineWidth = 3; ctx.strokeStyle = '#c3c8b9'; ctx.beginPath(); ctx.roundRect(131, 121, 638, 358, 80); ctx.stroke(); ctx.setLineDash([]);
  rounded(ctx, 206, 194, 488, 212, 55, '#e5d5b9'); rounded(ctx, 216, 204, 468, 192, 46, '#a7b990');
  village();
  [[238, 229], [668, 229], [238, 371], [668, 371], [33, 28], [869, 570], [860, 33], [39, 566]].forEach(([x, y]) => tree(x, y));
  ctx.fillStyle = '#484f4735'; ctx.font = '700 14px monospace'; ctx.textAlign = 'center'; ctx.fillText('BRICK VILLAGE', 450, 381);
  for (let row = 0; row < 6; row++) for (let col = 0; col < 2; col++) { ctx.fillStyle = (row + col) % 2 ? '#eee7d5' : '#3c433d'; ctx.fillRect(431 + col * 13, 438 + row * 18, 13, 18); }
  CHECKPOINTS.forEach((point, index) => {
    if (index < state.checkpoint) { disc(ctx, point.x, point.y, 14, '#516d52'); ctx.fillStyle = '#e4f3d6'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✓', point.x, point.y + 6); return; }
    const active = index === state.checkpoint;
    disc(ctx, point.x, point.y, active ? 39 : 20, active ? '#f9d97433' : '#d7d9c622');
    ctx.beginPath(); ctx.arc(point.x, point.y, active ? 32 : 18, 0, Math.PI * 2); ctx.lineWidth = active ? 3 : 1; ctx.strokeStyle = active ? '#ffda79' : '#bfc6b3'; ctx.stroke();
    if (active) { disc(ctx, point.x, point.y + 3, 20, '#a78334'); disc(ctx, point.x, point.y, 20, '#ffda79'); }
    ctx.fillStyle = active ? '#63512d' : '#d2d8c9'; ctx.font = `700 ${active ? 22 : 15}px monospace`; ctx.textAlign = 'center'; ctx.fillText(String(index + 1), point.x, point.y + (active ? 8 : 5));
  });
}
function drivingCar() {
  ctx.save(); ctx.translate(state.x, state.y); ctx.rotate(state.angle);
  rounded(ctx, -23, -14, 52, 35, 8, '#2430243a');
  const tyre = config.wheels === 'offroad' ? 13 : 10;
  for (const x of [-19, 11]) for (const y of [-20, 12]) {
    rounded(ctx, x, y, 14, tyre, 3, '#303a34');
    if (config.wheels === 'offroad') { ctx.strokeStyle = '#566151'; ctx.lineWidth = 2; for (let n = x + 3; n < x + 14; n += 4) { ctx.beginPath(); ctx.moveTo(n, y + 1); ctx.lineTo(n, y + tyre - 1); ctx.stroke(); } }
  }
  rounded(ctx, -26, -13, 56, 27, 3, tint(paint(), -36)); rounded(ctx, -26, -15, 56, 25, 3, paint());
  rounded(ctx, 27, -11, 4, 6, 1, '#fff3b9'); rounded(ctx, 27, 4, 4, 6, 1, '#fff3b9');
  rounded(ctx, -27, -10, 3, 5, 1, '#a63f31'); rounded(ctx, -27, 4, 3, 5, 1, '#a63f31');
  rounded(ctx, -10, -11, 20, 17, 2, '#354b45'); rounded(ctx, 7, -10, 6, 17, 1, '#b6d7cb');
  for (const y of [-8, 4]) for (const x of [19, -19]) { disc(ctx, x, y, 4, tint(paint(), -15)); disc(ctx, x, y - 1, 3.5, tint(paint(), 25)); }
  if (config.body === 'truck') { rounded(ctx, -24, -11, 19, 19, 2, '#6d7366'); rounded(ctx, -1, -10, 10, 17, 1, paint()); }
  if (config.body === 'buggy') { rounded(ctx, -13, -14, 4, 27, 1, '#ddd8bd'); }
  if (config.roof === 'canopy') { rounded(ctx, -11, -12, 22, 22, 2, '#aed0c5'); rounded(ctx, -9, -10, 12, 18, 1, paint()); disc(ctx, -3, -5, 3, tint(paint(), 22)); disc(ctx, -3, 3, 3, tint(paint(), 22)); }
  if (config.roof === 'wing') { rounded(ctx, -25, -21, 8, 39, 1, tint(paint(), -30)); rounded(ctx, -26, -23, 8, 39, 1, paint()); }
  ctx.restore();
}
function drawDrive() { track(); drivingCar(); }
function scoreboard() {
  $('checkpoints').textContent = `${state.checkpoint} / ${CHECKPOINTS.length}`;
  $('time').textContent = Math.max(0, COURSE.limit - state.elapsed).toFixed(1);
  $('best').textContent = best ? `${best.toFixed(1)}s` : '—';
}
function clearControls() { keys.clear(); touch.clear(); document.querySelectorAll('[data-control]').forEach(button => button.classList.remove('held')); }
function overlay(title, detail, label, canResume) {
  $('result-title').textContent = title; $('result-detail').textContent = detail; $('result-label').textContent = label;
  $('resume').hidden = !canResume; $('drive-overlay').hidden = false; $('pause').disabled = !canResume;
  (canResume ? $('resume') : $('again')).focus({ preventScroll: true });
}
function finish() {
  clearControls();
  if (state.status === 'won') {
    const record = !best || state.elapsed < best;
    if (record) { best = state.elapsed; save(); }
    overlay('Course complete', `All eight checkpoints in ${state.elapsed.toFixed(1)} seconds.${record ? ' Your new best time.' : ''}`, 'FINISHED', false);
    $('drive-status').textContent = `Course complete in ${state.elapsed.toFixed(1)} seconds.`;
  } else { overlay('Time’s up', `You reached ${state.checkpoint} of eight checkpoints. Restart the course or change your car in the garage.`, 'COURSE ENDED', false); $('drive-status').textContent = `Time's up. ${state.checkpoint} of eight checkpoints collected.`; }
  scoreboard();
}
function frame(time) {
  frameId = 0;
  if (mode !== 'drive' || state.status !== 'running') return;
  const active = new Set([...keys, ...touch.values()]);
  const previous = state.checkpoint;
  state = drive(state, { throttle: Number(active.has('gas')) - Number(active.has('brake')), steer: Number(active.has('right')) - Number(active.has('left')) }, lastFrame ? Math.min((time - lastFrame) / 1000, 1 / 30) : 1 / 60);
  lastFrame = time; drawDrive(); scoreboard();
  if (state.status !== 'running') return finish();
  if (state.checkpoint !== previous) $('drive-status').textContent = `${state.checkpoint} of eight collected. Head for marker ${state.checkpoint + 1}.`;
  frameId = requestAnimationFrame(frame);
}
function run() { cancelAnimationFrame(frameId); lastFrame = 0; frameId = requestAnimationFrame(frame); }
function start() {
  clearControls(); state = newDrive(config); mode = 'drive'; $('garage').hidden = true; $('drive-panel').hidden = false; $('drive-overlay').hidden = true; $('pause').disabled = false; $('pause').textContent = 'Pause';
  $('drive-status').textContent = 'Follow the glowing checkpoints in order. Hold GO or ↑ to start driving.';
  scoreboard(); drawDrive(); $('course').focus({ preventScroll: true }); run();
}
function pause() {
  if (mode !== 'drive' || !['running', 'paused'].includes(state.status)) return;
  clearControls();
  if (state.status === 'paused') { state = { ...state, status: 'running' }; $('drive-overlay').hidden = true; $('pause').textContent = 'Pause'; $('course').focus({ preventScroll: true }); run(); }
  else { state = { ...state, status: 'paused' }; cancelAnimationFrame(frameId); $('pause').textContent = 'Resume'; overlay('Paused', 'The clock is stopped.', 'PIT STOP', true); }
}
$('builder').addEventListener('submit', event => { event.preventDefault(); start(); });
$('pause').addEventListener('click', pause); $('resume').addEventListener('click', pause);
$('restart').addEventListener('click', start); $('again').addEventListener('click', start);
$('garage-button').addEventListener('click', () => { mode = 'garage'; clearControls(); cancelAnimationFrame(frameId); $('drive-panel').hidden = true; $('garage').hidden = false; $('builder').querySelector('button').focus({ preventScroll: true }); });
const keyMap = { ArrowUp: 'gas', w: 'gas', ArrowDown: 'brake', s: 'brake', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' };
document.addEventListener('keydown', event => {
  if (mode !== 'drive' || event.altKey || event.ctrlKey || event.metaKey) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (key === 'p' && !event.repeat) { event.preventDefault(); pause(); }
  if (keyMap[key] && state.status === 'running') { event.preventDefault(); keys.add(keyMap[key]); }
});
document.addEventListener('keyup', event => { const key = event.key.length === 1 ? event.key.toLowerCase() : event.key; keys.delete(keyMap[key]); });
document.querySelectorAll('[data-control]').forEach(button => {
  button.addEventListener('pointerdown', event => { if (state.status !== 'running') return; event.preventDefault(); button.setPointerCapture(event.pointerId); touch.set(event.pointerId, button.dataset.control); button.classList.add('held'); });
  const release = event => { touch.delete(event.pointerId); if (![...touch.values()].includes(button.dataset.control)) button.classList.remove('held'); };
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  button.addEventListener('keydown', event => { if ([' ', 'Enter'].includes(event.key) && state.status === 'running') { event.preventDefault(); touch.set(`keyboard-${button.dataset.control}`, button.dataset.control); button.classList.add('held'); } });
  button.addEventListener('keyup', event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); touch.delete(`keyboard-${button.dataset.control}`); button.classList.remove('held'); } });
  button.addEventListener('blur', () => { touch.delete(`keyboard-${button.dataset.control}`); button.classList.remove('held'); });
});
window.addEventListener('blur', () => { clearControls(); if (mode === 'drive' && state.status === 'running') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'drive' && state.status === 'running') pause(); });
updateBuild(); scoreboard();
