// MeloTag — Auto-Tag & Batch Operations
import { state } from './state.js';
import {
  btnMagic, btnAutoMatchAll, btnSaveAll, successOverlay,
  btnBatchAutotag, btnBatchSave
} from './dom.js';
import { parseMessyFilename } from './utils.js';
import { showModal, updateUI } from './ui.js';
import { fetchUnifiedSuggestions, fetchLyricsFromLRCLIB } from './api.js';
import { writeTagsToBuffer, triggerDownload } from './file-io.js';
import { selectTrack, updateTrackListItemUI, updateSelectionUI } from './tracks.js';

// --- Magic Auto-Tag Core ---
export async function magicAutoTagTrack(track) {
  const { artist, title } = parseMessyFilename(track.name);
  let query = '';
  if (artist && title) query = `${artist} - ${title}`;
  else query = artist || title || track.name.replace(/\.[^/.]+$/, "");

  const { results, error } = await fetchUnifiedSuggestions(query);
  if (error) throw new Error(error);
  if (results.length === 0) throw new Error('Could not find matches for "' + query + '".');

  const match = results[0];

  track.title = match.trackName || '';
  track.artist = match.artistName || '';
  track.album = match.collectionName || '';
  track.genre = match.primaryGenreName || '';
  track.year = (match.releaseDate && match.releaseDate.length >= 4) ? match.releaseDate.substring(0, 4) : '';
  track.trackNumber = match.trackNumber || '';
  track.trackTotal = match.trackCount || '';
  track.discNumber = match.discNumber || '';
  track.discTotal = match.discCount || '';

  // Auto-fetch lyrics
  try {
    const lyrics = await fetchLyricsFromLRCLIB(match.trackName, match.artistName);
    if (lyrics) track.lyrics = lyrics;
  } catch (err) {
    console.warn('LRCLIB auto lyrics fetch failed:', err);
  }

  // Download high-res cover art
  const highResArt = match.artworkUrlHigh || match.artworkUrl100 || '';
  if (highResArt) {
    try {
      const res = await fetch(highResArt);
      const blob = await res.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const mime = blob.type || 'image/jpeg';

      if (track.coverArt && track.coverArt.url) URL.revokeObjectURL(track.coverArt.url);
      track.coverArt = {
        data: uint8Array,
        format: mime,
        url: URL.createObjectURL(blob)
      };
    } catch (err) {
      console.warn('Cover art download failed:', err);
    }
  }

  const savedInPlace = await writeTagsToBuffer(track);
  track.status = savedInPlace ? 'saved' : 'modified';

  if (state.selectedTrackId === track.id) {
    selectTrack(track.id);
  } else {
    updateTrackListItemUI(track);
  }
  updateUI();
}

// --- Init Auto-Tag Listeners ---
export function initAutoTagListeners() {
  // Magic button (single track)
  btnMagic.addEventListener('click', async () => {
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (!track) return;

    btnMagic.disabled = true;
    const originalText = btnMagic.innerHTML;
    btnMagic.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px"></div><span>Matching...</span>`;

    try {
      await magicAutoTagTrack(track);
      successOverlay.classList.add('active');
      setTimeout(() => successOverlay.classList.remove('active'), 1500);
    } catch (err) {
      console.error('Magic Auto-tag error:', err);
      showModal('Auto-Tag Error', 'Magic Auto-Tag failed: ' + err.message);
    } finally {
      btnMagic.disabled = false;
      btnMagic.innerHTML = originalText;
    }
  });

  // Bulk Auto-Match All
  btnAutoMatchAll.addEventListener('click', async () => {
    if (state.tracks.length === 0 || state.isProcessing) return;

    state.isProcessing = true;
    btnAutoMatchAll.disabled = true;
    const origText = btnAutoMatchAll.innerHTML;
    btnAutoMatchAll.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px"></div><span>Auto-matching...</span>`;

    for (const track of state.tracks) {
      if (track.status !== 'original') continue;
      try {
        await magicAutoTagTrack(track);
      } catch (err) {
        console.error(`Auto-match failed for ${track.name}:`, err);
      }
    }

    state.isProcessing = false;
    btnAutoMatchAll.disabled = false;
    btnAutoMatchAll.innerHTML = origText;
    updateUI();
    showModal('Auto-Match Complete', 'Auto-Match completed! Check the track status indicators for results.');
  });

  // Bulk Save All
  btnSaveAll.addEventListener('click', async () => {
    const tracksToSave = state.tracks.filter(t => t.status === 'modified' || t.status === 'matched');
    if (tracksToSave.length === 0) return;

    btnSaveAll.disabled = true;
    const origText = btnSaveAll.innerHTML;
    btnSaveAll.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px"></div><span>Saving...</span>`;

    let inPlaceSaved = 0;
    let downloadsTriggered = 0;

    for (const track of tracksToSave) {
      try {
        const saved = await writeTagsToBuffer(track);
        if (saved) {
          track.status = 'saved';
          inPlaceSaved++;
        } else {
          track.status = 'saved';
          triggerDownload(track);
          downloadsTriggered++;
          await new Promise(resolve => setTimeout(resolve, 350));
        }
      } catch (err) {
        console.error(`Error saving track ${track.name}:`, err);
      }
      updateTrackListItemUI(track);
    }

    btnSaveAll.disabled = false;
    btnSaveAll.innerHTML = origText;
    updateUI();

    let msg = `Successfully saved all changes!`;
    if (inPlaceSaved > 0) msg += `\n- ${inPlaceSaved} files updated directly in-place.`;
    if (downloadsTriggered > 0) msg += `\n- ${downloadsTriggered} files downloaded manually as backups.`;
    showModal('Save Complete', msg);
  });

  // Batch Auto-Tag Selected
  if (btnBatchAutotag) {
    btnBatchAutotag.addEventListener('click', async () => {
      if (state.selectedTracks.size === 0 || state.isProcessing) return;

      state.isProcessing = true;
      btnBatchAutotag.disabled = true;
      const origText = btnBatchAutotag.innerHTML;
      btnBatchAutotag.innerHTML = `<div class="spinner" style="width:12px;height:12px;border-width:1.5px"></div><span>Matching...</span>`;

      const selectedIds = Array.from(state.selectedTracks);
      let successCount = 0;
      let failCount = 0;

      for (const trackId of selectedIds) {
        const track = state.tracks.find(t => t.id === trackId);
        if (!track) continue;
        try {
          await magicAutoTagTrack(track);
          successCount++;
        } catch (err) {
          console.error(`Auto-match failed for ${track.name}:`, err);
          failCount++;
        }
      }

      state.isProcessing = false;
      btnBatchAutotag.disabled = false;
      btnBatchAutotag.innerHTML = origText;
      updateUI();
      updateSelectionUI();
      showModal('Batch Auto-Tag Complete', `Auto-matched ${successCount} tracks.${failCount > 0 ? ` Failed to match ${failCount} tracks.` : ''}`);
    });
  }

  // Batch Save Selected
  if (btnBatchSave) {
    btnBatchSave.addEventListener('click', async () => {
      if (state.selectedTracks.size === 0) return;

      btnBatchSave.disabled = true;
      const origText = btnBatchSave.innerHTML;
      btnBatchSave.innerHTML = `<div class="spinner" style="width:12px;height:12px;border-width:1.5px"></div><span>Saving...</span>`;

      const selectedIds = Array.from(state.selectedTracks);
      let inPlaceSaved = 0;
      let downloadsTriggered = 0;

      for (const trackId of selectedIds) {
        const track = state.tracks.find(t => t.id === trackId);
        if (!track) continue;

        try {
          const saved = await writeTagsToBuffer(track);
          if (saved) {
            track.status = 'saved';
            inPlaceSaved++;
          } else {
            track.status = 'saved';
            triggerDownload(track);
            downloadsTriggered++;
            await new Promise(resolve => setTimeout(resolve, 350));
          }
        } catch (err) {
          console.error(`Error saving track ${track.name}:`, err);
        }
        updateTrackListItemUI(track);
      }

      btnBatchSave.disabled = false;
      btnBatchSave.innerHTML = origText;
      
      // Clear selection after saving
      state.selectedTracks.clear();
      updateUI();
      updateSelectionUI();

      let msg = `Successfully saved selected changes!`;
      if (inPlaceSaved > 0) msg += `\n- ${inPlaceSaved} files updated directly in-place.`;
      if (downloadsTriggered > 0) msg += `\n- ${downloadsTriggered} files downloaded manually.`;
      showModal('Save Complete', msg);
    });
  }
}
