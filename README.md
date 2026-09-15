# Echo Shift

A browser puzzle game by Sai Sugun. Record a route, rewind and use your echoes to hold switches while you collect crystals and reach the exit.

## Controls

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

`engine.js` holds the deterministic rules; `game.js` handles Canvas rendering and input. Tests cover every chamber solution, echo timing, blocked moves, resets and crystal collection. Solution fixtures stay in the test file.

## Deployment

Deploy `index.html`, `style.css`, `game.js`, `engine.js`, `levels.js` and `icon.svg` as static files on Vercel. No build command or runtime server is needed. GitHub Actions also tests changes and updates the [Pages mirror](https://drsai9090.github.io/echo-shift/) from `main`.
