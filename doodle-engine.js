export const WIDTH = 720, HEIGHT = 480;
export const COLORS = ['#252b3b', '#e65f69', '#e9b949', '#389d89', '#568be2', '#a875cd', '#ffffff'];
export const BRUSHES = [4, 9, 16];
export const MAX_STROKES = 120, MAX_POINTS = 2500;
export const validText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value);
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
const validName = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 18 && !/[\u0000-\u001f\u007f]/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validDrawing(strokes) {
  if (!Array.isArray(strokes) || strokes.length > MAX_STROKES) return false;
  let count = 0;
  return strokes.every(stroke => object(stroke) && Object.keys(stroke).length === 3 && COLORS.includes(stroke.color) && BRUSHES.includes(stroke.width)
    && Array.isArray(stroke.points) && stroke.points.length > 0 && stroke.points.length <= 400
    && (count += stroke.points.length) <= MAX_POINTS
    && stroke.points.every(point => Array.isArray(point) && point.length === 2
      && Number.isInteger(point[0]) && point[0] >= 0 && point[0] <= WIDTH
      && Number.isInteger(point[1]) && point[1] >= 0 && point[1] <= HEIGHT));
}

export function validAction(action) {
  if (!object(action) || Object.keys(action).length !== 5 || action.type !== 'submit' || !validId(action.gameId) || !Number.isInteger(action.round) || action.round < 0 || action.round > 6) return false;
  if (action.kind === 'text') return validText(action.text) && !('strokes' in action);
  return action.kind === 'drawing' && validDrawing(action.strokes) && action.strokes.length > 0 && !('text' in action);
}

export function createRelay(roster, gameId) {
  if (!Array.isArray(roster) || roster.length < 2 || roster.length > 6 || !validId(gameId)
      || new Set(roster.map(player => player?.id)).size !== roster.length
      || !roster.every(player => object(player) && validId(player.id) && validName(player.name))) throw new Error('Doodle Relay needs 2–6 players with valid names.');
  return {
    gameId, players: roster.map(player => ({ id: player.id, name: player.name.trim(), connected: true })),
    books: roster.map(player => ({ owner: player.id, name: player.name.trim(), steps: [] })),
    round: 0, totalRounds: roster.length % 2 ? roster.length : roster.length + 1,
    phase: 'play', timeLeft: 60, paused: false, bookIndex: 0, notice: '',
  };
}

export function assignedBook(state, id) {
  const index = state.players.findIndex(player => player.id === id);
  return index < 0 ? null : state.books[(index - state.round % state.players.length + state.players.length) % state.players.length];
}
export const allSubmitted = state => state.players.filter(player => player.connected).every(player => assignedBook(state, player.id).steps.length > state.round);

export function submitRelay(state, id, action) {
  if (state.phase !== 'play' || state.paused || state.timeLeft <= 0 || !validAction(action) || action.gameId !== state.gameId || action.round !== state.round
      || !state.players.some(player => player.id === id && player.connected)) return false;
  const book = assignedBook(state, id), player = state.players.find(candidate => candidate.id === id);
  if (book.steps.length !== state.round || action.kind !== (state.round % 2 ? 'drawing' : 'text')) return false;
  book.steps.push({ author: id, name: player.name, kind: action.kind, skipped: false,
    ...(action.kind === 'text' ? { text: action.text.trim() } : { strokes: action.strokes.map(stroke => ({ color: stroke.color, width: stroke.width, points: stroke.points.map(point => [...point]) })) }) });
  return true;
}

export function advanceRelay(state) {
  if (state.phase !== 'play' || state.paused || (!allSubmitted(state) && state.timeLeft > 0)) return false;
  for (const player of state.players) {
    const book = assignedBook(state, player.id);
    if (book.steps.length === state.round) book.steps.push({ author: player.id, name: player.name,
      kind: state.round % 2 ? 'drawing' : 'text', skipped: true,
      ...(state.round % 2 ? { strokes: [] } : { text: 'A sleepy penguin on a skateboard' }) });
  }
  if (state.round + 1 === state.totalRounds) { state.phase = 'reveal'; state.timeLeft = 0; }
  else { state.round++; state.timeLeft = state.round % 2 ? 90 : 60; }
  return true;
}

export function tickRelay(state, seconds = 1) {
  if (state.phase !== 'play' || state.paused || !Number.isFinite(seconds) || seconds < 0) return;
  state.timeLeft = Math.max(0, state.timeLeft - Math.min(seconds, 2));
}

export function leaveRelay(state, id) {
  const player = state.players.find(candidate => candidate.id === id);
  if (!player || !player.connected) return false;
  player.connected = false;
  state.notice = `${player.name} left. Their unfinished turns will be skipped.`;
  if (state.players.filter(candidate => candidate.connected).length < 2 && state.phase === 'play') {
    state.phase = 'ended'; state.timeLeft = 0; state.notice = 'The relay ended because fewer than two players remain. Create a new room to play again.';
  }
  return true;
}

export function nextBook(state) {
  if (state.phase !== 'reveal' || state.bookIndex >= state.books.length - 1) return false;
  state.bookIndex++;
  return true;
}

// Each guest sees only the preceding turn of their own task until the host reveals a book.
export function relayView(state, id) {
  const phase = state.phase === 'play' ? state.round === 0 ? 'write' : state.round % 2 ? 'draw' : 'guess' : state.phase;
  const assigned = assignedBook(state, id), previous = assigned?.steps[state.round - 1];
  return {
    gameId: state.gameId, phase, round: state.round, totalRounds: state.totalRounds,
    timeLeft: Math.ceil(state.timeLeft), paused: state.paused, notice: state.notice,
    players: state.players.map(player => ({ ...player, submitted: state.phase !== 'play' || assignedBook(state, player.id).steps.length > state.round })),
    task: state.phase === 'play' && previous ? previous.kind === 'text' ? { text: previous.text, skipped: previous.skipped } : { strokes: previous.strokes, skipped: previous.skipped } : null,
    book: state.phase === 'reveal' ? state.books[state.bookIndex] : null,
    bookIndex: state.bookIndex, bookCount: state.books.length,
  };
}

export function validView(view) {
  if (!object(view) || !validId(view.gameId) || !['write', 'draw', 'guess', 'reveal', 'ended'].includes(view.phase)
      || !Number.isInteger(view.round) || view.round < 0 || view.round > 6 || ![3, 5, 7].includes(view.totalRounds) || view.round >= view.totalRounds
      || !Number.isInteger(view.timeLeft) || view.timeLeft < 0 || view.timeLeft > 90 || typeof view.paused !== 'boolean'
      || typeof view.notice !== 'string' || view.notice.length > 200 || !Array.isArray(view.players) || view.players.length < 2 || view.players.length > 6
      || new Set(view.players.map(player => player?.id)).size !== view.players.length
      || !view.players.every(player => object(player) && validId(player.id) && validName(player.name) && typeof player.connected === 'boolean' && typeof player.submitted === 'boolean')
      || view.bookCount !== view.players.length || !Number.isInteger(view.bookIndex) || view.bookIndex < 0 || view.bookIndex >= view.bookCount) return false;
  if (view.phase === 'draw' && (!object(view.task) || !validText(view.task.text) || typeof view.task.skipped !== 'boolean' || 'strokes' in view.task)) return false;
  if (view.phase === 'guess' && (!object(view.task) || !validDrawing(view.task.strokes) || typeof view.task.skipped !== 'boolean' || 'text' in view.task)) return false;
  if (!['draw', 'guess'].includes(view.phase) && view.task !== null) return false;
  if (view.phase !== 'reveal') return view.book === null;
  return object(view.book) && validId(view.book.owner) && validName(view.book.name)
    && Array.isArray(view.book.steps) && view.book.steps.length === view.totalRounds
    && view.book.steps.every((step, index) => object(step) && validId(step.author) && validName(step.name) && typeof step.skipped === 'boolean'
      && (index % 2 ? step.kind === 'drawing' && validDrawing(step.strokes) : step.kind === 'text' && validText(step.text)));
}
