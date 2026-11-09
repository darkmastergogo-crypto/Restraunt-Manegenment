# Building the Windows app and the Android app

**Read this first.** The installer and the APK were **not built here and were never run.** This
machine has no access to the Rust package registry (crates.io), no Android SDK and none of the
Linux libraries Tauri needs, so not a single line of Rust could be compiled. What follows is the
complete project and the exact steps to build it on a machine that does have those things.

What *was* built and tested here is described in `OFFLINE-FIRST-v20.md` — the offline database,
the sync engine and the server side all ran for real against a real PostgreSQL and a real browser.

---

## Which app do I actually need?

There are two ways to put this on a counter or a phone, and the cheaper one may be all you need.

| | Installed web app (ready now) | Tauri app (needs building) |
|---|---|---|
| Works offline | Yes | Yes |
| Local database | The browser's own (IndexedDB) | A real SQLite file |
| Install on Windows | Edge/Chrome → Install this app | `.msi` / `.exe` installer |
| Install on Android | Chrome → Add to Home screen | `.apk` |
| Cost to produce | None — already in `WEBSITE/` | A build machine, and for Play Store a one-off fee |
| Survives clearing browser data | No | Yes |

**Start with the installed web app.** It is already in the upload and needs no build at all.
Build the Tauri app when you want a real installer, a file on disk that browser cleanup cannot
touch, or a Play Store listing.

---

## 1. Windows

### What the build machine needs
1. **Windows 10 or 11** (64-bit). Tauri cannot be cross-compiled for Windows from Linux.
2. **Rust** — <https://rustup.rs> → `rustup default stable`
3. **Microsoft C++ Build Tools** — Visual Studio Installer → "Desktop development with C++"
4. **WebView2** — already on Windows 11 and up-to-date Windows 10. The installer we produce
   downloads it if it is missing.
5. **Node.js 18+** (only to run the small bundler in `tools/`).
6. **Tauri CLI** — `cargo install tauri-cli --version "^2"`

### Build it
```bat
:: from the folder holding WEBSITE\ and src-tauri\
node tools\build-v19.js WEBSITE
cargo tauri build
```

The results land in `src-tauri\target\release\bundle\`:
- `msi\Restaurant Till_20.0.0_x64_en-US.msi`
- `nsis\Restaurant Till_20.0.0_x64-setup.exe`

### Signing
Unsigned installers make Windows SmartScreen warn people. To sign, buy a code-signing
certificate and add to `tauri.conf.json`:
```json
"bundle": { "windows": { "certificateThumbprint": "YOUR_THUMBPRINT", "digestAlgorithm": "sha256",
  "timestampUrl": "http://timestamp.digicert.com" } }
```
This is optional and costs money; the app works unsigned, people just click through a warning.

### Printing on Windows
Receipts print through the normal Windows printer dialog, exactly as they do in the browser
today, so any printer Windows knows about works — including 58 mm and 80 mm thermal printers
with their own Windows driver. Set the paper width in **Settings → Bill design**.

Talking to a USB or Bluetooth thermal printer *directly* with ESC/POS commands, bypassing the
Windows driver, is **not implemented**. It needs a Tauri plugin that could not be downloaded
here. Everything else prints.

---

## 2. Android

### What the build machine needs
1. **Rust** with the Android targets:
   ```bash
   rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
   ```
2. **Java JDK 17**
3. **Android Studio**, then in its SDK Manager install:
   - Android SDK Platform 34 (or newer)
   - **NDK (Side by side)**
   - Android SDK Build-Tools, Platform-Tools, Command-line Tools
4. Environment variables:
   ```bash
   export JAVA_HOME=/path/to/jdk-17
   export ANDROID_HOME=$HOME/Android/Sdk
   export NDK_HOME=$ANDROID_HOME/ndk/<version>
   ```
5. **Tauri CLI** — `cargo install tauri-cli --version "^2"`

### Build it
```bash
node tools/build-v19.js WEBSITE
cargo tauri android init      # once: creates src-tauri/gen/android
cargo tauri android build     # add --apk for a plain APK, or --aab for Play Store
```
Output: `src-tauri/gen/android/app/build/outputs/apk/universal/release/`

`cargo tauri android init` must run on the build machine — it generates a Gradle project from
your SDK and NDK versions, so it cannot be shipped pre-made.

### Signing the APK
Android refuses to install an unsigned release build.
```bash
keytool -genkey -v -keystore till.keystore -alias till -keyalg RSA -keysize 2048 -validity 10000
```
Then `src-tauri/gen/android/keystore.properties`:
```properties
storeFile=/absolute/path/till.keystore
storePassword=…
keyAlias=till
keyPassword=…
```
**Keep that keystore safe and backed up.** Lose it and you can never update the app for people
who already installed it.

### Printing on Android
Receipts go through Android's own print service (Settings → Printing), which covers network and
Wi-Fi printers and any printer with an Android plugin. Many cheap counter printers are
Bluetooth ESC/POS and are **not** reachable this way — see the limitation above.

---

## 3. What the app stores, and where

| | Where the database lives |
|---|---|
| Windows (Tauri) | `%APPDATA%\in.shoisystems.restaurant.till\restaurant-till.db` |
| Android (Tauri) | the app's private data folder, not visible to other apps |
| Installed web app | inside the browser profile for the site |

It is a normal SQLite file in write-ahead-logging mode, so a sudden power cut cannot leave a
half-written bill.

**Be clear with staff about this:** the device's copy is not a backup. Uninstalling the app,
wiping the phone, or clearing browser data for the site removes it. Anything already synced is
safe in Supabase; anything still waiting is not. Use **Saving & syncing → Save a backup** before
wiping or replacing a device. On Android, Google's own app-backup may or may not include the
file depending on the phone, so do not rely on it.

---

## 4. Running it before you build

```bash
node tools/build-v19.js WEBSITE
cd WEBSITE && python3 -m http.server 5173
cargo tauri dev            # in another terminal, with devUrl pointing at that server
```

---

## 5. If the build complains

| What it says | What it means |
|---|---|
| `failed to select a version for tauri-plugin-sql` | The plugin moved to a newer major version. Run `cargo update`, or pin the version the current Tauri 2 docs show. |
| `error: linker 'cc' not found` | The C++ build tools (Windows) or `build-essential` (Linux) are missing. |
| `NDK_HOME is not set` | Android NDK not installed, or the variable points at the wrong folder. |
| `webkit2gtk-4.1 not found` | Linux only: `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` |
| A Rust compile error inside `src/lib.rs` | The plugin API changed since this was written. The sources here parse cleanly but were never compiled, so this is the most likely thing to need a small edit. |

---

## 6. Honest list of what is not done

- **No installer or APK was produced or tested here.** No Rust was compiled at all.
- **Direct ESC/POS printing** over USB or Bluetooth is not implemented.
- **The local database is not encrypted.** Plain SQLite has no encryption; the usual answer,
  SQLCipher, needs a paid licence for some builds and could not be fetched or tested here. What
  protects it today is the operating system: on Android the file is inside the app's private
  storage, on Windows it sits in the signed-in user's own profile. If a device may be lost,
  turn on full-disk encryption (BitLocker, or Android's default). This is written up again in
  `OFFLINE-FIRST-v20.md` so nobody assumes more protection than is there.
- **iOS** is not set up.
