# MeloTag — Client-Side Music Player & Tag Editor

MeloTag is a high-fidelity, client-side MP3 player and ID3 metadata tag editor. It is built with a premium dark **Swiss Editorial / Vehicle Dashboard** aesthetic (instrument black, fine grid lines, and glowing Chrome Yellow/glowing blue telemetry highlights).

MeloTag queries metadata databases concurrently, merges details, downloads high-resolution cover artwork, syncs lyrics, and writes the updated tags directly back into your MP3 files in-place.

---

## Key Features

1. **Triple Search Engine (iTunes, Deezer, & MusicBrainz)**
   - Concurrently searches the **iTunes Search API**, **Deezer Search API**, and the open-source **MusicBrainz API** (along with the **Cover Art Archive**).
   - Normalizes and deduplicates results on-the-fly, showing clear source badges (`iTunes`, `Deezer`, `MusicBrainz`, or merged) on each candidate card.
   - Retains iTunes' fine-grained tags (genre, year, track/disc count), Deezer's cover art, and MusicBrainz's robust metadata.
   - Automatically falls back if individual API requests time out or fail.
2. **Multi-File Batch Tagging**
   - Select multiple tracks from the library using checkboxes or the "Select All" toggle.
   - Run bulk actions like **Auto-Tag** (matches and fetches metadata for all selected tracks) and **Save** (writes tags directly to files).
3. **Synchronized LRC Lyrics**
   - Integrates with **LRCLIB** to automatically fetch synced lyrics based on artist/title matching.
   - Highlights and scrolls lyrics in sync with the audio playback, both in the desktop sidebar and full-screen mobile player.
4. **In-place File System Tagging**
   - Utilizes the modern browser **File System Access API** (`showOpenFilePicker`, `showDirectoryPicker`) to open, read, edit, and write tags *directly* back to the files on your hard drive without duplicate downloads.
   - **Smart Overwriting Fallback**: If files are loaded via drag-and-drop or standard file inputs (which don't capture a file handle initially), clicking "Save" will query `window.showSaveFilePicker`. This lets you select and overwrite the original file in your system's save dialog (avoiding duplicate downloads like `song (1).mp3`). The app then retains that handle for subsequent direct saves.
   - Automatically falls back to standard file uploads and downloads for browsers that do not support the File System Access API (such as iOS Safari).
5. **PWA & Offline Caching (Installable on iPad/iOS)**
   - Configured with a Progressive Web App manifest (`manifest.json`) and service worker caching core assets.
   - Includes high-quality PNG assets (`icon-192.png`, `icon-512.png`) and an Apple-specific touch icon (`icon-180.png`) configured in the head of `index.html`.
   - On iPad/iPhone Safari, tap the **Share** button and select **Add to Home Screen** to install MeloTag as a native standalone app with its own launch icons and hidden browser chrome.

---

## Codebase Architecture

The codebase has been refactored into a highly modular ES module architecture, ensuring that no single JavaScript or CSS file exceeds 500 lines.

### JavaScript Modules (`src/`)
- [state.js](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/state.js): Application-wide playback, queue, and track selection state.
- [dom.js](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/dom.js): Central registry of all DOM elements.
- [utils.js](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/utils.js): Utility helpers like ID generation, time formatting, and filename parsing.
- [ui.js](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/ui.js): Modal dialog, tab switching, and general UI state updates.
- [api.js](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/api.js): iTunes, Deezer, MusicBrainz, and LRCLIB lyrics API fetchers.
- [suggestions.js](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/suggestions.js): Suggestion grid rendering, manual metadata search, and form matching.
- [tracks.js](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/tracks.js): Track list rendering, selection, selection checkboxes, and remove handlers.
- [player.js](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/player.js): Audio playback, volume (with iPad/mobile touch events fix), visualizer, seek, and shuffle/repeat.
- [queue.js](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/queue.js): Bottom Spotify-style play queue sidebar.
- [lyrics.js](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/lyrics.js): LRC parsing, click-to-seek, synced highlighting, and manual lyrics fetching.
- [file-io.js](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/file-io.js): File System Access API read/write operations, drag & drop, and manual download trigger.
- [auto-tag.js](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/auto-tag.js): Bulk auto-tag, auto-match, bulk saving, and batch operations.
- [main.js](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/main.js): App bootstrap, cross-module dependency injection, listener attachments, and service worker registration.

### Modular Stylesheets (`src/styles/`)
- [index.css](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/styles/index.css): Imports all style sheets.
- [variables.css](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/styles/variables.css): Color tokens, typography defaults, and resets.
- [layout.css](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/styles/layout.css): App grid layout.
- [components.css](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/styles/components.css): Shared UI elements (buttons, modals, spin indicators).
- [sidebar.css](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/styles/sidebar.css): Track listing, file upload zone, search, and batch actions bar.
- [editor.css](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/styles/editor.css): Form inputs, suggestions, and card grids.
- [player.css](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/styles/player.css): Central player, visualizer, dynamic lyrics, and artwork.
- [now-playing.css](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/styles/now-playing.css): Spotify-style bottom controls bar.
- [mobile.css](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/styles/mobile.css): Responsive layout overlays and tabs.
- [scrollbar.css](file:///Users/elemoghenekaro/Workspace/tasks/projects/melotag/src/styles/scrollbar.css): Custom scrollbar designs.

---

## Vercel Serverless Architecture

Vite proxies `/api/` in development. In production, requests are handled by Vercel serverless functions in the `api/` directory to bypass CORS and apply headers:
- `api/itunes.js` -> Proxies to iTunes Search API
- `api/deezer.js` -> Proxies to Deezer API
- `api/lrclib.js` -> Proxies to LRCLIB lyrics API
- `api/musicbrainz.js` -> Proxies to MusicBrainz recording search API
- `api/coverart.js` -> Proxies and serves cover art from the Cover Art Archive

---

## Native iOS App Setup (Capacitor)

MeloTag can be wrapped into a native iOS app using Capacitor:

1. Initialize Capacitor:
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/ios
   npx cap init MeloTag com.melotag.app --web-dir=dist
   npx cap add ios
   ```
2. Build and sync assets:
   ```bash
   npm run build
   npx cap sync ios
   ```
3. Open in Xcode (requires macOS):
   ```bash
   npx cap open ios
   ```
4. In Xcode, you can run the app on an iOS simulator or a physical iPhone/iPad.

---

## Getting Started

### Installation & Local Run
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run Vite local server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:5173`.
