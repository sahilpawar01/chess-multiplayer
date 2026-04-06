# Chess Multiplayer

Real-time chess over the web with Socket.IO. Previously hosted on [Render](https://chess-multiplayer-5103.onrender.com); this branch adds a v2 UI and features and can be deployed to Vercel (see caveats below).

## Features (v2)

- Real-time multiplayer via Socket.IO
- Room-based matchmaking (6-character room codes)
- Chess clock (10 minutes per side)
- Move history in algebraic notation (two columns)
- Pawn promotion picker
- In-game chat with quick messages
- Board theme picker (Classic, Green, Ice)
- Share room via URL (`?room=CODE`)
- Resign, draw offer / accept / decline, rematch (both players must request)
- Dark Chess.com–inspired UI (Playfair Display + DM Sans + DM Mono)
- Optional Web Audio sound effects (toggle in Controls)

## Deploy

- **Socket.IO**: Long-lived WebSocket connections are a poor fit for Vercel’s serverless model. For production, run this Node server on **Railway**, **Render**, or another host that keeps a single process alive.
- **Vercel**: A `vercel.json` is included for experimentation; for reliable real-time play, use Vercel for static assets only or host the full app on Railway/Render.

## Environment

Set on the host (e.g. Render dashboard):

- `PORT` — listen port (default `3000`)
- `NODE_ENV=production`

## Local dev

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in two browser tabs. Tab 1: enter name, generate room, **Create room (White)**. Tab 2: same room code, **Join room (Black)**.

## Scripts

- `npm start` — run `node app.js`
- `npm run dev` — run with nodemon

## Branch

Feature work for v2 lives on `feature/v2-ui-and-features`.
