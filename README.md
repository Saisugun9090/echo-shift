# Sugun Games

Four browser games by Sai Sugun. Pick a game, play with keyboard or touch, and return to the collection using the Sugun Games link.

**[Play Sugun Games](https://sugungames.vercel.app/)**

## Games

| Game | What to play | Players |
| --- | --- | --- |
| [Brick Garage](https://sugungames.vercel.app/bricks.html) | Choose a toy-brick chassis, top, wheels and paint. Drive through eight checkpoints before time runs out. | 1 |
| [Formula Club](https://sugungames.vercel.app/race.html) | Race three laps around Sugun Park. Practise alone or share a room code with friends. | 1–4 |
| [Echo Shift](https://sugungames.vercel.app/echo.html) | Record routes, rewind, and use your echoes to solve five puzzle chambers. | 1 |
| [Pocket Snake](https://sugungames.vercel.app/snake.html) | Eat apples, grow, and avoid the walls and your tail. | 1 |

## Race with friends

1. Open Formula Club, enter a driver name and choose **Create a room**.
2. Share the six-character code. Friends open the same page, enter the code and choose **Join**.
3. With 2–4 drivers in the room, the host chooses **Start race**.

Keep the host's tab visible: hiding it pauses the shared race. Leaving closes the room; return to the lobby to create another. Cars pass through one another. The host runs the race simulation; guests send steering, gas and brake inputs.

Rooms use the bundled [PeerJS 1.5.5](./vendor/README.md) client and public PeerJS signaling/relay services. Players do not need an account. Some work or school networks can block connections; solo practice remains available. These are casual rooms, without ranked matchmaking or an independent game server.

## Controls

| Game | Controls |
| --- | --- |
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

Open [localhost:4180](http://127.0.0.1:4180). Set `PORT` to use another port. Each game has a separate page, renderer and deterministic engine. Node tests cover puzzle solutions, Snake rules, car builds and driving, lap validation and the room protocol.

## Deployment

Repository: [Saisugun9090/sugun-games](https://github.com/Saisugun9090/sugun-games). Vercel project: `sugungames`.

Deploy these public files with no build command or runtime server:

```text
index.html  arcade.css  icon.svg
echo.html   style.css   game.js   engine.js   levels.js
snake.html  snake.css   snake.js  snake-engine.js
bricks.html bricks.css  bricks.js bricks-engine.js
race.html   race.css    race.js   race-engine.js race-network.js
vendor/peerjs.min.js    vendor/peerjs.LICENSE
```

GitHub Actions runs the tests and updates the [Pages mirror](https://saisugun9090.github.io/sugun-games/) from `main`. The old Vercel address remains an alias.
