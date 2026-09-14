# Adding AethoFlix Cinema + Watch Party to Your Existing Site

Step-by-step instructions for taking this prototype and running it inside an existing website. No account or paid service is required for the app itself.

---

## What this is

- A full OTT movie site first: touch-swipeable hero carousel with gliding animations, genres bar, multiple curated OTT rails (Trending, Action, Sci-Fi, Comedy, Horror, Anime), Watchlist bookmarking, Continue Watching, background YouTube trailer playback in detail modal, category pages, search studio, detail modal, mobile dock (black & white liquid-glass design).
- A normal 2D theater player with five TMDB servers (eight for anime), per-server Sub/Dub, ReCloud source, Nxsha-only sandboxing, and an episode explorer.
- An **optional** walkable 3D theatre + Watch Party inside it (React + TypeScript + Vite + Three.js), reachable via 1-click instant play without scrolling through deep menus, with an always-accessible floating cinema bar.
- 10 individual recliners, stairs, collision, third-person player.
- TMDB movie/series/anime search, explicit playback servers, per-server Sub/Dub and sandbox settings, AniList/MAL ID resolution, a local "My list".
- Online Firebase Watch Party rooms, companion bots, in-seat snack service, and a cafe with NPCs beyond the exit.
- Graphics presets (Ultra / Adaptive / Performance) and a 120 fps target on 120 Hz displays.

**Important limits:** Watch Party uses Firebase Anonymous Authentication and Realtime Database. It supports different devices, but not voice/text chat. The TMDB and Firebase web API keys are visible in the browser bundle by design; security comes from Firebase Authentication and Database Rules, not from hiding those public client identifiers.

---

## Step 1 — Requirements

- Node.js 18 or newer and npm.
- A place to serve static files (any host works: Vercel, Netlify, GitHub Pages, nginx, cPanel, an S3 bucket, or your existing site's `/public` folder).

## Step 2 — Install and run locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite. Verify the cinema loads, you can walk, sit, and ring for service.

## Step 3 — Configure the TMDB key and admin analytics

Create or edit `.env.local` / Vercel env vars:

```bash
VITE_TMDB_API_KEY=your_tmdb_key
MONGO_URI=mongodb+srv://...
ADMIN_PIN=2611
```

Admin dashboard URL:

```text
https://aethoflix.vercel.app/admin
```

Default PIN is `2611`. The panel includes overview stats, live watching, users, reports, VIP/trial codes, broadcast announcements, and tools. Public pages send page-view and watch-session analytics to `/api/analytics`.

Create or edit `.env.local` in the project root:

```
VITE_TMDB_API_KEY=fca1c3fa675f74cf4aa8d24b72dd4807
```

- `.env.example` documents this variable.
- The key is embedded in the built JavaScript and visible to visitors. For production, register your own key at https://www.themoviedb.org/settings/api, put it here, rebuild, and ideally rotate it periodically.
- The app defaults to the alternate metadata endpoint `https://api.tmdb.org/3`. The "Metadata connection" selector inside the collection can switch to `https://api.themoviedb.org/3`. This only affects metadata, never your playback server.

## Step 4 — Build

```bash
npm run build
```

This produces:

- `dist/index.html` — the entire app (React, Three.js, styles) inlined into one file.
- `dist/navigation.worker.*.js` — a small worker the app loads for layout checks.

**Copy both files together.** The worker must live next to `index.html` with its original filename.

## Step 5 — Add it to your existing site

### Option A — Host the build as its own page

1. Upload `dist/index.html` and `dist/navigation.worker.*.js` to a folder like `/cinema/` on your host.
2. Link to it from your site: `<a href="/cinema/">Private Cinema</a>`.

### Option B — Embed with an iframe

```html
<iframe src="/cinema/" title="AethoFlix Private Cinema"
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        style="width:100%;height:100vh;border:0"></iframe>
```

- Serve the app from the **same origin** as your site so the Watch Party's tab-to-tab communication works between the iframe and normal tabs. Cross-origin embedding still plays, but party tabs must share the same origin and browser profile.
- Open the iframe in its own tab for the best experience (safari/Chrome storage partitioning can isolate an embedded frame's tabs from standalone ones).

### Option C — Merge into an existing React/Vite app

1. Copy the folders `src/cinema/`, `src/catalog/`, `src/watch-party/`, `src/components/`, and `src/styles/` into your project.
2. Copy `public/images/afterlight.jpg` and `public/favicon.svg` into your `public/` folder.
3. Copy the CSS imports from `src/index.css` (fonts, tailwind, `experience.css`, `watch-party.css`, `catalog.css`).
4. Render `<App />` from `src/App.tsx` anywhere in your app. It expects a full-height container.
5. Add the same `VITE_TMDB_API_KEY` environment variable to your build.

## Bot-Generated Player Links

The deployed application accepts direct player links in this format:

```text
https://aethoflix.vercel.app/?type=tv&id=1396&s=1&e=1&srv=0&bot=flix&cb=1789076573
```

- `type`: `movie`, `tv`, or `anime`.
- `id`: positive TMDB ID.
- `s`: season number for TV/anime.
- `e`: episode number for TV/anime.
- `srv`: zero-based server position. Movies/series use `0..4`; anime uses `0..7`.
- `bot=flix`: marks the link as bot-generated and suppresses the site intro.
- `cb`: optional cache-buster; ignored by the player.

The app resolves the TMDB metadata and opens the normal player immediately at the requested episode and server. If one TMDB metadata hostname is blocked, it retries only the other metadata hostname. It never changes the requested playback server automatically.

## Step 6 — Configure the servers (once, in the UI)

- Watch Party > Pick from the TMDB collection > any title > **Choose a server**.
- Nxsha is the default and is sandboxed by default. Every other server starts unsandboxed. Each server keeps its own Sub/Dub, ReCloud source, and sandbox setting.
- No automatic fallback: if a server fails, press another server yourself.
- For MegaPlay/ReCloud, the anime edition is suggested automatically by title (no IDs needed); manual AniList/MAL ID entry is optional for advanced users.
- Zokoanime needs a provider-generated embed URL because its public route is not documented.
- Local video files are supported up to 3 GB per file; the browser must decode the codec.
- While the movie plays, the UI hides completely. Tap anywhere or press E to reveal controls briefly.

## Step 7 — Watch Party

1. Open **Watch party** in the header and create a room.
2. Use **Invite** or **Copy invite**, then send the link to another browser/device and join.
3. If nobody joins, turn on **Companion bots** — they sit in free seats, are labeled BOT, and are removed with the same toggle.
4. Host picks the film and server; guests follow the selection. Direct-video playback syncs; external iframe players cannot sync play/pause.

## Step 8 — Graphics and frame rate

- Settings > Render quality: **Ultra graphics** (max detail), **Adaptive** (auto), **Performance**.
- **High refresh target** aims for 100+ fps when a 120 Hz display is detected (a 120Hz badge appears next to the measured FPS). 120 fps requires a 120 Hz+ display and enough GPU headroom — Ultra never downscales, so weak GPUs will run lower.
- The measured FPS counter is always visible in the footer.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| TMDB search fails | Try the other metadata endpoint in "Metadata connection", check the key in `.env.local`, then rebuild. |
| A server won't play | Pick another server — there is no auto-fallback. If it is sandboxed, try its unsandboxed toggle. |
| Guests can't join | Enable Firebase Anonymous Auth, add the deployed domain to Authorized Domains, publish `database.rules.json`, and keep the host online. |
| Page goes dark when you sit | That is Cinema Mode. Press E or Stand up to restore the lights. |
| 3D fails to start | Enable hardware acceleration and WebGL 2 in the browser. |
| Build changed but the site is the same | Re-upload both `dist/index.html` and the worker file, and clear the browser cache. |

## Legal notes

- TMDB supplies metadata and posters only; attribution is included in the app. TMDB provides no video streams.
- The playback providers are third-party services with their own availability and terms. This app only constructs the configured iframe URLs; it hosts no content.
