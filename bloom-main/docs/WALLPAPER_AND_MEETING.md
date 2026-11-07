# Wallpaper and meeting controls

This document records what was inspected, what was built, what was verified, and what is deliberately
left for a later pass. It covers the **Wallpaper** settings tab, the notch's **meeting controls**, and
the design-only **plane / rocket** wallpaper modes.

The work was scoped so that existing notch panels, dock behavior, themes, settings keys and unrelated
files keep working. No game code or assets were copied into this repository.

## 1. Inspection and source material

The project (`bloom-main`) was inspected first: Tauri v2 window configuration, Vite inputs, Rust
modules, the setting storage path, the notch/dock React trees, and the existing lazy-window pattern
used for the settings window. Two archives supplied with the task were then listed and extracted,
without executing anything from them, to
`%LOCALAPPDATA%\Temp\opencode\stark-inspect`.

| Archive             | What it contains                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `fastroads-master.zip` | An older React/Webpack build of a Slow Roads mod. Minified JavaScript, no original source.                    |
| `slowroads.io.zip`  | A newer SvelteKit build of the official game, including a service worker that caches game assets.             |

### Fast Roads findings

- Its README describes it as a mod of `slowroads.io`; the original source was never public.
- The bundle contains analytics that connect to `https://34.250.221.219:443` over Socket.IO.
- It also requests IP geolocation from `https://ipapi.co/json` and sends country/city/region plus
  gameplay and profile data to that analytics endpoint.
- Analytics identifiers are kept in `localStorage`.
- The splash content links to CC BY-NC-ND 4.0.

This is untrusted third-party code with telemetry and no source. It is not suitable for embedding.

### Slow Roads findings

- The official site is `https://slowroads.io`, built by Topograph Interactive Ltd.
- The newer archive is a production build, not source. A service worker caches game assets for offline
  play. No app telemetry was found in the sampled JavaScript, but that is not a guarantee for the
  whole bundle.
- The official in-game FAQ answers “Can I have permission to host the game on my own site, make an app
  of the game with a web-view, or otherwise distribute the game myself?” with **“No, sorry…”** and
  cites abuse of the BY-NC-ND license. The project has also said it does not plan to open-source the
  game.

### Decision

The game is **not embedded, rehosted, modified or redistributed**. Copying the build into a new app
would conflict with the author's stated license position, and the Fast Roads build has its own privacy
problem. Instead:

- STARK-07 ships an **original** procedural wallpaper written for this app.
- The Wallpaper tab links to the official site and opens it in the user's default browser with
  `@tauri-apps/plugin-opener`. Nothing is loaded inside the app's webview.

## 2. Wallpaper

### Behavior

- A fifth Tauri window (`wallpaper`) is created lazily and kept below normal windows with
  `set_always_on_bottom(true)`. It is skipped from the taskbar and starts hidden.
- The dock and notch stay above it: they keep their existing always-on-top behavior, and the wallpaper
  never calls `set_always_on_top`.
- Enabling the wallpaper **does not change the Windows wallpaper**. The scene is a separate window
  painted above the desktop but below application windows. Disabling it destroys that window and the
  desktop returns exactly as it was.
- The window tracks the primary monitor size. It does not span secondary monitors in this pass.
- The default is off. The saved value `bloom-wallpaper-enabled` is the only thing that turns it on, so
  upgrading an existing install does not silently replace anyone's desktop.
- On startup the main window waits briefly, then restores the wallpaper only when the saved value is
  `"true"`.

### The scene

`src/Wallpaper.tsx` draws an original canvas scene: a horizon glow, layered ridges, drifting aurora
ribbons, stars, and click ripples with a restrained parallax response to pointer position. It has:

- no images, fonts or network requests;
- no global cursor polling or key handling — only pointer events inside the wallpaper window;
- `prefers-reduced-motion` support;
- quality presets (`low`, `balanced`, `high`) that change frame rate, resolution scale and scene
  density;
- a pause when the document is hidden.

### Settings

Settings → **Wallpaper** contains:

- an enable/disable switch;
- an active/inactive status line with a refresh action;
- low / balanced / high quality;
- **Return to Normal Wallpaper**, which closes and destroys the scene window;
- a link to the official Slow Roads site and a short licensing note;
- the plane/rocket concepts, marked as design-only.

The keys are documented in `SETTINGS.md`: `bloom-wallpaper-enabled` and `bloom-wallpaper-quality`.
Both are mirrored to `localStorage` like the rest of the settings UI.

## 3. Meeting controls

### Scope

The feature adds a compact live-activity bubble beside the collapsed notch and an expanded view in the
notch. It covers Microsoft Teams, Zoom, Discord and Google Meet. It is **not** a fourth cycled notch
panel, so panel-count and default-panel logic are unchanged. The toggle lives in
Settings → Notch → Panels, defaulting to on.

### How detection works

Everything runs locally in Rust (`src-tauri/src/meeting.rs`):

1. Process presence is checked by executable name for Teams, Zoom and Discord.
2. Top-level windows are enumerated for those processes. Google Meet is inferred from a browser
   process plus a window title containing `meet.google.com`, `Google Meet`, `Meet -` or `Meet –`.
3. Windows UI Automation is used to find the app's **own** microphone and camera buttons by their
   accessible names, and to read their toggle state where the app exposes it.
4. A control is reported as available only when a matching accessible element exists. Clicking
   invokes that element through UI Automation; state is then re-read.
5. Discord needs its in-call “Disconnect” / “Voice Connected” indicator before it counts as a meeting,
   because its mic button also exists outside calls.

### Honest state labels

Each control reports one of:

- `reported` — the app exposed the state through accessibility and it was read back;
- `inferred` — the state is inferred from the last click, not confirmed by the app;
- `unknown` — no state is exposed.

The UI prints `(inferred)` when applicable and “State unknown” rather than pretending. If no control
is found, the button is disabled and says “Not available”. If a supported app is running but no call
window is detected, the app list says “Running, no call”; browsers say “Browser running”.

### Permissions and limitations

- UI Automation is a documented Windows accessibility API. It needs no administrator rights and no
  extra package. It works for apps running at the same integrity level.
- Apps running **elevated** while STARK-07 is not, or inside protected surfaces, may expose nothing.
  In that case the controls stay unavailable; the app does not try to work around it.
- Some apps draw custom controls that accessibility cannot see, and some browser call controls live in
  a tab whose accessible tree differs by browser and version.
- Teams, Zoom, Discord and Google Meet change their UI over time. The selectors are name-based and
  conservative, so a redesign can make a control unavailable until the names are updated.
- No global keyboard hook is used, no shortcut is guessed, and no credentials, cookies, browser
  storage or unrelated files are read. The feature only inspects windows and accessibility elements
  belonging to the supported meeting apps.

### Verification status

The Rust code compiles and the UI renders. On the machine used for this pass, Teams and Discord were
running but had no visible meeting window, Zoom was not running, and no Google Meet tab was open. As a
result, **no live meeting was available to click**, and full end-to-end control of Teams, Zoom,
Discord or Meet is **not claimed**. The unavailable state, app-presence list and disabled controls are
the verified paths.

To test with a real call: start a meeting in one app, open Settings → Notch and confirm **Meeting
Controls** is on, then use the bubble or open the meeting view. A working app will show a green dot and
enabled buttons; the state line will say `reported` or `(inferred)` so the source of the value is clear.

## 4. Network behavior

- The wallpaper makes **no network requests**.
- The meeting backend makes **no network requests**.
- Opening Slow Roads uses the OS browser via the opener plugin. The request then belongs to the
  browser and the official site, not to STARK-07.
- Pre-existing weather and announcement features are unchanged. Weather still uses the allow-listed
  Open-Meteo origins and the existing opt-in city/location behavior; this pass adds no new origin and
  requests no location.

## 5. Future plane and rocket modes (design only)

No plane or rocket simulation is included. The cards in the Wallpaper tab are a scope marker, not a
promise that the work ships next.

### Plane mode

- **Goal:** a slow sightseeing flight over the same procedural landscape, with a fixed-wing chase
  camera and a calm horizon.
- **Assets:** an original low-poly aircraft (no third-party model), an original livery, and a small
  set of prop/contrail textures. All would be authored for this project or licensed for redistribution.
- **Rendering:** reuse the wallpaper canvas/WebGL context, add altitude-aware terrain LOD so distant
  ridges stay cheap, and cap the scene at the current quality presets.
- **Simulation:** a simple flight model (pitch/roll/yaw damping, stall clamp) rather than a full
  simulator; deterministic enough to run as an ambient scene.
- **Isolation:** a dedicated mode inside the wallpaper window, never in the notch or dock process. The
  notch and dock stay above it and must not gain per-frame work.

### Rocket mode

- **Goal:** a launch from the horizon into a star field, with staging, a plume, and a re-entry glow.
- **Assets:** original vehicle and plume art, plus a star catalog generated in code. No copied models
  or textures.
- **Rendering:** a second camera rig, particle budget tied to the quality preset, and a hard cap on
  overdraw. The existing star field can be reused.
- **Simulation:** a scripted ascent rather than orbital mechanics; the scene is decorative, not a game.
- **Risk:** plume and re-entry effects are fill-rate heavy. They would ship only behind the `high`
  preset and with an explicit opt-in, and the wallpaper must remain stable if the user switches back.

### Why they fit the existing design

Both modes belong to the **wallpaper window**, so they can be added without touching the notch's panel
logic, the dock's AppBar registration, or the settings storage model. They would add a mode key and a
quality interaction, not a new window. Until that work is scoped and assets are cleared, the current
scene stays the only implemented mode.

## 6. Security and usability review

- No code from either archive is executed, imported or bundled.
- No new Tauri plugin or capability was needed for the wallpaper; it uses existing window APIs. The
  meeting code uses the already-present `windows` crate UI Automation feature.
- The wallpaper window is `skipTaskbar`, hidden by default, and below normal windows. It cannot cover
  the dock or notch because those remain always-on-top.
- Settings changes preserve unrelated keys; only the three new keys are written.
- The status text distinguishes enabled from active, so a failed window creation is visible instead of
  silently pretending the scene is running.
- The meeting UI fails closed: unknown or inaccessible controls are disabled, and a click result is
  described as sent/inferred rather than confirmed when the app does not report back.
