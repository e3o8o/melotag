// MeloTag — Auto-Tag & Batch Operations
import { state } from './state.js';
import {
  btnMagic, btnAutoMatchAll, btnSaveAll, successOverlay,
  btnBatchAutotag, btnBatchSave, btnTagAsAlbum
} from './dom.js';
import { parseMessyFilename, cleanPromo, parseFeaturedArtist } from './utils.js';
import { showModal, updateUI } from './ui.js';
import { fetchUnifiedSuggestions, fetchLyricsFromLRCLIB, fetchAlbumContext } from './api.js';
import { writeTagsToBuffer, triggerDownload } from './file-io.js';
import { selectTrack, updateTrackListItemUI, updateSelectionUI } from './tracks.js';

// Album-level context (set when a folder is loaded)
export const albumContext = { artist: '', album: '', tracklistMap: null, artworkUrl: null, year: '', genre: '' };

// --- Apply cover art from URL ---
async function applyCoverArtFromUrl(track, artUrl) {
  if (!artUrl) return;
  try {
    const res = await fetch(artUrl);
    if (!res.ok) return;
    const blob = await res.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const mime = blob.type || 'image/jpeg';
    if (track.coverArt && track.coverArt.url) URL.revokeObjectURL(track.coverArt.url);
    track.coverArt = { data: uint8Array, format: mime, url: URL.createObjectURL(blob) };
  } catch (err) {
    console.warn('Cover art download failed:', err);
  }
}

// --- Magic Auto-Tag Core ---
export async function magicAutoTagTrack(track) {
  // --- 1. Try album tracklist match first (if a folder/album context is active) ---
  if (albumContext.tracklistMap && albumContext.tracklistMap.size > 0) {
    const rawName = track.name.replace(/\.[^/.]+$/, '');
    // Strip leading track number
    const stripped = rawName.replace(/^\d+\s*[.\-_]?\s*/, '');
    // Strip artist prefix
    const withoutArtist = albumContext.artist
      ? stripped.replace(new RegExp(`^${albumContext.artist}\\s*[.\\-_]?\\s*`, 'i'), '')
      : stripped;
    // Get base title before any featured artist markers
    const baseTitleRaw = withoutArtist.split(/\b(?:ft|feat|featuring)\b/i)[0].trim();
    const normKey = cleanPromo(baseTitleRaw).toLowerCase().replace(/[^a-z0-9]/g, '');
    let official = null;
    if (albumContext.tracklistMap.has(normKey)) {
      official = albumContext.tracklistMap.get(normKey);
    } else {
      // Substring match fallback
      for (const [key, val] of albumContext.tracklistMap.entries()) {
        if (key.length >= 4 && (normKey.includes(key) || key.includes(normKey))) {
          official = val;
          break;
        }
      }
    }

    if (official) {

      // Parse featured artist from official title if present
      const { baseTitle, featuredArtist } = parseFeaturedArtist(official.title);
      track.title = featuredArtist ? `${baseTitle} (feat. ${featuredArtist})` : official.title;
      track.artist = featuredArtist ? `${official.artist} & ${featuredArtist}` : official.artist;
      track.albumArtist = albumContext.artist || official.artist;
      track.album = albumContext.album || track.album;
      track.trackNumber = official.trackNumber || track.trackNumber;
      if (albumContext.year) track.year = albumContext.year;
      if (albumContext.genre) track.genre = albumContext.genre;

      // Use album-level artwork
      if (!track.coverArt && albumContext.artworkUrl) {
        await applyCoverArtFromUrl(track, albumContext.artworkUrl);
      }

      // Try lyrics for matched track
      try {
        const lyrics = await fetchLyricsFromLRCLIB(track.title, official.artist);
        if (lyrics) track.lyrics = lyrics;
      } catch (err) {
        console.warn('LRCLIB lyrics fetch failed:', err);
      }

      const savedInPlace = await writeTagsToBuffer(track);
      track.status = savedInPlace ? 'saved' : 'modified';
      if (state.selectedTrackId === track.id) selectTrack(track.id);
      else updateTrackListItemUI(track);
      updateUI();
      return;
    }
  }

  // --- 2. Fallback: unified search (iTunes + Deezer + MusicBrainz) ---
  const { artist, title } = parseMessyFilename(track.name);
  let query = '';
  if (artist && title) query = `${artist} - ${title}`;
  else query = artist || title || track.name.replace(/\.[^/.]+$/, '');

  const { results, error } = await fetchUnifiedSuggestions(query);
  if (error) throw new Error(error);
  if (results.length === 0) throw new Error('Could not find matches for "' + query + '".');

  const match = results[0];

  // Parse featured artist from match title
  const { baseTitle: matchBase, featuredArtist: matchFeat } = parseFeaturedArtist(match.trackName || '');
  track.title = matchFeat ? `${matchBase} (feat. ${matchFeat})` : (match.trackName || '');
  track.artist = matchFeat ? `${match.artistName} & ${matchFeat}` : (match.artistName || '');
  track.albumArtist = match.artistName || '';
  track.album = albumContext.album || match.collectionName || '';
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

  // Download high-res cover art (prefer album art if context has it)
  const artUrl = albumContext.artworkUrl || match.artworkUrlHigh || match.artworkUrl100 || '';
  if (!track.coverArt && artUrl) {
    await applyCoverArtFromUrl(track, artUrl);
  }

  // Clean promo junk
  track.title = cleanPromo(track.title);
  track.artist = cleanPromo(track.artist);
  track.album = cleanPromo(track.album);

  const savedInPlace = await writeTagsToBuffer(track);
  track.status = savedInPlace ? 'saved' : 'modified';

  if (state.selectedTrackId === track.id) {
    selectTrack(track.id);
  } else {
    updateTrackListItemUI(track);
  }
  updateUI();
}

// --- Album Auto-Tag: fetch album context then tag all tracks ---
export async function albumAutoTagTracks(tracks, artist, album) {
  // Store context so individual track tagging can use it
  albumContext.artist = artist;
  albumContext.album = album;
  albumContext.tracklistMap = null;
  albumContext.artworkUrl = null;
  albumContext.year = '';
  albumContext.genre = '';

  if (artist || album) {
    const ctx = await fetchAlbumContext(artist, album);
    albumContext.tracklistMap = ctx.tracklistMap;
    albumContext.artworkUrl = ctx.artworkUrl;
    if (ctx.resolvedArtist) albumContext.artist = ctx.resolvedArtist;
    if (ctx.resolvedAlbum) albumContext.album = ctx.resolvedAlbum;
    if (ctx.year) albumContext.year = ctx.year;
    if (ctx.genre) albumContext.genre = ctx.genre;
  }

  let successCount = 0;
  let failCount = 0;
  for (const track of tracks) {
    try {
      await magicAutoTagTrack(track);
      successCount++;
    } catch (err) {
      console.error(`Album auto-tag failed for ${track.name}:`, err);
      failCount++;
    }
  }
  return { successCount, failCount };
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

  // Tag as Album (folder context)
  if (btnTagAsAlbum) {
    btnTagAsAlbum.addEventListener('click', async () => {
      if (state.tracks.length === 0 || state.isProcessing) return;

      state.isProcessing = true;
      btnTagAsAlbum.disabled = true;
      const origText = btnTagAsAlbum.innerHTML;
      btnTagAsAlbum.innerHTML = `<div class="spinner" style="width:12px;height:12px;border-width:1.5px"></div><span>Fetching...</span>`;

      const { successCount, failCount } = await albumAutoTagTracks(
        state.tracks,
        albumContext.artist,
        albumContext.album
      );

      state.isProcessing = false;
      btnTagAsAlbum.disabled = false;
      btnTagAsAlbum.innerHTML = origText;
      updateUI();
      showModal(
        'Album Tag Complete',
        `Tagged ${successCount} track${successCount !== 1 ? 's' : ''} as part of «${albumContext.album || 'the album'}».` +
        (failCount > 0 ? `\n${failCount} track(s) could not be matched.` : '')
      );
    });
  }
}
