// MeloTag — Track List Rendering & Selection
import { state, playerState } from './state.js';
import {
  trackList, inspectorEmpty, inspectorContent,
  inputTitle, inputArtist, inputAlbum, inputAlbumArtist,
  inputGenre, inputYear, inputTrack, inputTrackTotal,
  inputDisc, inputDiscTotal, inputLyrics,
  artworkFrame, artworkRes, artworkFormat,
  editorTrackNum, editorTrackName, btnSave,
  suggestionsSearchInput, audioElement,
  batchActionsBar, batchSelectedCount, chkSelectAll
} from './dom.js';
import { escapeHTML, formatTime, parseMessyFilename } from './utils.js';
import { switchMobileTab, updateUI } from './ui.js';
import { loadTrackIntoPlayer, updateNowPlayingBar } from './player.js';
import { triggerSearch } from './suggestions.js';

// --- Update Selection UI State ---
export function updateSelectionUI() {
  const selectedCount = state.selectedTracks.size;
  const totalCount = state.tracks.length;
  
  if (selectedCount > 0) {
    batchActionsBar.style.display = 'flex';
    batchSelectedCount.textContent = `${selectedCount} selected`;
  } else {
    batchActionsBar.style.display = 'none';
  }
  
  if (chkSelectAll) {
    chkSelectAll.checked = selectedCount === totalCount && totalCount > 0;
    chkSelectAll.indeterminate = selectedCount > 0 && selectedCount < totalCount;
  }
}

// --- Render Artwork Preview ---
export function renderArtworkPreview(coverArt) {
  const uploadOverlay = `<div class="artwork-overlay"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><span>Upload Cover</span></div>`;

  if (coverArt && coverArt.url) {
    artworkFrame.style.backgroundImage = `url(${coverArt.url})`;
    artworkFrame.innerHTML = uploadOverlay;

    const img = new Image();
    img.onload = () => {
      artworkRes.textContent = `${img.width} × ${img.height}`;
      artworkFormat.textContent = coverArt.format.split('/')[1].toUpperCase();
    };
    img.src = coverArt.url;
  } else {
    artworkFrame.style.backgroundImage = 'none';
    artworkFrame.innerHTML = `
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
      ${uploadOverlay}
    `;
    artworkRes.textContent = 'No cover art';
    artworkFormat.textContent = '';
  }
}

// --- Select Track ---
export function selectTrack(trackId) {
  const oldTrack = state.tracks.find(t => t.id === state.selectedTrackId);
  state.selectedTrackId = trackId;
  if (oldTrack) updateTrackListItemUI(oldTrack);

  const track = state.tracks.find(t => t.id === trackId);
  if (!track) return;

  document.querySelectorAll('.track-item').forEach(item => {
    item.classList.toggle('active', item.dataset.id === trackId);
  });

  inspectorEmpty.style.display = 'none';
  inspectorContent.style.display = 'block';

  if (window.innerWidth <= 768) {
    switchMobileTab('editor');
  }

  inputTitle.value = track.title;
  inputArtist.value = track.artist;
  inputAlbum.value = track.album;
  inputAlbumArtist.value = track.albumArtist;
  inputGenre.value = track.genre;
  inputYear.value = track.year;
  inputTrack.value = track.trackNumber;
  inputTrackTotal.value = track.trackTotal;
  inputDisc.value = track.discNumber;
  inputDiscTotal.value = track.discTotal;
  inputLyrics.value = track.lyrics;

  renderArtworkPreview(track.coverArt);
  loadTrackIntoPlayer(track);

  editorTrackNum.textContent = track.trackNumber ? `${track.trackNumber}/${track.trackTotal || '?'}` : '--';
  editorTrackName.textContent = track.title || track.name;

  updateNowPlayingBar(track);

  btnSave.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg><span>${track.handle ? 'Save In-Place' : 'Apply Changes'}</span>`;

  const { artist, title } = parseMessyFilename(track.name);
  let defaultQuery = '';
  if (track.title && track.artist) {
    defaultQuery = `${track.artist} - ${track.title}`;
  } else if (artist && title) {
    defaultQuery = `${artist} - ${title}`;
  } else {
    defaultQuery = artist || title || track.name.replace(/\.[^/.]+$/, "");
  }
  suggestionsSearchInput.value = defaultQuery;
  triggerSearch(defaultQuery);
}

// --- Render Track List Item ---
export function renderTrackListItem(track) {
  const trackIndex = state.tracks.indexOf(track);
  const div = document.createElement('div');
  div.className = 'track-item';
  div.dataset.id = track.id;
  div.id = `track-item-${track.id}`;

  div.innerHTML = `
    <span class="track-item-select"><input type="checkbox" class="track-checkbox" data-id="${track.id}" ${state.selectedTracks.has(track.id) ? 'checked' : ''}></span>
    <span class="track-item-num">${trackIndex + 1}</span>
    <div class="track-item-artwork" id="track-art-${track.id}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
    </div>
    <div class="track-item-info">
      <div class="track-item-title">${escapeHTML(track.name)}</div>
      <div class="track-item-subtitle">Reading metadata...</div>
    </div>
    <span class="track-item-time">--:--</span>
    <div class="track-item-meta">
      <span class="badge badge-original">Loading</span>
      <button class="track-item-remove" title="Remove track">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
      </button>
    </div>
  `;

  div.addEventListener('click', (e) => {
    if (e.target.closest('.track-item-remove')) {
      e.stopPropagation();
      removeTrack(track.id);
      return;
    }
    if (e.target.closest('.track-item-select') || e.target.closest('.track-checkbox')) {
      return; // Handled by checkbox change listener
    }
    selectTrack(track.id);
  });

  const checkbox = div.querySelector('.track-checkbox');
  checkbox.addEventListener('click', (e) => {
    e.stopPropagation(); // Avoid triggering row selection
  });
  checkbox.addEventListener('change', (e) => {
    if (e.target.checked) {
      state.selectedTracks.add(track.id);
    } else {
      state.selectedTracks.delete(track.id);
    }
    updateSelectionUI();
  });

  trackList.appendChild(div);
  updateSelectionUI();
}

// --- Update Track Item Visual State ---
export function updateTrackListItemUI(track) {
  const div = document.getElementById(`track-item-${track.id}`);
  if (!div) return;

  const trackIndex = state.tracks.indexOf(track);
  const artContainer = document.getElementById(`track-art-${track.id}`);
  const titleContainer = div.querySelector('.track-item-title');
  const subtitleContainer = div.querySelector('.track-item-subtitle');
  const badgeContainer = div.querySelector('.badge');
  const timeContainer = div.querySelector('.track-item-time');
  const numContainer = div.querySelector('.track-item-num');

  const isPlayingThisTrack = track.id === state.selectedTrackId && playerState.isPlaying;

  if (numContainer) numContainer.textContent = trackIndex >= 0 ? trackIndex + 1 : '';

  if (track.coverArt && track.coverArt.url) {
    artContainer.style.backgroundImage = `url(${track.coverArt.url})`;
    artContainer.innerHTML = '';
  } else {
    artContainer.style.backgroundImage = 'none';
    artContainer.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
  }

  titleContainer.innerHTML = `${escapeHTML(track.title || track.name)}${isPlayingThisTrack ? `
    <div class="equalizer-bars" style="display: inline-flex; vertical-align: middle;">
      <span class="bar"></span><span class="bar"></span><span class="bar"></span><span class="bar"></span>
    </div>
  ` : ''}`;

  subtitleContainer.textContent = track.artist || 'Unknown Artist';

  if (timeContainer) {
    timeContainer.textContent = track.duration ? formatTime(track.duration) : '--:--';
  }

  badgeContainer.className = 'badge';
  if (track.status === 'original') {
    badgeContainer.classList.add('badge-original');
    badgeContainer.textContent = 'Original';
  } else if (track.status === 'modified') {
    badgeContainer.classList.add('badge-modified');
    badgeContainer.textContent = 'Modified';
  } else if (track.status === 'matched') {
    badgeContainer.classList.add('badge-matched');
    badgeContainer.textContent = 'Matched';
  } else if (track.status === 'saved') {
    badgeContainer.classList.add('badge-saved');
    badgeContainer.textContent = track.handle ? 'Saved' : 'Modified';
  }
}

// --- Remove Track ---
export function removeTrack(trackId) {
  const index = state.tracks.findIndex(t => t.id === trackId);
  if (index === -1) return;

  const track = state.tracks[index];
  if (track.coverArt && track.coverArt.url) {
    URL.revokeObjectURL(track.coverArt.url);
  }

  state.tracks.splice(index, 1);
  const div = document.getElementById(`track-item-${trackId}`);
  if (div) trackList.removeChild(div);

  state.selectedTracks.delete(trackId);
  updateSelectionUI();

  if (state.selectedTrackId === trackId) {
    audioElement.pause();
    audioElement.src = '';
    if (playerState.objectUrl) {
      URL.revokeObjectURL(playerState.objectUrl);
      playerState.objectUrl = null;
    }
    state.selectedTrackId = null;
    inspectorContent.style.display = 'none';
    inspectorEmpty.style.display = 'flex';
    updateNowPlayingBar(null);
  }

  updateUI();
}

// --- Initialize Track Selection Listeners ---
export function initTracksListeners() {
  if (chkSelectAll) {
    chkSelectAll.addEventListener('change', (e) => {
      const checked = e.target.checked;
      state.tracks.forEach(track => {
        const checkbox = document.querySelector(`.track-checkbox[data-id="${track.id}"]`);
        if (checkbox) checkbox.checked = checked;
        
        if (checked) {
          state.selectedTracks.add(track.id);
        } else {
          state.selectedTracks.delete(track.id);
        }
      });
      updateSelectionUI();
    });
  }
}
