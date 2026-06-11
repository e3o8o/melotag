#!/usr/bin/env node

/**
 * MeloTag CLI Tagger
 * Usage: node tagger.js <file-or-folder-path> [--artist "Artist"] [--album "Album"] [--no-rename]
 */

const fs = require('fs');
const path = require('path');
const NodeID3 = require('node-id3');

// ANSI escape codes for beautiful terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  dim: "\x1b[2m"
};

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log(`
${colors.bright}${colors.yellow}MeloTag CLI Tagger${colors.reset}
Clean promo tags, fetch metadata/covers, and organize files in-place.

${colors.bright}Usage:${colors.reset}
  node tagger.js <file-or-folder-path> [options]

${colors.bright}Options:${colors.reset}
  --artist "Artist Name"   Override or force a specific artist name
  --album "Album Name"     Override or force a specific album name
  --no-rename              Keep original filenames (don't rename to 'Track - Title.mp3')
  --help, -h               Show this help screen

${colors.bright}Example:${colors.reset}
  node tagger.js "/Users/elemoghenekaro/Downloads/Fola-Catharsis-Album"
  node tagger.js "/Users/elemoghenekaro/Downloads/song.mp3" --artist "Fola" --album "Catharsis"
`);
  process.exit(0);
}

const targetPath = path.resolve(args[0]);

// Parse optional overrides
const artistIndex = args.indexOf('--artist');
const albumIndex = args.indexOf('--album');
const forceArtist = artistIndex !== -1 ? args[artistIndex + 1] : null;
const forceAlbum = albumIndex !== -1 ? args[albumIndex + 1] : null;
const shouldRename = !args.includes('--no-rename');

// Clean promo keywords from text (prefixes, suffixes, domains, bracket-wrapped tags)
function cleanText(text) {
  if (!text) return "";
  const promos = [
    // Full domain variants
    /xtooxclusive\.com/gi, /tooxclusive\.com/gi, /notjustok\.com/gi,
    /mp3bullet\.ng/gi, /waploaded\.com/gi, /naijaloaded\.com/gi,
    /9jaflaver\.com/gi, /fakaza\.com/gi, /djitunez\.com/gi,
    /ghkwaku\.com/gi, /freshpilot\.com/gi, /zamusic\.com/gi,
    /mdundo\.com/gi, /boomplay\.com/gi,

    // Brand names without TLD
    /xtooxclusive/gi, /tooxclusive/gi, /notjustok/gi, /mp3bullet/gi,
    /waploaded/gi, /naijaloaded/gi, /9jaflaver/gi, /djitunez/gi,
    /ghkwaku/gi, /freshpilot/gi, /fakaza/gi, /zamusic/gi,

    // Partial suffix variants: xclusive, xclusivez, xclusives
    /\bxclusiv(?:e|es|ez)?\b/gi,

    // Generic promotional phrases
    /\bfree\s*mp3\b/gi, /\bdownload\b/gi, /\bpromo\b/gi, /\bexclusive\b/gi,

    // Bracket/paren-wrapped promo tags — e.g. "[XclusivePromo]", "(Waploaded.com)"
    /[\[(][^\]()]*(?:xclusive|promo|download|waploaded|naijaloaded|tooxclusive|notjustok|mp3)[^\]()]*[\])]/gi,
  ];
  let cleaned = text;
  promos.forEach(promo => { cleaned = cleaned.replace(promo, ""); });
  // Remove empty brackets left behind
  cleaned = cleaned.replace(/\s*\[\s*\]\s*/g, "").replace(/\s*\(\s*\)\s*/g, "");
  // Clean trailing/leading separators
  cleaned = cleaned.replace(/\s*[-_|]\s*$/, "").replace(/^\s*[-_|]\s*/, "");
  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

// Smart title-case: only fixes all-lowercase or all-uppercase strings
// Leaves mixed-case (stylized names) alone
// Skips short words: a, an, the, of, in, on, at, to, for, but, and, or, nor
const LOWERCASE_WORDS = new Set(['a','an','the','of','in','on','at','to','for','but','and','or','nor','is','as','by']);
function smartTitleCase(text) {
  if (!text) return text;
  const stripped = text.replace(/[^a-zA-Z]/g, '');
  if (stripped.length === 0) return text;
  const lower = stripped === stripped.toLowerCase();
  const upper = stripped === stripped.toUpperCase();
  if (!lower && !upper) return text; // already mixed-case, respect it
  return text.split(/(\s+)/).map((word, i) => {
    const clean = word.toLowerCase();
    if (/\s/.test(word)) return word;
    // Always capitalize first and last word
    if (i === 0 || LOWERCASE_WORDS.has(clean) === false) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    return clean;
  }).join('');
}

// Clean filename to extract track number, title, and features
function parseFilename(filename, inferredArtist) {
  let name = path.parse(filename).name;
  
  // Replace underscores and hyphens with spaces for better query parsing
  name = name.replace(/[-_]+/g, " ");
  name = cleanText(name);

  // Match leading track numbers: "01 Title"
  const match = name.match(/^(\d+)\s*(.*)$/);
  let trackNum = "";
  let title = name;

  if (match) {
    trackNum = match[1];
    title = match[2].trim();
  }

  // Remove leading artist name if present (e.g. "Fola Caricature" -> "Caricature")
  if (inferredArtist && title.toLowerCase().startsWith(inferredArtist.toLowerCase())) {
    title = title.substring(inferredArtist.length).trim();
  }

  // Clean leading symbols
  title = title.replace(/^[\s\.\-_]+/, "").trim();

  // If the title starts with "ft" or "feat", parse the featured artist and base title
  let featuredArtist = "";
  if (title.toLowerCase().startsWith("ft ") || title.toLowerCase().startsWith("feat ")) {
    const ftMatch = title.match(/^(?:ft|feat)\s+(.+?)\s+(.+)$/i);
    if (ftMatch) {
      featuredArtist = ftMatch[1].trim();
      title = ftMatch[2].trim();
      
      // Capitalize featured artist name nicely
      featuredArtist = featuredArtist.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    }
  }

  return { trackNum, title, featuredArtist };
}

// Calculate similarity score between query artist/album and candidate artist/album
function calculateAlbumScore(queryArtist, queryAlbum, matchArtist, matchAlbum) {
  const clean = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const qa = clean(queryArtist);
  const qb = clean(queryAlbum);
  const ma = clean(matchArtist);
  const mb = clean(matchAlbum);

  if (!qa && !qb) return 0;

  // Exact matching
  const exactArtist = qa === ma;
  const exactAlbum = qb === mb;
  if (exactArtist && exactAlbum) return 1.0;

  // Substring matching
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

// Search iTunes, Deezer, and MusicBrainz for candidate albums
async function searchAlbumAcrossSources(artist, album) {
  const query = `${artist} ${album}`.trim();
  const results = [];

  // 1. iTunes Search
  const itunesPromise = (async () => {
    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=3`, {
        headers: { 'User-Agent': 'MeloTag/1.0' }
      });
      if (res.ok) {
        const data = await res.json();
        (data.results || []).forEach(item => {
          const score = calculateAlbumScore(artist, album, item.artistName, item.collectionName);
          const coverUrl = item.artworkUrl100 ? item.artworkUrl100.replace('/100x100bb.jpg', '/1000x1000bb.jpg') : '';
          results.push({
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
      const res = await fetch(`https://api.deezer.com/search/album?q=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': 'MeloTag/1.0' }
      });
      if (res.ok) {
        const data = await res.json();
        (data.data || []).slice(0, 3).forEach(item => {
          const score = calculateAlbumScore(artist, album, item.artist?.name, item.title);
          const coverUrl = item.cover_xl || item.cover_big || item.cover;
          results.push({
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
      const url = `https://musicbrainz.org/ws/2/release?query=${encodeURIComponent(query)}&fmt=json&limit=3`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'MeloTag/1.0 (https://melotag.app)' }
      });
      if (res.ok) {
        const data = await res.json();
        (data.releases || []).forEach(item => {
          const artistName = (item['artist-credit'] || []).map(ac => ac.name || '').join(' ');
          const score = calculateAlbumScore(artist, album, artistName, item.title);
          results.push({
            source: 'MusicBrainz',
            id: item.id,
            artist: artistName,
            album: item.title || '',
            coverUrl: `https://coverartarchive.org/release/${item.id}/front`,
            score,
            genre: '',
            year: item.date ? item.date.substring(0, 4) : ''
          });
        });
      }
    } catch (e) {}
  })();

  await Promise.allSettled([itunesPromise, deezerPromise, mbPromise]);

  results.sort((a, b) => b.score - a.score);
  return results;
}

// Search track metadata across iTunes, Deezer, and MusicBrainz (for single file mode)
async function fetchTrackMetadata(artist, title) {
  const query = `${artist || ''} ${title}`.trim();
  const candidates = [];

  // 1. iTunes Song Search
  const itunesPromise = (async () => {
    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=3`, {
        headers: { 'User-Agent': 'MeloTag/1.0' }
      });
      if (res.ok) {
        const data = await res.json();
        (data.results || []).forEach(item => {
          candidates.push({
            source: 'iTunes',
            title: item.trackName || '',
            artist: item.artistName || '',
            album: item.collectionName || '',
            trackNumber: String(item.trackNumber || ''),
            genre: item.primaryGenreName || '',
            year: item.releaseDate ? item.releaseDate.substring(0, 4) : '',
            coverUrl: item.artworkUrl100 ? item.artworkUrl100.replace('/100x100bb.jpg', '/1000x1000bb.jpg') : '',
            score: calculateAlbumScore(artist || item.artistName || '', title, item.artistName, item.trackName)
          });
        });
      }
    } catch (e) {}
  })();

  // 2. Deezer Track Search
  const deezerPromise = (async () => {
    try {
      const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': 'MeloTag/1.0' }
      });
      if (res.ok) {
        const data = await res.json();
        (data.data || []).slice(0, 3).forEach(item => {
          const coverUrl = item.album?.cover_xl || item.album?.cover_big || item.album?.cover_medium || '';
          candidates.push({
            source: 'Deezer',
            title: item.title || '',
            artist: item.artist?.name || '',
            album: item.album?.title || '',
            trackNumber: '',
            genre: '',
            year: '',
            coverUrl,
            score: calculateAlbumScore(artist || item.artist?.name || '', title, item.artist?.name, item.title)
          });
        });
      }
    } catch (e) {}
  })();

  // 3. MusicBrainz Recording Search
  const mbPromise = (async () => {
    try {
      const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=3`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'MeloTag/1.0 (https://melotag.app)' }
      });
      if (res.ok) {
        const data = await res.json();
        const recordings = data.recordings || [];
        for (const rec of recordings) {
          const artistCredit = rec['artist-credit'] || [];
          const artistName = artistCredit.map(ac => ac.name || '').join(' ');
          const firstRelease = rec.releases?.[0] || {};
          const albumTitle = firstRelease.title || '';
          const releaseMbid = firstRelease.id || '';

          candidates.push({
            source: 'MusicBrainz',
            title: rec.title || '',
            artist: artistName,
            album: albumTitle,
            trackNumber: '',
            genre: '',
            year: firstRelease.date ? firstRelease.date.substring(0, 4) : '',
            coverUrl: releaseMbid ? `https://coverartarchive.org/release/${releaseMbid}/front` : '',
            score: calculateAlbumScore(artist || artistName, title, artistName, rec.title)
          });
        }
      }
    } catch (e) {}
  })();

  await Promise.allSettled([itunesPromise, deezerPromise, mbPromise]);

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

// Fetch tracklist from a specific candidate album
async function fetchTracklist(candidate) {
  const tracklistMap = new Map();
  let metadataOverride = {
    genre: candidate.genre || '',
    year: candidate.year || ''
  };

  if (candidate.source === 'iTunes') {
    try {
      const res = await fetch(`https://itunes.apple.com/lookup?id=${candidate.id}&entity=song`);
      if (res.ok) {
        const data = await res.json();
        const tracks = (data.results || []).filter(r => r.wrapperType === 'track' && r.kind === 'song');
        tracks.forEach(t => {
          let title = smartTitleCase(t.trackName || '');
          let artist = t.artistName || candidate.artist;
          
          const key = (t.trackName || '').toLowerCase().replace(/[^a-z0-9]/g, "");
          const cleanTitle = (t.trackName || '').split(/\b(?:ft|feat|featuring)\b/i)[0].trim();
          const shortKey = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, "");

          const trackInfo = {
            title,
            artist,
            trackNumber: String(t.trackNumber)
          };
          tracklistMap.set(key, trackInfo);
          if (shortKey && !tracklistMap.has(shortKey)) {
            tracklistMap.set(shortKey, trackInfo);
          }
        });
      }
    } catch (e) {
      console.warn(`[iTunes] Tracklist fetch failed:`, e.message);
    }
  } else if (candidate.source === 'Deezer') {
    try {
      const res = await fetch(`https://api.deezer.com/album/${candidate.id}/tracks`);
      if (res.ok) {
        const data = await res.json();
        const tracks = data.data || [];
        // Parallel fetch details
        const trackDetails = await Promise.all(
          tracks.map(async (t) => {
            try {
              const dRes = await fetch(`https://api.deezer.com/track/${t.id}`);
              if (dRes.ok) return await dRes.json();
            } catch (err) {}
            return t;
          })
        );
        trackDetails.forEach(t => {
          let title = smartTitleCase(t.title || '');
          let artist = t.artist?.name || candidate.artist;

          if (t.contributors && t.contributors.length > 1) {
            const mainArtist = t.artist?.name || candidate.artist;
            const feats = t.contributors
              .filter(c => c.name.toLowerCase() !== mainArtist.toLowerCase())
              .map(c => c.name);
            
            if (feats.length > 0) {
              title = `${title} (feat. ${feats.join(' & ')})`;
              artist = `${mainArtist} & ${feats.join(' & ')}`;
            }
          }

          const key = (t.title || '').toLowerCase().replace(/[^a-z0-9]/g, "");
          const shortKey = (t.title_short || '').toLowerCase().replace(/[^a-z0-9]/g, "");

          const trackInfo = {
            title,
            artist,
            trackNumber: String(t.track_position)
          };
          tracklistMap.set(key, trackInfo);
          if (shortKey && !tracklistMap.has(shortKey)) {
            tracklistMap.set(shortKey, trackInfo);
          }
        });
      }
    } catch (e) {
      console.warn(`[Deezer] Tracklist fetch failed:`, e.message);
    }
  } else if (candidate.source === 'MusicBrainz') {
    try {
      const url = `https://musicbrainz.org/ws/2/release/${candidate.id}?inc=recordings+artist-credits&fmt=json`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'MeloTag/1.0 (https://melotag.app)' }
      });
      if (res.ok) {
        const data = await res.json();
        const media = data.media || [];
        const tracks = media[0]?.tracks || [];
        tracks.forEach(t => {
          let title = smartTitleCase(t.title || '');
          
          let artistStr = '';
          const credits = t['artist-credit'] || [];
          credits.forEach(ac => {
            artistStr += ac.name;
            if (ac.joinphrase) {
              artistStr += ac.joinphrase;
            }
          });
          artistStr = artistStr.trim();
          let artist = artistStr || candidate.artist;

          const mainArtistName = credits[0]?.name || candidate.artist;
          const feats = credits
            .slice(1)
            .map(ac => ac.artist?.name || ac.name)
            .filter(name => name.toLowerCase() !== mainArtistName.toLowerCase());

          if (feats.length > 0 && !title.toLowerCase().includes('feat')) {
            title = `${title} (feat. ${feats.join(' & ')})`;
            artist = `${mainArtistName} & ${feats.join(' & ')}`;
          }

          const key = (t.title || '').toLowerCase().replace(/[^a-z0-9]/g, "");
          const trackInfo = {
            title,
            artist,
            trackNumber: String(t.number)
          };
          tracklistMap.set(key, trackInfo);
        });
      }
    } catch (e) {
      console.warn(`[MusicBrainz] Tracklist fetch failed:`, e.message);
    }
  }

  return { tracklistMap, metadataOverride };
}

// Download cover artwork buffer
async function downloadArtwork(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'MeloTag/1.0' } });
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mime = res.headers.get('content-type') || 'image/jpeg';
      return { buffer, mime };
    }
  } catch (err) {
    // Fail silently
  }
  return null;
}

// Infer Album and Artist from folder name (e.g., "Fola-Catharsis-Album")
function inferFromFolderName(folderName) {
  const parts = folderName.split(/[-_]+/);
  let artist = "";
  let album = "";

  if (parts.length >= 2) {
    artist = parts[0].trim();
    album = parts.slice(1).join(" ").replace(/album/gi, "").trim();
  } else {
    album = folderName.replace(/album/gi, "").trim();
  }

  return {
    artist: cleanText(artist),
    album: cleanText(album)
  };
}

// Main processing logic
async function processFile(filepath, inferredArtist, inferredAlbum, albumArtwork, tracklistMap, globalMetadata) {
  const filename = path.basename(filepath);
  const { trackNum, title, featuredArtist } = parseFilename(filename, inferredArtist);

  let finalTitle = featuredArtist ? `${title} (feat. ${featuredArtist})` : title;
  let finalArtist = forceArtist || inferredArtist || "Unknown Artist";
  if (featuredArtist && !forceArtist) {
    finalArtist = `${inferredArtist} & ${featuredArtist}`;
  }
  
  let finalAlbum = forceAlbum || inferredAlbum || "Unknown Album";
  let finalTrack = trackNum;
  let finalYear = globalMetadata?.year || "2025";
  let finalGenre = globalMetadata?.genre || "Afrobeats";
  let artwork = albumArtwork;

  console.log(`\n${colors.bright}${colors.blue}➜ Processing:${colors.reset} ${filename}`);
  
  // Try matching with official tracklist first
  const baseTitleClean = title.split(/\b(?:ft|feat|featuring)\b/i)[0].trim();
  const normKey = baseTitleClean.toLowerCase().replace(/[^a-z0-9]/g, "");
  const fullNormKey = title.toLowerCase().replace(/[^a-z0-9]/g, "");
  let matchedOfficial = false;

  if (tracklistMap && tracklistMap.has(normKey)) {
    const official = tracklistMap.get(normKey);
    console.log(`  ${colors.green}✓ Matched official album tracklist! (${official.title})${colors.reset}`);
    finalTitle = smartTitleCase(official.title);
    finalArtist = official.artist;
    finalTrack = official.trackNumber;
    matchedOfficial = true;
  } else if (tracklistMap) {
    for (const [key, official] of tracklistMap.entries()) {
      if (key.length >= 4 && (fullNormKey.includes(key) || key.includes(fullNormKey))) {
        console.log(`  ${colors.green}✓ Matched official album tracklist via substring! (${official.title})${colors.reset}`);
        finalTitle = smartTitleCase(official.title);
        finalArtist = official.artist;
        finalTrack = official.trackNumber;
        matchedOfficial = true;
        break;
      }
    }
  }

  // Fetch from unified sources as fallback
  if (!matchedOfficial) {
    const candidates = await fetchTrackMetadata(inferredArtist, title);
    if (candidates.length > 0) {
      const metadata = candidates[0];
      console.log(`  ${colors.green}✓ Matches ${metadata.source} database! (Score: ${metadata.score.toFixed(2)})${colors.reset}`);
      finalTitle = metadata.title || finalTitle;
      finalArtist = metadata.artist || finalArtist;
      
      if (!inferredAlbum) {
        finalAlbum = metadata.album || finalAlbum;
      }
      
      if (metadata.trackNumber) {
        finalTrack = metadata.trackNumber;
      }
      if (metadata.genre) {
        finalGenre = metadata.genre;
      }
      if (metadata.year) {
        finalYear = metadata.year;
      }

      if (!artwork) {
        const goodTrackCandidates = candidates.filter(c => c.score >= 0.8);
        const artPriority = { 'MusicBrainz': 3, 'iTunes': 2, 'Deezer': 1 };
        goodTrackCandidates.sort((a, b) => (artPriority[b.source] || 0) - (artPriority[a.source] || 0));

        for (const cand of goodTrackCandidates) {
          if (cand.coverUrl) {
            console.log(`  ${colors.cyan}⬇ Downloading cover art from ${cand.source}...${colors.reset}`);
            const art = await downloadArtwork(cand.coverUrl);
            if (art) {
              artwork = art;
              break;
            }
          }
        }
      }
    }
  }

  // Force clean promo names from all tags
  finalTitle = smartTitleCase(cleanText(finalTitle));
  finalArtist = cleanText(finalArtist);
  finalAlbum = smartTitleCase(cleanText(finalAlbum));

  const tags = {
    title: finalTitle,
    artist: finalArtist,
    album: finalAlbum,
    performerInfo: forceArtist || inferredArtist || finalArtist, // Album Artist
    trackNumber: finalTrack,
    year: finalYear,
    genre: finalGenre
  };

  if (artwork) {
    tags.image = {
      mime: artwork.mime,
      type: { id: 3 }, // Front cover
      description: 'Cover',
      imageBuffer: artwork.buffer
    };
  }

  try {
    NodeID3.removeTags(filepath);

    const success = NodeID3.write(tags, filepath);
    if (success) {
      console.log(`  ${colors.green}✓ Tags saved: ${finalArtist} - ${finalTitle} [${finalAlbum}]${colors.reset}`);
      if (artwork) console.log(`  ${colors.green}✓ Cover art embedded successfully.${colors.reset}`);
    } else {
      console.warn(`  ${colors.red}✗ Failed writing tags to ${filename}${colors.reset}`);
    }

    if (shouldRename) {
      let mainArtist = forceArtist || inferredArtist || finalArtist;
      mainArtist = mainArtist.split(/\b(?:&|and|,)\b/i)[0].trim();
      let newFilename = `${mainArtist} - ${finalTitle}.mp3`;

      newFilename = newFilename.replace(/[\\/*?:"<>|]/g, "");
      const newFilepath = path.join(path.dirname(filepath), newFilename);

      if (filepath !== newFilepath) {
        fs.renameSync(filepath, newFilepath);
        console.log(`  ${colors.cyan}➜ Renamed file to: ${newFilename}${colors.reset}`);
      }
    }
  } catch (err) {
    console.error(`  ${colors.red}✗ Error writing tags: ${err.message}${colors.reset}`);
  }
}

async function main() {
  if (!fs.existsSync(targetPath)) {
    console.error(`${colors.red}Error: Path does not exist at ${targetPath}${colors.reset}`);
    process.exit(1);
  }

  const stats = fs.statSync(targetPath);

  if (stats.isFile()) {
    if (!targetPath.toLowerCase().endsWith('.mp3')) {
      console.error(`${colors.red}Error: Selected file is not an MP3 file.${colors.reset}`);
      process.exit(1);
    }
    console.log(`${colors.bright}${colors.cyan}MeloTag single file processor starting...${colors.reset}`);
    await processFile(targetPath, forceArtist || "", forceAlbum || "", null, null, null);
    console.log(`\n${colors.bright}${colors.green}✓ Finished tagging file!${colors.reset}\n`);

  } else if (stats.isDirectory()) {
    console.log(`${colors.bright}${colors.cyan}MeloTag folder processor starting...${colors.reset}`);
    
    const folderName = path.basename(targetPath);
    const inferred = inferFromFolderName(folderName);
    const inferredArtist = forceArtist || inferred.artist || "Unknown Artist";
    const inferredAlbum = forceAlbum || inferred.album || "Unknown Album";

    console.log(`Inferred Artist: ${colors.bright}${colors.yellow}${inferredArtist}${colors.reset}`);
    console.log(`Inferred Album:  ${colors.bright}${colors.yellow}${inferredAlbum}${colors.reset}`);

    const files = fs.readdirSync(targetPath).filter(f => f.toLowerCase().endsWith('.mp3'));
    if (files.length === 0) {
      console.log(`${colors.red}No MP3 files found in folder: ${targetPath}${colors.reset}`);
      return;
    }

    console.log(`Found ${files.length} tracks. Searching for album-wide metadata across iTunes, Deezer, and MusicBrainz...`);

    let albumArtwork = null;
    let tracklistMap = new Map();
    let resolvedArtist = inferredArtist;
    let resolvedAlbum = inferredAlbum;
    let globalMetadata = { year: '2025', genre: 'Afrobeats' };

    const candidates = await searchAlbumAcrossSources(inferredArtist, inferredAlbum);
    if (candidates.length > 0) {
      console.log(`\n${colors.bright}Found ${candidates.length} candidate albums:${colors.reset}`);
      candidates.slice(0, 5).forEach((cand, idx) => {
        console.log(`  [${idx + 1}] [${cand.source}] ${cand.artist} - ${cand.album} (Score: ${cand.score.toFixed(2)})`);
      });

      let matchedCandidate = null;
      for (const cand of candidates) {
        console.log(`\nAttempting to resolve tracklist using candidate [${cand.source}]...`);
        const { tracklistMap: tempMap, metadataOverride } = await fetchTracklist(cand);
        if (tempMap && tempMap.size > 0) {
          tracklistMap = tempMap;
          matchedCandidate = cand;
          resolvedArtist = forceArtist || cand.artist || inferredArtist;
          resolvedAlbum = forceAlbum || cand.album || inferredAlbum;
          if (metadataOverride.year) globalMetadata.year = metadataOverride.year;
          if (metadataOverride.genre) globalMetadata.genre = metadataOverride.genre;
          console.log(`${colors.green}✓ Successfully resolved tracklist (${tracklistMap.size} tracks) from ${cand.source}!${colors.reset}`);
          break;
        } else {
          console.log(`${colors.yellow}⚠ No tracks resolved from ${cand.source}, trying next candidate...${colors.reset}`);
        }
      }

      // Download the highest-quality cover art among matching candidates
      const goodCandidates = candidates.filter(c => c.score >= 0.7);
      const artPriority = { 'MusicBrainz': 3, 'iTunes': 2, 'Deezer': 1 };
      goodCandidates.sort((a, b) => (artPriority[b.source] || 0) - (artPriority[a.source] || 0));

      for (const cand of goodCandidates) {
        if (cand.coverUrl) {
          console.log(`Attempting to download cover art from ${cand.source}: ${cand.coverUrl}`);
          const art = await downloadArtwork(cand.coverUrl);
          if (art) {
            albumArtwork = art;
            console.log(`${colors.green}✓ Downloaded cover art from ${cand.source}.${colors.reset}`);
            break;
          }
        }
      }
    } else {
      console.log(`${colors.yellow}No album matches found across any API sources.${colors.reset}`);
    }

    // Process all MP3 files
    for (const filename of files.sort()) {
      const filepath = path.join(targetPath, filename);
      await processFile(filepath, resolvedArtist, resolvedAlbum, albumArtwork, tracklistMap, globalMetadata);
    }

    console.log(`\n${colors.bright}${colors.green}✓ Finished tagging all ${files.length} files in folder!${colors.reset}\n`);
  }
}

main();
