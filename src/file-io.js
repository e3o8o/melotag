// MeloTag — File I/O Module
// Handles file loading, parsing, drag & drop, tag writing, and download
import { state, playerState } from './state.js';
import {
  dropZone, fileInput, btnOpenFiles, btnOpenFolder,
  btnSave, btnDownload, artworkFrame, artworkInput, artworkRes,
  btnSearchCover, btnRemoveCover, successOverlay,
  inputTitle, inputArtist, inputAlbum, inputAlbumArtist,
  inputGenre, inputYear, inputTrack, inputTrackTotal,
  inputDisc, inputDiscTotal, inputLyrics,
  playerTrackInfo, suggestionsSearchInput,
  albumContextBar, albumContextLabel,
  welcomeDirBanner, btnSelectWorkingDir
} from './dom.js';
import { generateId, inferFromFolderName } from './utils.js';
import { showModal, updateUI } from './ui.js';
import { parseLRC, renderSyncedLyrics } from './lyrics.js';
import { renderTrackListItem, updateTrackListItemUI, selectTrack, renderArtworkPreview } from './tracks.js';
import { triggerSearch } from './suggestions.js';
import { albumContext } from './auto-tag.js';

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

// --- Add Track Object ---
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

// --- Handle Standard Files (non-FS Access) ---
async function handleStandardFiles(filesList) {
  const files = Array.from(filesList).filter(file => file.name.endsWith('.mp3'));
  if (files.length === 0) return;
  for (const file of files) {
    await addTrackObject(file, null);
  }
  updateUI();
}

// --- Set/Clear Album Context Banner ---
function setAlbumContext(artist, album) {
  albumContext.artist = artist;
  albumContext.album = album;
  albumContext.tracklistMap = null;
  albumContext.artworkUrl = null;
  if (albumContextBar && albumContextLabel) {
    if (artist || album) {
      albumContextLabel.textContent = `« ${artist || '?'} — ${album || '?'} »`;
      albumContextBar.style.display = 'flex';
    } else {
      albumContextBar.style.display = 'none';
    }
  }
}

// --- Scan Directory (File System Access API) ---
async function scanDirectory(dirHandle) {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.mp3')) {
      const file = await entry.getFile();
      await addTrackObject(file, entry);
    } else if (entry.kind === 'directory') {
      await scanDirectory(entry);
    }
  }
}

// --- Read Directory Entry (webkitGetAsEntry fallback — Safari / Firefox) ---
function readDirectoryEntry(dirEntry, topLevelName) {
  if (!topLevelName) {
    const { artist, album } = inferFromFolderName(dirEntry.name);
    setAlbumContext(artist, album);
  }
  return new Promise((resolve) => {
    const name = topLevelName || dirEntry.name;
    const reader = dirEntry.createReader();

    function readBatch() {
      reader.readEntries(async (entries) => {
        if (entries.length === 0) { resolve(); return; }
        for (const entry of entries) {
          if (entry.isFile && entry.name.toLowerCase().endsWith('.mp3')) {
            await new Promise((res) => {
              entry.file(async (file) => {
                await addTrackObject(file, null);
                res();
              }, res);
            });
          } else if (entry.isDirectory) {
            await readDirectoryEntry(entry, name);
          }
        }
        readBatch(); // read next batch (readEntries returns max 100 at a time)
      }, () => resolve());
    }

    readBatch();
  });
}

// --- Permission Helper ---
async function verifyPermission(fileHandle, readWrite) {
  const options = {};
  if (readWrite) options.mode = 'readwrite';
  if ((await fileHandle.queryPermission(options)) === 'granted') return true;
  if ((await fileHandle.requestPermission(options)) === 'granted') return true;
  return false;
}

// --- Write Tags ---
export async function writeTagsToBuffer(track) {
  if (!track.mp3tag) return false;

  const mp3tag = track.mp3tag;
  if (!mp3tag.tags.v2) mp3tag.tags.v2 = {};

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
    mp3tag.tags.v2.USLT = [{ language: 'eng', descriptor: 'Lyrics', text: track.lyrics }];
  } else {
    delete mp3tag.tags.v2.USLT;
  }

  if (track.coverArt && track.coverArt.data) {
    mp3tag.tags.v2.APIC = [{ type: 3, format: track.coverArt.format, description: 'Cover', data: Array.from(track.coverArt.data) }];
  } else {
    delete mp3tag.tags.v2.APIC;
  }

  mp3tag.save();
  track.buffer = mp3tag.buffer;

  if (track.handle) {
    if (state.directoryHandle) {
      const dirPermission = await verifyPermission(state.directoryHandle, true);
      if (!dirPermission) throw new Error('Permission denied to save files in the working directory.');
    }
    const hasPermission = await verifyPermission(track.handle, true);
    if (!hasPermission) throw new Error('Permission denied to save local file.');
    const writable = await track.handle.createWritable();
    await writable.write(track.buffer);
    await writable.close();
    return true;
  } else if (window.showSaveFilePicker) {
    try {
      let suggestedName = track.name;
      if (track.title && track.artist) {
        const mainArtist = track.artist.split(/&|,|\band\b/i)[0].trim();
        suggestedName = `${mainArtist} - ${track.title}.mp3`;
      }
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'Audio Files', accept: { 'audio/mpeg': ['.mp3'] } }]
      });
      if (handle) {
        track.handle = handle;
        const writable = await handle.createWritable();
        await writable.write(track.buffer);
        await writable.close();
        return true;
      }
    } catch (err) {
      if (err.name === 'AbortError') return true;
      console.error('Save File Picker Error:', err);
    }
  }
  return false;
}

// --- Trigger Download ---
export function triggerDownload(track) {
  const blob = new Blob([track.buffer], { type: 'audio/mp3' });
  const url = URL.createObjectURL(blob);

  let filename = track.name;
  if (track.title && track.artist) {
    const mainArtist = track.artist.split(/&|,|\band\b/i)[0].trim();
    filename = `${mainArtist} - ${track.title}.mp3`;
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

// --- Init File I/O Listeners ---
export function initFileIOListeners(hasFS) {
  // File pickers
  if (hasFS) {
    btnOpenFiles.addEventListener('click', async () => {
      try {
        const fileHandles = await window.showOpenFilePicker({
          multiple: true,
          types: [{ description: 'Audio Files', accept: { 'audio/mpeg': ['.mp3'] } }]
        });
        for (const handle of fileHandles) {
          const file = await handle.getFile();
          await addTrackObject(file, handle);
        }
        updateUI();
      } catch (err) {
        if (err.name !== 'AbortError') console.error('File Picker Error:', err);
      }
    });

    btnOpenFolder.addEventListener('click', async () => {
      try {
        const dirHandle = await window.showDirectoryPicker();
        state.directoryHandle = dirHandle;
        await verifyPermission(dirHandle, true);
        // Infer artist & album from folder name, show banner
        const { artist, album } = inferFromFolderName(dirHandle.name);
        setAlbumContext(artist, album);
        await scanDirectory(dirHandle);
        updateUI();
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Folder Picker Error:', err);
      }
    });

    if (btnSelectWorkingDir) {
      btnSelectWorkingDir.addEventListener('click', async () => {
        try {
          const dirHandle = await window.showDirectoryPicker();
          state.directoryHandle = dirHandle;
          await verifyPermission(dirHandle, true);
          const { artist, album } = inferFromFolderName(dirHandle.name);
          setAlbumContext(artist, album);
          await scanDirectory(dirHandle);
          updateUI();
        } catch (err) {
          if (err.name !== 'AbortError') console.error('Working Folder Picker Error:', err);
        }
      });
    }

    const btnCloseWelcome = document.getElementById('btn-close-welcome-banner');
    if (btnCloseWelcome) {
      btnCloseWelcome.addEventListener('click', () => {
        const banner = document.getElementById('welcome-dir-banner');
        if (banner) banner.style.display = 'none';
        sessionStorage.setItem('dismissWelcomeBanner', 'true');
      });
    }
  } else {
    // Fallback: use standard file input for files
    btnOpenFiles.addEventListener('click', () => fileInput.click());

    // Fallback: use a separate input with webkitdirectory for folder selection
    const folderInput = document.createElement('input');
    folderInput.type = 'file';
    folderInput.multiple = true;
    folderInput.accept = 'audio/mp3,audio/mpeg';
    folderInput.setAttribute('webkitdirectory', '');
    folderInput.setAttribute('directory', '');
    folderInput.style.display = 'none';
    document.body.appendChild(folderInput);

    folderInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files).filter(f => f.name.endsWith('.mp3'));
      if (files.length === 0) return;

      // Infer folder name from the common directory path
      const firstPath = files[0].webkitRelativePath || '';
      const folderName = firstPath.split('/')[0] || '';
      if (folderName) {
        const { artist, album } = inferFromFolderName(folderName);
        setAlbumContext(artist, album);
      }

      for (const file of files) {
        await addTrackObject(file, null);
      }
      updateUI();
      folderInput.value = '';
    });

    btnOpenFolder.addEventListener('click', () => folderInput.click());
  }

  // Drag & Drop
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
      let loadedFolder = false;

      for (const item of items) {
        if (item.kind !== 'file') continue;
        try {
          const handle = await item.getAsFileSystemHandle();
          if (!handle) continue;

          if (handle.kind === 'directory') {
            // Dropped a folder — infer album context and scan it
            state.directoryHandle = handle;
            await verifyPermission(handle, true);
            const { artist, album } = inferFromFolderName(handle.name);
            setAlbumContext(artist, album);
            await scanDirectory(handle);
            loadedFolder = true;
          } else if (handle.kind === 'file' && handle.name.toLowerCase().endsWith('.mp3')) {
            const file = await handle.getFile();
            await addTrackObject(file, handle);
          }
        } catch (err) {
          console.error('Error getting handle from drop item:', err);
        }
      }

      updateUI();
    } else {
      // Non-FS-API path: check if items include a folder via webkitGetAsEntry
      const items = Array.from(e.dataTransfer.items || []);
      let handledByEntry = false;

      for (const item of items) {
        if (item.kind !== 'file') continue;
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        if (entry && entry.isDirectory) {
          handledByEntry = true;
          await readDirectoryEntry(entry);
        }
      }

      if (!handledByEntry) {
        await handleStandardFiles(e.dataTransfer.files);
      } else {
        updateUI();
      }
    }
  });

  // Save button
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
      track.status = 'saved';
      if (!savedInPlace) triggerDownload(track);
      updateTrackListItemUI(track);
      updateUI();
      playerTrackInfo.textContent = track.title || track.name;

      playerState.lyrics = parseLRC(track.lyrics);
      playerState.currentLyricIndex = -1;
      renderSyncedLyrics();

      successOverlay.classList.add('active');
      setTimeout(() => successOverlay.classList.remove('active'), 1500);
    } catch (err) {
      console.error('Failed to save tags:', err);
      showModal('Save Error', 'Error updating MP3 tags: ' + err.message);
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = originalText;
    }
  });

  // Download button
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

  // Artwork upload
  artworkFrame.addEventListener('click', (e) => {
    if (e.target.tagName !== 'INPUT') artworkInput.click();
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
        if (track.coverArt && track.coverArt.url) URL.revokeObjectURL(track.coverArt.url);
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

  // Search metadata manually
  btnSearchCover.addEventListener('click', async () => {
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (!track) return;
    const defaultValue = `${inputArtist.value} ${inputTitle.value}`.trim();
    const customQuery = await showModal('Search Metadata', 'Enter Artist & Song Name to search for matches:', { type: 'prompt', defaultValue });
    if (customQuery) {
      suggestionsSearchInput.value = customQuery;
      triggerSearch(customQuery);
    }
  });

  // Remove cover art
  btnRemoveCover.addEventListener('click', () => {
    const track = state.tracks.find(t => t.id === state.selectedTrackId);
    if (track) {
      if (track.coverArt && track.coverArt.url) URL.revokeObjectURL(track.coverArt.url);
      track.coverArt = null;
      renderArtworkPreview(null);
      if (track.status === 'saved') {
        track.status = 'modified';
        updateTrackListItemUI(track);
        updateUI();
      }
    }
  });
}
