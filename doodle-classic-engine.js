import { validDrawing } from './doodle-engine.js?v=classic-20260916';

const WORDS = 'apple,banana,carrot,pizza,cake,cupcake,ice cream,bread,egg,cheese,burger,sandwich,cookie,popcorn,lemon,watermelon,strawberry,pineapple,cat,dog,fish,bird,duck,penguin,elephant,giraffe,lion,monkey,rabbit,bee,butterfly,spider,snake,turtle,octopus,whale,shark,crab,snail,frog,house,castle,tent,bridge,tree,flower,cactus,mountain,volcano,island,sun,moon,star,rainbow,cloud,snowman,umbrella,balloon,kite,rocket,airplane,helicopter,boat,car,bus,train,bicycle,tractor,skateboard,chair,table,bed,lamp,clock,key,lock,phone,camera,television,book,pencil,scissors,hammer,ladder,bucket,shoe,hat,crown,glasses,watch,ring,guitar,drum,trumpet,football,basketball,tennis racket,bowling pin,robot,ghost,dragon,mermaid,treasure chest,lighthouse,windmill'.split(',');
const wordSet = new Set(WORDS);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
const validId = value => text(value, 100);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const normalise = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const cloneDrawing = strokes => strokes.map(stroke => ({ color: stroke.color, width: stroke.width, points: stroke.points.map(point => [...point]) }));

export function validAction(action) {
  if (!object(action) || !validId(action.gameId) || !integer(action.turn, 0, 5)) return false;
  if (action.type === 'choose') return exact(action, ['type', 'gameId', 'turn', 'word']) && wordSet.has(action.word);
  if (action.type === 'drawing') return exact(action, ['type', 'gameId', 'turn', 'revision', 'strokes'])
    && integer(action.revision, 1, 2147483646) && validDrawing(action.strokes);
  return action.type === 'guess' && exact(action, ['type', 'gameId', 'turn', 'text']) && text(action.text, 60) && normalise(action.text).length > 0;
}

function beginTurn(state, now, random) {
  state.phase = 'choose';
  state.drawerId = state.players[state.turn].id;
  state.deadline = now + 15000;
  state.timeLeft = 15;
  state.word = null;
  state.choices = Array.from({ length: 3 }, () => state.words.splice(Math.floor(random() * state.words.length), 1)[0]);
  state.strokes = [];
  state.revision = 0;
  state.solvedIds = [];
  state.guesses = [];
  state.guessTimes = new Map();
  state.notice = '';
}

export function createClassic(roster, gameId, seconds = 60, now = Date.now(), random = Math.random) {
  if (!Array.isArray(roster) || roster.length < 2 || roster.length > 6 || !validId(gameId)
    || ![30, 60, 90].includes(seconds) || !Number.isFinite(now) || typeof random !== 'function'
    || new Set(roster.map(player => player?.id)).size !== roster.length
    || !roster.every(player => object(player) && validId(player.id) && text(player.name, 18))) {
    throw new Error('Doodle Classic needs 2–6 players and a 30, 60 or 90 second timer.');
  }
  const state = { gameId, seconds, turn: 0, totalTurns: roster.length,
    players: roster.map(player => ({ id: player.id, name: player.name.trim(), connected: true, score: 0 })), words: [...WORDS] };
  beginTurn(state, now, random);
  return state;
}

function chooseWord(state, word, now) {
  state.word = word;
  state.choices = [];
  state.phase = 'draw';
  state.deadline = now + state.seconds * 1000;
  state.timeLeft = state.seconds;
}

export function tickClassic(state, now = Date.now()) {
  if (!Number.isFinite(now) || !['choose', 'draw'].includes(state.phase)) return false;
  const before = `${state.phase}:${state.timeLeft}`;
  // Anchor to the real deadline so a background host cannot extend a turn.
  if (state.phase === 'choose' && now >= state.deadline) chooseWord(state, state.choices[0], state.deadline);
  if (state.phase === 'draw' && now >= state.deadline) { state.phase = 'reveal'; state.timeLeft = 0; }
  else state.timeLeft = Math.max(0, Math.min(state.phase === 'choose' ? 15 : state.seconds, Math.ceil((state.deadline - now) / 1000)));
  return before !== `${state.phase}:${state.timeLeft}`;
}

export function applyClassic(state, id, action, now = Date.now()) {
  if (!Number.isFinite(now)) return false;
  const changed = tickClassic(state, now);
  const player = state.players.find(candidate => candidate.id === id && candidate.connected);
  if (!player || !validAction(action) || action.gameId !== state.gameId || action.turn !== state.turn) return changed;
  if (action.type === 'choose' && state.phase === 'choose' && id === state.drawerId && state.choices.includes(action.word)) {
    chooseWord(state, action.word, now);
    return true;
  }
  if (state.phase !== 'draw') return changed;
  if (action.type === 'drawing' && id === state.drawerId && action.revision > state.revision) {
    state.strokes = cloneDrawing(action.strokes);
    state.revision = action.revision;
    return true;
  }
  if (action.type !== 'guess' || id === state.drawerId || state.solvedIds.includes(id)
    || now - (state.guessTimes.get(id) ?? -Infinity) < 400) return changed;
  state.guessTimes.set(id, now);
  const correct = normalise(action.text) === normalise(state.word);
  if (correct) { player.score++; state.solvedIds.push(id); }
  state.guesses.push({ id, name: player.name, text: correct ? 'guessed correctly' : action.text.trim(), correct });
  if (state.guesses.length > 20) state.guesses.shift();
  return true;
}

export function nextClassic(state, now = Date.now(), random = Math.random) {
  if (state.phase !== 'reveal' || !Number.isFinite(now) || typeof random !== 'function') return false;
  let turn = state.turn + 1;
  while (turn < state.totalTurns && !state.players[turn].connected) turn++;
  if (turn === state.totalTurns) { state.phase = 'finished'; return true; }
  state.turn = turn;
  beginTurn(state, now, random);
  return true;
}

export function leaveClassic(state, id, now = Date.now()) {
  const player = state.players.find(candidate => candidate.id === id && candidate.connected);
  if (!player || !Number.isFinite(now)) return false;
  tickClassic(state, now);
  player.connected = false;
  state.notice = `${player.name} left. Their future drawing turn will be skipped.`;
  if (state.players.filter(candidate => candidate.connected).length < 2 && !['finished', 'ended'].includes(state.phase)) {
    state.phase = 'ended'; state.timeLeft = 0;
    state.notice = 'The game ended because fewer than two players remain. Return to the lobby to play again.';
  } else if (id === state.drawerId && ['choose', 'draw'].includes(state.phase)) {
    state.word ??= state.choices[0]; state.choices = [];
    state.phase = 'reveal'; state.timeLeft = 0;
    state.notice = `${player.name} left while drawing. The host can start the next turn.`;
  }
  return true;
}

// The complete word pool, answer and deadline stay on the host, outside guest views.
export function classicView(state, id) {
  return {
    gameId: state.gameId, phase: state.phase, turn: state.turn, totalTurns: state.totalTurns,
    drawerId: state.drawerId, seconds: state.seconds, timeLeft: state.timeLeft,
    players: state.players.map(player => ({ ...player })), correctCount: state.solvedIds.length,
    solvedIds: [...state.solvedIds], strokes: cloneDrawing(state.strokes), guesses: state.guesses.map(guess => ({ ...guess })),
    word: ['reveal', 'finished'].includes(state.phase) || state.phase === 'draw' && id === state.drawerId ? state.word : null,
    choices: state.phase === 'choose' && id === state.drawerId ? [...state.choices] : [], notice: state.notice,
  };
}

export function validView(view) {
  if (!exact(view, ['gameId', 'phase', 'turn', 'totalTurns', 'drawerId', 'seconds', 'timeLeft', 'players', 'correctCount', 'solvedIds', 'strokes', 'guesses', 'word', 'choices', 'notice'])
    || !validId(view.gameId) || !['choose', 'draw', 'reveal', 'finished', 'ended'].includes(view.phase)
    || !integer(view.totalTurns, 2, 6) || !integer(view.turn, 0, view.totalTurns - 1) || ![30, 60, 90].includes(view.seconds)
    || !integer(view.timeLeft, 0, view.phase === 'choose' ? 15 : view.phase === 'draw' ? view.seconds : 0)
    || typeof view.notice !== 'string' || view.notice.length > 200 || /[\u0000-\u001f\u007f]/.test(view.notice)
    || !Array.isArray(view.players) || view.players.length !== view.totalTurns
    || !view.players.every(player => exact(player, ['id', 'name', 'connected', 'score']) && validId(player.id) && text(player.name, 18)
      && typeof player.connected === 'boolean' && integer(player.score, 0, view.totalTurns - 1))
    || new Set(view.players.map(player => player.id)).size !== view.totalTurns || view.drawerId !== view.players[view.turn].id
    || !Array.isArray(view.solvedIds) || view.solvedIds.length >= view.totalTurns || new Set(view.solvedIds).size !== view.solvedIds.length
    || !view.solvedIds.every(id => id !== view.drawerId && view.players.some(player => player.id === id && player.score > 0))
    || view.correctCount !== view.solvedIds.length || !validDrawing(view.strokes)
    || !Array.isArray(view.guesses) || view.guesses.length > 20
    || !view.guesses.every(guess => exact(guess, ['id', 'name', 'text', 'correct'])
      && guess.id !== view.drawerId && view.players.some(player => player.id === guess.id && player.name === guess.name)
      && typeof guess.correct === 'boolean' && text(guess.text, 60)
      && (!guess.correct || guess.text === 'guessed correctly' && view.solvedIds.includes(guess.id)))
    || !Array.isArray(view.choices) || ![0, 3].includes(view.choices.length) || !view.choices.every(word => wordSet.has(word))
    || new Set(view.choices).size !== view.choices.length) return false;
  if (view.phase === 'choose') return view.word === null && view.correctCount === 0 && view.strokes.length === 0 && view.guesses.length === 0;
  if (view.choices.length !== 0) return false;
  if (['reveal', 'finished'].includes(view.phase)) return wordSet.has(view.word);
  return view.phase === 'draw' ? view.word === null || wordSet.has(view.word) : view.word === null;
}
