// MeloTag — UI Core (Modal, Mobile Nav, Status, General UI)
import { state } from './state.js';
import {
  navTabs, mobileHeaderTitle, mobileBackBtn, mobileStatusTime,
  modalOverlay, modalTitle, modalMessage, modalInput, modalInputWrap,
  modalOkBtn, modalCancelBtn, modalCloseBtn,
  librarySearchInput, tracksCount, tracksStatusSummary,
  btnAutoMatchAll, btnSaveAll, btnOpenFiles, btnOpenFolder
} from './dom.js';

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

  // Back button
  mobileBackBtn.addEventListener('click', () => {
    switchMobileTab('library');
  });

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
