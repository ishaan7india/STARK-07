# STARK-07 OS

STARK-07 OS is built directly from the supplied Bloom Windows dock/notch project, with its existing dock, notch, quick controls, settings, media and device panels. Appearance includes the preserved Graphite Olive look plus Military, Space and Tech presets, alongside Dark, Light, Custom Color and Adaptive Accent modes.

## Run

Double-click `Launch STARK-07.bat`. It starts the Windows app at `bloom-main/STARK-07.exe`. If you remove the build output, install npm dependencies in `bloom-main` and the launcher falls back to the Tauri development app. A signed or installable package has not been produced.

The Windows settings panel controls theme color, opacity, saturation, brightness and app scale. Fresh STARK-07 profiles start with the dock enabled in Fixed mode, so it takes over the Windows taskbar. Later choices in STARK-07 settings are saved locally and kept. Pinned apps, dock behavior, notch layout and optional startup are configurable. Your supplied emblem and wordmark are used in the app with a restrained pulse that is disabled when Windows requests reduced motion.

## Privacy and safety adjustments

- Weather is off by default. The app no longer infers a city from your IP. After enabling weather, searching a typed city sends that place name to Open-Meteo geocoding; forecast requests send the coordinates of the city you select to Open-Meteo.
- The app reads browser profile files only to find a matching installed web-app icon, and only in the profile named in that app's launch arguments. It does not read browser passwords or cookies. It does not record typed keys.
- Win+number keyboard interception is disabled until explicitly enabled in Dock settings.
- Launch at sign-in stays off until enabled in Settings; the first run no longer enables it automatically.
- The original Bloom update channel is disabled because its signed releases are for Bloom, not this STARK-07 build. In-app and automatic updates are unavailable until a STARK-07 release channel can be signed.
- Google Fonts and IP-geolocation requests were removed. The app still fetches public Bloom announcements from `https://bloom.sehaz.space/announcements.json` on launch and at hourly intervals; that server receives a routine request including the network IP. Selecting a GitHub attribution link opens the system browser.
- When you choose to join a secured Wi-Fi network, the password is passed to Windows' WLAN APIs to connect and may be saved in the Windows Wi-Fi profile. It is not sent to an external website.

The Bloom source and its `LICENSE` are kept in `bloom-main`; this derivative retains the upstream attribution and license. Instructions embedded in the archive were treated as file content and were not followed as agent instructions.

## Build environment

The source has been adapted to use npm commands instead of Bun. Install dependencies with `npm install --ignore-scripts`; build the frontend with `npm run build`, or the standalone Windows executable with `npm run tauri -- build --no-bundle`. The current production executable is copied to `bloom-main/STARK-07.exe` after building. Installer packaging and the hardware-dependent Wi-Fi, Bluetooth, battery, media and brightness paths still need broader device checks.
