import { createGame, queueTurn, step, tickDelay } from './snake-engine.js';

const board = document.querySelector('#board');
const context = board.getContext('2d');
const overlay = document.querySelector('#overlay');
const play = document.querySelector('#play');
const pause = document.querySelector('#pause');
const restart = document.querySelector('#restart');
const scoreLabel = document.querySelector('#score');
const bestLabel = document.querySelector('#best');
const status = document.querySelector('#status');
const storageKey = 'sugun-pocket-snake-best';
let best = 0;
try {
  const saved = Number(localStorage.getItem(storageKey));
  if (Number.isInteger(saved) && saved >= 0 && saved <= 397) best = saved;
} catch { /* Storage may be unavailable; the game still works. */ }
let state = createGame();
let phase = 'ready';
let timer;
let swipeStart;

function draw() {
  const cell = board.width / state.size;
  context.fillStyle = '#c5d59a';
  context.fillRect(0, 0, board.width, board.height);
  context.fillStyle = '#bdce94';
  for (let y = 0; y < state.size; y++) for (let x = 0; x < state.size; x++) {
    context.fillRect(x * cell + cell / 2 - 1, y * cell + cell / 2 - 1, 2, 2);
  }
  if (state.food) {
    const x = state.food.x * cell, y = state.food.y * cell;
    context.fillStyle = '#30453a';
    context.fillRect(x + 7, y + 10, cell - 14, cell - 14);
    context.fillRect(x + 4, y + 13, cell - 8, cell - 20);
    context.fillRect(x + 15, y + 4, 4, 7);
    context.fillRect(x + 19, y + 3, 5, 4);
    context.fillStyle = '#c5d59a';
    context.fillRect(x + 9, y + 12, 3, 5);
  }
  state.snake.forEach((segment, index) => {
    const x = segment.x * cell, y = segment.y * cell;
    context.fillStyle = index === 0 ? '#253c30' : '#3e5640';
    context.fillRect(x + 2, y + 2, cell - 4, cell - 4);
    context.fillStyle = '#c5d59a';
    if (index) context.fillRect(x + 7, y + 7, cell - 14, cell - 14);
    else {
      const eyes = { right: [[20, 6], [20, 20]], left: [[6, 6], [6, 20]], up: [[6, 6], [20, 6]], down: [[6, 20], [20, 20]] }[state.direction];
      for (const [ex, ey] of eyes) context.fillRect(x + ex, y + ey, 4, 4);
    }
  });
  scoreLabel.textContent = String(state.score).padStart(3, '0');
  bestLabel.textContent = String(best).padStart(3, '0');
}

function showOverlay(label, title, detail, button) {
  document.querySelector('#overlay-label').textContent = label;
  document.querySelector('#overlay-title').textContent = title;
  document.querySelector('#overlay-detail').textContent = detail;
  play.textContent = button;
  overlay.hidden = false;
}

function updateControls() {
  pause.disabled = phase === 'ready' || phase === 'over';
  restart.disabled = phase === 'ready';
  pause.setAttribute('aria-label', phase === 'paused' ? 'Resume game' : 'Pause game');
  pause.firstElementChild.textContent = phase === 'paused' ? '▶' : 'Ⅱ';
  document.querySelector('#pause-label').textContent = phase === 'paused' ? 'RESUME' : 'PAUSE';
}

function tick() {
  if (phase !== 'running') return;
  const previousScore = state.score;
  state = step(state);
  if (state.score > best) {
    best = state.score;
    try { localStorage.setItem(storageKey, String(best)); } catch { /* Keep the record for this visit. */ }
  }
  draw();
  if (state.status !== 'running') {
    phase = 'over';
    const won = state.status === 'won';
    showOverlay('POCKET SNAKE', won ? 'You win' : 'Game over', `Score: ${state.score}. Best: ${best}.`, 'Play again →');
    status.textContent = won ? 'Board cleared. You win!' : `Game over. Score: ${state.score}.`;
    updateControls();
    play.focus({ preventScroll: true });
    return;
  }
  if (state.score !== previousScore) status.textContent = `Score: ${state.score}${state.score % 3 === 0 ? ' · Speed increased' : ''}`;
  timer = setTimeout(tick, tickDelay(state.score));
}

function start() {
  clearTimeout(timer);
  state = createGame();
  phase = 'running';
  overlay.hidden = true;
  status.textContent = 'Playing';
  updateControls();
  draw();
  board.focus({ preventScroll: true });
  timer = setTimeout(tick, tickDelay(state.score));
}

function togglePause() {
  if (phase === 'running') {
    clearTimeout(timer);
    phase = 'paused';
    showOverlay('POCKET SNAKE', 'Paused', `Score: ${state.score}.`, 'Resume game →');
    status.textContent = 'Paused.';
  } else if (phase === 'paused') {
    phase = 'running';
    overlay.hidden = true;
    status.textContent = 'Playing';
    board.focus({ preventScroll: true });
    timer = setTimeout(tick, tickDelay(state.score));
  }
  updateControls();
}

function steer(direction) {
  if (phase === 'running') state = queueTurn(state, direction);
}

play.addEventListener('click', () => phase === 'paused' ? togglePause() : start());
pause.addEventListener('click', togglePause);
restart.addEventListener('click', start);
document.querySelectorAll('[data-direction]').forEach(button => button.addEventListener('click', () => steer(button.dataset.direction)));
const directions = { arrowup: 'up', w: 'up', arrowright: 'right', d: 'right', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left' };
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const key = event.key.toLowerCase();
  if (Object.hasOwn(directions, key) && phase === 'running') {
    event.preventDefault();
    if (!event.repeat) steer(directions[key]);
  } else if (key === 'p' || (key === ' ' && event.target === board)) {
    event.preventDefault();
    if (!event.repeat) togglePause();
  }
});
board.addEventListener('pointerdown', event => {
  if (phase !== 'running') return;
  swipeStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  board.setPointerCapture(event.pointerId);
});
board.addEventListener('pointerup', event => {
  if (!swipeStart || swipeStart.id !== event.pointerId) return;
  const dx = event.clientX - swipeStart.x, dy = event.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
  steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
});
board.addEventListener('pointercancel', () => { swipeStart = null; });
document.addEventListener('visibilitychange', () => { if (document.hidden && phase === 'running') togglePause(); });
window.addEventListener('blur', () => { if (phase === 'running') togglePause(); });
draw();
