// MeloTag — Main Entry Point
import { state } from './state.js';
import {
  initUIListeners,
  updateUI
} from './ui.js';
import {
  initPlayerListeners,
  setPlayerDeps
} from './player.js';
import {
  initQueueListeners,
  setQueueDeps
} from './queue.js';
import {
  initLyricsListeners,
  setLyricsDeps
} from './lyrics.js';
import {
  initSuggestionsListeners,
  setSuggestionsDeps
} from './suggestions.js';
import {
  initFileIOListeners
} from './file-io.js';
import {
  initAutoTagListeners
} from './auto-tag.js';
import {
  selectTrack,
  updateTrackListItemUI,
  renderArtworkPreview,
  initTracksListeners
} from './tracks.js';

// Setup cross-module dependencies to resolve circular imports
setPlayerDeps({ selectTrack, updateTrackListItemUI });
setQueueDeps({ selectTrack });
setLyricsDeps({
  updateTrackListItemUI,
  updateUI,
  getSelectedTrack: () => state.tracks.find(t => t.id === state.selectedTrackId)
});
setSuggestionsDeps({ renderArtworkPreview, updateTrackListItemUI, updateUI });

// DOMContentLoaded Entry
document.addEventListener('DOMContentLoaded', () => {
  // Check File System Access API support
  const hasFS = typeof window.showOpenFilePicker === 'function';
  
  // Initialize listeners
  initUIListeners();
  initPlayerListeners();
  initQueueListeners();
  initLyricsListeners();
  initSuggestionsListeners();
  initFileIOListeners(hasFS);
  initTracksListeners();
  initAutoTagListeners();

  // Initial UI sync
  updateUI();

  // Register service worker for PWA offline support
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('Service Worker registered successfully with scope:', reg.scope))
        .catch(err => console.error('Service Worker registration failed:', err));
    });
  }
});
