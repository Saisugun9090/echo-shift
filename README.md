# Sugun Games

Two browser games by Sai Sugun. Choose a game from the home page, and use the Sugun Games link to return to the collection.

[Play on Vercel](https://echo-shift-mu.vercel.app/)

## Games

- **[Echo Shift](https://echo-shift-mu.vercel.app/echo.html)** — record routes, rewind, and use your echoes to solve five puzzle chambers.
- **[Pocket Snake](https://echo-shift-mu.vercel.app/snake.html)** — eat apples, grow, and avoid walls and your own tail. The pace increases every three apples.

Pocket Snake uses arrow keys, WASD, on-screen direction buttons, or swipes. Press P (or Space with the board focused) to pause. Start, resume, restart, and replay also have buttons. Switching away pauses the game. Best scores are stored only on your device when browser storage is available.

## Echo Shift controls

| Control | Action |
| --- | --- |
| Arrows / WASD | Move |
| Space | Record an echo and rewind |
| Period (`.`) | Wait one step |
| R | Reset the chamber |
| Buttons / adjacent tiles | Touch and mouse controls |

Two echoes replay your routes and hold their final positions. A third replaces the oldest. Echoes move before you enter a gate and replay freely through gates. Blocked moves do not advance time. Rewinding restores the crystals; collect all of them in your final run. Best scores stay in your browser when storage is available.

## Development

Node.js 24, no dependencies or build step.

```sh
npm start
npm test
```

Open [localhost:4180](http://127.0.0.1:4180). Set `PORT` to use another port.

`index.html` is a static game picker. `echo.html` loads the existing Echo Shift engine and renderer. `snake.html` loads the separate Snake engine and renderer. Tests cover every Echo Shift solution, echo timing, blocked moves, resets, crystal collection, Snake growth, turn buffering, collisions, tail movement and a full-board win. No shared runtime or client router is needed.

## Deployment

Deploy these public assets to the existing Vercel project (`echo-shift`):

```text
index.html  arcade.css  icon.svg
echo.html   style.css   game.js   engine.js   levels.js
snake.html  snake.css   snake.js  snake-engine.js
```

No build command or runtime server is needed. GitHub Actions also tests changes and updates the [Pages mirror](https://saisugun9090.github.io/echo-shift/) from `main`. The repository and Vercel project names stay `echo-shift`; the website is branded Sugun Games.
