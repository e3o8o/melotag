// MeloTag — DOM Element References
// Single source of truth for all DOM lookups

// Core UI
export const dropZone = document.getElementById('drop-zone');
export const fileInput = document.getElementById('file-input');
export const trackList = document.getElementById('track-list');
export const tracksCount = document.getElementById('tracks-count');
export const tracksStatusSummary = document.getElementById('tracks-status-summary');

// Inspector
export const inspectorEmpty = document.getElementById('inspector-empty');
export const inspectorContent = document.getElementById('inspector-content');

// File System Access Buttons
export const btnOpenFiles = document.getElementById('btn-open-files');
export const btnOpenFolder = document.getElementById('btn-open-folder');

// Custom Audio Player Elements
export const playerPlayBtn = document.getElementById('player-play-btn');
export const playerPlayIcon = document.getElementById('player-play-icon');
export const playerCurrentTime = document.getElementById('player-current-time');
export const playerTrackInfo = document.getElementById('player-track-info');
export const playerTotalTime = document.getElementById('player-total-time');
export const playerSeek = document.getElementById('player-seek');
export const audioElement = document.getElementById('audio-element');

export const btnPlayerShuffle = document.getElementById('btn-player-shuffle');
export const btnPlayerRepeat = document.getElementById('btn-player-repeat');
export const btnPlayerPrev = document.getElementById('btn-player-prev');
export const btnPlayerNext = document.getElementById('btn-player-next');
export const playerVolume = document.getElementById('player-volume');
export const playerVolumeIcon = document.getElementById('player-volume-icon');
export const playerLyricsContainer = document.getElementById('player-lyrics-container');
export const playerVisualizer = document.getElementById('player-visualizer');
export const librarySearchInput = document.getElementById('library-search-input');
export const navTabs = document.querySelectorAll('.nav-tab');

// Now Playing Bar
export const nowPlayingBar = document.getElementById('now-playing-bar');
export const npArtwork = document.getElementById('np-artwork');
export const npTitle = document.getElementById('np-title');
export const npArtist = document.getElementById('np-artist');
export const npSeek = document.getElementById('np-seek');
export const npPlayBtn = document.getElementById('np-play-btn');
export const npPlayIcon = document.getElementById('np-play-icon');
export const npInfoClick = document.getElementById('np-info-click');
export const btnNpPrev = document.getElementById('btn-np-prev');
export const btnNpNext = document.getElementById('btn-np-next');
export const npVolumeSlider = document.getElementById('np-volume-slider');
export const btnNpQueue = document.getElementById('btn-np-queue');
export const npQueuePanel = document.getElementById('np-queue-panel');
export const npQueueList = document.getElementById('np-queue-list');
export const npQueueClose = document.getElementById('np-queue-close');

// Player View (mobile)
export const playerView = document.getElementById('player-view');
export const pvArtwork = document.getElementById('pv-artwork');
export const pvTitle = document.getElementById('pv-title');
export const pvArtist = document.getElementById('pv-artist');
export const pvSeek = document.getElementById('pv-seek');
export const pvCurrentTime = document.getElementById('pv-current-time');
export const pvTotalTime = document.getElementById('pv-total-time');
export const pvPlayBtn = document.getElementById('btn-pv-play');
export const pvPlayIcon = document.getElementById('pv-play-icon');
export const btnPvPrev = document.getElementById('btn-pv-prev');
export const btnPvNext = document.getElementById('btn-pv-next');
export const btnPvShuffle = document.getElementById('btn-pv-shuffle');
export const btnPvRepeat = document.getElementById('btn-pv-repeat');
export const btnPvVolume = document.getElementById('btn-pv-volume');
export const pvVolumeSlider = document.getElementById('pv-volume');
export const pvLyricsContainer = document.getElementById('pv-lyrics');

// Editor Header
export const editorTrackNum = document.getElementById('editor-track-num');
export const editorTrackName = document.getElementById('editor-track-name');

// Mobile Chrome
export const mobileHeaderTitle = document.getElementById('mobile-header-title');
export const mobileBackBtn = document.getElementById('mobile-back-btn');
export const mobileStatusTime = document.getElementById('mobile-status-time');

// Modal
export const modalOverlay = document.getElementById('modal-overlay');
export const modalTitle = document.getElementById('modal-title');
export const modalMessage = document.getElementById('modal-message');
export const modalInput = document.getElementById('modal-input');
export const modalInputWrap = document.getElementById('modal-input-wrap');
export const modalOkBtn = document.getElementById('modal-ok-btn');
export const modalCancelBtn = document.getElementById('modal-cancel-btn');
export const modalCloseBtn = document.getElementById('modal-close-btn');

// Form Inputs
export const inputTitle = document.getElementById('input-title');
export const inputArtist = document.getElementById('input-artist');
export const inputAlbum = document.getElementById('input-album');
export const inputAlbumArtist = document.getElementById('input-album-artist');
export const inputGenre = document.getElementById('input-genre');
export const inputYear = document.getElementById('input-year');
export const inputTrack = document.getElementById('input-track');
export const inputTrackTotal = document.getElementById('input-track-total');
export const inputDisc = document.getElementById('input-disc');
export const inputDiscTotal = document.getElementById('input-disc-total');
export const inputLyrics = document.getElementById('input-lyrics');
export const btnSearchLyrics = document.getElementById('btn-search-lyrics');

// Artwork
export const artworkFrame = document.getElementById('artwork-frame');
export const artworkInput = document.getElementById('artwork-input');
export const artworkRes = document.getElementById('artwork-res');
export const artworkFormat = document.getElementById('artwork-format');
export const btnSearchCover = document.getElementById('btn-search-cover');
export const btnRemoveCover = document.getElementById('btn-remove-cover');

// Buttons
export const btnMagic = document.getElementById('btn-magic');
export const btnSave = document.getElementById('btn-save');
export const btnDownload = document.getElementById('btn-download');
export const btnAutoMatchAll = document.getElementById('btn-auto-match-all');
export const btnSaveAll = document.getElementById('btn-save-all');
export const successOverlay = document.getElementById('success-overlay');

// Suggestions
export const suggestionsGrid = document.getElementById('suggestions-grid');
export const suggestionsLoading = document.getElementById('suggestions-loading');
export const suggestionsEmpty = document.getElementById('suggestions-empty');
export const suggestionsSearchInput = document.getElementById('suggestions-search-input');
export const btnSuggestionsSearch = document.getElementById('btn-suggestions-search');

// NP Extra Controls
export const btnNpShuffle = document.getElementById('btn-np-shuffle');
export const btnNpRepeat = document.getElementById('btn-np-repeat');
export const btnNpVolume = document.getElementById('btn-np-volume');

// Batch Tagging & Selection
export const batchActionsBar = document.getElementById('batch-actions-bar');
export const btnBatchAutotag = document.getElementById('btn-batch-autotag');
export const btnBatchSave = document.getElementById('btn-batch-save');
export const batchSelectedCount = document.getElementById('batch-selected-count');
export const chkSelectAll = document.getElementById('chk-select-all');

// Album Context Banner
export const albumContextBar = document.getElementById('album-context-bar');
export const albumContextLabel = document.getElementById('album-context-label');
export const btnTagAsAlbum = document.getElementById('btn-tag-as-album');

// Welcome Directory Permission Banner
export const welcomeDirBanner = document.getElementById('welcome-dir-banner');
export const btnSelectWorkingDir = document.getElementById('btn-select-working-dir');
