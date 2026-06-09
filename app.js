// MeloTag — Application Logic (Lyrics, Ambient Background & Equalizer Edition)
document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    tracks: [],
    selectedTrackId: null,
    isProcessing: false
  };

  // Custom Audio Player State
  const playerState = {
    objectUrl: null,
    isPlaying: false,
    isSeeking: false,
    isNpSeeking: false,
    isPvSeeking: false,
    shuffle: false,
    repeatMode: 'none', // 'none', 'all', 'one'
    volume: 0.8,
    isMuted: false,
    lyrics: [], // parsed LRC lines
    currentLyricIndex: -1
  };

  // DOM Elements
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const trackList = document.getElementById('track-list');
  const tracksCount = document.getElementById('tracks-count');
  const tracksStatusSummary = document.getElementById('tracks-status-summary');
  
  const inspectorEmpty = document.getElementById('inspector-empty');
  const inspectorContent = document.getElementById('inspector-content');
  
  // File System Access Buttons
  const btnOpenFiles = document.getElementById('btn-open-files');
  const btnOpenFolder = document.getElementById('btn-open-folder');
  
  // Custom Audio Player Elements
  const playerPlayBtn = document.getElementById('player-play-btn');
  const playerPlayIcon = document.getElementById('player-play-icon');
  const playerCurrentTime = document.getElementById('player-current-time');
  const playerTrackInfo = document.getElementById('player-track-info');
  const playerTotalTime = document.getElementById('player-total-time');
  const playerSeek = document.getElementById('player-seek');
  const audioElement = document.getElementById('audio-element');

  const btnPlayerShuffle = document.getElementById('btn-player-shuffle');
  const btnPlayerRepeat = document.getElementById('btn-player-repeat');
  const btnPlayerPrev = document.getElementById('btn-player-prev');
  const btnPlayerNext = document.getElementById('btn-player-next');
  const playerVolume = document.getElementById('player-volume');
  const playerVolumeIcon = document.getElementById('player-volume-icon');
  const playerLyricsContainer = document.getElementById('player-lyrics-container');
  const playerVisualizer = document.getElementById('player-visualizer');
  const librarySearchInput = document.getElementById('library-search-input');
  const navTabs = document.querySelectorAll('.nav-tab');

  // Now Playing Bar
  const nowPlayingBar = document.getElementById('now-playing-bar');
  const npArtwork = document.getElementById('np-artwork');
  const npTitle = document.getElementById('np-title');
  const npArtist = document.getElementById('np-artist');
  const npSeek = document.getElementById('np-seek');
  const npPlayBtn = document.getElementById('np-play-btn');
  const npPlayIcon = document.getElementById('np-play-icon');
  const npInfoClick = document.getElementById('np-info-click');
  const btnNpPrev = document.getElementById('btn-np-prev');
  const btnNpNext = document.getElementById('btn-np-next');
  const npVolumeSlider = document.getElementById('np-volume-slider');
  const btnNpQueue = document.getElementById('btn-np-queue');
  const npQueuePanel = document.getElementById('np-queue-panel');
  const npQueueList = document.getElementById('np-queue-list');
  const npQueueClose = document.getElementById('np-queue-close');

  // Player View (mobile)
  const playerView = document.getElementById('player-view');
  const pvArtwork = document.getElementById('pv-artwork');
  const pvTitle = document.getElementById('pv-title');
  const pvArtist = document.getElementById('pv-artist');
  const pvSeek = document.getElementById('pv-seek');
  const pvCurrentTime = document.getElementById('pv-current-time');
  const pvTotalTime = document.getElementById('pv-total-time');
  const pvPlayBtn = document.getElementById('btn-pv-play');
  const pvPlayIcon = document.getElementById('pv-play-icon');
  const btnPvPrev = document.getElementById('btn-pv-prev');
  const btnPvNext = document.getElementById('btn-pv-next');
  const btnPvShuffle = document.getElementById('btn-pv-shuffle');
  const btnPvRepeat = document.getElementById('btn-pv-repeat');
  const btnPvVolume = document.getElementById('btn-pv-volume');
  const pvVolumeSlider = document.getElementById('pv-volume');
  const pvLyricsContainer = document.getElementById('pv-lyrics');

  // Editor Header
  const editorTrackNum = document.getElementById('editor-track-num');
  const editorTrackName = document.getElementById('editor-track-name');

  // Mobile Chrome
  const mobileHeaderTitle = document.getElementById('mobile-header-title');
  const mobileBackBtn = document.getElementById('mobile-back-btn');
  const mobileStatusTime = document.getElementById('mobile-status-time');

  // Set mobile status bar time
  function updateMobileStatusTime() {
    if (mobileStatusTime) {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      mobileStatusTime.textContent = `${h}:${m < 10 ? '0' : ''}${m}`;
    }
  }
  updateMobileStatusTime();
  setInterval(updateMobileStatusTime, 30000);

  // Modal helper
  const modalOverlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalMessage = document.getElementById('modal-message');
  const modalInput = document.getElementById('modal-input');
  const modalInputWrap = document.getElementById('modal-input-wrap');
  const modalOkBtn = document.getElementById('modal-ok-btn');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  function showModal(title, message, options = {}) {
    return new Promise((resolve) => {
      modalTitle.textContent = title;
      modalMessage.textContent = message;

      if (options.type === 'prompt') {
        modalInputWrap.style.display = 'block';
        modalInput.value = options.defaultValue || '';
        modalCancelBtn.style.display = 'inline-flex';
        setTimeout(() => modalInput.focus(), 100);
      } else {
        modalInputWrap.style.display = 'none';
        modalCancelBtn.style.display = 'none';
      }

      modalOverlay.style.display = 'flex';

      function cleanup() {
        modalOverlay.style.display = 'none';
        modalOkBtn.removeEventListener('click', onOk);
        modalCancelBtn.removeEventListener('click', onCancel);
        modalCloseBtn.removeEventListener('click', onCancel);
        modalOverlay.removeEventListener('click', onOverlay);
      }

      function onOk() {
        cleanup();
        resolve(options.type === 'prompt' ? modalInput.value : true);
      }

      function onCancel() {
        cleanup();
        resolve(null);
      }

      function onOverlay(e) {
        if (e.target === modalOverlay) onCancel();
      }

      modalOkBtn.addEventListener('click', onOk);
      modalCancelBtn.addEventListener('click', onCancel);
      modalCloseBtn.addEventListener('click', onCancel);
      modalOverlay.addEventListener('click', onOverlay);

      modalOkBtn.focus();
    });
  }

  // Form Inputs
  const inputTitle = document.getElementById('input-title');
  const inputArtist = document.getElementById('input-artist');
  const inputAlbum = document.getElementById('input-album');
  const inputAlbumArtist = document.getElementById('input-album-artist');
  const inputGenre = document.getElementById('input-genre');
  const inputYear = document.getElementById('input-year');
  const inputTrack = document.getElementById('input-track');
  const inputTrackTotal = document.getElementById('input-track-total');
  const inputDisc = document.getElementById('input-disc');
  const inputDiscTotal = document.getElementById('input-disc-total');
  const inputLyrics = document.getElementById('input-lyrics');
  const btnSearchLyrics = document.getElementById('btn-search-lyrics');
  
  // Artwork
  const artworkFrame = document.getElementById('artwork-frame');
  const artworkInput = document.getElementById('artwork-input');
  const artworkRes = document.getElementById('artwork-res');
  const artworkFormat = document.getElementById('artwork-format');
  const btnSearchCover = document.getElementById('btn-search-cover');
  const btnRemoveCover = document.getElementById('btn-remove-cover');
  
  // Buttons
  const btnMagic = document.getElementById('btn-magic');
  const btnSave = document.getElementById('btn-save');
  const btnDownload = document.getElementById('btn-download');
  const btnAutoMatchAll = document.getElementById('btn-auto-match-all');
  const btnSaveAll = document.getElementById('btn-save-all');
  const successOverlay = document.getElementById('success-overlay');

  // Suggestions
  const suggestionsGrid = document.getElementById('suggestions-grid');
  const suggestionsLoading = document.getElementById('suggestions-loading');
  const suggestionsEmpty = document.getElementById('suggestions-empty');
  const suggestionsSearchInput = document.getElementById('suggestions-search-input');
  const btnSuggestionsSearch = document.getElementById('btn-suggestions-search');

  // Mobile nav tabs view switcher default
  switchMobileTab('library');

  function switchMobileTab(tabName) {
    document.body.className = 'tab-' + tabName;
    navTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));

    // Update mobile header
    const titles = { library: 'MeloTag', player: 'Now Playing', editor: 'Tag Editor' };
    mobileHeaderTitle.textContent = titles[tabName] || 'MeloTag';

    // Show back button on non-library tabs
    mobileBackBtn.style.display = tabName === 'library' ? 'none' : 'flex';
  }

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchMobileTab(tabName);
    });
  });

  mobileBackBtn.addEventListener('click', () => {
    switchMobileTab('library');
  });

  // Library Search filtering
  librarySearchInput.addEventListener('input', () => {
    const query = librarySearchInput.value.toLowerCase().trim();
    
    state.tracks.forEach(track => {
      const itemEl = document.getElementById(`track-item-${track.id}`);
      if (!itemEl) return;
      
      const matchName = track.name.toLowerCase().includes(query);
      const matchTitle = (track.title || '').toLowerCase().includes(query);
      const matchArtist = (track.artist || '').toLowerCase().includes(query);
      
      if (matchName || matchTitle || matchArtist) {
        itemEl.style.display = 'flex';
      } else {
        itemEl.style.display = 'none';
      }
    });
  });

  // Hide File System Access API buttons if browser doesn't support them
  const hasFS = 'showOpenFilePicker' in window && 'showDirectoryPicker' in window;
  if (!hasFS) {
    console.warn('File System Access API is not supported in this browser. Falling back to standard downloads.');
    if (btnOpenFiles) btnOpenFiles.style.display = 'none';
    if (btnOpenFolder) btnOpenFolder.style.display = 'none';
  }

  // --- Audio Player Logic ---
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
      console.warn('Web Audio API not supported or failed to initialize visualizer:', err);
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
      barHeight = dataArray[i] / 4; // Scaled down for canvas height

      // Draw bars with chrome yellow gradient
      canvasCtx.fillStyle = `rgba(245, 197, 24, ${0.1 + (barHeight / 64)})`;
      canvasCtx.fillRect(x, height - barHeight, barWidth - 2, barHeight);

      // Top dot/cap
      canvasCtx.fillStyle = 'rgba(245, 197, 24, 0.7)';
      canvasCtx.fillRect(x, height - barHeight - 2, barWidth - 2, 2);

      x += barWidth;
    }
  }

  playerPlayBtn.addEventListener('click', () => {
    if (!audioElement.src) return;

    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    if (playerState.isPlaying) {
      audioElement.pause();
    } else {
      audioElement.play().catch(err => console.error('Audio playback failed:', err));
    }
  });

  audioElement.addEventListener('play', () => {
    playerState.isPlaying = true;
    setPlayIcon(false);
    
    // Setup and start visualizer
    initVisualizer();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    // Toggle equalizer animation in sidebar
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (track) updateTrackListItemUI(track);
  });

  audioElement.addEventListener('pause', () => {
    playerState.isPlaying = false;
    setPlayIcon(true);
    
    // Toggle equalizer animation in sidebar
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (track) updateTrackListItemUI(track);
  });

  audioElement.addEventListener('ended', () => {
    playerState.isPlaying = false;
    setPlayIcon(true);
    playerSeek.value = 0;
    playerCurrentTime.textContent = '0:00';

    // Toggle equalizer animation in sidebar
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (track) updateTrackListItemUI(track);

    // Auto-advance next song in queue
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

    // Store duration on the track and update UI
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (track) {
      track.duration = Math.floor(dur);
      updateTrackListItemUI(track);
    }
  });

  audioElement.addEventListener('timeupdate', () => {
    if (!playerState.isSeeking) {
      playerSeek.value = Math.floor(audioElement.currentTime);
      playerCurrentTime.textContent = formatTime(audioElement.currentTime);
    }
    if (!playerState.isNpSeeking) {
      npSeek.value = Math.floor(audioElement.currentTime);
    }
    if (!playerState.isPvSeeking && pvSeek) {
      pvSeek.value = Math.floor(audioElement.currentTime);
      pvCurrentTime.textContent = formatTime(audioElement.currentTime);
    }
    updateSyncedLyricsHighlight();
  });

  playerSeek.addEventListener('input', () => {
    playerState.isSeeking = true;
    playerCurrentTime.textContent = formatTime(playerSeek.value);
  });

  playerSeek.addEventListener('change', () => {
    audioElement.currentTime = playerSeek.value;
    playerState.isSeeking = false;
  });

  function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  function setPlayIcon(paused) {
    if (!playerPlayIcon) return;
    if (paused) {
      playerPlayIcon.innerHTML = '<polygon points="6 3 20 12 6 21 6 3"/>';
    } else {
      playerPlayIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    }
    // Sync now-playing bar play icon
    if (npPlayIcon) {
      npPlayIcon.innerHTML = paused
        ? '<polygon points="6 3 20 12 6 21 6 3"/>'
        : '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    }
    // Sync player view play icon
    if (pvPlayIcon) {
      pvPlayIcon.innerHTML = paused
        ? '<polygon points="6 3 20 12 6 21 6 3"/>'
        : '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    }
  }

  // --- Now Playing Bar ---
  function updateNowPlayingBar(track) {
    if (!track) {
      nowPlayingBar.style.display = 'none';
      if (pvTitle) pvTitle.textContent = 'No track selected';
      if (pvArtist) pvArtist.textContent = '';
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
      npArtwork.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.5V20l12-8L7 4"/></svg>';
      if (pvArtwork) {
        pvArtwork.style.backgroundImage = 'none';
        pvArtwork.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M7 9.5V20l12-8L7 4"/></svg>';
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
  }

  // Now-playing bar controls
  npPlayBtn.addEventListener('click', () => {
    playerPlayBtn.click();
  });

  btnNpPrev.addEventListener('click', () => {
    btnPlayerPrev.click();
  });

  btnNpNext.addEventListener('click', () => {
    btnPlayerNext.click();
  });

  npSeek.addEventListener('input', () => {
    playerState.isNpSeeking = true;
  });

  npSeek.addEventListener('change', () => {
    audioElement.currentTime = npSeek.value;
    playerState.isNpSeeking = false;
  });

  // Player View controls (mobile)
  if (pvPlayBtn) {
    pvPlayBtn.addEventListener('click', () => playerPlayBtn.click());
  }
  if (btnPvPrev) {
    btnPvPrev.addEventListener('click', () => btnPlayerPrev.click());
  }
  if (btnPvNext) {
    btnPvNext.addEventListener('click', () => btnPlayerNext.click());
  }
  if (btnPvShuffle) {
    btnPvShuffle.addEventListener('click', () => {
      playerState.shuffle = !playerState.shuffle;
      btnPvShuffle.classList.toggle('active', playerState.shuffle);
      btnPlayerShuffle.classList.toggle('active', playerState.shuffle);
      btnNpShuffle.classList.toggle('active', playerState.shuffle);
    });
  }
  if (btnPvRepeat) {
    btnPvRepeat.addEventListener('click', () => {
      if (playerState.repeatMode === 'none') { playerState.repeatMode = 'all'; }
      else if (playerState.repeatMode === 'all') { playerState.repeatMode = 'one'; }
      else { playerState.repeatMode = 'none'; }
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
  if (pvVolumeSlider) {
    pvVolumeSlider.addEventListener('input', () => {
      playerState.volume = pvVolumeSlider.value / 100;
      audioElement.volume = playerState.volume;
      playerState.isMuted = playerState.volume === 0;
      updateVolumeIconUI();
    });
  }
  if (btnPvVolume) {
    btnPvVolume.addEventListener('click', () => {
      playerState.isMuted = !playerState.isMuted;
      audioElement.volume = playerState.isMuted ? 0 : playerState.volume;
      updateVolumeIconUI();
    });
  }

  function loadTrackIntoPlayer(track) {
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

    // Volume configuration
    audioElement.volume = playerState.isMuted ? 0 : playerState.volume;
    playerVolume.value = Math.floor(playerState.volume * 100);
    updateVolumeIconUI();

    // Sync lyrics configuration
    playerState.lyrics = parseLRC(track.lyrics);
    playerState.currentLyricIndex = -1;
    renderSyncedLyrics();
  }

  // --- Audio Queue traversal and navigation ---
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
      // Random track from the queue
      nextIndex = Math.floor(Math.random() * state.tracks.length);
    } else {
      if (currentIndex !== -1) {
        nextIndex = currentIndex + 1;
        if (nextIndex >= state.tracks.length) {
          if (playerState.repeatMode === 'all') {
            nextIndex = 0;
          } else {
            // End of queue and no repeat-all
            return;
          }
        }
      }
    }

    const nextTrack = state.tracks[nextIndex];
    if (nextTrack) {
      selectTrack(nextTrack.id);
      audioElement.play().catch(err => console.error('Auto-play next track failed:', err));
    }
  }

  function playPrevTrack() {
    if (state.tracks.length === 0) return;
    
    const currentIndex = state.tracks.findIndex(t => t.id === state.selectedTrackId);
    let prevIndex = 0;

    if (playerState.shuffle) {
      prevIndex = Math.floor(Math.random() * state.tracks.length);
    } else {
      if (currentIndex !== -1) {
        prevIndex = currentIndex - 1;
        if (prevIndex < 0) {
          if (playerState.repeatMode === 'all') {
            prevIndex = state.tracks.length - 1;
          } else {
            prevIndex = 0; // clamp to start
          }
        }
      }
    }

    const prevTrack = state.tracks[prevIndex];
    if (prevTrack) {
      selectTrack(prevTrack.id);
      audioElement.play().catch(err => console.error('Play previous track failed:', err));
    }
  }

  // Queue & Loop controls listeners
  btnPlayerNext.addEventListener('click', () => {
    playNextTrack();
  });

  btnPlayerPrev.addEventListener('click', () => {
    playPrevTrack();
  });

  btnPlayerShuffle.addEventListener('click', () => {
    playerState.shuffle = !playerState.shuffle;
    btnPlayerShuffle.classList.toggle('active', playerState.shuffle);
  });

  btnPlayerRepeat.addEventListener('click', () => {
    if (playerState.repeatMode === 'none') {
      playerState.repeatMode = 'all';
      btnPlayerRepeat.className = 'btn btn-control btn-control-sm active-all';
      btnPlayerRepeat.title = 'Repeat Loop: All';
    } else if (playerState.repeatMode === 'all') {
      playerState.repeatMode = 'one';
      btnPlayerRepeat.className = 'btn btn-control btn-control-sm active-one';
      btnPlayerRepeat.title = 'Repeat Loop: One';
    } else {
      playerState.repeatMode = 'none';
      btnPlayerRepeat.className = 'btn btn-control btn-control-sm';
      btnPlayerRepeat.title = 'Repeat Mode';
    }
  });

  // Now-playing bar controls
  const btnNpShuffle = document.getElementById('btn-np-shuffle');
  const btnNpRepeat = document.getElementById('btn-np-repeat');
  const btnNpVolume = document.getElementById('btn-np-volume');

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
      if (playerState.repeatMode === 'none') {
        playerState.repeatMode = 'all';
        btnNpRepeat.className = 'btn btn-control btn-control-xs active-all';
        btnNpRepeat.title = 'Repeat Loop: All';
      } else if (playerState.repeatMode === 'all') {
        playerState.repeatMode = 'one';
        btnNpRepeat.className = 'btn btn-control btn-control-xs active-one';
        btnNpRepeat.title = 'Repeat Loop: One';
      } else {
        playerState.repeatMode = 'none';
        btnNpRepeat.className = 'btn btn-control btn-control-xs';
        btnNpRepeat.title = 'Repeat Mode';
      }
      syncRepeatBtnUI();
    });
  }

  function syncRepeatBtnUI() {
    if (!btnNpRepeat) return;
    if (playerState.repeatMode === 'all') {
      btnNpRepeat.className = 'btn btn-control btn-control-xs active-all';
    } else if (playerState.repeatMode === 'one') {
      btnNpRepeat.className = 'btn btn-control btn-control-xs active-one';
    } else {
      btnNpRepeat.className = 'btn btn-control btn-control-xs';
    }
    btnPlayerRepeat.className = 'btn btn-control btn-control-sm' + (playerState.repeatMode === 'all' ? ' active-all' : playerState.repeatMode === 'one' ? ' active-one' : '');
    if (btnPvRepeat) {
      const baseClass = 'btn btn-control btn-control-sm';
      btnPvRepeat.className = baseClass + (playerState.repeatMode === 'all' ? ' active-all' : playerState.repeatMode === 'one' ? ' active-one' : '');
    }
  }

  if (btnNpVolume) {
    btnNpVolume.addEventListener('click', () => {
      playerState.isMuted = !playerState.isMuted;
      audioElement.volume = playerState.isMuted ? 0 : playerState.volume;
      updateVolumeIconUI();
    });
  }

  // Volume slider controls
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
    if (btnNpVolume) {
      btnNpVolume.innerHTML = (playerState.isMuted || playerState.volume === 0)
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3s4 2.4 4 9.6c0 2-.31 3.54-.76 4.72M17 8v6M8.58 8 7.1 9H3v4m10-4V5l-1.85 1.25M3 16h4.29L13 20v-6.35M4 2l16 20"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16h4.29L13 20V5L7.1 9H3v4M17 3s4 2.4 4 9.6-4 8.4-4 8.4m0-13v8"/></svg>';
    }
    if (btnPvVolume) {
      btnPvVolume.innerHTML = (playerState.isMuted || playerState.volume === 0)
        ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3s4 2.4 4 9.6c0 2-.31 3.54-.76 4.72M17 8v6M8.58 8 7.1 9H3v4m10-4V5l-1.85 1.25M3 16h4.29L13 20v-6.35M4 2l16 20"/></svg>'
        : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16h4.29L13 20V5L7.1 9H3v4M17 3s4 2.4 4 9.6-4 8.4-4 8.4m0-13v8"/></svg>';
    }
    if (npVolumeSlider) {
      npVolumeSlider.value = Math.floor(playerState.volume * 100);
    }
    if (pvVolumeSlider) {
      pvVolumeSlider.value = Math.floor(playerState.volume * 100);
    }
  }

  // --- Volume slider in now-playing bar ---
  if (npVolumeSlider) {
    npVolumeSlider.addEventListener('input', () => {
      playerState.volume = npVolumeSlider.value / 100;
      audioElement.volume = playerState.volume;
      playerState.isMuted = playerState.volume === 0;
      updateVolumeIconUI();
      playerVolume.value = npVolumeSlider.value;
    });
  }

  // --- Queue panel ---
  function renderQueue() {
    if (!npQueueList) return;
    if (state.tracks.length === 0) {
      npQueueList.innerHTML = '<div class="np-queue-empty">No tracks in queue</div>';
      return;
    }
    npQueueList.innerHTML = state.tracks.map((t, i) => {
      const isCurrent = t.id === state.selectedTrackId;
      const time = t.duration ? formatTime(t.duration) : '--:--';
      return `<div class="np-queue-item${isCurrent ? ' current' : ''}" data-id="${t.id}">
        <div class="np-queue-item-info">
          <div class="np-queue-item-title">${t.title || t.name}</div>
          <div class="np-queue-item-artist">${t.artist || 'Unknown Artist'}</div>
        </div>
        <span class="np-queue-item-time">${time}</span>
      </div>`;
    }).join('');
    npQueueList.querySelectorAll('.np-queue-item').forEach(el => {
      el.addEventListener('click', () => {
        selectTrack(el.dataset.id);
        closeQueue();
      });
    });
  }

  function openQueue() {
    if (!npQueuePanel) return;
    renderQueue();
    npQueuePanel.classList.add('open');
    btnNpQueue.classList.add('active');
  }

  function closeQueue() {
    if (!npQueuePanel) return;
    npQueuePanel.classList.remove('open');
    btnNpQueue.classList.remove('active');
  }

  function toggleQueue() {
    if (npQueuePanel.classList.contains('open')) {
      closeQueue();
    } else {
      openQueue();
    }
  }

  if (btnNpQueue) {
    btnNpQueue.addEventListener('click', toggleQueue);
  }

  if (npQueueClose) {
    npQueueClose.addEventListener('click', closeQueue);
  }

  if (npInfoClick) {
    npInfoClick.addEventListener('click', toggleQueue);
  }

  // Close queue when clicking outside
  document.addEventListener('click', (e) => {
    if (npQueuePanel && npQueuePanel.classList.contains('open')) {
      const isInside = npQueuePanel.contains(e.target) ||
        btnNpQueue.contains(e.target) ||
        npInfoClick.contains(e.target);
      if (!isInside) closeQueue();
    }
  });

  // Parsed Synced Lyrics LRC format helper
  function parseLRC(lrcText) {
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

  function renderSyncedLyrics() {
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

  function updateSyncedLyricsHighlight() {
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

  // Handle click on lyric line to seek (both desktop and PV containers)
  if (playerLyricsContainer) {
    playerLyricsContainer.addEventListener('click', handleLyricClick);
  }
  if (pvLyricsContainer) {
    pvLyricsContainer.addEventListener('click', handleLyricClick);
  }

  // --- Manual Lyrics Search ---
  btnSearchLyrics.addEventListener('click', async () => {
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
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
        updateTrackListItemUI(track);
        updateUI();
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

  // LRCLIB Search API Helper
  async function fetchLyricsFromLRCLIB(title, artist) {
    if (!title || !artist) return '';
    try {
      const url = `/api/lrclib/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'MeloTag/1.0.0 (https://melotag.com)'
        }
      });
      const results = await res.json();
      if (results && results.length > 0) {
        const bestMatch = results.find(item => item.plainLyrics);
        return bestMatch ? bestMatch.plainLyrics : '';
      }
    } catch (err) {
      console.error('LRCLIB lyrics fetch error:', err);
    }
    return '';
  }

  // --- fetchiTunesSuggestions ---
  async function fetchiTunesSuggestions(query) {
    if (!query) return { results: [], error: null };
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const url = `/api/itunes/search?term=${encodeURIComponent(query)}&media=music&limit=6`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        return { results: [], error: `iTunes API returned ${res.status}` };
      }
      const data = await res.json();
      return { results: data.results || [], error: null };
    } catch (err) {
      console.error('iTunes API search error:', err);
      if (err.name === 'AbortError') {
        return { results: [], error: 'Request timed out. Check your connection.' };
      }
      return { results: [], error: 'Network error — couldn\'t reach iTunes.' };
    }
  }

  // --- Suggestions Inline Search ---
  btnSuggestionsSearch.addEventListener('click', () => {
    const query = suggestionsSearchInput.value.trim();
    if (query) {
      triggerSearch(query);
    }
  });

  suggestionsSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const query = suggestionsSearchInput.value.trim();
      if (query) {
        triggerSearch(query);
      }
    }
  });

  async function triggerSearch(query) {
    suggestionsGrid.innerHTML = '';
    suggestionsEmpty.style.display = 'none';
    suggestionsLoading.style.display = 'flex';

    try {
      const { results, error } = await fetchiTunesSuggestions(query);
      suggestionsLoading.style.display = 'none';

      if (error) {
        suggestionsEmpty.textContent = error;
        suggestionsEmpty.style.display = 'block';
        return;
      }

      if (results.length === 0) {
        suggestionsEmpty.style.display = 'block';
        return;
      }

      results.forEach(res => {
        const card = document.createElement('div');
        card.className = 'suggestion-card';
        
        const highResArt = res.artworkUrl100 ? res.artworkUrl100.replace('/100x100bb.jpg', '/600x600bb.jpg') : '';
        
        card.innerHTML = `
          <div class="suggestion-card-main" title="Click to apply both text tags and cover image">
            <div class="suggestion-artwork" style="background-image: url(${res.artworkUrl100 || ''})"></div>
            <div class="suggestion-info">
              <div class="suggestion-title">${res.trackName || 'Unknown Track'}</div>
              <div class="suggestion-artist">${res.artistName || 'Unknown Artist'}</div>
              <div class="suggestion-album">${res.collectionName || 'Unknown Album'}</div>
            </div>
            <div class="suggestion-score">Match</div>
          </div>
          <div class="suggestion-card-actions">
            <button class="btn-suggestion-action apply-text-only" title="Apply text metadata only, keep current cover art">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              <span>Text Only</span>
            </button>
            <button class="btn-suggestion-action apply-cover-only" title="Apply album cover only, keep current text fields">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
              <span>Cover Only</span>
            </button>
          </div>
        `;

        card.querySelector('.suggestion-card-main').addEventListener('click', () => applySuggestionToForm(res, highResArt, 'both'));
        card.querySelector('.apply-text-only').addEventListener('click', (e) => {
          e.stopPropagation();
          applySuggestionToForm(res, null, 'text');
        });
        card.querySelector('.apply-cover-only').addEventListener('click', (e) => {
          e.stopPropagation();
          applySuggestionToForm(res, highResArt, 'cover');
        });

        suggestionsGrid.appendChild(card);
      });
    } catch (err) {
      console.error(err);
      suggestionsLoading.style.display = 'none';
      suggestionsEmpty.textContent = 'Failed to load suggestions.';
      suggestionsEmpty.style.display = 'block';
    }
  }

  // --- File System Access API Pickers ---
  if (hasFS) {
    btnOpenFiles.addEventListener('click', async () => {
      try {
        const fileHandles = await window.showOpenFilePicker({
          multiple: true,
          types: [{
            description: 'Audio Files',
            accept: { 'audio/mpeg': ['.mp3'] }
          }]
        });
        for (const handle of fileHandles) {
          const file = await handle.getFile();
          await addTrackObject(file, handle);
        }
        updateUI();
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('File Picker Error:', err);
        }
      }
    });

    btnOpenFolder.addEventListener('click', async () => {
      try {
        const dirHandle = await window.showDirectoryPicker();
        await scanDirectory(dirHandle);
        updateUI();
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Folder Picker Error:', err);
        }
      }
    });
  } else {
    // Fallback for iOS/unsupported browsers: use hidden file input
    btnOpenFiles.addEventListener('click', () => fileInput.click());
    btnOpenFolder.addEventListener('click', () => fileInput.click());
  }

  // --- Drag & Drop ---
  dropZone.addEventListener('click', () => fileInput.click());
  
  fileInput.addEventListener('change', async (e) => {
    await handleStandardFiles(e.target.files);
    fileInput.value = '';
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    
    if (hasFS && e.dataTransfer.items) {
      const items = Array.from(e.dataTransfer.items);
      for (const item of items) {
        if (item.kind === 'file') {
          try {
            const handle = await item.getAsFileSystemHandle();
            if (handle && handle.kind === 'file' && handle.name.endsWith('.mp3')) {
              const file = await handle.getFile();
              await addTrackObject(file, handle);
            }
          } catch (err) {
            console.error('Error getting handle from drop item:', err);
          }
        }
      }
      updateUI();
    } else {
      await handleStandardFiles(e.dataTransfer.files);
    }
  });

  async function handleStandardFiles(filesList) {
    const files = Array.from(filesList).filter(file => file.name.endsWith('.mp3'));
    if (files.length === 0) return;

    for (const file of files) {
      await addTrackObject(file, null);
    }
    updateUI();
  }

  // --- Add Track Helper ---
  async function addTrackObject(file, handle) {
    const id = generateId();
    const track = {
      id,
      file,
      handle,
      name: file.name,
      title: '',
      artist: '',
      album: '',
      albumArtist: '',
      genre: '',
      year: '',
      trackNumber: '',
      trackTotal: '',
      discNumber: '',
      discTotal: '',
      lyrics: '',
      coverArt: null,
      status: 'original',
      buffer: null,
      mp3tag: null,
      duration: 0
    };

    state.tracks.push(track);
    renderTrackListItem(track);
    await parseTrack(track);
  }

  // --- Parse MP3 Tag ---
  async function parseTrack(track) {
    try {
      const buffer = await track.file.arrayBuffer();
      track.buffer = buffer;
      
      const mp3tag = new MP3Tag(buffer);
      mp3tag.read();
      
      if (mp3tag.error) {
        console.error(`Error parsing tags for ${track.name}:`, mp3tag.error);
      }
      
      track.mp3tag = mp3tag;

      const tags = mp3tag.tags || {};
      const v2 = tags.v2 || {};

      track.title = v2.TIT2 || tags.title || '';
      track.artist = v2.TPE1 || tags.artist || '';
      track.album = v2.TALB || tags.album || '';
      track.albumArtist = v2.TPE2 || '';
      track.genre = v2.TCON || tags.genre || '';
      track.year = v2.TYER || v2.TDRC || tags.year || '';
      
      const trck = v2.TRCK || tags.track || '';
      if (trck) {
        const parts = trck.split('/');
        track.trackNumber = parts[0] || '';
        track.trackTotal = parts[1] || '';
      }

      const tpos = v2.TPOS || '';
      if (tpos) {
        const parts = tpos.split('/');
        track.discNumber = parts[0] || '';
        track.discTotal = parts[1] || '';
      }

      const uslt = v2.USLT || [];
      track.lyrics = uslt.length > 0 ? (uslt[0].text || '') : (tags.lyrics || '');

      const apic = v2.APIC || [];
      if (apic.length > 0) {
        const cover = apic[0];
        const mime = cover.format || 'image/jpeg';
        const dataBytes = new Uint8Array(cover.data);
        const blob = new Blob([dataBytes], { type: mime });
        
        track.coverArt = {
          data: dataBytes,
          format: mime,
          url: URL.createObjectURL(blob)
        };
      }

      updateTrackListItemUI(track);
      if (state.selectedTrackId === track.id) {
        selectTrack(track.id);
      }
    } catch (err) {
      console.error(`Error reading file buffer for ${track.name}:`, err);
      track.status = 'original';
      updateTrackListItemUI(track);
    }
  }

  // --- Select Track ---
  function selectTrack(trackId) {
    // Stop previous equalizer rendering if active
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

    // Switch to Editor tab on mobile when selecting a track
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

    // Update editor header
    editorTrackNum.textContent = track.trackNumber ? `${track.trackNumber}/${track.trackTotal || '?'}` : '--';
    editorTrackName.textContent = track.title || track.name;

    // Update now-playing bar
    updateNowPlayingBar(track);

    // Dynamic Ambient Background (placeholder for future enhancement)

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

  // --- Render Artwork Preview ---
  function renderArtworkPreview(coverArt) {
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

  // --- Apply Suggestion to Form ---
  async function applySuggestionToForm(suggestion, artworkUrl, mode = 'both') {
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (!track) return;

    if (mode === 'both' || mode === 'text') {
      inputTitle.value = suggestion.trackName || '';
      inputArtist.value = suggestion.artistName || '';
      inputAlbum.value = suggestion.collectionName || '';
      inputGenre.value = suggestion.primaryGenreName || '';
      
      if (suggestion.releaseDate) {
        inputYear.value = suggestion.releaseDate.substring(0, 4);
      } else {
        inputYear.value = '';
      }

      inputTrack.value = suggestion.trackNumber || '';
      inputTrackTotal.value = suggestion.trackCount || '';
      inputDisc.value = suggestion.discNumber || '';
      inputDiscTotal.value = suggestion.discCount || '';

      // Auto-fetch lyrics
      try {
        const lyrics = await fetchLyricsFromLRCLIB(suggestion.trackName, suggestion.artistName);
        if (lyrics) {
          inputLyrics.value = lyrics;
          track.lyrics = lyrics;
        }
      } catch (err) {
        console.warn('Auto lyrics fetch failed for suggestion:', err);
      }
    }

    if (mode === 'both' || mode === 'cover') {
      if (artworkUrl) {
        artworkRes.textContent = 'Loading Cover Art...';
        try {
          const res = await fetch(artworkUrl);
          const blob = await res.blob();
          const arrayBuffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          const mime = blob.type || 'image/jpeg';

          if (track.coverArt && track.coverArt.url) {
            URL.revokeObjectURL(track.coverArt.url);
          }
          track.coverArt = {
            data: uint8Array,
            format: mime,
            url: URL.createObjectURL(blob)
          };
          renderArtworkPreview(track.coverArt);
        } catch (err) {
          console.error('Artwork fetch error:', err);
          artworkRes.textContent = 'Failed to load cover.';
        }
      }
    }
  }

  // --- Save / Write handle permissions helper ---
  async function verifyPermission(fileHandle, readWrite) {
    const options = {};
    if (readWrite) {
      options.mode = 'readwrite';
    }
    if ((await fileHandle.queryPermission(options)) === 'granted') {
      return true;
    }
    if ((await fileHandle.requestPermission(options)) === 'granted') {
      return true;
    }
    return false;
  }

  // --- Save Track Tags ---
  btnSave.addEventListener('click', async () => {
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (!track) return;

    btnSave.disabled = true;
    const originalText = btnSave.innerHTML;
    btnSave.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px"></div><span>Saving...</span>`;

    track.title = inputTitle.value.trim();
    track.artist = inputArtist.value.trim();
    track.album = inputAlbum.value.trim();
    track.albumArtist = inputAlbumArtist.value.trim();
    track.genre = inputGenre.value.trim();
    track.year = inputYear.value.trim();
    track.trackNumber = inputTrack.value.trim();
    track.trackTotal = inputTrackTotal.value.trim();
    track.discNumber = inputDisc.value.trim();
    track.discTotal = inputDiscTotal.value.trim();
    track.lyrics = inputLyrics.value.trim();

    try {
      const savedInPlace = await writeTagsToBuffer(track);
      track.status = savedInPlace ? 'saved' : 'modified';
      
      updateTrackListItemUI(track);
      updateUI();
      
      playerTrackInfo.textContent = track.title || track.name;

      // Update lyrics in player state
      playerState.lyrics = parseLRC(track.lyrics);
      playerState.currentLyricIndex = -1;
      renderSyncedLyrics();
      
      successOverlay.classList.add('active');
      setTimeout(() => {
        successOverlay.classList.remove('active');
      }, 1500);

    } catch (err) {
      console.error('Failed to save tags:', err);
      showModal('Save Error', 'Error updating MP3 tags: ' + err.message);
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = originalText;
    }
  });

  // --- Write Tags back to Binary ArrayBuffer ---
  async function writeTagsToBuffer(track) {
    if (!track.mp3tag) return false;

    const mp3tag = track.mp3tag;
    if (!mp3tag.tags.v2) {
      mp3tag.tags.v2 = {};
    }

    mp3tag.tags.v2.TIT2 = track.title;
    mp3tag.tags.v2.TPE1 = track.artist;
    mp3tag.tags.v2.TALB = track.album;
    mp3tag.tags.v2.TPE2 = track.albumArtist;
    mp3tag.tags.v2.TCON = track.genre;
    
    mp3tag.tags.v2.TYER = track.year;
    mp3tag.tags.v2.TDRC = track.year;

    if (track.trackNumber) {
      mp3tag.tags.v2.TRCK = track.trackTotal ? `${track.trackNumber}/${track.trackTotal}` : `${track.trackNumber}`;
    } else {
      delete mp3tag.tags.v2.TRCK;
    }

    if (track.discNumber) {
      mp3tag.tags.v2.TPOS = track.discTotal ? `${track.discNumber}/${track.discTotal}` : `${track.discNumber}`;
    } else {
      delete mp3tag.tags.v2.TPOS;
    }

    if (track.lyrics) {
      mp3tag.tags.v2.USLT = [
        {
          language: 'eng',
          descriptor: 'Lyrics',
          text: track.lyrics
        }
      ];
    } else {
      delete mp3tag.tags.v2.USLT;
    }

    if (track.coverArt && track.coverArt.data) {
      mp3tag.tags.v2.APIC = [
        {
          type: 3,
          format: track.coverArt.format,
          description: 'Cover',
          data: Array.from(track.coverArt.data)
        }
      ];
    } else {
      delete mp3tag.tags.v2.APIC;
    }

    mp3tag.save();
    track.buffer = mp3tag.buffer;

    if (track.handle) {
      const hasPermission = await verifyPermission(track.handle, true);
      if (!hasPermission) {
        throw new Error('Permission denied to save local file.');
      }
      const writable = await track.handle.createWritable();
      await writable.write(track.buffer);
      await writable.close();
      return true;
    }
    return false;
  }

  // --- Magic Auto-Tag button click handler ---
  btnMagic.addEventListener('click', async () => {
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (!track) return;

    btnMagic.disabled = true;
    const originalText = btnMagic.innerHTML;
    btnMagic.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px"></div><span>Matching...</span>`;

    try {
      await magicAutoTagTrack(track);

      successOverlay.classList.add('active');
      setTimeout(() => {
        successOverlay.classList.remove('active');
      }, 1500);

    } catch (err) {
      console.error('Magic Auto-tag error:', err);
      showModal('Auto-Tag Error', 'Magic Auto-Tag failed: ' + err.message);
    } finally {
      btnMagic.disabled = false;
      btnMagic.innerHTML = originalText;
    }
  });

  // Magic Auto-Tag Core implementation
  async function magicAutoTagTrack(track) {
    const { artist, title } = parseMessyFilename(track.name);
    let query = '';
    if (artist && title) {
      query = `${artist} - ${title}`;
    } else {
      query = artist || title || track.name.replace(/\.[^/.]+$/, "");
    }

    const { results, error } = await fetchiTunesSuggestions(query);
    if (error) {
      throw new Error(error);
    }
    if (results.length === 0) {
      throw new Error('Could not find matches for "' + query + '" on iTunes.');
    }

    const match = results[0];
    
    track.title = match.trackName || '';
    track.artist = match.artistName || '';
    track.album = match.collectionName || '';
    track.genre = match.primaryGenreName || '';
    
    if (match.releaseDate) {
      track.year = match.releaseDate.substring(0, 4);
    }
    
    track.trackNumber = match.trackNumber || '';
    track.trackTotal = match.trackCount || '';
    track.discNumber = match.discNumber || '';
    track.discTotal = match.discCount || '';

    // Auto-fetch lyrics
    try {
      const lyrics = await fetchLyricsFromLRCLIB(match.trackName, match.artistName);
      if (lyrics) {
        track.lyrics = lyrics;
      }
    } catch (err) {
      console.warn('LRCLIB auto lyrics fetch failed:', err);
    }

    // Download high-res cover art
    if (match.artworkUrl100) {
      const highResArt = match.artworkUrl100.replace('/100x100bb.jpg', '/600x600bb.jpg');
      try {
        const res = await fetch(highResArt);
        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const mime = blob.type || 'image/jpeg';

        if (track.coverArt && track.coverArt.url) {
          URL.revokeObjectURL(track.coverArt.url);
        }
        track.coverArt = {
          data: uint8Array,
          format: mime,
          url: URL.createObjectURL(blob)
        };
      } catch (err) {
        console.warn('Cover art download failed, proceeding with tags:', err);
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

  // --- Manual Cover Art Upload ---
  artworkFrame.addEventListener('click', (e) => {
    if (e.target.tagName !== 'INPUT') {
      artworkInput.click();
    }
  });

  artworkInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataBytes = new Uint8Array(event.target.result);
      const mime = file.type || 'image/jpeg';
      
      const track = state.tracks.find(t => t.id === state.selectedTrackId);
      if (track) {
        if (track.coverArt && track.coverArt.url) {
          URL.revokeObjectURL(track.coverArt.url);
        }
        track.coverArt = {
          data: dataBytes,
          format: mime,
          url: URL.createObjectURL(new Blob([dataBytes], { type: mime }))
        };
        renderArtworkPreview(track.coverArt);

        if (track.status === 'saved') {
          track.status = 'modified';
          updateTrackListItemUI(track);
          updateUI();
        }
      }
    };
    reader.readAsArrayBuffer(file);
    artworkInput.value = '';
  });

  // --- Search iTunes Manually ---
  btnSearchCover.addEventListener('click', async () => {
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (!track) return;

    const defaultValue = `${inputArtist.value} ${inputTitle.value}`.trim();
    const customQuery = await showModal('Search iTunes', 'Enter Artist & Song Name to search on iTunes:', { type: 'prompt', defaultValue });
    if (customQuery) {
      suggestionsSearchInput.value = customQuery;
      triggerSearch(customQuery);
    }
  });

  // --- Remove Cover Art ---
  btnRemoveCover.addEventListener('click', () => {
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (track) {
      if (track.coverArt && track.coverArt.url) {
        URL.revokeObjectURL(track.coverArt.url);
      }
      track.coverArt = null;
      renderArtworkPreview(null);

      if (track.status === 'saved') {
        track.status = 'modified';
        updateTrackListItemUI(track);
        updateUI();
      }
    }
  });

  // --- Download Copy ---
  btnDownload.addEventListener('click', async () => {
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (!track) return;

    track.title = inputTitle.value.trim();
    track.artist = inputArtist.value.trim();
    track.album = inputAlbum.value.trim();
    track.albumArtist = inputAlbumArtist.value.trim();
    track.genre = inputGenre.value.trim();
    track.year = inputYear.value.trim();
    track.trackNumber = inputTrack.value.trim();
    track.trackTotal = inputTrackTotal.value.trim();
    track.discNumber = inputDisc.value.trim();
    track.discTotal = inputDiscTotal.value.trim();
    track.lyrics = inputLyrics.value.trim();

    const tempHandle = track.handle;
    track.handle = null;
    try {
      await writeTagsToBuffer(track);
      triggerDownload(track);
    } finally {
      track.handle = tempHandle;
    }
  });

  function triggerDownload(track) {
    const blob = new Blob([track.buffer], { type: 'audio/mp3' });
    const url = URL.createObjectURL(blob);
    
    let filename = track.name;
    if (track.title && track.artist) {
      filename = `${track.artist} - ${track.title}.mp3`;
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // --- Bulk Auto-Match All ---
  btnAutoMatchAll.addEventListener('click', async () => {
    if (state.tracks.length === 0 || state.isProcessing) return;

    state.isProcessing = true;
    btnAutoMatchAll.disabled = true;
    const origText = btnAutoMatchAll.innerHTML;
    btnAutoMatchAll.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px"></div><span>Auto-matching...</span>`;

    let matchesCount = 0;
    for (const track of state.tracks) {
      if (track.status !== 'original') continue;

      try {
        const savedInPlace = await magicAutoTagTrack(track);
        if (savedInPlace) matchesCount++;
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

  // --- Bulk Save All In-Place ---
  btnSaveAll.addEventListener('click', async () => {
    const tracksToSave = state.tracks.filter(t => t.status === 'modified' || t.status === 'matched');
    if (tracksToSave.length === 0) return;

    btnSaveAll.disabled = true;
    const origText = btnSaveAll.innerHTML;
    btnSaveAll.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px"></div><span>Saving...</span>`;

    let inPlaceSaved = 0;
    let downloadsTriggered = 0;

    for (let i = 0; i < tracksToSave.length; i++) {
      const track = tracksToSave[i];
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

  // --- Render Track Item in Sidebar ---
  function renderTrackListItem(track) {
    const trackIndex = state.tracks.indexOf(track);
    const div = document.createElement('div');
    div.className = 'track-item';
    div.dataset.id = track.id;
    div.id = `track-item-${track.id}`;

    div.innerHTML = `
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
      selectTrack(track.id);
    });

    trackList.appendChild(div);
  }

  // --- Update Track Item Visual State ---
  function updateTrackListItemUI(track) {
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

    // Track number
    if (numContainer) {
      numContainer.textContent = trackIndex >= 0 ? trackIndex + 1 : '';
    }

    if (track.coverArt && track.coverArt.url) {
      artContainer.style.backgroundImage = `url(${track.coverArt.url})`;
      artContainer.innerHTML = '';
    } else {
      artContainer.style.backgroundImage = 'none';
      artContainer.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
    }

    // Title & inline equalizer
    titleContainer.innerHTML = `${escapeHTML(track.title || track.name)}${isPlayingThisTrack ? `
      <div class="equalizer-bars" style="display: inline-flex; vertical-align: middle;">
        <span class="bar"></span>
        <span class="bar"></span>
        <span class="bar"></span>
        <span class="bar"></span>
      </div>
    ` : ''}`;

    subtitleContainer.textContent = track.artist || 'Unknown Artist';

    // Time display from duration if available
    if (timeContainer) {
      if (track.duration) {
        timeContainer.textContent = formatTime(track.duration);
      } else {
        timeContainer.textContent = '--:--';
      }
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
  function removeTrack(trackId) {
    const index = state.tracks.findIndex(t => t.id === trackId);
    if (index === -1) return;

    const track = state.tracks[index];
    if (track.coverArt && track.coverArt.url) {
      URL.revokeObjectURL(track.coverArt.url);
    }

    state.tracks.splice(index, 1);
    
    const div = document.getElementById(`track-item-${trackId}`);
    if (div) {
      trackList.removeChild(div);
    }

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

  // --- General UI State Updates ---
  function updateUI() {
    tracksCount.textContent = state.tracks.length;
    
    const originalCount = state.tracks.filter(t => t.status === 'original').length;
    const modifiedCount = state.tracks.filter(t => t.status === 'modified' || t.status === 'matched').length;
    const savedCount = state.tracks.filter(t => t.status === 'saved').length;

    let summaryText = '';
    if (state.tracks.length > 0) {
      summaryText = `${modifiedCount} pending, ${savedCount} saved`;
    }
    tracksStatusSummary.textContent = summaryText;

    btnAutoMatchAll.disabled = state.tracks.length === 0 || originalCount === 0 || state.isProcessing;
    btnSaveAll.disabled = state.tracks.length === 0 || modifiedCount === 0;

    // Refresh track numbers in case of reorder
    state.tracks.forEach((track, index) => {
      const numEl = document.querySelector(`#track-item-${track.id} .track-item-num`);
      if (numEl) numEl.textContent = index + 1;
    });
  }

  // --- Utility Functions ---
  function generateId() {
    return 'track-' + Math.random().toString(36).substr(2, 9);
  }

  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  // Smart Filename Parser
  function parseMessyFilename(filename) {
    let name = filename.replace(/\.[^/.]+$/, "");
    
    name = name.replace(/\(official\s*(video|audio|lyrics|music)?\s*\)/gi, '');
    name = name.replace(/\[official\s*(video|audio|lyrics|music)?\s*\]/gi, '');
    name = name.replace(/\b(128|192|320)kbps\b/gi, '');
    name = name.replace(/\blyric\s*video\b/gi, '');
    name = name.replace(/\b(HQ|HD|4K)\b/g, '');
    
    let parts = name.split(/\s*-\s*|\s*–\s*|\s*—\s*/);
    const domainRegex = /\b([a-zA-Z0-9-]+\.[a-zA-Z]{2,6})\b/i;
    parts = parts.filter(part => !domainRegex.test(part));
    
    let artist = '';
    let title = '';
    
    if (parts.length >= 2) {
      artist = cleanPart(parts[0]);
      title = cleanPart(parts[1]);
    } else if (parts.length === 1) {
      title = cleanPart(parts[0]);
    }
    
    return { artist, title };
  }

  function cleanPart(part) {
    if (!part) return '';
    let cleaned = part.replace(/^[\s\d._-]+/, '');
    cleaned = cleaned.replace(/\s*[([].*?[\])]\s*/g, ' ');
    return cleaned.replace(/\s+/g, ' ').trim();
  }
});
