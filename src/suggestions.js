// MeloTag — Suggestions Module
import { state } from './state.js';
import {
  suggestionsGrid, suggestionsLoading, suggestionsEmpty,
  suggestionsSearchInput, btnSuggestionsSearch,
  inputTitle, inputArtist, inputAlbum, inputGenre, inputYear,
  inputTrack, inputTrackTotal, inputDisc, inputDiscTotal, inputLyrics,
  artworkRes
} from './dom.js';
import { fetchUnifiedSuggestions, fetchLyricsFromLRCLIB } from './api.js';

// Forward-declared dependencies
let _renderArtworkPreview = null;
let _updateTrackListItemUI = null;
let _updateUI = null;

export function setSuggestionsDeps({ renderArtworkPreview, updateTrackListItemUI, updateUI }) {
  _renderArtworkPreview = renderArtworkPreview;
  _updateTrackListItemUI = updateTrackListItemUI;
  _updateUI = updateUI;
}

// --- Trigger Search ---
export async function triggerSearch(query) {
  suggestionsGrid.innerHTML = '';
  suggestionsEmpty.style.display = 'none';
  suggestionsLoading.style.display = 'flex';

  try {
    const { results, error } = await fetchUnifiedSuggestions(query);
    suggestionsLoading.style.display = 'none';

    if (error) {
      suggestionsEmpty.textContent = error;
      suggestionsEmpty.style.display = 'block';
      return;
    }

    if (results.length === 0) {
      suggestionsEmpty.textContent = 'No matches found. Try adjusting the title/artist above.';
      suggestionsEmpty.style.display = 'block';
      return;
    }

    results.forEach(res => {
      const card = document.createElement('div');
      card.className = 'suggestion-card';

      const highResArt = res.artworkUrlHigh || res.artworkUrl100 || '';
      const badgesHtml = res.sources.map(src => `<span class="badge-source badge-${src.toLowerCase()}">${src}</span>`).join(' ');

      card.innerHTML = `
        <div class="suggestion-card-main" title="Click to apply both text tags and cover image">
          <div class="suggestion-artwork" style="background-image: url(${res.artworkUrl100 || ''})"></div>
          <div class="suggestion-info">
            <div class="suggestion-title">${res.trackName || 'Unknown Track'}</div>
            <div class="suggestion-artist">${res.artistName || 'Unknown Artist'}</div>
            <div class="suggestion-album">${res.collectionName || 'Unknown Album'}</div>
          </div>
          <div class="suggestion-score">${badgesHtml}</div>
        </div>
        <div class="suggestion-card-actions">
          <button class="btn-suggestion-action apply-text-only" title="Apply text metadata only">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            <span>Text Only</span>
          </button>
          <button class="btn-suggestion-action apply-cover-only" title="Apply album cover only">
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

// --- Apply Suggestion to Form ---
export async function applySuggestionToForm(suggestion, artworkUrl, mode = 'both') {
  const track = state.tracks.find(t => t.id === state.selectedTrackId);
  if (!track) return;

  if (mode === 'both' || mode === 'text') {
    inputTitle.value = suggestion.trackName || '';
    inputArtist.value = suggestion.artistName || '';
    inputAlbum.value = suggestion.collectionName || '';
    inputGenre.value = suggestion.primaryGenreName || '';
    inputYear.value = suggestion.releaseDate ? suggestion.releaseDate.substring(0, 4) : '';
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
        _renderArtworkPreview(track.coverArt);
      } catch (err) {
        console.error('Artwork fetch error:', err);
        artworkRes.textContent = 'Failed to load cover.';
      }
    }
  }
}

// --- Init Suggestions Listeners ---
export function initSuggestionsListeners() {
  btnSuggestionsSearch.addEventListener('click', () => {
    const query = suggestionsSearchInput.value.trim();
    if (query) triggerSearch(query);
  });

  suggestionsSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const query = suggestionsSearchInput.value.trim();
      if (query) triggerSearch(query);
    }
  });
}
