// MeloTag — Audio Player Module
// Handles playback, seek, volume, visualizer, now-playing bar, shuffle/repeat
import { state, playerState } from './state.js';
import {
  audioElement, playerPlayBtn, playerPlayIcon, playerCurrentTime,
  playerTotalTime, playerSeek, playerTrackInfo, playerVolume,
  playerVolumeIcon, playerVisualizer, playerLyricsContainer,
  nowPlayingBar, npArtwork, npTitle, npArtist, npSeek, npPlayBtn,
  npPlayIcon, btnNpPrev, btnNpNext, npVolumeSlider,
  btnNpShuffle, btnNpRepeat, btnNpVolume,
  pvArtwork, pvTitle, pvArtist, pvSeek, pvCurrentTime, pvTotalTime,
  pvPlayBtn, pvPlayIcon, btnPvPrev, btnPvNext,
  btnPvShuffle, btnPvRepeat, btnPvVolume, pvVolumeSlider, pvLyricsContainer,
  btnPlayerShuffle, btnPlayerRepeat, btnPlayerPrev, btnPlayerNext
} from './dom.js';
import { formatTime } from './utils.js';
import { parseLRC, renderSyncedLyrics, updateSyncedLyricsHighlight } from './lyrics.js';

// Forward-declared dependencies
let _selectTrack = null;
let _updateTrackListItemUI = null;

export function setPlayerDeps({ selectTrack, updateTrackListItemUI }) {
  _selectTrack = selectTrack;
  _updateTrackListItemUI = updateTrackListItemUI;
}

// --- Visualizer ---
let audioCtx = null;
let analyser = null;
let visualizerInitialized = false;

function initVisualizer() {
  if (visualizerInitialized) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    const source = audioCtx.createMediaElementSource(audioElement);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    analyser.fftSize = 64;
    visualizerInitialized = true;
    drawVisualizer();
  } catch (err) {
    console.warn('Web Audio API not supported:', err);
  }
}

function drawVisualizer() {
  if (!visualizerInitialized || !playerVisualizer) return;
  requestAnimationFrame(drawVisualizer);

  const canvasCtx = playerVisualizer.getContext('2d');
  const width = playerVisualizer.width = playerVisualizer.clientWidth;
  const height = playerVisualizer.height = playerVisualizer.clientHeight;
  canvasCtx.clearRect(0, 0, width, height);
  if (!analyser) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  const barWidth = (width / bufferLength) * 1.4;
  let barHeight;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    barHeight = dataArray[i] / 4;
    canvasCtx.fillStyle = `rgba(245, 197, 24, ${0.1 + (barHeight / 64)})`;
    canvasCtx.fillRect(x, height - barHeight, barWidth - 2, barHeight);
    canvasCtx.fillStyle = 'rgba(245, 197, 24, 0.7)';
    canvasCtx.fillRect(x, height - barHeight - 2, barWidth - 2, 2);
    x += barWidth;
  }
}

// --- Play/Pause Icon Sync ---
function setPlayIcon(paused) {
  if (!playerPlayIcon) return;
  const playSvg = '<polygon points="6 3 20 12 6 21 6 3"/>';
  const pauseSvg = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
  playerPlayIcon.innerHTML = paused ? playSvg : pauseSvg;
  if (npPlayIcon) npPlayIcon.innerHTML = paused ? playSvg : pauseSvg;
  if (pvPlayIcon) pvPlayIcon.innerHTML = paused ? playSvg : pauseSvg;
}

// --- Now Playing Bar Update ---
export function updateNowPlayingBar(track) {
  if (!track) {
    nowPlayingBar.style.display = 'none';
    if (pvTitle) pvTitle.textContent = 'No track selected';
    if (pvArtist) pvArtist.textContent = '';
    // Clear mini player
    import('./ui.js').then(({ updateMiniPlayer }) => updateMiniPlayer(null));
    return;
  }
  nowPlayingBar.style.display = 'flex';
  npTitle.textContent = track.title || track.name;
  npArtist.textContent = track.artist || 'Unknown Artist';
  if (pvTitle) pvTitle.textContent = track.title || track.name;
  if (pvArtist) pvArtist.textContent = track.artist || 'Unknown Artist';

  if (track.coverArt && track.coverArt.url) {
    npArtwork.style.backgroundImage = `url(${track.coverArt.url})`;
    npArtwork.innerHTML = '';
    if (pvArtwork) {
      pvArtwork.style.backgroundImage = `url(${track.coverArt.url})`;
      pvArtwork.innerHTML = '';
    }
  } else {
    npArtwork.style.backgroundImage = 'none';
    npArtwork.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 9.5V20l12-8L7 4"/></svg>';
    if (pvArtwork) {
      pvArtwork.style.backgroundImage = 'none';
      pvArtwork.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M7 9.5V20l12-8L7 4"/></svg>';
    }
  }

  npSeek.max = Math.floor(audioElement.duration || 100);
  npSeek.value = 0;
  if (pvSeek) {
    pvSeek.max = Math.floor(audioElement.duration || 100);
    pvSeek.value = 0;
    if (pvCurrentTime) pvCurrentTime.textContent = '0:00';
    if (pvTotalTime) pvTotalTime.textContent = formatTime(audioElement.duration);
  }

  // Sync mini player (mobile)
  import('./ui.js').then(({ updateMiniPlayer }) => updateMiniPlayer(track));
}

// --- Load Track ---
export function loadTrackIntoPlayer(track) {
  audioElement.pause();
  audioElement.src = '';

  if (playerState.objectUrl) {
    URL.revokeObjectURL(playerState.objectUrl);
  }

  const blob = new Blob([track.buffer], { type: 'audio/mp3' });
  playerState.objectUrl = URL.createObjectURL(blob);
  audioElement.src = playerState.objectUrl;
  audioElement.load();

  playerTrackInfo.textContent = track.title || track.name;
  playerCurrentTime.textContent = '0:00';
  playerTotalTime.textContent = '0:00';
  playerSeek.value = 0;
  if (pvCurrentTime) pvCurrentTime.textContent = '0:00';
  if (pvTotalTime) pvTotalTime.textContent = '0:00';
  if (pvSeek) pvSeek.value = 0;

  playerState.isPlaying = false;
  setPlayIcon(true);

  audioElement.volume = playerState.isMuted ? 0 : playerState.volume;
  playerVolume.value = Math.floor(playerState.volume * 100);
  updateVolumeIconUI();

  playerState.lyrics = parseLRC(track.lyrics);
  playerState.currentLyricIndex = -1;
  renderSyncedLyrics();
}

// --- Queue Traversal ---
function playNextTrack() {
  if (state.tracks.length === 0) return;
  const currentIndex = state.tracks.findIndex(t => t.id === state.selectedTrackId);
  let nextIndex = 0;

  if (playerState.repeatMode === 'one' && currentIndex !== -1) {
    audioElement.currentTime = 0;
    audioElement.play().catch(err => console.error(err));
    return;
  }

  if (playerState.shuffle) {
    nextIndex = Math.floor(Math.random() * state.tracks.length);
  } else if (currentIndex !== -1) {
    nextIndex = currentIndex + 1;
    if (nextIndex >= state.tracks.length) {
      if (playerState.repeatMode === 'all') nextIndex = 0;
      else return;
    }
  }

  const nextTrack = state.tracks[nextIndex];
  if (nextTrack) {
    _selectTrack(nextTrack.id);
    audioElement.play().catch(err => console.error(err));
  }
}

function playPrevTrack() {
  if (state.tracks.length === 0) return;
  const currentIndex = state.tracks.findIndex(t => t.id === state.selectedTrackId);
  let prevIndex = 0;

  if (playerState.shuffle) {
    prevIndex = Math.floor(Math.random() * state.tracks.length);
  } else if (currentIndex !== -1) {
    prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
      prevIndex = playerState.repeatMode === 'all' ? state.tracks.length - 1 : 0;
    }
  }

  const prevTrack = state.tracks[prevIndex];
  if (prevTrack) {
    _selectTrack(prevTrack.id);
    audioElement.play().catch(err => console.error(err));
  }
}

// --- Repeat Button Sync ---
function syncRepeatBtnUI() {
  const mode = playerState.repeatMode;
  if (btnNpRepeat) {
    btnNpRepeat.className = 'btn btn-control btn-control-xs' +
      (mode === 'all' ? ' active-all' : mode === 'one' ? ' active-one' : '');
  }
  btnPlayerRepeat.className = 'btn btn-control btn-control-sm' +
    (mode === 'all' ? ' active-all' : mode === 'one' ? ' active-one' : '');
  if (btnPvRepeat) {
    btnPvRepeat.className = 'btn btn-control btn-control-sm' +
      (mode === 'all' ? ' active-all' : mode === 'one' ? ' active-one' : '');
  }
}

// --- Volume Icon Sync ---
function updateVolumeIconUI() {
  const volumeSvg = document.getElementById('volume-svg');
  if (volumeSvg) {
    let svg;
    if (playerState.isMuted || playerState.volume === 0) {
      svg = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>';
    } else if (playerState.volume < 0.4) {
      svg = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>';
    } else if (playerState.volume < 0.7) {
      svg = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
    } else {
      svg = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
    }
    volumeSvg.innerHTML = svg;
  }

  const muteIcon = (size) => (playerState.isMuted || playerState.volume === 0)
    ? `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3s4 2.4 4 9.6c0 2-.31 3.54-.76 4.72M17 8v6M8.58 8 7.1 9H3v4m10-4V5l-1.85 1.25M3 16h4.29L13 20v-6.35M4 2l16 20"/></svg>`
    : `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16h4.29L13 20V5L7.1 9H3v4M17 3s4 2.4 4 9.6-4 8.4-4 8.4m0-13v8"/></svg>`;

  if (btnNpVolume) btnNpVolume.innerHTML = muteIcon(14);
  if (btnPvVolume) btnPvVolume.innerHTML = muteIcon(16);
  if (npVolumeSlider) npVolumeSlider.value = Math.floor(playerState.volume * 100);
  if (pvVolumeSlider) pvVolumeSlider.value = Math.floor(playerState.volume * 100);
}

// --- Touch Volume Helper (fixes mobile/iPad volume) ---
function handleVolumeTouch(slider, e) {
  e.preventDefault();
  const rect = slider.getBoundingClientRect();
  const touch = e.touches[0] || e.changedTouches[0];
  const ratio = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
  const value = Math.round(ratio * 100);
  slider.value = value;
  playerState.volume = value / 100;
  audioElement.volume = playerState.volume;
  playerState.isMuted = playerState.volume === 0;
  updateVolumeIconUI();
  playerVolume.value = value;
}

// --- Init Player Event Listeners ---
export function initPlayerListeners() {
  // Play/Pause
  playerPlayBtn.addEventListener('click', () => {
    if (!audioElement.src) return;
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (playerState.isPlaying) audioElement.pause();
    else audioElement.play().catch(err => console.error(err));
  });

  // Audio element events
  audioElement.addEventListener('play', () => {
    playerState.isPlaying = true;
    setPlayIcon(false);
    initVisualizer();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (track) _updateTrackListItemUI(track);
  });

  audioElement.addEventListener('pause', () => {
    playerState.isPlaying = false;
    setPlayIcon(true);
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (track) _updateTrackListItemUI(track);
  });

  audioElement.addEventListener('ended', () => {
    playerState.isPlaying = false;
    setPlayIcon(true);
    playerSeek.value = 0;
    playerCurrentTime.textContent = '0:00';
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (track) _updateTrackListItemUI(track);
    playNextTrack();
  });

  audioElement.addEventListener('loadedmetadata', () => {
    const dur = audioElement.duration || 100;
    playerSeek.max = Math.floor(dur);
    playerSeek.value = 0;
    playerTotalTime.textContent = formatTime(dur);
    npSeek.max = Math.floor(dur);
    if (pvSeek) {
      pvSeek.max = Math.floor(dur);
      pvSeek.value = 0;
      pvTotalTime.textContent = formatTime(dur);
    }
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (track) {
      track.duration = Math.floor(dur);
      _updateTrackListItemUI(track);
    }
  });

  audioElement.addEventListener('timeupdate', () => {
    if (!playerState.isSeeking) {
      playerSeek.value = Math.floor(audioElement.currentTime);
      playerCurrentTime.textContent = formatTime(audioElement.currentTime);
    }
    if (!playerState.isNpSeeking) npSeek.value = Math.floor(audioElement.currentTime);
    if (!playerState.isPvSeeking && pvSeek) {
      pvSeek.value = Math.floor(audioElement.currentTime);
      pvCurrentTime.textContent = formatTime(audioElement.currentTime);
    }
    updateSyncedLyricsHighlight();
  });

  // Seek bars
  playerSeek.addEventListener('input', () => {
    playerState.isSeeking = true;
    playerCurrentTime.textContent = formatTime(playerSeek.value);
  });
  playerSeek.addEventListener('change', () => {
    audioElement.currentTime = playerSeek.value;
    playerState.isSeeking = false;
  });

  // NP bar controls
  npPlayBtn.addEventListener('click', () => playerPlayBtn.click());
  btnNpPrev.addEventListener('click', () => playPrevTrack());
  btnNpNext.addEventListener('click', () => playNextTrack());

  npSeek.addEventListener('input', () => { playerState.isNpSeeking = true; });
  npSeek.addEventListener('change', () => {
    audioElement.currentTime = npSeek.value;
    playerState.isNpSeeking = false;
  });

  // PV (mobile player view) controls
  if (pvPlayBtn) pvPlayBtn.addEventListener('click', () => playerPlayBtn.click());
  if (btnPvPrev) btnPvPrev.addEventListener('click', () => playPrevTrack());
  if (btnPvNext) btnPvNext.addEventListener('click', () => playNextTrack());

  if (btnPvShuffle) {
    btnPvShuffle.addEventListener('click', () => {
      playerState.shuffle = !playerState.shuffle;
      btnPvShuffle.classList.toggle('active', playerState.shuffle);
      btnPlayerShuffle.classList.toggle('active', playerState.shuffle);
      if (btnNpShuffle) btnNpShuffle.classList.toggle('active', playerState.shuffle);
    });
  }

  if (btnPvRepeat) {
    btnPvRepeat.addEventListener('click', () => {
      if (playerState.repeatMode === 'none') playerState.repeatMode = 'all';
      else if (playerState.repeatMode === 'all') playerState.repeatMode = 'one';
      else playerState.repeatMode = 'none';
      syncRepeatBtnUI();
    });
  }

  if (pvSeek) {
    pvSeek.addEventListener('input', () => { playerState.isPvSeeking = true; });
    pvSeek.addEventListener('change', () => {
      audioElement.currentTime = pvSeek.value;
      playerState.isPvSeeking = false;
    });
  }

  // --- Volume controls (with touch event fix for mobile/iPad) ---

  // Desktop player volume
  playerVolume.addEventListener('input', () => {
    playerState.volume = playerVolume.value / 100;
    audioElement.volume = playerState.volume;
    playerState.isMuted = playerState.volume === 0;
    updateVolumeIconUI();
  });

  playerVolumeIcon.addEventListener('click', () => {
    playerState.isMuted = !playerState.isMuted;
    audioElement.volume = playerState.isMuted ? 0 : playerState.volume;
    updateVolumeIconUI();
  });

  // NP bar volume
  if (npVolumeSlider) {
    npVolumeSlider.addEventListener('input', () => {
      playerState.volume = npVolumeSlider.value / 100;
      audioElement.volume = playerState.volume;
      playerState.isMuted = playerState.volume === 0;
      updateVolumeIconUI();
      playerVolume.value = npVolumeSlider.value;
    });
    // Touch events for mobile
    npVolumeSlider.addEventListener('touchstart', (e) => handleVolumeTouch(npVolumeSlider, e), { passive: false });
    npVolumeSlider.addEventListener('touchmove', (e) => handleVolumeTouch(npVolumeSlider, e), { passive: false });
  }

  // PV (mobile) volume
  if (pvVolumeSlider) {
    pvVolumeSlider.addEventListener('input', () => {
      playerState.volume = pvVolumeSlider.value / 100;
      audioElement.volume = playerState.volume;
      playerState.isMuted = playerState.volume === 0;
      updateVolumeIconUI();
    });
    // Touch events for mobile
    pvVolumeSlider.addEventListener('touchstart', (e) => handleVolumeTouch(pvVolumeSlider, e), { passive: false });
    pvVolumeSlider.addEventListener('touchmove', (e) => handleVolumeTouch(pvVolumeSlider, e), { passive: false });
  }

  if (btnPvVolume) {
    btnPvVolume.addEventListener('click', () => {
      playerState.isMuted = !playerState.isMuted;
      audioElement.volume = playerState.isMuted ? 0 : playerState.volume;
      updateVolumeIconUI();
    });
  }

  if (btnNpVolume) {
    btnNpVolume.addEventListener('click', () => {
      playerState.isMuted = !playerState.isMuted;
      audioElement.volume = playerState.isMuted ? 0 : playerState.volume;
      updateVolumeIconUI();
    });
  }

  // Queue navigation buttons
  btnPlayerNext.addEventListener('click', () => playNextTrack());
  btnPlayerPrev.addEventListener('click', () => playPrevTrack());

  btnPlayerShuffle.addEventListener('click', () => {
    playerState.shuffle = !playerState.shuffle;
    btnPlayerShuffle.classList.toggle('active', playerState.shuffle);
  });

  btnPlayerRepeat.addEventListener('click', () => {
    if (playerState.repeatMode === 'none') playerState.repeatMode = 'all';
    else if (playerState.repeatMode === 'all') playerState.repeatMode = 'one';
    else playerState.repeatMode = 'none';
    syncRepeatBtnUI();
  });

  // NP shuffle/repeat
  if (btnNpShuffle) {
    btnNpShuffle.addEventListener('click', () => {
      playerState.shuffle = !playerState.shuffle;
      btnNpShuffle.classList.toggle('active', playerState.shuffle);
      btnPlayerShuffle.classList.toggle('active', playerState.shuffle);
      if (btnPvShuffle) btnPvShuffle.classList.toggle('active', playerState.shuffle);
    });
  }

  if (btnNpRepeat) {
    btnNpRepeat.addEventListener('click', () => {
      if (playerState.repeatMode === 'none') playerState.repeatMode = 'all';
      else if (playerState.repeatMode === 'all') playerState.repeatMode = 'one';
      else playerState.repeatMode = 'none';
      syncRepeatBtnUI();
    });
  }
}
