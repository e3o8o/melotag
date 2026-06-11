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
// Calculate similarity score between query artist/album and candidate artist/album
function calculateAlbumScore(queryArtist, queryAlbum, matchArtist, matchAlbum) {
  const clean = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const qa = clean(queryArtist);
  const qb = clean(queryAlbum);
  const ma = clean(matchArtist);
  const mb = clean(matchAlbum);

  if (!qa && !qb) return 0;

  const exactArtist = qa === ma;
  const exactAlbum = qb === mb;
  if (exactArtist && exactAlbum) return 1.0;

  const artistSub = qa && ma ? (qa.includes(ma) || ma.includes(qa)) : false;
  const albumSub = qb && mb ? (qb.includes(mb) || mb.includes(qb)) : false;

  let artistScore = 0;
  if (exactArtist) artistScore = 1.0;
  else if (artistSub) artistScore = 0.8;
  else artistScore = 0.2;

  let albumScore = 0;
  if (exactAlbum) albumScore = 1.0;
  else if (albumSub) albumScore = 0.8;
  else albumScore = 0.2;

  return artistScore * 0.5 + albumScore * 0.5;
}

// --- Album Context Fetch (iTunes + Deezer + MusicBrainz) ---
export async function fetchAlbumContext(artist, album) {
  const tracklistMap = new Map();
  let artworkUrl = null;
  let resolvedArtist = artist;
  let resolvedAlbum = album;
  let year = '';
  let genre = '';
  
  const query = `${artist} ${album}`.trim();
  if (!query) return { tracklistMap, artworkUrl, resolvedArtist, resolvedAlbum, year, genre };

  const candidates = [];

  // 1. iTunes Search
  const itunesPromise = (async () => {
    try {
      const res = await fetch(`/api/itunes/search?term=${encodeURIComponent(query)}&entity=album&limit=3`);
      if (res.ok) {
        const data = await res.json();
        (data.results || []).forEach(item => {
          const score = calculateAlbumScore(artist, album, item.artistName, item.collectionName);
          const coverUrl = item.artworkUrl100 ? item.artworkUrl100.replace('/100x100bb.jpg', '/1000x1000bb.jpg') : '';
          candidates.push({
            source: 'iTunes',
            id: String(item.collectionId),
            artist: item.artistName || '',
            album: item.collectionName || '',
            coverUrl,
            score,
            genre: item.primaryGenreName || '',
            year: item.releaseDate ? item.releaseDate.substring(0, 4) : ''
          });
        });
      }
    } catch (e) {}
  })();

  // 2. Deezer Search
  const deezerPromise = (async () => {
    try {
      const res = await fetch(`/api/deezer/search/album?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        (data.data || []).slice(0, 3).forEach(item => {
          const score = calculateAlbumScore(artist, album, item.artist?.name, item.title);
          const coverUrl = item.cover_xl || item.cover_big || item.cover;
          candidates.push({
            source: 'Deezer',
            id: String(item.id),
            artist: item.artist?.name || '',
            album: item.title || '',
            coverUrl,
            score,
            genre: '',
            year: ''
          });
        });
      }
    } catch (e) {}
  })();

  // 3. MusicBrainz Search
  const mbPromise = (async () => {
    try {
      const url = `/api/musicbrainz/ws/2/release?query=${encodeURIComponent(query)}&fmt=json&limit=3`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'MeloTag/1.0 (https://melotag.app)' }
      });
      if (res.ok) {
        const data = await res.json();
        (data.releases || []).forEach(item => {
          const artistName = (item['artist-credit'] || []).map(ac => ac.name || '').join(' ');
          const score = calculateAlbumScore(artist, album, artistName, item.title);
          candidates.push({
            source: 'MusicBrainz',
            id: item.id,
            artist: artistName,
            album: item.title || '',
            coverUrl: `/api/coverart/release/${item.id}/front`,
            score,
            genre: '',
            year: item.date ? item.date.substring(0, 4) : ''
          });
        });
      }
    } catch (e) {}
  })();

  await Promise.allSettled([itunesPromise, deezerPromise, mbPromise]);

  candidates.sort((a, b) => b.score - a.score);

  if (candidates.length > 0) {
    // Attempt to resolve tracklist
    for (const cand of candidates) {
      if (cand.source === 'iTunes') {
        try {
          const res = await fetch(`/api/itunes/lookup?id=${cand.id}&entity=song`);
          if (res.ok) {
            const data = await res.json();
            const tracks = (data.results || []).filter(r => r.wrapperType === 'track' && r.kind === 'song');
            if (tracks.length > 0) {
              tracks.forEach(t => {
                let title = smartTitleCase(t.trackName || '');
                let artistVal = t.artistName || cand.artist;
                
                // Reconcile features if artistName contains multiple artists but trackName does not
                const albumArtist = cand.artist || '';
                if (artistVal && !title.toLowerCase().includes('feat') && !title.toLowerCase().includes('ft')) {
                  const mainArtistWords = albumArtist.toLowerCase().split(/\s+/);
                  const artists = artistVal.split(/&|,|\band\b/i).map(s => s.trim());
                  const feats = artists.filter(a => {
                    const aWords = a.toLowerCase().split(/\s+/);
                    return !aWords.every(w => mainArtistWords.includes(w));
                  });
                  if (feats.length > 0) {
                    title = `${title} (feat. ${feats.join(' & ')})`;
                  }
                }
                
                const key = (t.trackName || '').toLowerCase().replace(/[^a-z0-9]/g, "");
                const cleanTitle = (t.trackName || '').split(/\b(?:ft|feat|featuring)\b/i)[0].trim();
                const shortKey = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, "");

                const trackInfo = {
                  title,
                  artist: artistVal,
                  trackNumber: String(t.trackNumber)
                };
                tracklistMap.set(key, trackInfo);
                if (shortKey && !tracklistMap.has(shortKey)) {
                  tracklistMap.set(shortKey, trackInfo);
                }
              });
              resolvedArtist = cand.artist || resolvedArtist;
              resolvedAlbum = cand.album || resolvedAlbum;
              if (cand.year) year = cand.year;
              if (cand.genre) genre = cand.genre;
              break;
            }
          }
        } catch (e) {}
      } else if (cand.source === 'Deezer') {
        try {
          const res = await fetch(`/api/deezer/album/${cand.id}/tracks`);
          if (res.ok) {
            const data = await res.json();
            const tracks = data.data || [];
            if (tracks.length > 0) {
              const trackDetails = await Promise.all(
                tracks.map(async (t) => {
                  try {
                    const dRes = await fetch(`/api/deezer/track/${t.id}`);
                    if (dRes.ok) return await dRes.json();
                  } catch (err) {}
                  return t;
                })
              );
              trackDetails.forEach(t => {
                let title = smartTitleCase(t.title || '');
                let artistVal = t.artist?.name || cand.artist;

                if (t.contributors && t.contributors.length > 1) {
                  const mainArtist = t.artist?.name || cand.artist;
                  const feats = t.contributors
                    .filter(c => c.name.toLowerCase() !== mainArtist.toLowerCase())
                    .map(c => c.name);
                  
                  if (feats.length > 0) {
                    title = `${title} (feat. ${feats.join(' & ')})`;
                    artistVal = `${mainArtist} & ${feats.join(' & ')}`;
                  }
                }

                const key = (t.title || '').toLowerCase().replace(/[^a-z0-9]/g, "");
                const shortKey = (t.title_short || '').toLowerCase().replace(/[^a-z0-9]/g, "");

                const trackInfo = {
                  title,
                  artist: artistVal,
                  trackNumber: String(t.track_position)
                };
                tracklistMap.set(key, trackInfo);
                if (shortKey && !tracklistMap.has(shortKey)) {
                  tracklistMap.set(shortKey, trackInfo);
                }
              });
              resolvedArtist = cand.artist || resolvedArtist;
              resolvedAlbum = cand.album || resolvedAlbum;
              break;
            }
          }
        } catch (e) {}
      } else if (cand.source === 'MusicBrainz') {
        try {
          const res = await fetch(`/api/musicbrainz/ws/2/release/${cand.id}?inc=recordings+artist-credits&fmt=json`);
          if (res.ok) {
            const data = await res.json();
            const media = data.media || [];
            const tracks = media[0]?.tracks || [];
            if (tracks.length > 0) {
              tracks.forEach(t => {
                let title = smartTitleCase(t.title || '');
                let artistStr = '';
                const credits = t['artist-credit'] || [];
                credits.forEach(ac => {
                  artistStr += ac.name;
                  if (ac.joinphrase) artistStr += ac.joinphrase;
                });
                artistStr = artistStr.trim();
                let artistVal = artistStr || cand.artist;

                const mainArtistName = credits[0]?.name || cand.artist;
                const feats = credits
                  .slice(1)
                  .map(ac => ac.artist?.name || ac.name)
                  .filter(name => name.toLowerCase() !== mainArtistName.toLowerCase());

                if (feats.length > 0 && !title.toLowerCase().includes('feat')) {
                  title = `${title} (feat. ${feats.join(' & ')})`;
                  artistVal = `${mainArtistName} & ${feats.join(' & ')}`;
                }

                const key = (t.title || '').toLowerCase().replace(/[^a-z0-9]/g, "");
                tracklistMap.set(key, {
                  title,
                  artist: artistVal,
                  trackNumber: String(t.number)
                });
              });
              resolvedArtist = cand.artist || resolvedArtist;
              resolvedAlbum = cand.album || resolvedAlbum;
              if (cand.year) year = cand.year;
              break;
            }
          }
        } catch (e) {}
      }
    }

    // Select cover art
    const goodCandidates = candidates.filter(c => c.score >= 0.7);
    const artPriority = { 'MusicBrainz': 3, 'iTunes': 2, 'Deezer': 1 };
    goodCandidates.sort((a, b) => (artPriority[b.source] || 0) - (artPriority[a.source] || 0));

    for (const cand of goodCandidates) {
      if (cand.coverUrl) {
        try {
          const imgRes = await fetch(cand.coverUrl, { method: 'HEAD' });
          if (imgRes.ok) {
            artworkUrl = cand.coverUrl;
            break;
          }
        } catch (e) {
          artworkUrl = cand.coverUrl;
          break;
        }
      }
    }
  }

  return { tracklistMap, artworkUrl, resolvedArtist, resolvedAlbum, year, genre };
}
