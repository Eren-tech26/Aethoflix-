# AethoFlix Private Cinema

A walkable 3D cinema with a screen player, customizable avatars, and a functional same-browser Watch Party prototype. Built with React, TypeScript, Vite, Tailwind CSS, and Three.js. The original ten-seat room and both seating rows are preserved.

Watch Party uses the browser's `BroadcastChannel` API. It connects tabs on the same origin, device, and browser profile. It is **not an internet multiplayer service**: sending an invitation to another device or browser will not connect. No authentication, backend, or chat service is included. TMDB search and explicit external-provider selection are available alongside local video playback.

## Explore

- WASD or arrow keys: move relative to the camera.
- Click and drag: look around freely. Scroll: adjust camera distance.
- E: sit in the nearby recliner, cancel a guided walk, or stand up.
- Click a chair or use the seat map: follow a collision-aware route to that chair.
- Space: pause or resume native screen playback. F: fullscreen. R: return to the entrance.
- Touch: left thumbstick to move; drag the room with the other thumb to look.
- The TMDB movie, series, and anime collection opens only from the Watch Party panel. External embeds use their own player controls, not the Space shortcut.

The opening architectural view places the avatar beside the right-hand stairs for scale. Reset view returns the avatar to the rear/right entrance.

## Your Player

Select the avatar button in the header to set your display name and choose one of five jacket colors. The color is applied to the actual 3D player, not just its interface icon. Names and colors are saved locally, without creating an account. Each tab has a distinct participant identity. "Walk with my player" returns to the following camera. The seat map still defaults to B3 when that seat is available.

## Watch Party

1. Open **Watch party** in the header. Enter a name and create a party, or join with an existing room code.
2. The host picks the shared film with **Pick from the TMDB collection** during setup, or from the shared-film row once the room is open. The cinema screen shows the current selection. Local videos and direct URLs remain available through the screen player.
3. Keep the host tab open. Use **Open guest tab**, or copy the invitation into another tab in the same browser and profile. The setup form's draft is preserved while you step into the TMDB collection.
4. Enter the second player's name and join. Only real connected tabs appear in the member list and as 3D avatars; no simulated guests are added.
5. Choose a seat and switch on **Ready**. Seat reservations are authorized by the host to prevent two players claiming the same recliner.
6. Once everyone is ready, the host can start the screening. For local files and direct video URLs, host play/pause, seek, speed, looping, and source changes are synchronized. For external iframe providers, only the title, episode, and server selection are shared; play/pause and position are not synchronized. Each participant can stand or walk independently.
7. Leave the room or end it with the confirmation control. Closing the host tab ends the session. There is no host migration or persistent room backend. If the current screen came from a provider selection, leaving the party restores the Afterlight ambient scene.

The local prototype supports up to ten participants. Late joiners receive the current media, playback clock, roster, and recent avatar positions. New films reset readiness. Missing hosts, full rooms, unsupported browsers, expired participants, blocked autoplay, and occupied seats have explicit UI handling. Invite copying has a selectable-link fallback.

Local video files are shared using structured-cloned File handles, not uploaded to a server. For this preview, shared local files are limited to 250 MB. A participant explicitly joins the room before receiving its file. Larger browser-decodable files may still be played solo. Browser storage partitioning can prevent embedded previews from communicating with standalone tabs; use two tabs of the same deployed application origin for the best test.

## Room

Exactly ten independent recliners, arranged as A1-A5 on the main floor and B1-B5 on a 0.64 m raised platform. Each recliner has an individual interaction target, padded leather components, piping, cup holders, footrests, and a physical number plaque. Nominal chair width is 1.28 m, chair gaps are 0.76 m, and side clearance to the acoustic treatments is approximately 1.48 m. Both 1.44 m-wide staircases have four 0.16 m risers and 0.36 m treads.

Sitting aligns the avatar, blends its pose, moves to a seated viewing camera, and gradually reduces room-light intensity toward 2.5% of the exploration level. The screen's area light, shadow-casting fill, and subtle avatar bounce remain active. Standing reverses the transition and restores navigation.

## Screen

Open **Screen player** in the navigation or select the film title in the footer. For local/direct videos, the player contains a 1920 x 1080 canvas preview of the same media used on the cinema screen; it does not create a second video or audio stream. Controls include play/pause, seeking, ten-second skips, personal volume/mute, playback speed, looping, and player fullscreen. A seek strip also appears along the cinema footer for native video playback.

Afterlight remains a locally bundled, gently animated ambient image, not a streamed movie. The player offers the Blender Foundation's Sintel trailer as an optional external sample, browser-decodable local video files, and direct HTTPS video URLs. Direct URLs must support cross-origin video access. The direct-URL input is not for YouTube pages, subscription-service links, or iframes; configured external providers are loaded through the catalogue/server picker instead. No automatic source fallback is performed. External sample availability and CORS configuration are outside this application's control.

Videos are letterboxed to preserve their aspect ratio and provide sampled color for screen lighting. Unsupported formats or failed URLs display an error without replacing the previous successfully loaded film. Incoming media loads are cancellable; a guest who cannot load the shared film can retry it. Browsers that block autoplay display an explicit Enable playback control.

## TMDB Collection

The collection is **only available inside Watch Party**. Open **Watch party** in the header, then **Pick from the TMDB collection** during setup, or the shared-film row once a room is open. In a room the host selects the title, episode, and server; guests can browse the same collection read-only. The standalone screen player intentionally offers ambient, local, and direct-video sources only.

Search all titles, movies, series, or Japanese-animation titles, with real TMDB posters, summaries, ratings, pagination, and season/episode details. Anime searches filter TMDB's Japanese-animation metadata; they are not an exhaustive definition of all animation.

The supplied API key is configured in the ignored `.env.local` as `VITE_TMDB_API_KEY`. `.env.example` documents the variable. Vite client environment values are **visible in the browser bundle**, not server-side secrets. Use a backend proxy and rotate the key before a production deployment if the credential must remain private. The key is sent only to the explicitly selected TMDB metadata hostname, never to anime lookup or embed providers.

The standard endpoint is `https://api.themoviedb.org/3`; the supplied alternate endpoint is `https://api.tmdb.org/3`. **The alternate endpoint is the default** until a preference is saved. The Metadata connection selector changes only metadata requests, and a network-error action offers an explicit switch. Neither an ISP bypass nor the alternate hostname's availability is guaranteed. There is no silent endpoint or provider switch. Posters use `https://image.tmdb.org/t/p/w500`. TMDB attribution is present in the catalogue and About/credits.

## Provider Selection

Movies and series expose exactly five servers in the requested order: ZXC, Bingr, Nxsha, VidLink, and VidNest. Their URL templates, including existing query strings, are unchanged. **Nxsha is preselected as the default server.** These are independent TMDB-ID-based providers, not TMDB video services. Provider quality tags such as 4K are labels, not measured guarantees.

Anime exposes eight servers: MegaPlay, ReCloud, Zokoanime, then the same five standard providers. Select a server and press **Load Server**. No alternate provider is requested on load failure, error, timeout, or completion. The notice immediately below the server choices explains how to try another server manually.

Sub/Dub preferences are stored separately by provider key. ReCloud's HD-1/HD-2 choice is stored in its own provider preference. Changing a setting does not silently load a provider: press Load Server to apply it. For the standard TMDB-ID providers, audio preferences remain saved but must be selected using the provider's own controls because the supplied URL templates do not document an audio parameter.

Each server has an independent iframe sandbox preference. **Nxsha starts sandboxed; every other server starts without a sandbox.** The per-server toggle is saved and applied the next time that server is loaded. Turning the sandbox off removes popup and top-level-navigation restrictions, so that provider can potentially open windows or redirect the page; disable it only for providers you trust. The sandbox state travels with the shared selection in a watch party, so guests reproduce the host's setting.

MegaPlay and ReCloud require an AniList ID, not a TMDB ID. The edition-matching interface uses AniList's GraphQL catalogue and requires an explicit user selection or a manually entered AniList ID. Confirm the correct season and its episode numbering. The selection is remembered per TMDB title and season.

- MegaPlay uses its documented `/stream/ani/{id}/{episode}/{sub|dub}` route.
- ReCloud uses the current provider homepage documentation: `/embed/{hd-1|hd-2}/ani/{id}/{episode}/{sub|dub}?k=1`. Older indexed examples show `/api/embed`, but this app follows the current published route rather than automatically trying both.
- Zokoanime's public playback route could not be verified. Server 3 therefore requires a provider-generated HTTPS embed URL or template restricted to `zokoanime.video`. Templates may use `{anilistId}`, `{episode}`, and `{audio}`. The white `color=ffffff` accent is appended. This is a configurable provider slot, not a claim of a verified automatic Zokoanime integration.

The active provider uses one iframe, sandboxed or unrestricted according to its per-server preference. A CSS3D surface is aligned with the physical 16:9 cinema screen and revealed through a depth-aware WebGL cutout. Open Screen player for a flat, full-resolution view and provider controls. Supported browsers use `moveBefore` to preserve the iframe when moving between the room and panel; older browsers may restart it during reparenting. CSS3D alignment is intended for 100% browser zoom. Opening the provider in a new tab is an explicit user action.

While the sandbox is on, iframe popups and top-level navigation are blocked. With the sandbox off, those restrictions do not exist and the provider may redirect the app; the interface labels unsandboxed players clearly. Some providers may refuse a sandbox, deny framing, lack the selected content, or be unavailable. Only messages from the selected iframe and its exact origin are inspected for errors. An iframe load event is shown as navigation, never as proof that its video works. Third-party playback controls cannot be safely controlled or sampled as native video, so shared timing is disabled and the cinema uses an approximate neutral screen glow for these embeds.

## Service, Cafe, And Frame Rate

Two waitresses work the floor. One serves: after you sit down, ring the bell (the Ring for service button near the seat controls, or its 3D counterpart on the armrest). She pathfinds from her station to your seat, delivers a snack combo (popcorn and drink) first, then hot meals on later rounds. Your character eats automatically with arm-to-mouth animation while a progress bar runs. When it finishes, ring the bell again for the next round. Standing up clears the order; a server mid-walk finishes her trip and returns. The bell chimes through the sound system when audio is on. The second waitress patrols the floor with a tray.

The corridor beyond the rear/right exit is now a small cafe: a counter, espresso machine, menu board, warm pendant light, and an AETHOFLIX CAFE sign above the doorway. Two patrons sit at the counter sipping drinks while a barista works behind it. The counter and stools have collision; the patrons and staff are decorative NPCs.

Rendering still follows the display's native cadence without an artificial cap. **120 fps requires a 120 Hz (or higher) display and enough GPU headroom**; the Ultra preset never downscales, so lower-end hardware will not reach it there. Adaptive mode detects a high-refresh display from frame pacing and targets 100+ fps by adjusting resolution between 1x and 1.5x. When a high-refresh display is detected, the footer shows a 120Hz tag next to the measured FPS. This is a best-effort target, not a guarantee.

## Clarity

Sharp is now the default graphics preset and uses the display's pixel ratio up to 2x without dynamic downscaling. Adaptive mode never drops below one physical render pixel per CSS pixel. The low-resolution 0.8x floor has been removed. Atmospheric fog and display-glass haze are reduced, panel frosted blur is removed, and important labels and controls are larger and higher contrast. This improves clarity but does not guarantee 120 fps on all hardware.

## Architecture

- `src/App.tsx`: application entry point and minimal experience interface.
- `src/cinema/world.ts`: shared seat layout, architectural colliders, stair elevations, substepped movement, navigation, and circulation diagnostics.
- `src/cinema/environment.ts`: layered architecture, batched static geometry, ten chair groups, practical lighting, and embedded display.
- `src/cinema/avatar.ts`: humanoid, outfit materials, reusable poses, and avatar lifecycle.
- `src/cinema/CinemaEngine.ts`: imperative render loop, input, camera, interactions, remote avatar interpolation, screen lighting, and media lifecycle.
- `src/cinema/navigation.worker.ts`: off-main-thread circulation checks.
- `src/cinema/ProviderSurface.ts`: the single sandboxed iframe, in-room CSS3D surface, panel docking, and exact-origin error messages.
- `src/components/`: touch controls, scene lifecycle, and accessible interaction panels.
- `src/watch-party/LocalParty.ts`: local host-authoritative room, presence, playback clock, seat requests, and message validation.
- `src/watch-party/useWatchParty.ts`: room-to-engine bridge, media loading, and React state integration.
- `src/watch-party/profile.ts`: local display-name and outfit preferences.
- `src/catalog/config.ts`: TMDB endpoints, image host, and environment-key configuration.
- `src/catalog/tmdb.ts`: cancellable metadata requests, caching, title/episode details, and explicit anime edition lookup.
- `src/catalog/servers.ts`: exact URL templates, eight-slot anime ordering, source validation, and independent provider preferences.

The render loop does not depend on React's update cycle. React receives throttled UI snapshots. Avatar positions travel at approximately 8 Hz and interpolate in the engine; remote movement messages do not trigger React renders. Room transport is separate from rendering so a production networking adapter can be introduced without replacing the environment. The local transport is a prototype, not an authenticated security boundary.

## Performance And Verification

Rendering follows the browser's native animation cadence without an application-imposed frame cap. A 120 Hz display and sufficiently capable hardware are necessary for 120 fps; that rate is not guaranteed. The FPS indicator measures elapsed frame time rather than showing a fixed target. Adaptive quality reduces resolution if necessary. Performance mode removes dynamic shadow rendering, while contact shadows remain. Static geometry is merged by material, chair geometry is shared, shadow maps are refreshed only when needed, and inactive browser tabs suspend 3D rendering. During a party, media and the room clock can continue while 3D rendering is suspended. Opening the player adds a 24 Hz preview only while that panel is mounted.

The startup worker checks paths from the rear entrance to all ten seat approaches, the hallway, both stairs, both side aisles, the cross-aisle, the screen area, and points on both sides and behind every chair. The graphics panel shows the actual diagnostic result. These path checks use the same collision and stair rules as player movement, but do not replace a visual browser walkthrough or device-specific profiling.

The production build is verified with the project's build script. The configured TMDB key, network/ISP access, provider availability, CSS3D alignment, iframe reparenting, multi-tab behavior, real-device frame rate, video codec support, and touch ergonomics still require browser/device testing. No browser automation tool is available in the implementation environment. Zokoanime still needs a verified embed URL from its provider before its slot can play content. The watch-party-only gating of the TMDB collection is intentionally not validated against any external expectations; it matches the current product request.