import { WIDTH, HEIGHT, COLORS, BRUSHES, MAX_STROKES, MAX_POINTS, createRelay, relayView, validView, validAction, submitRelay, advanceRelay, tickRelay, leaveRelay, nextBook } from './doodle-engine.js?v=party-20260916';
import { createRoom, validName } from './room-network.js?v=party-20260916';

const $ = id => document.getElementById(id);
const canvas = $('drawing-canvas');
let room = null, authoritative = null, view = null, roster = [], myId = 'host', host = false;
let taskKey = '', revealKey = '', strokes = [], activeStroke = null, pointerId = null, totalPoints = 0;
let colour = COLORS[0], pending = false, pendingTimer = null, manualPause = false;
const playing = () => view && ['write', 'draw', 'guess'].includes(view.phase);
const me = () => view?.players.find(player => player.id === myId);
const canAnswer = () => playing() && !me()?.submitted && !view.paused && view.timeLeft > 0 && !pending;
function status(message, error = false) { $('connection-status').textContent = message; $('connection-status').classList.toggle('error', error); }
function setBusy(busy) { $('create-room').disabled = busy; $('join-form').querySelector('button').disabled = busy; }
function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function drawVectors(target, list) {
  const ctx = target.getContext('2d'); ctx.fillStyle = '#fffef9'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const stroke of list) {
    ctx.strokeStyle = ctx.fillStyle = stroke.color; ctx.lineWidth = stroke.width;
    if (stroke.points.length === 1) { ctx.beginPath(); ctx.arc(...stroke.points[0], stroke.width / 2, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(...stroke.points[0]); for (const point of stroke.points.slice(1)) ctx.lineTo(...point); ctx.stroke(); }
  }
}
function finishStroke() {
  activeStroke = null;
  if (pointerId !== null && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  pointerId = null;
}
function resetAnswer() {
  finishStroke(); clearTimeout(pendingTimer); pending = false; strokes = []; totalPoints = 0;
  $('answer').value = ''; $('character-count').textContent = '0 / 120'; drawVectors(canvas, []);
}
function stopSession(message = 'Create a room or join your friends.', error = false) {
  room?.close(); room = null; authoritative = view = null; roster = []; taskKey = revealKey = ''; host = false; manualPause = false;
  resetAnswer(); document.body.classList.remove('playing');
  $('setup').hidden = false; $('room-panel').hidden = true; $('welcome').hidden = false;
  for (const id of ['play-panel', 'reveal-panel', 'ended-panel']) $(id).hidden = true;
  $('phase-label').textContent = 'PASS IT ON'; $('timer').textContent = '✎'; $('round-label').textContent = 'A LITTLE CHAOS, TOGETHER';
  $('progress-label').textContent = 'KEEP THE SURPRISE SECRET'; setBusy(false); status(message, error);
}
function renderRoster() {
  const list = view?.players ?? roster;
  $('roster').replaceChildren(...list.map((player, index) => {
    const row = element('li'); row.append(element('span', 'avatar', String(index + 1)), element('span', '', `${player.name}${player.id === myId ? ' (you)' : ''}`));
    row.append(element('span', 'player-detail', player.connected === false ? 'LEFT' : playing() ? player.submitted ? 'DONE ✓' : 'CREATING' : player.id === 'host' ? 'HOST' : 'READY'));
    return row;
  }));
  $('room-help').textContent = view ? `Room ${room?.code ?? ''} · Keep your task secret until the reveal.` : `${roster.length}/6 players. ${host ? roster.length < 2 ? 'Waiting for a friend.' : 'Everyone here? Start the relay.' : 'The host starts when everyone is ready.'}`;
  $('start-game').hidden = !host || Boolean(view); $('start-game').disabled = roster.length < 2;
}
function publish() {
  if (!authoritative || !room) return;
  receive(relayView(authoritative, myId)); room.broadcastState(id => relayView(authoritative, id));
}
function beginRelay() {
  if (!host || !room) return;
  const players = authoritative ? authoritative.players.filter(player => player.connected).map(({ id, name }) => ({ id, name })) : roster;
  if (players.length < 2) { status('Invite at least one friend before starting.', true); return; }
  const alreadyStarted = Boolean(authoritative);
  authoritative = createRelay(players, crypto.randomUUID()); manualPause = false;
  authoritative.paused = document.hidden;
  if (alreadyStarted) publish(); else room.start(id => relayView(authoritative, id));
}
function connect(isHost) {
  const name = $('player-name').value.trim();
  if (!validName(name)) { status('Enter a name using 1–18 characters.', true); $('player-name').focus(); return; }
  host = isHost; setBusy(true); status(host ? 'Opening your drawing circle…' : 'Finding your friends…');
  try {
    room = createRoom({
      game: 'doodle', host, name, code: $('join-code').value.trim().toUpperCase(), validState: validView, validAction,
      onReady: ({ code, id }) => {
        myId = id; $('setup').hidden = true; $('room-panel').hidden = false; $('room-code').value = code; $('copy-code').textContent = 'Copy';
        status(host ? 'Room open. Share the code with up to five friends.' : 'Connected. Get ready to draw something questionable.');
      },
      onRoster: players => { roster = players; renderRoster(); },
      onStart: receive, onState: receive,
      onAction: (id, action) => { if (authoritative && submitRelay(authoritative, id, action)) publish(); },
      onLeave: id => { roster = roster.filter(player => player.id !== id); if (authoritative && leaveRelay(authoritative, id)) publish(); },
      onError: message => stopSession(message, true), onStatus: message => status(message),
    });
  } catch (error) { stopSession(error.message, true); }
}
function receive(snapshot) {
  view = snapshot; document.body.classList.add('playing'); $('welcome').hidden = true;
  $('play-panel').hidden = !playing(); $('reveal-panel').hidden = view.phase !== 'reveal'; $('ended-panel').hidden = view.phase !== 'ended';
  $('phase-label').textContent = ({ write: 'WRITE A SENTENCE', draw: 'DRAW IT YOUR WAY', guess: 'WHAT ON EARTH IS THAT?', reveal: 'THE BIG REVEAL', ended: 'RELAY ENDED' })[view.phase];
  $('timer').textContent = playing() ? view.paused ? 'Ⅱ' : `${view.timeLeft}s` : view.phase === 'reveal' ? '↘' : '—';
  $('timer').setAttribute('aria-label', playing() ? view.paused ? 'Timer paused' : `${view.timeLeft} seconds remaining` : 'Relay complete');
  $('round-label').textContent = playing() ? `ROUND ${view.round + 1} / ${view.totalRounds}` : view.phase === 'reveal' ? `STORY ${view.bookIndex + 1} / ${view.bookCount}` : 'BRING YOUR FRIENDS BACK';
  const key = `${view.gameId}:${view.round}:${view.phase}`;
  if (key !== taskKey) {
    taskKey = key; resetAnswer();
    if (playing()) prepareTask();
    if (matchMedia('(max-width: 760px)').matches) document.querySelector('.work-area').scrollIntoView({ behavior: 'auto', block: 'start' });
  }
  if (me()?.submitted) { pending = false; clearTimeout(pendingTimer); }
  renderRoster();
  if (playing()) renderTurn();
  if (view.phase === 'reveal') renderReveal();
  if (view.phase === 'ended') $('ended-message').textContent = view.notice;
  if (view.notice) status(view.notice);
  else if (view.paused) status(host ? 'Timer paused. Resume here when everyone is ready.' : 'The host paused the timer. Your work is saved in this tab.');
  else if (playing()) status(host ? 'You host the relay. Keep this tab visible; advance when everyone is done or time is up.' : 'Only your current task is shared with you. The host advances each round.');
}
function prepareTask() {
  const drawing = view.phase === 'draw', guessing = view.phase === 'guess';
  $('task-title').textContent = drawing ? 'Give it your best bad drawing.' : guessing ? 'Describe what you see.' : 'Start something silly.';
  $('task-help').textContent = drawing ? 'Someone else has to guess this. No pressure, obviously.' : guessing ? 'One sentence. Your guess becomes the next person’s prompt.' : 'A tiny scene, a strange character, an unlikely adventure.';
  $('prompt-card').hidden = !drawing; $('reference-wrap').hidden = !guessing;
  $('drawing-tools').hidden = !drawing; $('text-tools').hidden = drawing;
  $('answer-label').textContent = guessing ? 'Your best guess' : 'Your opening sentence';
  $('answer').placeholder = guessing ? 'I think this is…' : 'A penguin delivering pizza on a skateboard';
  $('task-kicker').textContent = view.task?.skipped ? 'PREVIOUS TURN WAS SKIPPED · IMPROVISE!' : 'YOUR SECRET TASK';
  if (drawing) $('prompt-text').textContent = view.task.text;
  if (guessing) drawVectors($('reference-canvas'), view.task.strokes);
  $('submit-answer').replaceChildren(document.createTextNode('Pass it on'), element('span', '', '→'));
}
function renderTurn() {
  const connected = view.players.filter(player => player.connected), ready = connected.filter(player => player.submitted).length;
  $('progress-label').textContent = `${ready} / ${connected.length} READY`;
  const allowed = canAnswer(); $('answer').disabled = !allowed; $('submit-answer').disabled = !allowed;
  for (const control of $('drawing-tools').querySelectorAll('button,select')) control.disabled = !allowed;
  $('drawing-canvas').setAttribute('aria-disabled', String(!allowed));
  $('turn-status').textContent = me()?.submitted ? `Passed on ✓ · ${ready} of ${connected.length} ready. Waiting for the host.` : pending ? 'Sending your masterpiece…' : view.paused ? 'Timer paused. Your work stays here.' : view.timeLeft === 0 ? 'Time is up. Waiting for the host to pass the books.' : 'Your answer stays secret until the reveal.';
  if (!allowed) finishStroke();
  $('host-controls').hidden = !host;
  $('next-round').disabled = view.paused || (ready < connected.length && view.timeLeft > 0);
  $('next-round').textContent = view.round + 1 === view.totalRounds ? 'Reveal the chaos →' : 'Next round →';
  $('pause').textContent = view.paused ? 'Resume timer' : 'Pause timer';
}
function renderReveal() {
  const key = `${view.gameId}:${view.bookIndex}`;
  if (key !== revealKey) {
    revealKey = key; $('reveal-kicker').textContent = `STORY ${view.bookIndex + 1} OF ${view.bookCount}`;
    $('reveal-title').textContent = `${view.book.name}’s story.`;
    $('reveal-chain').replaceChildren(...view.book.steps.map((step, index) => {
      const card = element('article', 'reveal-step'), heading = element('div', 'step-label');
      heading.append(element('span', '', index === 0 ? '01 / THE ORIGINAL IDEA' : `${String(index + 1).padStart(2, '0')} / ${step.kind === 'drawing' ? 'THE DRAWING' : 'THE GUESS'}`), element('span', '', step.name)); card.append(heading);
      if (step.kind === 'text') card.append(element('p', '', step.text));
      else { const image = element('canvas'); image.width = WIDTH; image.height = HEIGHT; image.setAttribute('role', 'img'); image.setAttribute('aria-label', `${step.name}’s drawing, step ${index + 1}`); drawVectors(image, step.strokes); card.append(image); }
      if (step.skipped) card.append(element('p', 'skipped', step.kind === 'text' ? 'Turn skipped · a fallback sentence kept the relay going.' : 'Turn skipped · an empty page passed on.'));
      return card;
    }));
  }
  const last = view.bookIndex === view.bookCount - 1;
  $('next-book').hidden = !host || last; $('play-again').hidden = !host || !last;
  $('play-again').disabled = view.players.filter(player => player.connected).length < 2;
  $('reveal-help').textContent = host ? last ? 'That’s the whole gallery. Same friends, new terrible drawings?' : 'Give everyone a moment to read the story, then reveal the next one.' : last ? 'The host can start a fresh relay, or leave the room when you’re done.' : 'The host reveals the next story when everyone is ready.';
  $('progress-label').textContent = last ? 'A MASTERPIECE, PROBABLY' : 'THE PLOT THICKENS';
}

for (const [index, value] of COLORS.entries()) {
  const names = ['Ink', 'Coral', 'Gold', 'Green', 'Blue', 'Purple', 'White'];
  const button = element('button', 'colour-button'); button.type = 'button'; button.style.background = value; button.setAttribute('aria-label', names[index]); button.title = names[index]; button.setAttribute('aria-pressed', String(index === 0));
  button.addEventListener('click', () => { colour = value; for (const candidate of $('palette').querySelectorAll('button')) candidate.setAttribute('aria-pressed', String(candidate === button)); });
  $('palette').append(button);
}
function point(event) {
  const rect = canvas.getBoundingClientRect();
  return [Math.max(0, Math.min(WIDTH, Math.round((event.clientX - rect.left) / rect.width * WIDTH))), Math.max(0, Math.min(HEIGHT, Math.round((event.clientY - rect.top) / rect.height * HEIGHT)))];
}
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || activeStroke || !canAnswer() || view.phase !== 'draw') return;
  if (strokes.length >= MAX_STROKES || totalPoints >= MAX_POINTS) { $('turn-status').textContent = 'Your drawing is full. Undo a stroke or pass it on.'; return; }
  event.preventDefault(); pointerId = event.pointerId; canvas.setPointerCapture(pointerId);
  const width = Number($('brush-size').value); activeStroke = { color: colour, width: BRUSHES.includes(width) ? width : 9, points: [point(event)] };
  strokes.push(activeStroke); totalPoints++; drawVectors(canvas, strokes);
});
canvas.addEventListener('pointermove', event => {
  if (!activeStroke || event.pointerId !== pointerId || !canAnswer()) return;
  event.preventDefault(); const next = point(event), last = activeStroke.points.at(-1);
  if (Math.hypot(next[0] - last[0], next[1] - last[1]) < 2) return;
  if (activeStroke.points.length >= 400 || totalPoints >= MAX_POINTS) { finishStroke(); $('turn-status').textContent = 'Stroke limit reached. Lift your pointer; undo a stroke if you need more room.'; return; }
  activeStroke.points.push(next); totalPoints++; drawVectors(canvas, strokes);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => { if (event.pointerId === pointerId) finishStroke(); });
$('undo').addEventListener('click', () => { if (!canAnswer()) return; finishStroke(); const removed = strokes.pop(); totalPoints -= removed?.points.length ?? 0; drawVectors(canvas, strokes); });
$('clear').addEventListener('click', () => { if (!canAnswer()) return; finishStroke(); strokes = []; totalPoints = 0; drawVectors(canvas, strokes); });
$('answer').addEventListener('input', () => { $('character-count').textContent = `${$('answer').value.length} / 120`; });
$('answer-form').addEventListener('submit', event => {
  event.preventDefault(); if (!canAnswer()) return; finishStroke();
  const action = { type: 'submit', gameId: view.gameId, round: view.round,
    ...(view.phase === 'draw' ? { kind: 'drawing', strokes } : { kind: 'text', text: $('answer').value.trim() }) };
  if (!validAction(action)) { $('turn-status').textContent = view.phase === 'draw' ? 'Make at least one mark before passing it on.' : 'Write a sentence using 1–120 characters.'; return; }
  pending = true; renderTurn(); room?.sendAction(action);
  if (pending) pendingTimer = setTimeout(() => { pending = false; if (playing()) { renderTurn(); $('turn-status').textContent = 'No confirmation yet. Try passing it on again.'; } }, 8000);
});
$('create-room').addEventListener('click', () => connect(true));
$('join-form').addEventListener('submit', event => { event.preventDefault(); connect(false); });
$('join-code').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase().replace(/\s/g, ''); });
$('start-game').addEventListener('click', beginRelay); $('play-again').addEventListener('click', beginRelay);
$('leave-room').addEventListener('click', () => stopSession()); $('new-room').addEventListener('click', () => stopSession());
$('next-round').addEventListener('click', () => { if (host && authoritative && advanceRelay(authoritative)) publish(); });
$('next-book').addEventListener('click', () => { if (host && authoritative && nextBook(authoritative)) publish(); });
$('pause').addEventListener('click', () => { if (!host || !authoritative) return; manualPause = !manualPause; authoritative.paused = manualPause || document.hidden; publish(); });
$('copy-code').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('room-code').value); $('copy-code').textContent = 'Copied'; }
  catch { $('room-code').focus(); $('room-code').select(); status('Code selected. Copy it with Ctrl+C or press and hold to copy.'); }
});
setInterval(() => { if (host && authoritative?.phase === 'play') { tickRelay(authoritative); publish(); } }, 1000);
document.addEventListener('visibilitychange', () => { finishStroke(); if (host && authoritative?.phase === 'play') { authoritative.paused = manualPause || document.hidden; publish(); } });
addEventListener('blur', finishStroke); addEventListener('pagehide', () => stopSession());
drawVectors(canvas, []);
