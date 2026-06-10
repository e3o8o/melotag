// MeloTag — Lyrics Module (LRC parsing, synced display, click-to-seek)
import { playerState } from './state.js';
import {
  audioElement, playerSeek, playerCurrentTime,
  playerLyricsContainer, pvLyricsContainer,
  btnSearchLyrics, inputTitle, inputArtist, inputLyrics
} from './dom.js';
import { escapeHTML, formatTime } from './utils.js';
import { fetchLyricsFromLRCLIB } from './api.js';
import { showModal } from './ui.js';

// Forward-declared dependencies (set by main.js to avoid circular imports)
let _updateTrackListItemUI = null;
let _updateUI = null;
let _getSelectedTrack = null;

export function setLyricsDeps({ updateTrackListItemUI, updateUI, getSelectedTrack }) {
  _updateTrackListItemUI = updateTrackListItemUI;
  _updateUI = updateUI;
  _getSelectedTrack = getSelectedTrack;
}

// --- Parse LRC Format ---
export function parseLRC(lrcText) {
  if (!lrcText) return [];

  const timeRegex = /\[(\d+):(\d+(?:\.\d+)?)\]/;
  const lines = lrcText.split('\n');
  const lyrics = [];

  for (const line of lines) {
    const match = timeRegex.exec(line);
    if (match) {
      const mins = parseInt(match[1], 10);
      const secs = parseFloat(match[2]);
      const time = mins * 60 + secs;
      const text = line.replace(timeRegex, '').trim();
      if (text) {
        lyrics.push({ time, text });
      }
    }
  }

  return lyrics.sort((a, b) => a.time - b.time);
}

// --- Render Synced Lyrics ---
export function renderSyncedLyrics() {
  if (!playerLyricsContainer) return;

  if (playerState.lyrics.length === 0) {
    playerLyricsContainer.style.display = 'none';
    playerLyricsContainer.innerHTML = '';
    if (pvLyricsContainer) {
      pvLyricsContainer.style.display = 'none';
      pvLyricsContainer.innerHTML = '';
    }
    return;
  }

  const html = playerState.lyrics.map((line, index) => `
    <div class="lyric-line" id="lyric-line-${index}" data-time="${line.time}">
      ${escapeHTML(line.text)}
    </div>
  `).join('');

  playerLyricsContainer.style.display = 'block';
  playerLyricsContainer.innerHTML = html;

  if (pvLyricsContainer) {
    pvLyricsContainer.style.display = 'block';
    pvLyricsContainer.innerHTML = html;
  }
}

// --- Highlight Current Lyric ---
export function updateSyncedLyricsHighlight() {
  if (playerState.lyrics.length === 0 || !playerLyricsContainer) return;

  const curTime = audioElement.currentTime;
  let activeIndex = -1;

  for (let i = 0; i < playerState.lyrics.length; i++) {
    if (curTime >= playerState.lyrics[i].time) {
      activeIndex = i;
    } else {
      break;
    }
  }

  if (activeIndex !== -1 && activeIndex !== playerState.currentLyricIndex) {
    document.querySelectorAll('.lyric-line.active').forEach(el => el.classList.remove('active'));

    const newActive = document.getElementById(`lyric-line-${activeIndex}`);
    if (newActive) {
      newActive.classList.add('active');

      const containerHeight = playerLyricsContainer.clientHeight;
      const lineOffsetTop = newActive.offsetTop;
      const lineHeight = newActive.clientHeight;
      playerLyricsContainer.scrollTo({
        top: lineOffsetTop - (containerHeight / 2) + (lineHeight / 2),
        behavior: 'smooth'
      });
    }

    // Also highlight and scroll in PV container
    const newActivePv = pvLyricsContainer ? pvLyricsContainer.querySelector(`#lyric-line-${activeIndex}`) : null;
    if (newActivePv) {
      newActivePv.classList.add('active');
      const containerHeight = pvLyricsContainer.clientHeight;
      const lineOffsetTop = newActivePv.offsetTop;
      const lineHeight = newActivePv.clientHeight;
      pvLyricsContainer.scrollTo({
        top: lineOffsetTop - (containerHeight / 2) + (lineHeight / 2),
        behavior: 'smooth'
      });
    }

    playerState.currentLyricIndex = activeIndex;
  }
}

// --- Handle Click on Lyric Line ---
function handleLyricClick(e) {
  const line = e.target.closest('.lyric-line');
  if (line) {
    const time = parseFloat(line.dataset.time);
    if (!isNaN(time)) {
      audioElement.currentTime = time;
      if (!playerState.isSeeking) {
        playerSeek.value = Math.floor(time);
        playerCurrentTime.textContent = formatTime(time);
      }
    }
  }
}

// --- Init Lyrics Listeners ---
export function initLyricsListeners() {
  if (playerLyricsContainer) {
    playerLyricsContainer.addEventListener('click', handleLyricClick);
  }
  if (pvLyricsContainer) {
    pvLyricsContainer.addEventListener('click', handleLyricClick);
  }

  // Manual lyrics search
  btnSearchLyrics.addEventListener('click', async () => {
    const track = _getSelectedTrack();
    if (!track) return;

    const title = inputTitle.value.trim();
    const artist = inputArtist.value.trim();

    if (!title || !artist) {
      showModal('Missing Fields', 'Please fill out the Song Title and Artist fields first.');
      return;
    }

    btnSearchLyrics.disabled = true;
    const origText = btnSearchLyrics.innerHTML;
    btnSearchLyrics.innerHTML = `<div class="spinner" style="width:10px;height:10px;border-width:1.5px"></div><span>Fetching...</span>`;

    try {
      const lyrics = await fetchLyricsFromLRCLIB(title, artist);
      if (lyrics) {
        inputLyrics.value = lyrics;
        track.lyrics = lyrics;
        if (track.status === 'saved') {
          track.status = 'modified';
        }
        _updateTrackListItemUI(track);
        _updateUI();
        showModal('Lyrics Found', 'Lyrics successfully retrieved and loaded!');
      } else {
        showModal('No Lyrics', 'No lyrics found for this song in the database.');
      }
    } catch (err) {
      console.error(err);
      showModal('Error', 'Failed to retrieve lyrics: ' + err.message);
    } finally {
      btnSearchLyrics.disabled = false;
      btnSearchLyrics.innerHTML = origText;
    }
  });
}
