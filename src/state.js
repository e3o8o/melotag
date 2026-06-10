// MeloTag — Application State
// Central state objects shared across all modules

export const state = {
  tracks: [],
  selectedTrackId: null,
  isProcessing: false,
  selectedTracks: new Set()   // for batch tagging selection mode
};

export const playerState = {
  objectUrl: null,
  isPlaying: false,
  isSeeking: false,
  isNpSeeking: false,
  isPvSeeking: false,
  shuffle: false,
  repeatMode: 'none', // 'none', 'all', 'one'
  volume: 0.8,
  isMuted: false,
  lyrics: [],          // parsed LRC lines
  currentLyricIndex: -1
};
