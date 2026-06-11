// MeloTag — UI Core (Modal, Mobile Nav, Mini Player, Swipe, Status)
import { state } from './state.js';
import {
  navTabs, mobileHeaderTitle, mobileBackBtn, mobileStatusTime,
  modalOverlay, modalTitle, modalMessage, modalInput, modalInputWrap,
  modalOkBtn, modalCancelBtn, modalCloseBtn,
  librarySearchInput, tracksCount, tracksStatusSummary,
  btnAutoMatchAll, btnSaveAll, btnOpenFiles, btnOpenFolder,
  audioElement
} from './dom.js';

// --- Mobile tab order for swipe ---
const TAB_ORDER = ['library', 'player', 'editor'];

// --- Mobile Status Time ---
export function updateMobileStatusTime() {
  if (mobileStatusTime) {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    mobileStatusTime.textContent = `${h}:${m < 10 ? '0' : ''}${m}`;
  }
}

// --- Modal ---
export function showModal(title, message, options = {}) {
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

// --- Mobile Tab Switch ---
export function switchMobileTab(tabName) {
  document.body.className = 'tab-' + tabName;
  navTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));

  const titles = { library: 'MeloTag', player: 'Now Playing', editor: 'Tag Editor' };
  mobileHeaderTitle.textContent = titles[tabName] || 'MeloTag';
  mobileBackBtn.style.display = tabName === 'library' ? 'none' : 'flex';

  // Show mini player strip only in library and editor tabs
  const miniPlayer = document.getElementById('mobile-mini-player');
  if (miniPlayer) {
    const isMobile = window.innerWidth <= 768;
    const hasTrack = state.selectedTrackId != null;
    miniPlayer.style.display = isMobile && hasTrack && tabName !== 'player' ? 'flex' : 'none';
  }

  // Show mobile actions strip only in library tab when tracks exist
  const actionsStrip = document.getElementById('mobile-actions-strip');
  if (actionsStrip) {
    const isMobile = window.innerWidth <= 768;
    actionsStrip.style.display = isMobile && state.tracks.length > 0 && tabName === 'library' ? 'flex' : 'none';
  }
}

// --- Update Mini Player ---
export function updateMiniPlayer(track) {
  const miniPlayer = document.getElementById('mobile-mini-player');
  if (!miniPlayer) return;

  const isMobile = window.innerWidth <= 768;
  const currentTab = document.body.className.replace('tab-', '');
  const shouldShow = isMobile && track && currentTab !== 'player';
  miniPlayer.style.display = shouldShow ? 'flex' : 'none';

  if (!track) return;

  const titleEl = document.getElementById('mini-player-title');
  const artistEl = document.getElementById('mini-player-artist');
  const artEl = document.getElementById('mini-player-art');
  const seekFill = document.getElementById('mini-player-seek-fill');

  if (titleEl) titleEl.textContent = track.title || track.name || 'No track';
  if (artistEl) artistEl.textContent = track.artist || 'Unknown Artist';

  if (artEl) {
    if (track.coverArt && track.coverArt.url) {
      artEl.style.backgroundImage = `url(${track.coverArt.url})`;
      artEl.innerHTML = '';
    } else {
      artEl.style.backgroundImage = 'none';
      artEl.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 9.5V20l12-8L7 4"/></svg>';
    }
  }

  // Update seek fill from audio
  if (seekFill && audioElement && audioElement.duration) {
    const pct = (audioElement.currentTime / audioElement.duration) * 100;
    seekFill.style.width = `${pct}%`;
  }
}

// --- Sync mobile action strip button states ---
function syncMobileActionStrip() {
  const mobAutoMatch = document.getElementById('mob-btn-auto-match');
  const mobSaveAll = document.getElementById('mob-btn-save-all');
  if (!mobAutoMatch || !mobSaveAll) return;

  const originalCount = state.tracks.filter(t => t.status === 'original').length;
  const modifiedCount = state.tracks.filter(t => t.status === 'modified' || t.status === 'matched').length;
  mobAutoMatch.disabled = state.tracks.length === 0 || originalCount === 0 || state.isProcessing;
  mobSaveAll.disabled = state.tracks.length === 0 || modifiedCount === 0;
}

// --- General UI State Updates ---
export function updateUI() {
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

  // Refresh track numbers
  state.tracks.forEach((track, index) => {
    const numEl = document.querySelector(`#track-item-${track.id} .track-item-num`);
    if (numEl) numEl.textContent = index + 1;
  });

  // Mobile specifics
  syncMobileActionStrip();

  // Show/hide mobile actions strip based on track count
  const actionsStrip = document.getElementById('mobile-actions-strip');
  if (actionsStrip) {
    const isMobile = window.innerWidth <= 768;
    const currentTab = document.body.className.replace('tab-', '');
    actionsStrip.style.display =
      isMobile && state.tracks.length > 0 && currentTab === 'library' ? 'flex' : 'none';
  }
}

// --- Swipe gesture handler (left/right between tabs) ---
function initSwipeGestures() {
  let startX = 0;
  let startY = 0;
  let isDragging = false;

  function getCurrentTabIndex() {
    const cls = document.body.className.replace('tab-', '');
    return TAB_ORDER.indexOf(cls);
  }

  document.addEventListener('touchstart', (e) => {
    // Ignore swipes on sliders and scrollable areas
    const el = e.target;
    if (el.tagName === 'INPUT' || el.closest('.track-list') || el.closest('.inspector-content')) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isDragging = true;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;
    // Cancel if mostly vertical
    if (Math.abs(dy) > Math.abs(dx) * 1.5) {
      isDragging = false;
    }
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    isDragging = false;
    if (window.innerWidth > 768) return;

    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;

    // Only fire on clearly horizontal swipes (min 60px, ratio 2:1)
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return;

    const currentIdx = getCurrentTabIndex();
    if (dx < 0 && currentIdx < TAB_ORDER.length - 1) {
      // Swipe left → next tab
      switchMobileTab(TAB_ORDER[currentIdx + 1]);
    } else if (dx > 0 && currentIdx > 0) {
      // Swipe right → previous tab
      switchMobileTab(TAB_ORDER[currentIdx - 1]);
    }
  }, { passive: true });
}

// --- Init UI Event Listeners ---
export function initUIListeners() {
  // Mobile tab default
  switchMobileTab('library');

  // Mobile status time
  updateMobileStatusTime();
  setInterval(updateMobileStatusTime, 30000);

  // Nav tabs
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchMobileTab(tab.dataset.tab);
    });
  });

  // Back button → always go to library
  mobileBackBtn.addEventListener('click', () => {
    switchMobileTab('library');
  });

  // Mini player: tap info area → go to player tab
  const miniPlayer = document.getElementById('mobile-mini-player');
  if (miniPlayer) {
    miniPlayer.addEventListener('click', (e) => {
      if (e.target.closest('#mini-player-play') ||
          e.target.closest('#mini-player-prev') ||
          e.target.closest('#mini-player-next')) return;
      switchMobileTab('player');
    });
  }

  // Mini player play/pause
  const miniPlayBtn = document.getElementById('mini-player-play');
  if (miniPlayBtn) {
    miniPlayBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (audioElement.paused) {
        audioElement.play();
      } else {
        audioElement.pause();
      }
    });
  }

  // Mini player prev/next — delegate to actual player buttons
  const miniPrev = document.getElementById('mini-player-prev');
  if (miniPrev) {
    miniPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('btn-pv-prev')?.click();
    });
  }

  const miniNext = document.getElementById('mini-player-next');
  if (miniNext) {
    miniNext.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('btn-pv-next')?.click();
    });
  }

  // Sync mini player icon with audio state
  if (audioElement) {
    const miniIcon = document.getElementById('mini-play-icon');
    const pauseIconSVG = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
    const playIconSVG = `<polygon points="6 3 20 12 6 21 6 3"/>`;

    audioElement.addEventListener('play', () => {
      if (miniIcon) miniIcon.innerHTML = pauseIconSVG;
      // Scale artwork up
      const pvArt = document.getElementById('pv-artwork');
      if (pvArt) pvArt.classList.add('playing');
    });
    audioElement.addEventListener('pause', () => {
      if (miniIcon) miniIcon.innerHTML = playIconSVG;
      const pvArt = document.getElementById('pv-artwork');
      if (pvArt) pvArt.classList.remove('playing');
    });

    // Keep seek fill updated
    audioElement.addEventListener('timeupdate', () => {
      const seekFill = document.getElementById('mini-player-seek-fill');
      if (seekFill && audioElement.duration) {
        const pct = (audioElement.currentTime / audioElement.duration) * 100;
        seekFill.style.width = `${pct}%`;
      }
    });
  }

  // Mobile actions strip — delegate to the real header buttons
  const mobAutoMatch = document.getElementById('mob-btn-auto-match');
  if (mobAutoMatch) {
    mobAutoMatch.addEventListener('click', () => {
      btnAutoMatchAll.click();
    });
  }
  const mobSaveAll = document.getElementById('mob-btn-save-all');
  if (mobSaveAll) {
    mobSaveAll.addEventListener('click', () => {
      btnSaveAll.click();
    });
  }

  // Swipe gestures between tabs
  initSwipeGestures();

  // Library search filter
  librarySearchInput.addEventListener('input', () => {
    const query = librarySearchInput.value.toLowerCase().trim();
    state.tracks.forEach(track => {
      const itemEl = document.getElementById(`track-item-${track.id}`);
      if (!itemEl) return;
      const matchName = track.name.toLowerCase().includes(query);
      const matchTitle = (track.title || '').toLowerCase().includes(query);
      const matchArtist = (track.artist || '').toLowerCase().includes(query);
      itemEl.style.display = (matchName || matchTitle || matchArtist) ? 'flex' : 'none';
    });
  });

  // File System Access API check
  const hasFS = 'showOpenFilePicker' in window && 'showDirectoryPicker' in window;
  if (!hasFS) {
    console.warn('File System Access API is not supported in this browser.');
    if (btnOpenFiles) btnOpenFiles.style.display = 'none';
    if (btnOpenFolder) btnOpenFolder.style.display = 'none';
  }

  return hasFS;
}
