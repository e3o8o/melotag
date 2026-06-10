// MeloTag — Queue Panel
import { state, playerState } from './state.js';
import {
  npQueuePanel, npQueueList, btnNpQueue, npQueueClose, npInfoClick
} from './dom.js';
import { formatTime } from './utils.js';

// Forward-declared dependency
let _selectTrack = null;
export function setQueueDeps({ selectTrack }) {
  _selectTrack = selectTrack;
}

// --- Render Queue ---
export function renderQueue() {
  if (!npQueueList) return;
  if (state.tracks.length === 0) {
    npQueueList.innerHTML = '<div class="np-queue-empty">No tracks in queue</div>';
    return;
  }
  npQueueList.innerHTML = state.tracks.map((t) => {
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
      _selectTrack(el.dataset.id);
      closeQueue();
    });
  });
}

// --- Open / Close / Toggle ---
export function openQueue() {
  if (!npQueuePanel) return;
  renderQueue();
  npQueuePanel.classList.add('open');
  btnNpQueue.classList.add('active');
}

export function closeQueue() {
  if (!npQueuePanel) return;
  npQueuePanel.classList.remove('open');
  btnNpQueue.classList.remove('active');
}

export function toggleQueue() {
  if (npQueuePanel.classList.contains('open')) {
    closeQueue();
  } else {
    openQueue();
  }
}

// --- Init Queue Listeners ---
export function initQueueListeners() {
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
}
