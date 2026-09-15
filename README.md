# Echo Shift

An original browser puzzle game by **Sai Sugun**. Record your route, rewind, and cooperate with echoes of your previous moves to escape five chambers.

Personal portfolio project. The working directory name, Tenet, is an internal codename; the game uses original visuals and no film, game-franchise or employer assets.

## Play

Collect every crystal in the current run, then reach the exit. Stand on switches to open the matching gates. An echo can hold a switch while you take another route.

| Control | Action |
| --- | --- |
| WASD or arrow keys | Move one square |
| Space | Rewind and record the current route as an echo |
| Period (`.`) | Wait one turn |
| R | Reset the current chamber |
| On-screen buttons | Touch and pointer controls |

Up to two echoes replay recorded movement as you take turns, then hold their final position. Echoes move first; a gate must be held when you enter. Recorded echoes pass freely through gates. A third recording replaces the oldest. Blocked moves do not advance time. Rewinding starts a new run, so collect the crystals again before leaving. Best move counts are saved in this browser using `localStorage` when storage is available.

## Run locally

Use Node.js 24. There are no dependencies to install and no build step.

```sh
npm start
```

Open [the local game](http://127.0.0.1:4180). Set the `PORT` environment variable to an integer between 1 and 65535 to choose another port.

```sh
npm test
```

Tests run with Node's built-in test runner. The test output and GitHub Actions run are the evidence for each revision; this README does not assume a run has passed.

## Engineering

- Browser-native JavaScript modules and Canvas rendering, with HTML controls.
- Deterministic game rules separated from rendering so moves and solutions can be tested without a browser.
- A five-chamber scope, keyboard and touch input, and browser-local best scores.
- Node's built-in HTTP server serves only the six public game files on localhost.
- GitHub Actions runs tests before packaging an explicit list of public files for Pages.

This is a small single-player puzzle game. It has no accounts, multiplayer service or AI API. Browser-local scores are personal records and are not a competitive leaderboard.

## Deployment

The workflow in `.github/workflows/pages.yml` tests pull requests and deploys successful `main` runs through GitHub Pages. In repository **Settings → Pages**, choose **GitHub Actions** as the source.

Repository: [drsai9090/echo-shift](https://github.com/drsai9090/echo-shift).

Play: [Echo Shift on GitHub Pages](https://drsai9090.github.io/echo-shift/).

The deployed artifact contains only `index.html`, `style.css`, `game.js`, `engine.js`, `levels.js` and `icon.svg`. Source, tests, documentation and local tooling stay outside the website artifact.
