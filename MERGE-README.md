# AethoFlix + 3D Watch Party

This package keeps the existing AethoFlix site and API routes, and builds the Arena 3D cinema into `/party/`.

## Vercel
- Build command: `npm run build`
- Output is generated at `party/`
- Add `VITE_TMDB_API_KEY` as a Vercel Environment Variable.
- Do not commit `.env.local`.

## Important
The Arena Watch Party transport in this version uses `BroadcastChannel`, so its multiplayer room works only between tabs in the same browser/device profile. It is not cross-device realtime multiplayer yet.
