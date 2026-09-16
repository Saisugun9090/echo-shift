# Sugun Games

Seven browser games by Sai Sugun. Pick a game, play with keyboard or touch, and return to the collection using the Sugun Games link. Multiplayer rooms support up to six friends.

**[Play Sugun Games](https://sugungames.vercel.app/)**

## Games

| Game | What to play | Players |
| --- | --- | --- |
| [Pocket Bowl](https://sugungames.vercel.app/bowling.html) | Take turns bowling ten frames. Set your aim, power and spin, then chase strikes and spares. | 1–6 |
| [Bumper Bash](https://sugungames.vercel.app/bumper.html) | Collect stars and bump friends around the arena in a 90-second match. | 1–6 |
| [Doodle Classic](https://sugungames.vercel.app/doodle.html) | One person draws live; everyone else guesses the secret word. Relay mode is also available. | 2–6 |
| [Brick Garage](https://sugungames.vercel.app/bricks.html) | Choose a toy-brick chassis, top, wheels and paint. Drive through eight checkpoints before time runs out. | 1 |
| [Formula Club](https://sugungames.vercel.app/race.html) | Race three laps around Sugun Park. Practise alone or share a room code with friends. | 1–6 |
| [Echo Shift](https://sugungames.vercel.app/echo.html) | Record routes, rewind, and use your echoes to solve five puzzle chambers. | 1 |
| [Pocket Snake](https://sugungames.vercel.app/snake.html) | Eat apples, grow, and avoid the walls and your tail. | 1 |

## Race with friends

1. Open Formula Club, enter a driver name and choose **Create a room**.
2. Share the six-character code. Friends open the same page, enter the code and choose **Join**.
3. With 2–6 drivers in the room, the host chooses **Start race**. A seventh player is told the room is full.

Keep the host's tab visible: hiding it pauses the shared race. Leaving closes the room; return to the lobby to create another. Cars pass through one another. The host runs the race simulation; guests send steering, gas and brake inputs.

Rooms use the bundled [PeerJS 1.5.5](./vendor/README.md) client and public PeerJS signaling/relay services. Players do not need an account. Some work or school networks can block connections; solo practice remains available. These are casual rooms, without ranked matchmaking or an independent game server.

## Bowl with friends

Open **Pocket Bowl**, enter your name and create a room. Share its six-character code with up to five friends; everyone joins from the same game page. The host starts with 2–6 players. **Solo practice** lets one player play a full game without a room.

Take turns setting aim, power and spin, then bowl. Each player plays ten frames with up to two rolls to clear ten pins. A strike adds the next two rolls; a spare adds the next roll. Strikes and spares in the tenth frame earn bonus rolls. The highest completed score wins. Keep the host's tab open for the whole game; the host owns the scores and leaving ends the room.

## Party games

Bumper Bash and both Doodle modes have their own **Create a room** and **Join** controls. Share the code with up to five friends on the same game and mode. The host starts once at least two players have joined. Keep the host tab open; closing it ends the room. Bumper Bash and Relay pause while the host tab is hidden; Classic uses elapsed time for its countdown.

- **Bumper Bash:** move toward stars and knock other cars away. There is no elimination. Most stars when the 90-second timer ends wins. Solo practice is available.
- **Doodle Classic (default):** the artist chooses one of three easy words and draws while everyone else guesses. Each player's first correct guess adds one point and increments the shared correct-answer counter. Correct guesses are hidden from the guess feed. The timer keeps running even if everyone guesses correctly; the answer is revealed only when it expires. The host then starts the next artist's turn. Everyone draws once per match. Choose 30, 60 or 90 seconds per drawing; word selection lasts up to 15 seconds.
- **Doodle Relay:** everyone starts a sentence, then alternates drawing and guessing as books pass around. Submit your turn and wait for the host to advance. The host can advance once everyone is done or time runs out. At the end, reveal each book together. Four to six players creates the most variety, but two can play too.

### Classic guide by group size

| Players | Each turn | Turns per match | Most correct answers per turn |
| --- | --- | --- | --- |
| 2 | One draws, the other guesses; swap next turn | 2 | 1 |
| 3 | One draws, two guess | 3 | 2 |
| 4 | One draws, three guess | 4 | 3 |
| 5 | One draws, four guess | 5 | 4 |
| 6 | One draws, five guess | 6 | 5 |

No sentence writing is needed in Classic. Guess as often as needed until correct or time runs out; repeat correct guesses never add extra points. Draw pictures without writing the answer. Switch to **Relay** using the mode links if you want drawing telephone.

Doodle Classic sends the chosen word only to the artist until reveal; Relay sends each guest their private task. The host runs the game and necessarily holds its answers. Text and drawings stay in the active room; this site does not save them. Treat the host and room guests as people you trust.

## Controls

| Game | Controls |
| --- | --- |
| Pocket Bowl | Adjust the aim, power and spin sliders with keyboard or touch, then bowl on your turn. |
| Bumper Bash | Arrows / WASD or the on-screen direction buttons. |
| Doodle Classic / Relay | Type guesses; draw with a mouse, pen or touch. Brush, colour, undo and clear controls are on screen. Classic shares strokes as you draw. |
| Brick Garage | Arrows / WASD: accelerate, steer, brake and reverse. P: pause. On-screen driving buttons also work. |
| Formula Club | Arrows / WASD: gas, steer and brake. P: pause solo practice. On-screen driving buttons also work. |
| Echo Shift | Arrows / WASD: move. Space: record and rewind. Period: wait. R: reset. Buttons and adjacent tiles support touch. |
| Pocket Snake | Arrows / WASD, direction buttons or swipes. P: pause. Space also pauses when the board is focused. |

Brick Garage saves your car and best time on this device when storage is available. Echo Shift and Pocket Snake also keep local best scores. Switching away pauses solo games.

In Echo Shift, two echoes replay your routes and hold their final positions; a third replaces the oldest. Echoes move before you enter a gate. Blocked moves do not advance time. Rewinding restores the crystals, so collect all of them in your final run.

## Development

Node.js 24. Native HTML, CSS, JavaScript modules and Canvas; no install or build step.

```sh
npm start
npm test
```

Open [localhost:4180](http://127.0.0.1:4180). Set `PORT` to use another port. Each game has a separate page, renderer and deterministic engine. Node tests cover puzzle solutions, Snake rules, car builds and driving, lap validation, bowling scores and the room protocol.

## Deployment

Repository: [Saisugun9090/sugun-games](https://github.com/Saisugun9090/sugun-games). Vercel project: `sugungames`.

Deploy these public files with no build command or runtime server:

```text
index.html  arcade.css  icon.svg
echo.html   style.css   game.js   engine.js   levels.js
snake.html  snake.css   snake.js  snake-engine.js
bricks.html bricks.css  bricks.js bricks-engine.js
race.html   race.css    race.js   race-engine.js race-network.js
bumper.html bumper.css bumper.js bumper-engine.js
doodle.html doodle.css doodle.js doodle-engine.js room-network.js
doodle-relay.html doodle-classic.css doodle-classic.js doodle-classic-engine.js
bowling.html bowling.css bowling.js bowling-engine.js
vendor/peerjs.min.js    vendor/peerjs.LICENSE
```

GitHub Actions runs the tests and updates the [Pages mirror](https://saisugun9090.github.io/sugun-games/) from `main`. The old Vercel address remains an alias.
