// MeloTag — API Module (iTunes, Deezer, MusicBrainz, LRCLIB)
import { smartTitleCase } from './utils.js';

// --- LRCLIB Lyrics API ---
export async function fetchLyricsFromLRCLIB(title, artist) {
  if (!title || !artist) return '';
  try {
    const url = `/api/lrclib/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MeloTag/1.0.0 (https://melotag.com)' }
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

// --- iTunes Search API ---
export async function fetchiTunesSuggestions(query) {
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

// --- Deezer Search API ---
export async function fetchDeezerSuggestions(query) {
  if (!query) return { results: [], error: null };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const url = `/api/deezer/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) {
      return { results: [], error: `Deezer API returned ${res.status}` };
    }
    const data = await res.json();
    return { results: data.data || [], error: null };
  } catch (err) {
    console.error('Deezer API search error:', err);
    if (err.name === 'AbortError') {
      return { results: [], error: 'Request timed out. Check your connection.' };
    }
    return { results: [], error: 'Network error — couldn\'t reach Deezer.' };
  }
}

// --- MusicBrainz Search API (Open-Source) ---
export async function fetchMusicBrainzSuggestions(query) {
  if (!query) return { results: [], error: null };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const url = `/api/musicbrainz/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=6`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'MeloTag/1.0 (https://melotag.app)' }
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return { results: [], error: `MusicBrainz API returned ${res.status}` };
    }
    const data = await res.json();
    const recordings = data.recordings || [];

    // Map MusicBrainz recordings to our normalized format
    const results = recordings.map(rec => {
      const artistCredit = rec['artist-credit'] || [];
      const artistName = artistCredit.map(ac => ac.name || ac.artist?.name || '').join(', ');
      const releases = rec.releases || [];
      const firstRelease = releases[0] || {};
      const releaseDate = firstRelease.date || '';
      const releaseMbid = firstRelease.id || '';
      const albumTitle = firstRelease.title || '';
      const trackNumber = firstRelease['media']?.[0]?.['track']?.[0]?.number || '';

      return {
        trackName: rec.title || '',
        artistName,
        collectionName: albumTitle,
        primaryGenreName: '',
        releaseDate,
        trackNumber: trackNumber ? String(trackNumber) : '',
        trackCount: '',
        discNumber: '',
        discCount: '',
        artworkUrl100: '',
        artworkUrlHigh: '',
        releaseMbid,
        sources: ['MusicBrainz']
      };
    });

    // Attempt to fetch cover art for the first result with a release MBID
    for (const result of results) {
      if (result.releaseMbid) {
        try {
          const coverUrl = `/api/coverart/release/${result.releaseMbid}/front-500`;
          const coverRes = await fetch(coverUrl, { redirect: 'follow' });
          if (coverRes.ok) {
            // The Cover Art Archive may redirect to the actual image URL
            const finalUrl = coverRes.url;
            result.artworkUrl100 = finalUrl;
            result.artworkUrlHigh = finalUrl.replace('front-500', 'front-1200') || finalUrl;
            break; // Just get cover for first match to save requests
          }
        } catch {
          // Cover art fetch failed, continue without it
        }
      }
    }

    return { results, error: null };
  } catch (err) {
    console.error('MusicBrainz API search error:', err);
    if (err.name === 'AbortError') {
      return { results: [], error: 'MusicBrainz request timed out.' };
    }
    return { results: [], error: 'Network error — couldn\'t reach MusicBrainz.' };
  }
}

// --- Unified Suggestions (merge all sources) ---
export async function fetchUnifiedSuggestions(query) {
  if (!query) return { results: [], error: null };

  const [itunesRes, deezerRes, mbRes] = await Promise.allSettled([
    fetchiTunesSuggestions(query),
    fetchDeezerSuggestions(query),
    fetchMusicBrainzSuggestions(query)
  ]);

  let itunesRaw = [];
  let deezerRaw = [];
  let mbRaw = [];
  const errors = [];

  if (itunesRes.status === 'fulfilled') {
    if (itunesRes.value.error) errors.push(`iTunes: ${itunesRes.value.error}`);
    else itunesRaw = itunesRes.value.results || [];
  } else {
    errors.push('iTunes API request failed.');
  }

  if (deezerRes.status === 'fulfilled') {
    if (deezerRes.value.error) errors.push(`Deezer: ${deezerRes.value.error}`);
    else deezerRaw = deezerRes.value.results || [];
  } else {
    errors.push('Deezer API request failed.');
  }

  if (mbRes.status === 'fulfilled') {
    if (mbRes.value.error) errors.push(`MusicBrainz: ${mbRes.value.error}`);
    else mbRaw = mbRes.value.results || [];
  } else {
    errors.push('MusicBrainz API request failed.');
  }

  // Normalize iTunes results
  const itunesNormalized = itunesRaw.map(item => ({
    trackName: item.trackName || '',
    artistName: item.artistName || '',
    collectionName: item.collectionName || '',
    primaryGenreName: item.primaryGenreName || '',
    releaseDate: item.releaseDate || '',
    trackNumber: item.trackNumber || '',
    trackCount: item.trackCount || '',
    discNumber: item.discNumber || '',
    discCount: item.discCount || '',
    artworkUrl100: item.artworkUrl100 || '',
    artworkUrlHigh: item.artworkUrl100 ? item.artworkUrl100.replace('/100x100bb.jpg', '/600x600bb.jpg') : '',
    sources: ['iTunes']
  }));

  // Normalize Deezer results
  const deezerNormalized = deezerRaw.map(item => {
    const coverMedium = item.album?.cover_medium || item.album?.cover || '';
    const coverHigh = item.album?.cover_xl || item.album?.cover_big || coverMedium;
    return {
      trackName: item.title || item.title_short || '',
      artistName: item.artist?.name || '',
      collectionName: item.album?.title || '',
      primaryGenreName: '',
      releaseDate: '',
      trackNumber: '',
      trackCount: '',
      discNumber: '',
      discCount: '',
      artworkUrl100: coverMedium,
      artworkUrlHigh: coverHigh,
      sources: ['Deezer']
    };
  });

  // MusicBrainz results are already normalized

  // Merge and deduplicate
  const map = new Map();
  const getNormalizationKey = (track) => {
    const clean = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${clean(track.trackName)}|${clean(track.artistName)}`;
  };

  [...itunesNormalized, ...deezerNormalized, ...mbRaw].forEach(track => {
    const key = getNormalizationKey(track);
    if (map.has(key)) {
      const existing = map.get(key);
      existing.sources = [...new Set([...existing.sources, ...track.sources])];

      // Fill in missing properties
      if (!existing.primaryGenreName && track.primaryGenreName) existing.primaryGenreName = track.primaryGenreName;
      if (!existing.releaseDate && track.releaseDate) existing.releaseDate = track.releaseDate;
      if (!existing.trackNumber && track.trackNumber) existing.trackNumber = track.trackNumber;
      if (!existing.trackCount && track.trackCount) existing.trackCount = track.trackCount;
      if (!existing.discNumber && track.discNumber) existing.discNumber = track.discNumber;
      if (!existing.discCount && track.discCount) existing.discCount = track.discCount;

      // Prefer higher resolution cover art
      if (track.artworkUrlHigh && !existing.artworkUrlHigh) {
        existing.artworkUrlHigh = track.artworkUrlHigh;
        existing.artworkUrl100 = track.artworkUrl100 || existing.artworkUrl100;
      }
      // Prefer Deezer cover_xl (1000px) over iTunes (600px)
      if (track.sources.includes('Deezer') && track.artworkUrlHigh) {
        existing.artworkUrlHigh = track.artworkUrlHigh;
        existing.artworkUrl100 = track.artworkUrl100 || existing.artworkUrl100;
      }
    } else {
      map.set(key, { ...track });
    }
  });

  const mergedResults = Array.from(map.values());
  let combinedError = null;
  if (itunesRaw.length === 0 && deezerRaw.length === 0 && mbRaw.length === 0 && errors.length > 0) {
    combinedError = errors.join(' | ');
  }

  return { results: mergedResults, error: combinedError };
}

// --- Album Context Fetch (Deezer tracklist + cover art) ---
// Returns { tracklistMap: Map<normalizedKey, {title, artist, trackNumber}>, artworkUrl: string|null }
export async function fetchAlbumContext(artist, album) {
  const tracklistMap = new Map();
  let artworkUrl = null;
  const query = `${artist} ${album}`.trim();
  if (!query) return { tracklistMap, artworkUrl };

  try {
    const res = await fetch(`/api/deezer/search/album?q=${encodeURIComponent(query)}`);
    if (!res.ok) return { tracklistMap, artworkUrl };
    const data = await res.json();
    const albums = data.data || [];
    if (albums.length === 0) return { tracklistMap, artworkUrl };

    const albumInfo = albums[0];
    artworkUrl = albumInfo.cover_xl || albumInfo.cover_big || albumInfo.cover_medium || null;
    const albumId = albumInfo.id;

    const tracksRes = await fetch(`/api/deezer/album/${albumId}/tracks`);
    if (!tracksRes.ok) return { tracklistMap, artworkUrl };
    const tracksData = await tracksRes.json();
    const tracks = tracksData.data || [];

    // Parallel fetch detailed track info to resolve contributors/features
    const trackDetails = await Promise.all(
      tracks.map(async (t) => {
        try {
          const detailRes = await fetch(`/api/deezer/track/${t.id}`);
          if (detailRes.ok) {
            return await detailRes.json();
          }
        } catch (err) {
          // Fallback to basic info
        }
        return t;
      })
    );

    trackDetails.forEach(t => {
      let finalT = smartTitleCase(t.title || '');
      let finalA = t.artist?.name || artist;

      // Extract features from contributors
      if (t.contributors && t.contributors.length > 1) {
        const mainArtist = t.artist?.name || artist;
        const feats = t.contributors
          .filter(c => c.name.toLowerCase() !== mainArtist.toLowerCase())
          .map(c => c.name);

        if (feats.length > 0) {
          finalT = `${finalT} (feat. ${feats.join(' & ')})`;
          finalA = `${mainArtist} & ${feats.join(' & ')}`;
        }
      }

      const key = t.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const shortKey = (t.title_short || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const trackInfo = {
        title: finalT,
        trackNumber: String(t.track_position || ''),
        artist: finalA
      };
      tracklistMap.set(key, trackInfo);
      if (shortKey && !tracklistMap.has(shortKey)) tracklistMap.set(shortKey, trackInfo);
    });
  } catch (err) {
    console.warn('fetchAlbumContext failed:', err);
  }

  return { tracklistMap, artworkUrl };
}
