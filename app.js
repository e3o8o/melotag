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
  const blurredBg = document.getElementById('blurred-bg');
  
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
  const btnReset = document.getElementById('btn-reset');
  const successOverlay = document.getElementById('success-overlay');

  // Suggestions
  const suggestionsGrid = document.getElementById('suggestions-grid');
  const suggestionsLoading = document.getElementById('suggestions-loading');
  const suggestionsEmpty = document.getElementById('suggestions-empty');
  const suggestionsSearchInput = document.getElementById('suggestions-search-input');
  const btnSuggestionsSearch = document.getElementById('btn-suggestions-search');

  // Initialize Lucide Icons
  lucide.createIcons();

  // Mobile nav tabs view switcher default
  document.body.className = 'tab-library';

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      navTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const tabName = tab.dataset.tab;
      document.body.className = 'tab-' + tabName;
    });
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

      // Draw bars with primary color gradient/glow
      canvasCtx.fillStyle = `rgba(250, 82, 15, ${0.1 + (barHeight / 64)})`;
      canvasCtx.fillRect(x, height - barHeight, barWidth - 2, barHeight);

      // Top glowing dot/cap
      canvasCtx.fillStyle = 'rgba(255, 161, 16, 0.9)';
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
    playerPlayIcon.setAttribute('data-lucide', 'pause');
    lucide.createIcons();
    
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
    playerPlayIcon.setAttribute('data-lucide', 'play');
    lucide.createIcons();
    
    // Toggle equalizer animation in sidebar
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (track) updateTrackListItemUI(track);
  });

  audioElement.addEventListener('ended', () => {
    playerState.isPlaying = false;
    playerPlayIcon.setAttribute('data-lucide', 'play');
    playerSeek.value = 0;
    playerCurrentTime.textContent = '0:00';
    lucide.createIcons();
    
    // Toggle equalizer animation in sidebar
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (track) updateTrackListItemUI(track);

    // Auto-advance next song in queue
    playNextTrack();
  });

  audioElement.addEventListener('loadedmetadata', () => {
    playerSeek.max = Math.floor(audioElement.duration || 100);
    playerSeek.value = 0;
    playerTotalTime.textContent = formatTime(audioElement.duration);
  });

  audioElement.addEventListener('timeupdate', () => {
    if (!playerState.isSeeking) {
      playerSeek.value = Math.floor(audioElement.currentTime);
      playerCurrentTime.textContent = formatTime(audioElement.currentTime);
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
    
    playerState.isPlaying = false;
    playerPlayIcon.setAttribute('data-lucide', 'play');
    lucide.createIcons();

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
      btnPlayerRepeat.className = 'btn btn-secondary btn-icon-only btn-sm active-all';
      btnPlayerRepeat.title = 'Repeat Loop: All';
    } else if (playerState.repeatMode === 'all') {
      playerState.repeatMode = 'one';
      btnPlayerRepeat.className = 'btn btn-secondary btn-icon-only btn-sm active-one';
      btnPlayerRepeat.title = 'Repeat Loop: One';
    } else {
      playerState.repeatMode = 'none';
      btnPlayerRepeat.className = 'btn btn-secondary btn-icon-only btn-sm';
      btnPlayerRepeat.title = 'Repeat Mode';
    }
  });

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
    if (playerState.isMuted || playerState.volume === 0) {
      playerVolumeIcon.setAttribute('data-lucide', 'volume-x');
    } else if (playerState.volume < 0.4) {
      playerVolumeIcon.setAttribute('data-lucide', 'volume');
    } else if (playerState.volume < 0.7) {
      playerVolumeIcon.setAttribute('data-lucide', 'volume-1');
    } else {
      playerVolumeIcon.setAttribute('data-lucide', 'volume-2');
    }
    lucide.createIcons();
  }

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
      return;
    }

    playerLyricsContainer.style.display = 'block';
    playerLyricsContainer.innerHTML = playerState.lyrics.map((line, index) => `
      <div class="lyric-line" id="lyric-line-${index}" data-time="${line.time}">
        ${escapeHTML(line.text)}
      </div>
    `).join('');
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
      const oldActive = document.querySelector('.lyric-line.active');
      if (oldActive) oldActive.classList.remove('active');

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

      playerState.currentLyricIndex = activeIndex;
    }
  }

  // Handle click on lyric line to seek
  if (playerLyricsContainer) {
    playerLyricsContainer.addEventListener('click', (e) => {
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
    });
  }

  // --- Manual Lyrics Search ---
  btnSearchLyrics.addEventListener('click', async () => {
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (!track) return;

    const title = inputTitle.value.trim();
    const artist = inputArtist.value.trim();

    if (!title || !artist) {
      alert('Please fill out the Song Title and Artist fields first.');
      return;
    }

    btnSearchLyrics.disabled = true;
    const origText = btnSearchLyrics.innerHTML;
    btnSearchLyrics.innerHTML = `<i data-lucide="loader-2" class="spinner" size="10"></i><span>Fetching...</span>`;
    lucide.createIcons();

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
        alert('Lyrics successfully retrieved and loaded!');
      } else {
        alert('No lyrics found for this song in the database.');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to retrieve lyrics: ' + err.message);
    } finally {
      btnSearchLyrics.disabled = false;
      btnSearchLyrics.innerHTML = origText;
      lucide.createIcons();
    }
  });

  // LRCLIB Search API Helper
  async function fetchLyricsFromLRCLIB(title, artist) {
    if (!title || !artist) return '';
    try {
      const url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
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
      const results = await fetchiTunesSuggestions(query);
      suggestionsLoading.style.display = 'none';

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
              <i data-lucide="file-text" size="10"></i>
              <span>Apply Text Only</span>
            </button>
            <button class="btn-suggestion-action apply-cover-only" title="Apply album cover only, keep current text fields">
              <i data-lucide="image" size="10"></i>
              <span>Apply Cover Only</span>
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
      lucide.createIcons();
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
      mp3tag: null
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

    // Switch to Player tab on mobile when selecting a track
    const playerTab = document.querySelector('.nav-tab[data-tab="player"]');
    if (playerTab && window.innerWidth <= 768) {
      navTabs.forEach(t => t.classList.remove('active'));
      playerTab.classList.add('active');
      document.body.className = 'tab-player';
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

    // Dynamic Ambient Background
    if (track.coverArt && track.coverArt.url) {
      blurredBg.style.backgroundImage = `url(${track.coverArt.url})`;
    } else {
      blurredBg.style.backgroundImage = 'none';
    }

    btnSave.innerHTML = `<i data-lucide="save" size="14"></i><span>${track.handle ? 'Save In-Place' : 'Apply Changes'}</span>`;

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
    if (coverArt && coverArt.url) {
      artworkFrame.style.backgroundImage = `url(${coverArt.url})`;
      artworkFrame.innerHTML = `
        <div class="artwork-frame-overlay">
          <i data-lucide="upload"></i>
          <span>Upload Custom Cover</span>
        </div>
      `;
      
      const img = new Image();
      img.onload = () => {
        artworkRes.textContent = `${img.width} × ${img.height}`;
        artworkFormat.textContent = coverArt.format.split('/')[1].toUpperCase();
      };
      img.src = coverArt.url;
    } else {
      artworkFrame.style.backgroundImage = 'none';
      artworkFrame.innerHTML = `
        <i data-lucide="image" size="48"></i>
        <div class="artwork-frame-overlay">
          <i data-lucide="upload"></i>
          <span>Upload Custom Cover</span>
        </div>
      `;
      artworkRes.textContent = 'No cover art';
      artworkFormat.textContent = '';
    }
    lucide.createIcons();
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

          // Update Dynamic Blurred background
          blurredBg.style.backgroundImage = `url(${track.coverArt.url})`;
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
    btnSave.innerHTML = `<i data-lucide="loader-2" class="spinner" size="14"></i><span>Saving...</span>`;
    lucide.createIcons();

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
      alert('Error updating MP3 tags: ' + err.message);
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = originalText;
      lucide.createIcons();
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
    btnMagic.innerHTML = `<i data-lucide="loader-2" class="spinner" size="14"></i><span>Matching...</span>`;
    lucide.createIcons();

    try {
      await magicAutoTagTrack(track);

      successOverlay.classList.add('active');
      setTimeout(() => {
        successOverlay.classList.remove('active');
      }, 1500);

    } catch (err) {
      console.error('Magic Auto-tag error:', err);
      alert('Magic Auto-Tag failed: ' + err.message);
    } finally {
      btnMagic.disabled = false;
      btnMagic.innerHTML = originalText;
      lucide.createIcons();
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

    const results = await fetchiTunesSuggestions(query);
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
        
        // Update Dynamic Blurred background
        blurredBg.style.backgroundImage = `url(${track.coverArt.url})`;

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
  btnSearchCover.addEventListener('click', () => {
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (!track) return;

    const customQuery = prompt('Enter Artist & Song Name to search on iTunes:', `${inputArtist.value} ${inputTitle.value}`.trim());
    if (customQuery !== null) {
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
      blurredBg.style.backgroundImage = 'none';

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
    btnAutoMatchAll.innerHTML = `<i data-lucide="loader-2" class="spinner" size="14"></i><span>Auto-matching...</span>`;
    lucide.createIcons();

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
    lucide.createIcons();
    updateUI();

    alert(`Completed Auto-Match! Match status updated for tracks.`);
  });

  // --- Bulk Save All In-Place ---
  btnSaveAll.addEventListener('click', async () => {
    const tracksToSave = state.tracks.filter(t => t.status === 'modified' || t.status === 'matched');
    if (tracksToSave.length === 0) return;

    btnSaveAll.disabled = true;
    const origText = btnSaveAll.innerHTML;
    btnSaveAll.innerHTML = `<i data-lucide="loader-2" class="spinner" size="14"></i><span>Saving...</span>`;
    lucide.createIcons();

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
    lucide.createIcons();
    updateUI();

    let msg = `Successfully saved all changes!`;
    if (inPlaceSaved > 0) msg += `\n- ${inPlaceSaved} files updated directly in-place.`;
    if (downloadsTriggered > 0) msg += `\n- ${downloadsTriggered} files downloaded manually as backups.`;
    alert(msg);
  });

  // --- Render Track Item in Sidebar ---
  function renderTrackListItem(track) {
    const div = document.createElement('div');
    div.className = 'track-item';
    div.dataset.id = track.id;
    div.id = `track-item-${track.id}`;

    div.innerHTML = `
      <div class="track-item-artwork" id="track-art-${track.id}">
        <i data-lucide="music-2" size="18"></i>
      </div>
      <div class="track-item-info">
        <div class="track-item-title">${escapeHTML(track.name)}</div>
        <div class="track-item-subtitle">Reading metadata...</div>
      </div>
      <div class="track-item-meta">
        <span class="badge badge-original">Loading</span>
        <button class="track-item-remove" title="Remove track">
          <i data-lucide="trash" size="12"></i>
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
    lucide.createIcons();
  }

  // --- Update Track Item Visual State ---
  function updateTrackListItemUI(track) {
    const div = document.getElementById(`track-item-${track.id}`);
    if (!div) return;

    const artContainer = document.getElementById(`track-art-${track.id}`);
    const titleContainer = div.querySelector('.track-item-title');
    const subtitleContainer = div.querySelector('.track-item-subtitle');
    const badgeContainer = div.querySelector('.badge');

    const isPlayingThisTrack = track.id === state.selectedTrackId && playerState.isPlaying;

    if (track.coverArt && track.coverArt.url) {
      artContainer.style.backgroundImage = `url(${track.coverArt.url})`;
      artContainer.innerHTML = '';
    } else {
      artContainer.style.backgroundImage = 'none';
      artContainer.innerHTML = `<i data-lucide="music-2" size="18"></i>`;
    }

    // Display title & inline equalizer if active
    titleContainer.innerHTML = `${escapeHTML(track.title || track.name)}${isPlayingThisTrack ? `
      <div class="equalizer-bars" style="display: inline-flex; vertical-align: middle;">
        <span class="bar"></span>
        <span class="bar"></span>
        <span class="bar"></span>
        <span class="bar"></span>
      </div>
    ` : ''}`;

    subtitleContainer.textContent = track.artist || 'Unknown Artist';

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

    lucide.createIcons();
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
      blurredBg.style.backgroundImage = 'none';
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
