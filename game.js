import { LEVELS } from './levels.js';
import { createState, step, echoPositions, isGateOpen } from './engine.js';

const $ = id => document.getElementById(id);
const canvas = $('board');
const ctx = canvas.getContext('2d');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const storageKey = 'echo-shift-best-v1';
let best = {};
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && typeof saved === 'object') {
    for (const { id } of LEVELS) if (Number.isSafeInteger(saved[id]) && saved[id] > 0) best[id] = saved[id];
  }
} catch { /* Scores are optional when browser storage is unavailable. */ }

let state = createState();
let previous = state;
let changedAt = 0;
let width = 0, height = 0, tileW = 0, tileH = 0, originX = 0, originY = 0;
let frame = 0;
const colors = { coral: '#ff806e', mint: '#9de2dd', gold: '#f8d48d', switch: '#c5aae8' };
const pad = number => String(number).padStart(2, '0');

function choose(index) {
  state = createState(index);
  previous = state;
  $('hint').open = false;
  update();
  resize();
}

function act(action) {
  previous = state;
  state = step(state, action);
  changedAt = performance.now();
  if (action === 'rewind' || action === 'reset') previous = state;
  if (state.won && !previous.won) {
    const id = LEVELS[state.levelIndex].id;
    best[id] = Math.min(best[id] ?? Infinity, state.moves);
    try { localStorage.setItem(storageKey, JSON.stringify(best)); } catch { /* Play continues without saved scores. */ }
  }
  update();
  if (state.won && !previous.won) $('next').focus({ preventScroll: true });
  else if (!state.won) canvas.focus({ preventScroll: true });
}

function update() {
  const level = LEVELS[state.levelIndex];
  $('chamber-number').textContent = `CHAMBER ${pad(state.levelIndex + 1)}`;
  $('chamber-title').textContent = level.title;
  $('moves').textContent = pad(state.moves);
  const total = level.grid.join('').split('o').length - 1;
  $('crystals').textContent = `${state.collected.length} / ${total}`;
  $('tick').textContent = `STEP ${pad(state.tick)}`;
  $('echo-count').textContent = `${state.echoes.length} / 2 ECHOES`;
  $('status').textContent = state.message;
  $('hint-text').textContent = level.hint;
  $('progress-count').textContent = `${Object.keys(best).length} / ${LEVELS.length}`;
  $('levels').replaceChildren(...LEVELS.map((item, index) => {
    const button = document.createElement('button');
    button.className = 'level-button';
    button.setAttribute('aria-current', String(index === state.levelIndex));
    button.setAttribute('aria-label', `Chamber ${index + 1}: ${item.title}${best[item.id] ? `, best ${best[item.id]} moves` : ''}`);
    for (const [className, text] of [['level-number', pad(index + 1)], ['level-name', item.title], ['level-check', best[item.id] ? '✓' : '·']]) {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = text;
      button.append(span);
    }
    button.addEventListener('click', () => { choose(index); canvas.focus({ preventScroll: true }); });
    return button;
  }));
  $('rewind').disabled = state.won || !state.route.some(p => p.x !== state.route[0].x || p.y !== state.route[0].y);
  $('wait').disabled = state.won;
  document.querySelectorAll('[data-move]').forEach(button => { button.disabled = state.won; });
  $('victory').hidden = !state.won;
  if (state.won) {
    const last = state.levelIndex === LEVELS.length - 1;
    $('victory-label').textContent = `CHAMBER ${pad(state.levelIndex + 1)} CLEAR`;
    $('victory-title').textContent = last ? 'Final chamber complete' : 'Chamber complete';
    $('victory-detail').textContent = `${state.moves} moves · ${state.rewinds} ${state.rewinds === 1 ? 'echo' : 'echoes'} cast · best ${best[level.id]}`;
    $('next').textContent = last ? 'Back to the beginning ↶' : 'Next chamber →';
  }
  canvas.setAttribute('aria-label', `${level.title}. You are at column ${state.player.x + 1}, row ${state.player.y + 1}. ${state.collected.length} of ${total} crystals. ${state.echoes.length} echoes. Arrow keys or WASD move, Space casts an echo, period waits, R resets. Tap neighbouring tiles to move.`);
  requestDraw();
}

function project(x, y, z = 0) {
  return { x: originX + (x - y) * tileW / 2, y: originY + (x + y) * tileH / 2 - z };
}

function polygon(points, fill, stroke) {
  ctx.beginPath();
  points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function diamond(x, y, w, h, fill, stroke) {
  polygon([[x, y - h / 2], [x + w / 2, y], [x, y + h / 2], [x - w / 2, y]], fill, stroke);
}

function ellipse(x, y, rx, ry, color, stroke = false) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (stroke) { ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke(); }
  else { ctx.fillStyle = color; ctx.fill(); }
}

function label(text, x, y, color, size = 10) {
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
}

function explorer(position, ghost, time, offset = 0) {
  const p = project(position.x, position.y);
  const scale = tileW / 65;
  const bob = motion.matches ? 0 : Math.sin(time / 520 + offset) * 1.3 * scale;
  ctx.save();
  ctx.translate(p.x, p.y - 3 * scale);
  ctx.scale(scale, scale);
  if (ghost) ctx.globalAlpha = .68;
  ellipse(0, 1, 12, 5, ghost ? '#9de2dd28' : '#20182d66');
  if (ghost) ellipse(0, 1, 16, 7, '#9de2dd77', true);
  ctx.translate(0, -bob);
  const suit = ghost ? colors.mint : colors.coral;
  ctx.fillStyle = ghost ? '#72b5b3' : '#cf615e';
  ctx.fillRect(-9, -20, 5, 15);
  ctx.fillRect(5, -20, 5, 15);
  ctx.fillStyle = suit;
  ctx.beginPath();
  ctx.roundRect(-8, -23, 16, 19, 6);
  ctx.fill();
  ctx.fillRect(-7, -8, 5, 9);
  ctx.fillRect(3, -8, 5, 9);
  ellipse(0, -30, 12, 12, suit);
  ctx.fillStyle = ghost ? '#416b77' : '#513c58';
  ctx.beginPath();
  ctx.roundRect(-8, -34, 16, 8, 4);
  ctx.fill();
  ctx.fillStyle = '#faf8ff';
  ctx.globalAlpha *= .85;
  ctx.fillRect(1, -33, 4, 2);
  ctx.restore();
}

function draw(time = 0) {
  ctx.clearRect(0, 0, width, height);
  const grid = LEVELS[state.levelIndex].grid;
  const rows = grid.length, columns = grid[0].length;
  const cells = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) cells.push({ x, y, symbol: grid[y][x] });
  cells.sort((a, b) => a.x + a.y - b.x - b.y || a.x - b.x);

  // Draw only walls adjoining a path: this keeps every corridor visible on a small screen.
  for (const { x, y, symbol } of cells) {
    const wall = symbol === '#';
    if (wall && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => grid[y + dy]?.[x + dx] && grid[y + dy][x + dx] !== '#')) continue;
    const p = project(x, y, wall ? tileW * .16 : 0);
    const w = tileW * .96, h = tileH * .96, depth = wall ? tileW * .25 : tileW * .1;
    polygon([[p.x - w / 2, p.y], [p.x, p.y + h / 2], [p.x, p.y + h / 2 + depth], [p.x - w / 2, p.y + depth]], wall ? '#40334e' : '#594761');
    polygon([[p.x, p.y + h / 2], [p.x + w / 2, p.y], [p.x + w / 2, p.y + depth], [p.x, p.y + h / 2 + depth]], wall ? '#493b59' : '#695574');
    diamond(p.x, p.y, w, h, wall ? '#574765' : '#9786aa', wall ? '#79658b55' : '#cbb8d344');
    if (wall) continue;
    if (symbol === 'S') diamond(p.x, p.y, w * .55, h * .55, null, '#d9c7e377');
  }

  // Keep interactive floor markings above the low surrounding walls.
  for (const { x, y, symbol } of cells) {
    const p = project(x, y);
    if (symbol === 'A' || symbol === 'B') {
      const held = isGateOpen(state, symbol.toLowerCase());
      const tint = symbol === 'A' ? colors.switch : colors.gold;
      ellipse(p.x, p.y, tileW * .23, tileH * .23, held ? tint : '#574369');
      ellipse(p.x, p.y, tileW * .29, tileH * .29, tint, true);
      label(symbol, p.x, p.y + tileW * .055, held ? '#443350' : tint, tileW * .16);
    }
    if (symbol === 'X') {
      ellipse(p.x, p.y, tileW * .29, tileH * .29, '#5e918f');
      ellipse(p.x, p.y, tileW * .35, tileH * .35, colors.mint, true);
      ellipse(p.x, p.y, tileW * .19, tileH * .19, colors.mint, true);
      label('EXIT', p.x, p.y + tileW * .4, '#c7eeea', Math.max(7, tileW * .12));
    }
  }

  for (const route of state.echoes) {
    ctx.beginPath();
    route.forEach(({ x, y }, index) => {
      const p = project(x, y, 2);
      index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    });
    ctx.strokeStyle = '#9de2dd70';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const amount = motion.matches ? 1 : Math.min(1, Math.max(0, (time - changedAt) / 135));
  const t = 1 - (1 - amount) ** 3;
  const lerp = (a, b) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const pastEchoes = echoPositions(previous);
  const entities = echoPositions(state).map((p, index) => ({ ...lerp(pastEchoes[index] ?? p, p), ghost: true, index }));
  entities.push({ ...lerp(previous.player, state.player), ghost: false });

  const objects = [
    ...cells.filter(({ x, y, symbol }) => 'abo'.includes(symbol) && !(symbol === 'o' && state.collected.includes(`${x},${y}`))),
    ...entities,
  ].sort((a, b) => a.x + a.y - b.x - b.y || Number(b.ghost) - Number(a.ghost));
  for (const object of objects) {
    if ('ghost' in object) { explorer(object, object.ghost, time, object.index ?? 0); continue; }
    const { x, y, symbol } = object;
    const p = project(x, y);
    if (symbol === 'o') {
      const bob = motion.matches ? 0 : Math.sin(time / 650 + x + y) * tileW * .035;
      ellipse(p.x, p.y, tileW * .12, tileH * .11, '#3e2c5344');
      const top = p.y - tileW * .28 + bob;
      diamond(p.x, top, tileW * .22, tileW * .34, colors.gold, '#fff1c6');
      polygon([[p.x, top - tileW * .17], [p.x + tileW * .11, top], [p.x, top + tileW * .17]], '#d9aa68');
    } else {
      const open = isGateOpen(state, symbol);
      const tint = symbol === 'a' ? colors.switch : colors.gold;
      diamond(p.x, p.y, tileW * .75, tileH * .75, open ? null : '#513d65', tint);
      if (!open) {
        const left = p.x - tileW * .22, right = p.x + tileW * .22;
        ctx.strokeStyle = tint; ctx.lineWidth = Math.max(2, tileW * .055);
        ctx.beginPath(); ctx.moveTo(left, p.y - 2); ctx.lineTo(left, p.y - tileW * .45); ctx.lineTo(right, p.y - tileW * .45); ctx.lineTo(right, p.y - 2); ctx.stroke();
        ctx.globalAlpha = .2;
        ctx.fillStyle = tint; ctx.fillRect(left, p.y - tileW * .45, right - left, tileW * .4);
        ctx.globalAlpha = 1;
        label(symbol.toUpperCase(), p.x, p.y - tileW * .18, tint, tileW * .18);
      } else label(symbol.toUpperCase(), p.x, p.y + 3, '#4c3b60', tileW * .13);
    }
  }
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  width = rect.width; height = rect.height;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const grid = LEVELS[state.levelIndex].grid;
  const columns = grid[0].length, rows = grid.length;
  tileW = Math.min(width * 1.72 / (columns + rows), height * 2.8 / (columns + rows), 78);
  tileH = tileW * .5;
  originX = width / 2 - (columns - rows) * tileW / 4;
  originY = height * .52 - (columns + rows - 2) * tileH / 4;
  requestDraw();
}

function requestDraw() {
  if (frame || document.hidden) return;
  frame = requestAnimationFrame(time => {
    frame = 0;
    draw(time);
    if (!motion.matches) requestDraw();
  });
}

$('rewind').addEventListener('click', () => act('rewind'));
$('wait').addEventListener('click', () => act('wait'));
$('reset').addEventListener('click', () => act('reset'));
$('replay').addEventListener('click', () => act('reset'));
$('next').addEventListener('click', () => { choose((state.levelIndex + 1) % LEVELS.length); canvas.focus({ preventScroll: true }); });
document.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', () => act(button.dataset.move)));
$('help').addEventListener('click', () => $('help-dialog').showModal());

document.addEventListener('keydown', event => {
  if ($('help-dialog').open || event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  const action = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', ' ': 'rewind', '.': 'wait', r: 'reset' }[event.key.length === 1 ? event.key.toLowerCase() : event.key];
  // Keep Space available for activating focused buttons, including the native help dialog trigger.
  if (!action || (event.key === ' ' && event.target.closest('button,a,summary'))) return;
  event.preventDefault();
  if (!event.repeat || action !== 'rewind') act(action);
});

canvas.addEventListener('pointerdown', event => {
  const rect = canvas.getBoundingClientRect();
  const dx = (event.clientX - rect.left - originX) / (tileW / 2);
  const dy = (event.clientY - rect.top - originY) / (tileH / 2);
  const x = Math.round((dx + dy) / 2), y = Math.round((dy - dx) / 2);
  const offset = `${x - state.player.x},${y - state.player.y}`;
  const action = { '0,-1': 'up', '0,1': 'down', '-1,0': 'left', '1,0': 'right' }[offset];
  if (action) act(action);
  canvas.focus({ preventScroll: true });
});
new ResizeObserver(resize).observe(canvas);
document.addEventListener('visibilitychange', requestDraw);
motion.addEventListener('change', requestDraw);
update();
resize();
