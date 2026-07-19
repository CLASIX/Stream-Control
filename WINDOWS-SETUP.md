# Stream Control — Windows Desktop & Setup Guide

This guide covers everything you need to install, launch, configure, and troubleshoot **Stream Control** on your Windows PC.

---

## 🏁 1. First-Run & Launch Setup

### Step A: Install Node.js LTS
Ensure you have the latest **Node.js LTS (v20+ or v22+)** installed on your system:
👉 [Download Node.js LTS from nodejs.org](https://nodejs.org/)
*(During installation, accept default settings. If prompted to reboot after setup, restart your computer).*

### Step B: Choose a Clean Project Directory
For optimal permissions and zero path issues with Windows Defender or OneDrive, place the `Stream-Control` folder in a clean, short directory such as:
```
C:\StreamControl
```
*(Avoid placing it inside deeply nested folders or restricted system folders like `C:\Program Files` or inside zipped archives).*

### Step C: Launch Stream Control (`Launch Stream Control.bat`)
Double-click **`Launch Stream Control.bat`** inside your project folder.

**What the launch script automatically does:**
1. Verifies Node.js installation.
2. Runs `npm install` to download required dependencies on first launch.
3. Compiles the Vite self-contained production bundle (`npm run build`).
4. Launches the standalone **Electron desktop application window** (`electron .`) featuring the frameless top drag bar and native popout window controls.

---

## 🎛️ 2. Connecting to OBS Studio & Aitum Vertical

Stream Control communicates with your local OBS Studio instance via the built-in **OBS WebSocket v5** server (`OBS v28+` / `v31+`).

### A. Enable WebSocket in OBS Studio
1. Open **OBS Studio**.
2. Go to the top menu: **Tools $\rightarrow$ WebSocket Server Settings**.
3. Check **Enable WebSocket server**.
4. Note your **Server Port** (`4455` by default).
5. If **Enable Authentication** is checked, click **Show Connect Info** or note down your **Server Password**.

### B. Connect from Stream Control
1. Open Stream Control (`Launch Stream Control.bat`).
2. Navigate to the **OBS Dashboard** tab in the left/right sidebar.
3. In the **Connection** tile (`x: 0, y: 0`), enter:
   - **Host**: `127.0.0.1` (or `localhost`)
   - **Port**: `4455`
   - **Server password**: *(your OBS password, or leave blank if authentication is off)*
4. Click **Connect**. A green status dot will confirm **Connected** (`OBS v31.x.x`).
5. Check **Connect automatically** so Stream Control connects seamlessly whenever you launch the app.

### C. Aitum Vertical Canvas Integration (`16:9 + 9:16 Dual-Format`)
Stream Control natively detects and synchronizes with **Aitum Vertical (`v1.6+`)** across both new canvas UUIDs (`OBS 31+`) and native C++ `CallVendorRequest` bridges:
- **Vertical Stream Preview (`9:16`)**: Automatically captures and displays your live `540 × 960` vertical program canvas (`15 | 30 | 60 fps`) with zero manual dropdown selection needed.
- **Scenes & Sources Dock**:
  - Click **`VERTICAL SCENES`** to view all Aitum scenes. Your live vertical scene highlights automatically with a red **`PROGRAM`** badge. Click any scene to switch Aitum instantly in OBS.
  - Click **`VERTICAL SOURCES`** to view and toggle visibility (`👁️` / `🚫`) of every vertical source, including expandable nested group folders (`isGroup`).
- **Linking Horizontal & Vertical Canvases (`🔗`)**:
  - Right-click (`or click 🔗`) on any Main scene (`Starting Soon`) $\rightarrow$ check `[✓] Starting Soon Vertical`. When you switch to `Starting Soon` on your normal stream, Aitum transitions simultaneously.
  - Right-click (`or click 🔗`) on any source (`Webcam`) $\rightarrow$ check `[✓] Webcam - Vertical`. Turning on/off your webcam on the Main Canvas mirrors instantly to the vertical stream.

---

## 💬 3. Chat Overlay & Desktop Popout Window

### A. Connecting Twitch & Kick Chats
1. Navigate to the **Chat Overlay** tab.
2. In the **Channels** tile, type your **Twitch channel name** (`slug`) and/or your **Kick channel name**.
3. Click **Connect to chat**. Stream Control will connect anonymously (`justinfan` IRC for Twitch, public Pusher WebSocket for Kick).

### B. Desktop Chat Window (Always-On-Top Popout)
1. In the **Desktop Chat Window** tile (`x: 380, y: 420`), click **Open Desktop Chat Window**.
2. A transparent, frameless desktop window will pop out.
3. This window features native Windows Desktop Window Manager (`DWM`) `Always-On-Top` re-enforcement (`popoutWin.setAlwaysOnTop(true, "screen-saver", 1)`), guaranteeing your live chat stays cleanly overlayed on top of your full-screen game or application.
4. Click **Close Desktop Chat Window** from the main app or the popout window to close it.

### C. Adding as an OBS Browser Source
1. In the **OBS Source Mode** tile (`x: 0, y: 300`), click **Copy overlay URL**.
2. In OBS Studio, add a new **Browser Source**.
3. Paste the URL (`http://127.0.0.1:8080/?overlay=chat&...` or `http://localhost:5173/?overlay=chat&...`).
4. Set **Width**: `400` and **Height**: `600` (or `800`).
5. The overlay features transparent backgrounds and drop shadows, rendering directly over your broadcast.

---

## 🎵 4. Spotify "Now Playing" Setup

Stream Control uses browser-safe **Authorization Code + PKCE** OAuth authentication (only your **Spotify Client ID** is needed; never share your Client Secret).

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and log into your Spotify account.
2. Click **Create App** (or select an existing app).
3. Under **Redirect URIs**, add this exact URL:
   ```
   http://127.0.0.1:8080/auth/spotify/callback
   ```
   *(If running in browser dev mode via `npm run dev`, also add `http://localhost:5173/auth/spotify/callback`).*
4. Copy your **Client ID** from the Spotify dashboard.
5. In Stream Control, open the **Now Playing** tab and paste your **Client ID**.
6. Verify the **Redirect URI** field matches what you registered on Spotify.
7. Click **Connect Spotify**. Authorize the app on the Spotify consent screen.
8. Once connected, your live album art, track title, artist, and progress turntable appear.
9. Click **Copy Now Playing URL** and add it as a **separate Browser Source** in OBS (`460 × 90` recommended size for a compact horizontal overlay).

---

## ⚙️ 5. Customizing & Decluttering Your Dashboard (`Edit layout`)

Stream Control puts you in 100% control of your layout. To enter edit mode, toggle **`Edit layout`** ON in the top header or **Settings** tab.

### A. Drag-and-Drop Reordering (`SortableList` & `FreeformBoard`)
- **Large Tiles (`Connection`, `Previews`, `Scenes & Sources`)**: Drag any tile from its `-top-3 left-3` header bubble. Resize tiles from their bottom-right drag handle (`cursor-se-resize`). All tiles strictly clamp to visible viewport boundaries.
- **Small Stat Cards (`CPU`, `FPS`, `Viewers`, `Uptime`)**: Click and drag any small stat card horizontally or vertically to reorder `obsPerformanceOrder` or `obsAudienceOrder`.
- **Scenes & Sources Switcher Pills**: Click and drag the `SCENES`, `SOURCES`, `VERTICAL SCENES`, and `VERTICAL SOURCES` tab buttons left or right across the switcher bar to reorder `obsScenesSourcesTabOrder`.
- **Individual Scenes & Sources**: Drag any scene or source row up and down inside the dock to customize `obsScenesOrder` or `obsSourcesOrder`.

### B. Decluttering & Hiding Tiles / Items (`🙈 Hide`)
If you do not use vertical streaming or want a cleaner control surface:
1. **Hide Top-Level Dashboard Tiles (`obsHiddenTiles`)**:
   - While `Edit layout` mode is ON, click **`🙈 Hide`** inside the `-top-3 left-3` header bubble of any tile (`Vertical Stream Preview`, `Performance`, etc.).
   - The tile immediately slides off the board.
   - At the top of your dashboard, the **`🙈 Hidden Dashboard Tiles (N)`** manager banner displays every hidden tile (`🙈 Vertical Stream Preview 👁️ Unhide`). Click **`👁️ Unhide`** on any pill to restore that tile right back to its board coordinates.
2. **Hide In-Dock Scenes & Sources (`obsHiddenItems`)**:
   - While `Edit layout` mode is ON, click **`🙈 Hide`** next to any scene or source inside the `Scenes & Sources` dock.
   - Hidden items slide down to the bottom of the card (`--- Hidden from Dock ---`).
   - A dedicated **`HIDDEN (N)`** tab pill appears dynamically in the dock switcher during `Edit layout` mode. Open `HIDDEN` to review and unhide items with one click. When unhidden, items snap back to their native OBS index layering (`refreshSceneItems`).
   - When `Edit layout` mode is toggled OFF, the `HIDDEN` tab and all hidden items vanish cleanly from your workspace.

---

## ❓ 6. Troubleshooting & FAQs

### Q: `Launch Stream Control.bat` opens briefly and closes
- **Solution**: Open a command prompt (`cmd.exe`), navigate to `C:\StreamControl`, and run `npm start` manually to see exact error logs.
- Ensure **Node.js LTS** (`v20+`) is installed and added to your Windows `PATH`.

### Q: "Port 8080 already in use" error
- **Solution**: Another instance of Stream Control or local web server is running on port `8080`. Close the existing Electron window or command prompt, or check Task Manager for `electron.exe` / `node.exe` processes and end them.

### Q: OBS WebSocket says "Incorrect OBS WebSocket password"
- **Solution**: Double-check your exact password inside OBS (**Tools $\rightarrow$ WebSocket Server Settings**). If you recently changed or generated a new password in OBS, click **Apply** in OBS first, then re-enter the password in Stream Control.

### Q: Vertical Stream Preview displays "Waiting for vertical frame..."
- **Solution**:
  1. Ensure **Aitum Vertical (`v1.6+`)** is properly installed and active in OBS Studio.
  2. Verify your OBS WebSocket connection is connected (`OBS v31.x.x`).
  3. Try clicking on a vertical scene in the **`VERTICAL SCENES`** tab to trigger a native C++ `CallVendorRequest` frame synchronization.

### Q: Desktop Chat Window popout drops behind full-screen game
- **Solution**: Run your game in **Borderless Windowed / Fullscreen Borderless** mode instead of Exclusive Fullscreen so Windows DWM permits frameless overlay windows to maintain `Always-On-Top` priority cleanly.
