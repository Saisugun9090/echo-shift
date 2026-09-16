import { COLORS, PIN_POSITIONS, ballPosition, createBowling, bowl, settleRoll, leaveBowling, validAction, validState, scoreFrames, rankPlayers } from './bowling-engine.js?v=bowling-20260916';
import { createRoom, validName } from './room-network.js?v=bowling-20260916';

const $ = id => document.getElementById(id);
const canvas = $('lane'), ctx = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sliders = ['aim', 'power', 'spin'].map($);
let room = null, state = null, roster = [], mode = 'menu', myId = 'host', settleTimer = null;
let shotStarted = 0, shownShot = '', frameRequest = 0;
const SHOT_MS = 1900;
const settings = () => ({ aim: Number($('aim').value) / 100, power: Number($('power').value) / 100, spin: Number($('spin').value) / 100 });
const isMyTurn = () => state?.phase === 'aiming' && state.players[state.turn]?.id === myId && state.players[state.turn]?.connected;
function status(message, error = false) { $('connection-status').textContent = message; $('connection-status').classList.toggle('error', error); }
function busy(value) { for (const id of ['create-room', 'practice']) $(id).disabled = value; $('join-form').querySelector('button').disabled = value; }
function name() { const value = $('player-name').value.trim(); if (validName(value)) return value; status('Enter a name using 1–18 characters.', true); $('player-name').focus(); return null; }
function reset(message = 'Create a room, join your friends or bowl a solo game.', error = false) {
  clearTimeout(settleTimer); settleTimer = null; room?.close(); room = null; state = null; roster = []; mode = 'menu'; myId = 'host'; shownShot = '';
  $('setup').hidden = false; for (const id of ['room-panel', 'session-panel', 'score-section']) $(id).hidden = true;
  document.body.classList.remove('playing'); busy(false); status(message, error); render();
}
function rosterRows(players, scored = false) {
  return players.map((player, index) => {
    const li = document.createElement('li'), dot = document.createElement('span'), title = document.createElement('span'), score = document.createElement('span');
    dot.className = 'swatch'; dot.style.background = COLORS[state ? state.players.findIndex(item => item.id === player.id) : index];
    title.textContent = `${player.name}${player.id === myId ? ' (you)' : ''}`; score.className = 'score';
    score.textContent = scored ? `${player.score}` : player.id === 'host' ? 'HOST' : 'READY';
    li.classList.toggle('active', !!state && state.phase !== 'finished' && state.players[state.turn]?.id === player.id); li.append(dot, title, score); return li;
  });
}
function connect(host) {
  const playerName = name(); if (!playerName) return;
  busy(true); mode = host ? 'host' : 'guest'; status(host ? 'Opening your lane…' : 'Joining the lane…');
  try {
    room = createRoom({ game: 'bowling', host, name: playerName, code: $('join-code').value.trim().toUpperCase(), validState, validAction,
      onReady: ({ code, id }) => { myId = id; $('setup').hidden = true; $('room-panel').hidden = false; $('room-code').value = code; $('copy-code').textContent = 'Copy'; $('start-game').hidden = !host; status(host ? 'Your lane is open. Share the code with your friends.' : 'You are in! The host will start the game.'); },
      onRoster: players => { roster = players; $('roster').replaceChildren(...rosterRows(players)); $('start-game').disabled = players.length < 2; $('room-help').textContent = `${players.length}/6 players. ${host ? players.length < 2 ? 'Waiting for a friend.' : 'Ready to roll.' : 'The host starts the game.'}`; },
      onStart: begin, onState: receive,
      onAction: (id, action) => { if (state && bowl(state, id, action)) { receive(state); room.broadcastState(state); scheduleSettlement(); } },
      onLeave: id => { roster = roster.filter(player => player.id !== id); if (state) { const player = state.players.find(item => item.id === id); leaveBowling(state, id); status(`${player?.name ?? 'A player'} left. Their remaining turns are skipped.`); receive(state); room.broadcastState(state); } },
      onError: message => reset(message, true), onStatus: message => status(message),
    });
  } catch (error) { reset(error.message, true); }
}
function begin(next) {
  clearTimeout(settleTimer); settleTimer = null; shownShot = ''; state = next;
  $('setup').hidden = true; $('room-panel').hidden = true; $('session-panel').hidden = false; $('score-section').hidden = false;
  document.body.classList.add('playing'); $('mode-label').textContent = mode === 'practice' ? 'SOLO PRACTICE' : `ROOM ${room.code}`;
  status(mode === 'practice' ? 'Ten frames to find your favourite line.' : mode === 'host' ? 'Your room is live. Keep this tab open until everyone finishes.' : 'Watch the lane. Your controls unlock when it is your turn.');
  receive(next);
  $('play-area').focus({ preventScroll: true });
  if (matchMedia('(max-width: 760px)').matches) canvas.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
}
function receive(next) {
  if (state && state.gameId !== next.gameId) { begin(next); return; }
  state = next;
  const shotKey = next.lastShot ? `${next.gameId}:${next.lastShot.id}` : '';
  if (shotKey !== shownShot) {
    shownShot = shotKey; shotStarted = performance.now();
    if (next.phase === 'rolling' && next.lastShot?.playerId === myId) canvas.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
  }
  render();
}
function scheduleSettlement() {
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => { settleTimer = null; if (!state || !['host', 'practice'].includes(mode)) return; settleRoll(state); render(); if (mode === 'host') room?.broadcastState(state); }, SHOT_MS);
}
function roll() {
  if (!isMyTurn()) return;
  const action = { type: 'bowl', gameId: state.gameId, revision: state.revision, ...settings() };
  if (mode === 'practice') { if (bowl(state, myId, action)) { receive(state); scheduleSettlement(); } }
  else room?.sendAction(action);
}
function scorecard() {
  $('scorecard').replaceChildren(...state.players.map((player, playerIndex) => {
    const row = document.createElement('tr'), heading = document.createElement('th'), scored = scoreFrames(player.frames);
    heading.scope = 'row'; heading.textContent = `${player.name}${player.id === myId ? ' (you)' : ''}`;
    if (!player.connected) { const left = document.createElement('small'); left.textContent = 'LEFT THE GAME'; heading.append(left); }
    row.append(heading);
    for (let i = 0; i < 10; i++) {
      const cell = document.createElement('td'), marks = document.createElement('span'), total = document.createElement('span'); marks.className = 'marks'; total.className = 'total';
      marks.textContent = scored.marks[i].join(' '); total.textContent = scored.frames[i] ?? (player.frames[i].length ? '…' : '');
      cell.classList.toggle('pending', scored.frames[i] === null); cell.classList.toggle('current', state.phase !== 'finished' && playerIndex === state.turn && i === state.frame); cell.append(marks, total); row.append(cell);
    }
    const total = document.createElement('td'); total.textContent = String(scored.total); row.append(total); return row;
  }));
}
function render() {
  const turn = isMyTurn(); $('bowl').disabled = !turn; sliders.forEach(input => { input.disabled = !turn; });
  $('frame-number').textContent = state ? `${state.frame + 1} / 10` : '— / 10';
  $('shot-banner').hidden = !!state && state.phase !== 'finished';
  if (!state) {
    $('lane-title').textContent = 'A good time, rolling.'; $('shot-result').textContent = 'Try a solo game or bring your friends.'; $('control-help').textContent = 'Start a game to bowl. Adjust the sliders with a mouse, touch or arrow keys.';
    $('shot-banner').querySelector('span').textContent = 'WELCOME TO THE CLUB'; $('shot-banner').querySelector('strong').textContent = "Let's roll.";
  } else {
    const current = state.players[state.turn], ranked = rankPlayers(state), finished = state.phase === 'finished';
    const leaders = ranked.filter(player => player.score === ranked[0]?.score);
    const title = finished ? mode === 'practice' ? 'Nice game.' : leaders.length > 1 ? 'A shared victory!' : leaders.length ? `${leaders[0].name} wins!` : 'Game over.' : `${current.name}${current.id === myId ? ', you’re up.' : ' is up.'}`;
    $('turn-title').textContent = finished ? 'Final scores.' : state.phase === 'rolling' ? 'Watch it roll.' : title;
    $('lane-title').textContent = finished ? title : state.phase === 'rolling' ? `${current.name} is bowling.` : title;
    $('turn-detail').textContent = finished ? 'All ten frames are complete.' : `Frame ${state.frame + 1} · ${state.phase === 'rolling' ? 'Ball on the lane' : `${state.pins.filter(Boolean).length} pins standing`}`;
    $('standings').replaceChildren(...rosterRows(ranked, true)); $('rematch').hidden = !finished || mode === 'guest';
    $('control-help').textContent = finished ? 'Play again for another ten frames.' : state.phase === 'rolling' ? 'Everyone sees the same roll. Your next turn is coming.' : turn ? 'Follow the dotted line. Adjust aim, power and spin, then press Bowl.' : `Waiting for ${current.name} to bowl.`;
    const shot = state.lastShot;
    if (shot) {
      const bowler = state.players.find(player => player.id === shot.playerId);
      const mark = scoreFrames(bowler.frames).marks.findLast(frame => frame.length)?.at(-1);
      const result = mark === 'X' ? 'Strike!' : mark === '/' ? 'Spare!' : shot.knocked === 0 ? 'No pins this time.' : `${shot.knocked} pin${shot.knocked === 1 ? '' : 's'} down.`;
      $('shot-result').textContent = `${bowler.name}: ${result}`;
    } else $('shot-result').textContent = 'A fresh rack. Take your first shot.';
    if (finished) { $('shot-banner').querySelector('span').textContent = 'THAT’S TEN FRAMES'; $('shot-banner').querySelector('strong').textContent = title; }
    scorecard();
  }
  redraw();
}
function point(x, y) { const depth = Math.max(0, Math.min(1, y)); return { x: 450 + x * (288 - depth * 158), y: 597 - depth * 485, scale: 1 - depth * .48 }; }
function polygon(points, fill) { ctx.fillStyle = fill; ctx.beginPath(); points.forEach((p, index) => index ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill(); }
function drawBall(x, y, color) {
  const p = point(x, y), r = 18 * p.scale;
  ctx.fillStyle = '#13284455'; ctx.beginPath(); ctx.ellipse(p.x + 3, p.y + 6, r * 1.2, r * .55, 0, 0, Math.PI * 2); ctx.fill();
  const shine = ctx.createRadialGradient(p.x - r * .35, p.y - r * .4, 1, p.x, p.y, r); shine.addColorStop(0, '#ffffff'); shine.addColorStop(.15, color); shine.addColorStop(1, '#173455');
  ctx.fillStyle = shine; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#132844';
  for (const [dx, dy] of [[-.2, -.25], [.13, -.37], [.18, .05]]) { ctx.beginPath(); ctx.arc(p.x + dx * r, p.y + dy * r, r * .1, 0, Math.PI * 2); ctx.fill(); }
}
function drawPin(index, standing, fall) {
  const pin = PIN_POSITIONS[index], p = point(pin.x, pin.y), scale = p.scale;
  if (!standing && !fall) return;
  ctx.save(); ctx.translate(p.x, p.y); ctx.scale(scale, scale);
  if (fall) { ctx.translate((index % 2 ? 1 : -1) * fall * 24, -fall * 10); ctx.rotate((index % 2 ? 1 : -1) * fall * 1.4); ctx.globalAlpha = 1 - fall * .65; }
  ctx.fillStyle = '#614b3555'; ctx.beginPath(); ctx.ellipse(3, 4, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fffaf0'; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.bezierCurveTo(-13, -10, -4, -21, -4, -28); ctx.bezierCurveTo(-10, -37, 10, -37, 4, -28); ctx.bezierCurveTo(4, -21, 13, -10, 9, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d34b3c'; ctx.fillRect(-5, -23, 10, 3); ctx.fillRect(-6, -18, 12, 3); ctx.restore();
}
function redraw() {
  cancelAnimationFrame(frameRequest); frameRequest = 0;
  ctx.fillStyle = '#294f79'; ctx.fillRect(0, 0, 900, 650);
  for (const side of [-1, 1]) { polygon([point(side * 1.7, 0), point(side * 1.7, 1), point(side * 1.24, 1), point(side * 1.24, 0)], '#315983'); }
  polygon([point(-1.2, 0), point(-1.2, 1), point(1.2, 1), point(1.2, 0)], '#102c49');
  polygon([point(-1, 0), point(-1, 1), point(1, 1), point(1, 0)], '#e1b57f');
  for (let i = 0; i < 18; i++) { const left = -1 + i / 9, right = left + 1 / 9; polygon([point(left, 0), point(left, 1), point(right, 1), point(right, 0)], i % 3 === 0 ? '#eac18d' : i % 3 === 1 ? '#dfb17a' : '#e5bb87'); }
  ctx.strokeStyle = '#835e3233'; ctx.lineWidth = 1;
  for (let i = 1; i < 13; i++) { const a = point(-1, i / 13), b = point(1, i / 13); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  const foulA = point(-1, .065), foulB = point(1, .065); ctx.strokeStyle = '#724d37'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(foulA.x, foulA.y); ctx.lineTo(foulB.x, foulB.y); ctx.stroke();
  ctx.fillStyle = '#805c3b'; for (let i = -3; i <= 3; i++) { const p = point(i * .18, .4 - Math.abs(i) * .02); polygon([{ x: p.x, y: p.y - 8 }, { x: p.x - 4, y: p.y + 4 }, { x: p.x + 4, y: p.y + 4 }], '#805c3b'); }
  ctx.fillStyle = '#c5d9ea'; ctx.font = '11px monospace'; ctx.textAlign = 'center'; ctx.fillText('S U G U N   B O W L I N G   C L U B', 450, 51);
  const shot = state?.lastShot, rolling = state?.phase === 'rolling', progress = rolling ? Math.min(1, (performance.now() - shotStarted) / SHOT_MS) : 1;
  const travel = reducedMotion ? 1 : Math.min(1, progress / .72), impact = Math.max(0, (progress - .61) / .39);
  const pins = rolling && !reducedMotion ? shot.before : state?.pins ?? Array(10).fill(true);
  for (let i = PIN_POSITIONS.length - 1; i >= 0; i--) { const falling = rolling && shot.before[i] && !shot.after[i] && (reducedMotion || impact > 0); drawPin(i, pins[i] && !falling, falling && !reducedMotion ? Math.min(1, impact) : 0); }
  if (!state || state.phase === 'aiming') {
    const controls = settings(); ctx.beginPath(); ctx.setLineDash([4, 8]); ctx.lineWidth = 2; ctx.strokeStyle = '#17345588';
    for (let i = 0; i <= 30; i++) { const position = ballPosition(i / 30, controls.aim, controls.power, controls.spin), p = point(position.x, position.y); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } ctx.stroke(); ctx.setLineDash([]);
    drawBall(0, .03, COLORS[state?.turn ?? 0]);
  } else if (rolling && progress < .82 && !reducedMotion) { const p = ballPosition(travel, shot.aim, shot.power, shot.spin); drawBall(p.x, p.y, COLORS[state.players.findIndex(player => player.id === shot.playerId)]); }
  if (rolling && progress < 1 && !reducedMotion) frameRequest = requestAnimationFrame(redraw);
}
for (const input of sliders) input.addEventListener('input', () => { const { aim, power, spin } = settings(); $('aim-value').value = aim === 0 ? 'Centre' : `${Math.round(Math.abs(aim) * 100)}% ${aim < 0 ? 'left' : 'right'}`; $('power-value').value = `${Math.round(power * 100)}%`; $('spin-value').value = spin === 0 ? 'Straight' : `${Math.round(Math.abs(spin) * 100)}% ${spin < 0 ? 'left' : 'right'}`; redraw(); });
$('create-room').addEventListener('click', () => connect(true));
$('join-form').addEventListener('submit', event => { event.preventDefault(); connect(false); });
$('practice').addEventListener('click', () => { const playerName = name(); if (!playerName) return; reset(); mode = 'practice'; begin(createBowling([{ id: 'host', name: playerName }], crypto.randomUUID())); });
$('start-game').addEventListener('click', () => { if (mode === 'host' && roster.length >= 2) room.start(createBowling(roster, crypto.randomUUID())); });
$('bowl-form').addEventListener('submit', event => { event.preventDefault(); roll(); });
for (const id of ['leave-room', 'leave-game']) $(id).addEventListener('click', () => reset());
$('rematch').addEventListener('click', () => { if (mode === 'practice') begin(createBowling([{ id: myId, name: state.players[0].name }], crypto.randomUUID())); else if (mode === 'host') { if (roster.length < 2) { status('A new online game needs two players. Leave the room to invite a new crew.', true); return; } begin(createBowling(roster, crypto.randomUUID())); room.broadcastState(state); } });
$('copy-code').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('room-code').value); $('copy-code').textContent = 'Copied'; } catch { $('room-code').select(); status('Select and copy the room code to share it.'); } });
window.addEventListener('pagehide', () => reset());
render();
