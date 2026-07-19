# Stream Control

A comprehensive, single-file / desktop web app (`React 19 + Vite 7 + Electron + TypeScript + Tailwind CSS`) built to run, monitor, and control your entire livestream broadcast from one unified, highly customizable control surface.

---

## 🚀 Key Features & Capabilities

### 1. Dual-Format OBS & Aitum Vertical Production Dashboard (`OBS Dashboard`)
Connect directly to local OBS Studio (`v28+` / `v31+` with WebSocket v5) with instant multi-canvas and Aitum Vertical Canvas (`v1.6+`) native synchronization:
- **Independent Stream Preview Monitors (`16:9` & `9:16`)**:
  - **Stream Preview (`16:9`)**: Live real-time horizontal canvas frame monitor (`15 | 30 | 60 fps`) with pause toggle, active scene indicator, and visual animated transition progress bar (`sc:obs-transition`).
  - **Vertical Stream Preview (`9:16`)**: Independent live frame monitor specifically tracking the **Aitum Vertical Canvas**. Zero manual dropdown selectors required—it dynamically auto-follows whatever scene is actively showing on the vertical program canvas.
- **Interactive `Scenes & Sources` 4-Tab Dock**:
  - View-switcher pill bar strictly labeled as **`SCENES`**, **`SOURCES`**, **`VERTICAL SCENES`**, and **`VERTICAL SOURCES`** (draggable and reorderable via `SortableList` when `Edit layout` mode is on).
  - **Studio Mode Toggle (`ON/OFF`) & Direct Transition**: Seamless preview/program workflow for both Main (`16:9`) and Aitum Vertical (`9:16`) canvases simultaneously (`TriggerStudioModeTransition` + `CallVendorRequest switch_scene`).
  - **Expandable Nested Group Sources (`isGroup`)**: Grouped items (like an `App Input Cap` folder inside your game scene) render with interactive chevrons (`▶ Group: App Input Cap...`). Expand any group to reveal every child source inside (`↳ child.sourceName`) and toggle individual child source visibility (`👁️` / `🚫`) directly inside the group.
  - **Native OBS Studio Source Type Icons (`SourceKindIcon`)**: Recognizes and displays exact visual badges next to every source name:
    - 📷 Camera / Video Capture (`dshow_input`, `av_capture`)
    - 🖥️ Desktop / Monitor Capture (`monitor_capture`, `display`)
    - 🎮 Game / Application / Window Capture (`game_capture`, `window`, `app_input`)
    - 🌐 Browser Source (`browser_source`)
    - 🎬 Media / Video / Audio File (`vlc_source`, `ffmpeg_source`)
    - 🖼️ Image / Slideshow (`image_source`)
    - 📝 Text Source (`text_ft2_source`, `gdiplus`)
    - 🎙️ Audio Input / Output / Microphone (`wasapi`, `pulse`, `alsa`)
    - 📁 Group Folder (`group`)
- **Bidirectional Cross-Canvas Linking (`obsLinkedItems` / `🔗`)**:
  - Link any scene or source between your Main Canvas and Aitum Vertical Canvas via right-click (`onContextMenu`) or the **`🔗`** link icon.
  - When a linked source (e.g. `Webcam`) is toggled ON/OFF (`👁️` / `🚫`) on the Main Canvas, its linked vertical counterpart (`Webcam - Vertical`) automatically and simultaneously toggles ON/OFF on the Aitum Vertical Canvas.
  - When a linked scene (`Gaming`) is clicked to switch on the Main Canvas, the Aitum Vertical Canvas switches to its linked vertical scene (`Gaming Vertical`) at the exact same instant.
- **Complete Edit-Mode Layout Customization & Decluttering**:
  - **Universal Drag-and-Drop (`SortableList`)**: Reorder top-level sidebar tabs (`TABS`), large dashboard tiles (`FreeformBoard` with strict viewport safety clamping), small stat tiles (`Status`, `Audience`, `Performance`), dock switcher pills, and individual scenes/sources.
  - **In-Dock Item Hiding (`🙈 Hide` / `👁️ Unhide`)**: Hide specific utility scenes or helper sources while in `Edit layout` mode. Hidden items stack cleanly at the bottom (`--- Hidden from Dock ---`) and can be managed from a dedicated **`HIDDEN (N)`** tab pill. When unhidden, items immediately restore to their original native index order from OBS Studio (`refreshSceneItems`).
  - **Top-Level Tile Hiding (`obsHiddenTiles`)**: Don't need vertical streaming or certain monitors? Click **`🙈 Hide`** right on the `-top-3 left-3` title bubble of any large or small tile on the dashboard to tuck it away. Restore them anytime with one click from the symmetrical **`🙈 Hidden Dashboard Tiles`** manager banner displayed across the top during `Edit layout` mode.

### 2. Multi-Platform Chat Overlay & Desktop Popout (`Chat Overlay`)
- **Unified Chat Feed**: Merges **Twitch** IRC (`justinfan` anonymous read) and **Kick** (`Pusher WebSocket`) messages into one clean, highly legible feed with role-based colors, platform badges, timestamps, @mention/self highlights, and channel orientation toggles.
- **Desktop Chat Window (Always-On-Top Popout)**:
  - Frameless, transparent popout reader window designed for single-monitor or overlay setups.
  - Features strict Windows DWM `Always-On-Top` re-enforcement on move/resize/focus (`popoutWin.setAlwaysOnTop(true, "screen-saver", 1)`), alongside `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` so chat stays clearly visible over full-screen games.
- **OBS Browser Source Mode**: Copy the standalone overlay URL (`?overlay=chat&...`) into an OBS Browser Source (`400×600` recommended) for transparent on-stream chat display.

### 3. Spotify "Now Playing" Controller & Overlay (`Now Playing`)
- Uses modern **Authorization Code + PKCE** OAuth flow (Client ID only, no Client Secret required).
- Includes turntable album art display, live track title/artist/album metadata, progress tracking, and fallback player mode (`local-player`).
- **Card-Scaling Live Preview (`NowPlayingDisplay`)**: The visual card wrapper (`460 × 90 px`) inside your freeform tile scales dynamically to `100%` visual scale (`s = Math.min(cw/345, ch/68)`), while the standalone OBS Browser Source (`?overlay=now-playing&...`) fades out smoothly after `~2.5s` when playback stops to prevent flashing.

### 4. streamer.bot Bridge, Twitch Clips, & Discord Announcements (`Bridge`, `Clips`, `Webhooks`)
- **BridgeHost**: Always-mounted background processor connecting to local `streamer.bot` (`127.0.0.1:8080`), enabling automated macro execution, stream markers, and timecode synchronization (`getStreamLengthTimecode` calibrated `1×` real-time).
- **Twitch Clips**: One-click clip creation (`has_delay=true`), hotkey bindings, and instant Discord webhook sharing (`clipsDiscordMessage` templates).
- **Webhooks**: Pre-configured announcement presets (`🔴 Go-Live Alert`, `⏳ 15m Teaser`, `🏁 Off the Air`, `🎬 Clip Showcase`) for instant Discord channel notifications.

---

## 📦 Quick Start & Installation

```bash
# 1. Install dependencies
npm install

# 2. Run in browser development mode (http://localhost:5173)
npm run dev

# 3. Build standalone self-contained production bundle → dist/index.html (~490 kB)
npm run build

# 4. Build + launch as a desktop Electron window
npm run start
```

### Windows Double-Click Launch
Double-click **`Launch Stream Control.bat`** inside the project folder (`C:\StreamControl` recommended). It will automatically install packages, compile the Vite bundle, and open the desktop Electron application window.

---

## 🛠️ Architecture & Project Structure

```
src/
├── types.ts                  # Central TypeScript definitions (Tab, BoardItemLayout, Settings, ObsState)
├── lib/
│   ├── Emitter.ts            # Lightweight typed pub/sub class used by connectors
│   ├── store.tsx             # Settings Context + versioned localStorage (multichat:settings:v1)
│   ├── obsClient.ts          # ObsClient v5 WebSocket wrapper + Aitum Vertical CallVendorRequest bridge
│   └── reorder.ts            # Array sorting & applyOrder utilities
├── platforms/                # Platform connectors (Twitch IRC, Kick Pusher WebSocket)
├── hooks/
│   ├── useChat.ts            # Multi-chat feed subscription hook
│   └── useObs.ts             # useObs() singleton hook exposing client & wrapped action promises
├── components/
│   ├── FreeformBoard.tsx     # Viewport-safe freeform grid layout board + tile minimize/hide bubbles
│   ├── SortableList.tsx      # Native HTML5 drag-and-drop list component
│   ├── TileCard.tsx          # Standard responsive card container
│   ├── BridgeHost.tsx        # Background streamer.bot bridge runner
│   ├── ChatFeed.tsx          # Virtualized chat feed display
│   └── ChatOverlay.tsx       # Standalone OBS browser source overlay mode
├── tabs/                     # Top-level navigation tabs (TABS registry)
│   ├── obsDashboard.tsx      # OBS Dashboard (Stream Previews, Scenes & Sources dock, stat tiles)
│   ├── chat.tsx              # Chat Overlay & Desktop Popout Window controller
│   ├── nowPlaying.tsx        # Spotify Now Playing controller
│   ├── clips.tsx             # Twitch Clips & Discord share automation
│   ├── webhooks.tsx          # Discord live announcement webhooks
│   ├── bridge.tsx            # streamer.bot bridge status & macros
│   ├── settings.tsx          # Global settings, backup/restore JSON layout, & sidebar positioning
│   └── index.ts              # Export registry (TABS = MODULES)
├── App.tsx                   # Application shell (transparent drag bar h-9, left/right sidebar toggle)
└── main.tsx                  # React entry point
electron/
├── main.cjs                  # Electron main process (frameless window, DWM always-on-top popout window)
└── preload.cjs               # Secure IPC bridge (window.streamControl)
```

---

## 🔌 OBS Studio & Aitum Vertical Configuration

### 1. Enable OBS WebSocket v5 Server
1. In OBS Studio (`v28+` or `v31+`), navigate to **Tools $\rightarrow$ WebSocket Server Settings**.
2. Check **Enable WebSocket server**.
3. Note the **Server Port** (`4455` by default) and **Server Password** (if set).
4. Open the **OBS Dashboard** tab in Stream Control, enter your `Host` (`127.0.0.1`), `Port` (`4455`), and `Password`, then click **Connect** (or check **Connect automatically**).

### 2. Aitum Vertical Canvas Setup
Stream Control integrates directly with **Aitum Vertical (`v1.6+`)** running on OBS `v31.1+` (native `GetCanvasList` / `canvasUuid`) as well as older Aitum versions via native C++ vendor requests (`CallVendorRequest`):
- **No Manual Mapping Needed**: Once connected to OBS, Stream Control automatically discovers your Aitum Vertical Canvas via `GetCanvasList`, polls `GetSourceActive` / `CallVendorRequest("current_scene")` every second, and syncs `state.verticalCurrentScene`.
- **Linking Main & Vertical Canvases (`🔗`)**:
  - To link scenes across horizontal and vertical formats, right-click any scene on the `SCENES` or `VERTICAL SCENES` tab (or click its `🔗` icon).
  - Check the counterpart scene in the popover menu (`[✓] Gaming Vertical`). From that moment on, clicking `Gaming` on your Main Canvas switches your Aitum Vertical Canvas to `Gaming Vertical` simultaneously.
  - To link specific webcam or mic sources, right-click the source on `SOURCES` (`Webcam`), select its counterpart (`[✓] Webcam - Vertical`), and any visibility toggle (`👁️` / `🚫`) is mirrored instantly across both canvases.

---

## 📝 License & Migration
Persisted settings are saved in local storage under `STORAGE_KEY = "multichat:settings:v1"`. You can export, share, or backup your complete layout configuration as a JSON file anytime from the **Settings** tab.
