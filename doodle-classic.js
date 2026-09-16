import { WIDTH, HEIGHT, COLORS, BRUSHES, MAX_STROKES, MAX_POINTS } from './doodle-engine.js?v=party-20260916';
import { createClassic, classicView, validView, validAction, applyClassic, tickClassic, nextClassic, leaveClassic } from './doodle-classic-engine.js?v=classic-20260916';
import { createRoom, validName } from './room-network.js?v=classic-20260916';

const $ = id => document.getElementById(id), canvas = $('drawing-canvas');
let room = null, authoritative = null, view = null, roster = [], myId = 'host', host = false, tickTimer = null;
let turnKey = '', phaseKey = '', feedKey = '', strokes = [], activeStroke = null, pointerId = null, totalPoints = 0;
let colour = COLORS[0], revision = 0, dirtyDrawing = false, drawingTimer = null, lastDrawingSend = 0, guessTimer = null, guessPending = false;
const artist = () => view?.drawerId === myId;
const canDraw = () => view?.phase === 'draw' && artist() && view.timeLeft > 0;
const canGuess = () => view?.phase === 'draw' && !artist() && view.timeLeft > 0 && !view.solvedIds.includes(myId) && !guessPending;
function text(id, value) { if ($(id).textContent !== value) $(id).textContent = value; }
function element(tag, className, value) { const node = document.createElement(tag); if (className) node.className = className; if (value !== undefined) node.textContent = value; return node; }
function status(message, error = false) { text('connection-status', message); $('connection-status').classList.toggle('error', error); }
function busy(value) { $('create-room').disabled = value; $('join-form').querySelector('button').disabled = value; }
function drawVectors(list) {
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fffef9'; ctx.fillRect(0, 0, WIDTH, HEIGHT); ctx.lineCap = ctx.lineJoin = 'round';
  for (const stroke of list) {
    ctx.strokeStyle = ctx.fillStyle = stroke.color; ctx.lineWidth = stroke.width; ctx.beginPath();
    if (stroke.points.length === 1) { ctx.arc(...stroke.points[0], stroke.width / 2, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.moveTo(...stroke.points[0]); for (const point of stroke.points.slice(1)) ctx.lineTo(...point); ctx.stroke(); }
  }
}
function sendDrawing() {
  clearTimeout(drawingTimer); drawingTimer = null;
  if (!dirtyDrawing || !canDraw() || !room) return;
  dirtyDrawing = false; lastDrawingSend = performance.now();
  room.sendAction({ type: 'drawing', gameId: view.gameId, turn: view.turn, revision: ++revision, strokes });
}
function queueDrawing() {
  dirtyDrawing = true;
  if (drawingTimer === null) drawingTimer = setTimeout(sendDrawing, Math.max(0, 80 - (performance.now() - lastDrawingSend)));
}
function finishStroke(flush = true) {
  const released = pointerId; pointerId = null; activeStroke = null;
  if (released !== null && canvas.hasPointerCapture(released)) canvas.releasePointerCapture(released);
  if (flush) sendDrawing();
}
function resetTurn() {
  finishStroke(false); clearTimeout(drawingTimer); drawingTimer = null; clearTimeout(guessTimer); guessTimer = null;
  dirtyDrawing = false; guessPending = false; strokes = []; totalPoints = revision = lastDrawingSend = 0;
  $('guess').value = ''; feedKey = ''; drawVectors([]);
}
function stopSession(message = 'Create a room or join your friends.', error = false) {
  room?.close(); room = null; clearInterval(tickTimer); tickTimer = null; authoritative = view = null; roster = []; host = false;
  turnKey = phaseKey = ''; resetTurn(); document.body.classList.remove('playing'); busy(false);
  $('setup').hidden = false; $('room-panel').hidden = true; $('welcome').hidden = false;
  for (const id of ['play-panel', 'finished-panel', 'ended-panel']) $(id).hidden = true;
  text('phase-label', 'DRAW IT. GUESS IT.'); text('timer', '✎'); text('round-label', 'ONE TURN EACH');
  $('timer').setAttribute('aria-label', 'Time remaining'); text('progress-label', 'THE ANSWER WAITS FOR ZERO'); renderGuide(); status(message, error);
}
function renderGuide() {
  const count = view ? view.players.filter(player => player.connected).length : roster.length;
  if (view?.players.some(player => !player.connected)) {
    text('group-guide', `${count} players remain from your ${view.totalTurns}-player game. Players who leave keep their earned points, and their future drawing turns are skipped.`);
    return;
  }
  text('group-guide', count < 2 ? 'With 2 players, take turns: one draws and the other guesses. After two turns, you have both been the artist.'
    : count === 2 ? 'Your 2-player game: one draws, one guesses. The counter can reach 1 correct answer each turn. Swap roles next turn; both of you draw once.'
      : `Your ${count}-player game: one draws and ${count - 1} guess at the same time. The counter can reach ${count - 1} correct answers each turn. ${count} turns give everyone a chance to draw.`);
}
function scoreRow(player, index, final = false) {
  const row = element('li'); row.append(element('span', 'avatar', String(index + 1)), element('span', '', `${player.name}${player.id === myId ? ' (you)' : ''}`));
  row.append(element('span', 'player-detail', final ? `${player.score} ${player.score === 1 ? 'POINT' : 'POINTS'}` : player.connected === false ? 'LEFT'
    : view ? `${player.score} PT${player.id === view.drawerId ? ' · ARTIST' : view.solvedIds.includes(player.id) ? ' · ✓' : ''}` : player.id === 'host' ? 'HOST' : 'READY'));
  return row;
}
function renderRoster() {
  $('roster').replaceChildren(...(view?.players ?? roster).map((player, index) => scoreRow(player, index)));
  text('room-help', view ? `Room ${room?.code ?? ''} · Each correct guesser earns one point.`
    : `${roster.length}/6 players. ${host ? roster.length < 2 ? 'Waiting for a friend.' : 'Everyone here? Start drawing.' : 'The host starts when everyone is ready.'}`);
  $('start-game').hidden = !host || Boolean(view); $('start-game').disabled = roster.length < 2;
  $('timer-setting').hidden = !host || Boolean(view); renderGuide();
}
function publish() {
  if (!authoritative || !room) return;
  receive(classicView(authoritative, myId)); room.broadcastState(id => classicView(authoritative, id));
}
function beginGame() {
  if (!host || !room) return;
  const players = authoritative ? authoritative.players.filter(player => player.connected).map(({ id, name }) => ({ id, name })) : roster;
  if (players.length < 2) { status('Invite at least one friend before starting.', true); return; }
  const rematch = Boolean(authoritative);
  authoritative = createClassic(players, crypto.randomUUID(), Number($('round-seconds').value));
  if (rematch) publish(); else room.start(id => classicView(authoritative, id));
}
function connect(isHost) {
  const name = $('player-name').value.trim();
  if (!validName(name)) { status('Enter a name using 1–18 characters.', true); $('player-name').focus(); return; }
  host = isHost; busy(true); status(host ? 'Opening your drawing circle…' : 'Finding your friends…');
  try {
    room = createRoom({ game: 'doodle-classic', host, name, code: $('join-code').value.trim().toUpperCase(), validState: validView, validAction,
      onReady: ({ code, id }) => {
        myId = id; $('setup').hidden = true; $('room-panel').hidden = false; $('room-code').value = code; text('copy-code', 'Copy');
        status(host ? 'Room open. Share the code with up to five friends.' : 'Connected. The artist draws; you guess the word.');
        if (host) tickTimer = setInterval(() => { if (authoritative && tickClassic(authoritative)) publish(); }, 250);
      },
      onRoster: players => { roster = players; renderRoster(); }, onStart: receive, onState: receive,
      onAction: (id, action) => { if (authoritative && applyClassic(authoritative, id, action)) publish(); },
      onLeave: id => { roster = roster.filter(player => player.id !== id); if (authoritative && leaveClassic(authoritative, id)) publish(); },
      onError: message => stopSession(message, true), onStatus: message => status(message),
    });
  } catch (error) { stopSession(error.message, true); }
}
function receive(snapshot) {
  view = snapshot;
  const nextTurn = `${view.gameId}:${view.turn}`, nextPhase = `${nextTurn}:${view.phase}`;
  if (turnKey !== nextTurn) { turnKey = nextTurn; resetTurn(); }
  document.body.classList.add('playing'); $('welcome').hidden = true;
  const active = ['choose', 'draw', 'reveal'].includes(view.phase);
  $('play-panel').hidden = !active; $('finished-panel').hidden = view.phase !== 'finished'; $('ended-panel').hidden = view.phase !== 'ended';
  text('phase-label', ({ choose: 'PICK A SECRET WORD', draw: 'DRAWING LIVE', reveal: 'TIME’S UP · THE ANSWER', finished: 'THE FINAL SCORES', ended: 'GAME ENDED' })[view.phase]);
  text('timer', ['choose', 'draw'].includes(view.phase) ? `${view.timeLeft}s` : view.phase === 'reveal' ? '0s' : '—');
  $('timer').setAttribute('aria-label', `${view.timeLeft} seconds remaining`);
  text('round-label', view.phase === 'finished' ? 'EVERYONE DREW ONCE' : `TURN ${view.turn + 1} / ${view.totalTurns}`);
  if (phaseKey !== nextPhase) {
    phaseKey = nextPhase; preparePhase();
    if (matchMedia('(max-width: 760px)').matches) document.querySelector('.work-area').scrollIntoView({ behavior: 'auto', block: 'start' });
  }
  renderRoster();
  if (active) renderTurn();
  if (view.phase === 'finished') renderFinish();
  if (view.phase === 'ended') text('ended-message', view.notice);
  if (view.notice) status(view.notice);
  else status(host ? 'Keep this tab open. The timer runs until zero, even after everyone guesses correctly.' : 'Correct guesses stay secret until time runs out. Each player counts once.');
}
function preparePhase() {
  const drawer = view.players.find(player => player.id === view.drawerId)?.name ?? 'The artist';
  const choosing = view.phase === 'choose', drawing = view.phase === 'draw', reveal = view.phase === 'reveal';
  text('task-kicker', reveal ? 'THE BIG REVEAL' : artist() ? 'YOU ARE THE ARTIST' : `${drawer.toUpperCase()} IS THE ARTIST`);
  text('task-title', choosing ? artist() ? 'Choose your secret word.' : `${drawer} is choosing a word.` : drawing ? artist() ? 'Draw it your way.' : 'What is the drawing?' : 'The word was…');
  text('task-help', choosing ? artist() ? 'Pick one. Your friends won’t see the answer yet.' : 'Get ready. You will see each stroke live.' : drawing ? artist() ? 'Your friends are guessing live. No letters or spelling clues.' : 'Type a word below. Keep trying until you get it.' : 'One point for each person who guessed correctly.');
  $('word-choices').hidden = !choosing || !artist();
  $('word-choices').replaceChildren(...view.choices.map(word => {
    const button = element('button', 'button', word); button.type = 'button';
    button.addEventListener('click', () => {
      if (view?.phase !== 'choose' || !artist()) return;
      for (const control of $('word-choices').children) control.disabled = true;
      room?.sendAction({ type: 'choose', gameId: view.gameId, turn: view.turn, word });
    }); return button;
  }));
  $('prompt-card').hidden = !reveal && !(drawing && artist()); text('prompt-label', reveal ? 'THE ANSWER' : 'YOUR SECRET WORD'); text('prompt-text', view.word ?? '');
  $('drawing-tools').hidden = !drawing || !artist(); $('drawing-note').hidden = !drawing || !artist();
  $('canvas-wrap').hidden = choosing; $('correct-count').hidden = choosing; $('guess-feed').hidden = choosing;
  $('guess-form').hidden = !drawing || artist(); $('host-controls').hidden = !host || !reveal;
  text('next-turn', view.turn + 1 === view.totalTurns ? 'Final scores →' : 'Next artist →');
}
function renderTurn() {
  const drawing = canDraw(), guessing = canGuess(), solved = view.solvedIds.includes(myId);
  if (!drawing) finishStroke(false);
  $('guess').disabled = !guessing; $('send-guess').disabled = !guessing;
  for (const control of $('drawing-tools').querySelectorAll('button,select')) control.disabled = !drawing;
  canvas.setAttribute('aria-disabled', String(!drawing)); canvas.setAttribute('aria-label', drawing ? 'Drawing canvas. Draw with your mouse, finger or pen.' : 'Live drawing canvas');
  // The artist keeps their newest local strokes; a delayed host echo must not erase ink still being sent.
  drawVectors(drawing ? strokes : view.strokes);
  text('correct-count', `${view.correctCount} correct ${view.correctCount === 1 ? 'answer' : 'answers'}`);
  text('progress-label', `${view.correctCount} / ${view.players.filter(player => player.id !== view.drawerId).length} GUESSED IT`);
  text('turn-status', view.phase === 'choose' ? 'A word is chosen automatically after 15 seconds.'
    : view.phase === 'reveal' ? host ? 'Give everyone a moment, then start the next turn.' : 'Waiting for the host to continue.'
      : solved ? 'You got it! The answer is revealed when the timer reaches zero.'
        : artist() ? 'Every stroke is shared live. Keep drawing until time is up.'
          : guessPending ? 'Guess sent…' : 'Correct answers stay hidden until the timer ends.');
  const key = JSON.stringify(view.guesses);
  if (feedKey !== key) {
    feedKey = key; $('guesses').replaceChildren(...(view.guesses.length ? view.guesses.map(guess => element('li', guess.correct ? 'correct' : '', guess.correct ? `${guess.name} guessed correctly ✓` : `${guess.name}: ${guess.text}`)) : [element('li', 'empty', 'Guesses will appear here.')]));
    $('guesses').scrollTop = $('guesses').scrollHeight;
  }
}
function renderFinish() {
  const players = [...view.players].sort((a, b) => b.score - a.score), best = players[0].score, winners = players.filter(player => player.score === best);
  text('winner-title', best === 0 ? 'No points. Plenty of masterpieces.' : `${winners.map(player => player.name).join(' & ')} ${winners.length === 1 ? 'wins' : 'share the win'}!`);
  $('final-scores').replaceChildren(...players.map((player, index) => scoreRow(player, index, true)));
  $('play-again').hidden = !host; $('play-again').disabled = view.players.filter(player => player.connected).length < 2;
  text('finished-help', host ? 'Same friends, new words? Start another game in this room.' : 'The host can start another game in this room.');
  text('progress-label', 'GOOD GUESSES. GREAT COMPANY.');
}

for (const [index, value] of COLORS.entries()) {
  const names = ['Ink', 'Coral', 'Gold', 'Green', 'Blue', 'Purple', 'White'], button = element('button', 'colour-button');
  button.type = 'button'; button.style.background = value; button.setAttribute('aria-label', names[index]); button.title = names[index]; button.setAttribute('aria-pressed', String(index === 0));
  button.addEventListener('click', () => { colour = value; for (const candidate of $('palette').querySelectorAll('button')) candidate.setAttribute('aria-pressed', String(candidate === button)); }); $('palette').append(button);
}
function point(event) {
  const rect = canvas.getBoundingClientRect();
  return [Math.max(0, Math.min(WIDTH, Math.round((event.clientX - rect.left) / rect.width * WIDTH))), Math.max(0, Math.min(HEIGHT, Math.round((event.clientY - rect.top) / rect.height * HEIGHT)))];
}
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || activeStroke || !canDraw()) return;
  if (strokes.length >= MAX_STROKES || totalPoints >= MAX_POINTS) { text('turn-status', 'Your drawing is full. Undo a stroke or clear the page to keep drawing.'); return; }
  event.preventDefault(); pointerId = event.pointerId; canvas.setPointerCapture(pointerId);
  const width = Number($('brush-size').value); activeStroke = { color: colour, width: BRUSHES.includes(width) ? width : 9, points: [point(event)] };
  strokes.push(activeStroke); totalPoints++; drawVectors(strokes); queueDrawing();
});
canvas.addEventListener('pointermove', event => {
  if (!activeStroke || event.pointerId !== pointerId || !canDraw()) return;
  event.preventDefault(); const next = point(event), last = activeStroke.points.at(-1);
  if (Math.hypot(next[0] - last[0], next[1] - last[1]) < 2) return;
  if (activeStroke.points.length >= 400 || totalPoints >= MAX_POINTS) { finishStroke(); text('turn-status', 'Stroke limit reached. Lift your pointer; undo a stroke if you need more room.'); return; }
  activeStroke.points.push(next); totalPoints++; drawVectors(strokes); queueDrawing();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => { if (event.pointerId === pointerId) finishStroke(); });
$('undo').addEventListener('click', () => { if (!canDraw()) return; finishStroke(false); const removed = strokes.pop(); totalPoints -= removed?.points.length ?? 0; dirtyDrawing = true; drawVectors(strokes); sendDrawing(); });
$('clear').addEventListener('click', () => { if (!canDraw()) return; finishStroke(false); strokes = []; totalPoints = 0; dirtyDrawing = true; drawVectors(strokes); sendDrawing(); });
$('guess-form').addEventListener('submit', event => {
  event.preventDefault(); if (!canGuess()) return;
  const action = { type: 'guess', gameId: view.gameId, turn: view.turn, text: $('guess').value.trim() };
  if (!validAction(action)) { text('turn-status', 'Enter a guess using 1–60 characters.'); return; }
  guessPending = true; $('guess').value = ''; renderTurn(); room?.sendAction(action);
  guessTimer = setTimeout(() => { guessTimer = null; guessPending = false; if (view?.phase === 'draw') { renderTurn(); if (canGuess()) $('guess').focus({ preventScroll: true }); } }, 600);
});
$('create-room').addEventListener('click', () => connect(true));
$('join-form').addEventListener('submit', event => { event.preventDefault(); connect(false); });
$('join-code').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase().replace(/\s/g, ''); });
$('start-game').addEventListener('click', beginGame); $('play-again').addEventListener('click', beginGame);
$('leave-room').addEventListener('click', () => stopSession()); $('new-room').addEventListener('click', () => stopSession());
$('next-turn').addEventListener('click', () => { if (host && authoritative && nextClassic(authoritative)) publish(); });
$('copy-code').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('room-code').value); text('copy-code', 'Copied'); }
  catch { $('room-code').focus(); $('room-code').select(); status('Code selected. Copy it with Ctrl+C or press and hold to copy.'); }
});
addEventListener('blur', () => finishStroke()); addEventListener('pagehide', () => stopSession());
drawVectors([]);
