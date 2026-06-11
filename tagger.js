#!/usr/bin/env node

/**
 * MeloTag CLI Tagger
 * Usage: node tagger.js <file-or-folder-path> [--artist "Artist"] [--album "Album"] [--no-rename]
 */

const fs = require('fs');
const path = require('path');
const NodeID3 = require('node-id3');
const { execSync } = require('child_process');

let ffmpegCmd = 'ffmpeg';
let ffprobeCmd = 'ffprobe';

try {
  try {
    execSync('"/opt/homebrew/bin/ffmpeg" -version', { stdio: 'ignore' });
    ffmpegCmd = '/opt/homebrew/bin/ffmpeg';
  } catch (e) {
    execSync('ffmpeg -version', { stdio: 'ignore' });
  }
} catch (e) {}

try {
  try {
    execSync('"/opt/homebrew/bin/ffprobe" -version', { stdio: 'ignore' });
    ffprobeCmd = '/opt/homebrew/bin/ffprobe';
  } catch (e) {
    execSync('ffprobe -version', { stdio: 'ignore' });
  }
} catch (e) {}

// Check if ffmpeg and ffprobe are available
function checkFfmpegDependency() {
  try {
    execSync(`"${ffmpegCmd}" -version`, { stdio: 'ignore' });
    execSync(`"${ffprobeCmd}" -version`, { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

// Read metadata tags from either MP3 or M4A files
function readTags(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  if (ext === '.m4a') {
    try {
      const cmd = `"${ffprobeCmd}" -v quiet -print_format json -show_format -show_streams "${filepath}"`;
      const output = execSync(cmd, { encoding: 'utf8' });
      const info = JSON.parse(output);
      const tags = info.format?.tags || {};
      const hasArtwork = (info.streams || []).some(s => s.codec_type === 'video');
      return {
        title: tags.title || '',
        artist: tags.artist || '',
        album: tags.album || '',
        albumArtist: tags.album_artist || tags.artist || '',
        trackNumber: tags.track ? tags.track.split('/')[0] : '',
        year: tags.date ? tags.date.substring(0, 4) : '',
        genre: tags.genre || '',
        hasArtwork
      };
    } catch (err) {
      console.warn(`  [ffprobe] Failed to read M4A tags for ${path.basename(filepath)}: ${err.message}`);
      return {};
    }
  } else {
    try {
      const tags = NodeID3.read(filepath) || {};
      return {
        title: tags.title || '',
        artist: tags.artist || '',
        album: tags.album || '',
        albumArtist: tags.performerInfo || tags.artist || '',
        trackNumber: tags.trackNumber || '',
        year: tags.year || '',
        genre: tags.genre || '',
        hasArtwork: !!tags.image
      };
    } catch (err) {
      return {};
    }
  }
}

// Write tags (and optionally artwork) to either MP3 or M4A files
function writeTags(filepath, tags, artwork) {
  const ext = path.extname(filepath).toLowerCase();
  if (ext === '.m4a') {
    const tempOutput = filepath + '.temp.m4a';
    let cmd = `"${ffmpegCmd}" -y -i "${filepath}"`;
    let tempArtFile = null;
    let inputs = 1;

    if (artwork && artwork.buffer) {
      const artExt = artwork.mime === 'image/png' ? '.png' : '.jpg';
      tempArtFile = filepath + '.temp_art' + artExt;
      fs.writeFileSync(tempArtFile, artwork.buffer);
      cmd += ` -i "${tempArtFile}"`;
      inputs = 2;
    }

    cmd += ' -map 0:a';
    if (inputs === 2) {
      cmd += ' -map 1 -c:v copy -disposition:v:0 attached_pic';
    } else {
      cmd += ' -map 0:v? -c:v copy';
    }

    cmd += ' -map_metadata -1 -c:a copy';

    if (tags.title !== undefined) cmd += ` -metadata title="${tags.title.replace(/"/g, '\\"')}"`;
    if (tags.artist !== undefined) cmd += ` -metadata artist="${tags.artist.replace(/"/g, '\\"')}"`;
    if (tags.album !== undefined) cmd += ` -metadata album="${tags.album.replace(/"/g, '\\"')}"`;
    if (tags.performerInfo !== undefined) cmd += ` -metadata album_artist="${tags.performerInfo.replace(/"/g, '\\"')}"`;
    if (tags.trackNumber !== undefined) cmd += ` -metadata track="${tags.trackNumber}"`;
    if (tags.year !== undefined) cmd += ` -metadata date="${tags.year}"`;
    if (tags.genre !== undefined) cmd += ` -metadata genre="${tags.genre.replace(/"/g, '\\"')}"`;

    cmd += ` "${tempOutput}"`;

    try {
      execSync(cmd, { stdio: 'ignore' });
      fs.renameSync(tempOutput, filepath);
      return true;
    } catch (err) {
      console.error(`  ${colors.red}✗ ffmpeg error writing tags: ${err.message}${colors.reset}`);
      if (fs.existsSync(tempOutput)) {
        try { fs.unlinkSync(tempOutput); } catch (e) {}
      }
      return false;
    } finally {
      if (tempArtFile && fs.existsSync(tempArtFile)) {
        try { fs.unlinkSync(tempArtFile); } catch (e) {}
      }
    }
  } else {
    try {
      let existingImage = null;
      try {
        const existing = NodeID3.read(filepath);
        if (existing && existing.image) {
          existingImage = existing.image;
        }
      } catch (e) {}

      NodeID3.removeTags(filepath);
      
      const id3Tags = { ...tags };
      if (artwork) {
        id3Tags.image = {
          mime: artwork.mime,
          type: { id: 3 },
          description: 'Cover',
          imageBuffer: artwork.buffer
        };
      } else if (existingImage) {
        id3Tags.image = existingImage;
      }
      return NodeID3.write(id3Tags, filepath);
    } catch (err) {
      console.error(`  ${colors.red}✗ NodeID3 error writing tags: ${err.message}${colors.reset}`);
      return false;
    }
  }
}

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
    /mdundo\.com/gi, /boomplay\.com/gi, /imack\.ng/gi,

    // Brand names without TLD
    /xtooxclusive/gi, /tooxclusive/gi, /notjustok/gi, /mp3bullet/gi,
    /waploaded/gi, /naijaloaded/gi, /9jaflaver/gi, /djitunez/gi,
    /ghkwaku/gi, /freshpilot/gi, /fakaza/gi, /zamusic/gi, /imack/gi,

    // Partial suffix variants: xclusive, xclusivez, xclusives
    /\bxclusiv(?:e|es|ez)?\b/gi,

    // Generic promotional phrases
    /\bfree\s*mp3\b/gi, /\bdownload\b/gi, /\bpromo\b/gi, /\bexclusive\b/gi,

    // Bracket/paren-wrapped promo tags — e.g. "[XclusivePromo]", "(Waploaded.com)"
    /[\[(][^\]()]*(?:xclusive|promo|download|waploaded|naijaloaded|tooxclusive|notjustok|mp3|imack)[^\]()]*[\])]/gi,
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

// Normalize unicode accents and convert to alphanumeric only lowercase key
function cleanKey(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
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

  // Match features in parenthesized/bracketed format or standalone in the title
  let featuredArtist = "";
  const parenFtRegex = /[\(\[]\s*\b(?:ft|feat|featuring)\b\.?\s+([^\)\]]+)[\)\]]/i;
  const ftRegex = /\b(?:ft|feat|featuring)\b\.?\s+(.+)$/i;

  let matchFt = title.match(parenFtRegex);
  if (matchFt) {
    featuredArtist = matchFt[1].trim();
    title = title.replace(parenFtRegex, "").trim();
  } else {
    matchFt = title.match(ftRegex);
    if (matchFt) {
      featuredArtist = matchFt[1].trim();
      title = title.replace(ftRegex, "").trim();
    }
  }

  // Clean title trailing symbols
  title = title.replace(/^[\s\.\-_]+|[\s\.\-_]+$/, "").trim();

  if (featuredArtist) {
    featuredArtist = smartTitleCase(featuredArtist);
  }

  return { trackNum, title, featuredArtist };
}

// Calculate similarity score between query artist/album and candidate artist/album
function calculateAlbumScore(queryArtist, queryAlbum, matchArtist, matchAlbum) {
  const clean = cleanKey;
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

// Levenshtein distance helper for fuzzy matching
function getEditDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function getSimilarity(a, b) {
  const distance = getEditDistance(a, b);
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1.0;
  return 1.0 - distance / maxLength;
}

// Calculate similarity score between query artist/title and candidate artist/title for tracks
function calculateTrackScore(queryArtist, queryTitle, matchArtist, matchTitle) {
  const clean = cleanKey;
  const qa = clean(queryArtist);
  const ma = clean(matchArtist);

  if (!queryTitle || !matchTitle) return 0;

  // Matching for artist
  const exactArtist = qa === ma;
  const artistSub = qa && ma ? (qa.includes(ma) || ma.includes(qa)) : false;
  let artistSimilarity = 0;
  if (qa && ma) {
    artistSimilarity = getSimilarity(qa, ma);
  }

  let artistScore = 0;
  if (exactArtist) artistScore = 1.0;
  else if (artistSub) artistScore = 0.8;
  else if (artistSimilarity >= 0.8) artistScore = 0.8;
  else artistScore = 0.2;

  // Reject track-level matches if a query artist is provided but doesn't match the candidate artist at all
  if (qa && artistScore === 0.2) {
    return 0;
  }

  // Tokenize titles to handle spelling differences and word additions/removals
  const tokenize = (str) => {
    return (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\band\b/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 0);
  };

  const qbClean = cleanKey(queryTitle);
  const mbClean = cleanKey(matchTitle);

  // Check exact/substring matching first
  const exactTitle = qbClean === mbClean;
  const titleSub = qbClean && mbClean ? (qbClean.includes(mbClean) || mbClean.includes(qbClean)) : false;

  let titleScore = 0;
  if (exactTitle) {
    titleScore = 1.0;
  } else if (titleSub) {
    titleScore = 0.9;
  } else {
    // Word/Token based similarity
    const qTokens = tokenize(queryTitle);
    const mTokens = tokenize(matchTitle);

    if (qTokens.length > 0 && mTokens.length > 0) {
      let matches = 0;
      for (const q of qTokens) {
        if (mTokens.includes(q)) {
          matches++;
        } else {
          for (const m of mTokens) {
            if (getSimilarity(q, m) >= 0.8) {
              matches++;
              break;
            }
          }
        }
      }

      const overlapQ = matches / qTokens.length;
      const overlapM = matches / mTokens.length;
      const tokenOverlap = Math.max(overlapQ, overlapM);

      if (tokenOverlap >= 0.75) {
        titleScore = 0.8;
      } else if (tokenOverlap >= 0.5) {
        titleScore = 0.6;
      } else {
        titleScore = 0.0;
      }
    } else {
      titleScore = 0.0;
    }
  }

  return titleScore * 0.7 + artistScore * 0.3;
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
            score: calculateTrackScore(artist || item.artistName || '', title, item.artistName, item.trackName)
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
            id: String(item.id),
            title: item.title || '',
            artist: item.artist?.name || '',
            album: item.album?.title || '',
            trackNumber: '',
            genre: '',
            year: '',
            coverUrl,
            score: calculateTrackScore(artist || item.artist?.name || '', title, item.artist?.name, item.title)
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
            score: calculateTrackScore(artist || artistName, title, artistName, rec.title)
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
  const trackNumberMap = new Map();
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
          
          // Reconcile features if artistName contains multiple artists but trackName does not
          const albumArtist = candidate.artist || '';
          if (artist && !title.toLowerCase().includes('feat') && !title.toLowerCase().includes('ft')) {
            const mainArtistWords = albumArtist.toLowerCase().split(/\s+/);
            const artists = artist.split(/&|,|\band\b/i).map(s => s.trim());
            const feats = artists.filter(a => {
              const aWords = a.toLowerCase().split(/\s+/);
              return !aWords.every(w => mainArtistWords.includes(w));
            });
            if (feats.length > 0) {
              title = `${title} (feat. ${feats.join(' & ')})`;
            }
          }
          
          const key = cleanKey(t.trackName || '');
          const cleanTitle = (t.trackName || '').split(/\b(?:ft|feat|featuring)\b/i)[0].trim();
          const shortKey = cleanKey(cleanTitle);

          const trackInfo = {
            title,
            artist,
            trackNumber: String(t.trackNumber)
          };
          tracklistMap.set(key, trackInfo);
          if (shortKey && !tracklistMap.has(shortKey)) {
            tracklistMap.set(shortKey, trackInfo);
          }
          trackNumberMap.set(trackInfo.trackNumber, trackInfo);
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
              if (!title.toLowerCase().includes('feat') && !title.toLowerCase().includes('ft')) {
                title = `${title} (feat. ${feats.join(' & ')})`;
              }
              artist = `${mainArtist} & ${feats.join(' & ')}`;
            }
          }

          const key = cleanKey(t.title || '');
          const shortKey = cleanKey(t.title_short || '');

          const trackInfo = {
            title,
            artist,
            trackNumber: String(t.track_position)
          };
          tracklistMap.set(key, trackInfo);
          if (shortKey && !tracklistMap.has(shortKey)) {
            tracklistMap.set(shortKey, trackInfo);
          }
          trackNumberMap.set(trackInfo.trackNumber, trackInfo);
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

          if (feats.length > 0 && !title.toLowerCase().includes('feat') && !title.toLowerCase().includes('ft')) {
            title = `${title} (feat. ${feats.join(' & ')})`;
            artist = `${mainArtistName} & ${feats.join(' & ')}`;
          }

          const key = cleanKey(t.title || '');
          const trackInfo = {
            title,
            artist,
            trackNumber: String(t.number)
          };
          tracklistMap.set(key, trackInfo);
          trackNumberMap.set(trackInfo.trackNumber, trackInfo);
        });
      }
    } catch (e) {
      console.warn(`[MusicBrainz] Tracklist fetch failed:`, e.message);
    }
  }

  return { tracklistMap, trackNumberMap, metadataOverride };
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
async function processFile(filepath, inferredArtist, inferredAlbum, albumArtwork, tracklistMap, trackNumberMap, globalMetadata, isMixedFolder) {
  const ext = path.extname(filepath).toLowerCase();
  if (ext === '.m4a' && !checkFfmpegDependency()) {
    console.error(`  ${colors.red}✗ Error: ffmpeg and ffprobe are required to process M4A (AAC) files. Please install them (e.g., 'brew install ffmpeg').${colors.reset}`);
    return;
  }

  let existingTags = {};
  try {
    existingTags = readTags(filepath);
  } catch (err) {}

  const filename = path.basename(filepath);
  
  if (isMixedFolder && existingTags.artist && existingTags.title && existingTags.hasArtwork) {
    let mainArtist = forceArtist || inferredArtist || existingTags.artist;
    mainArtist = mainArtist.split(/&|,|\band\b/i)[0].trim();
    const cleanTitle = cleanText(existingTags.title);
    const expectedFilename = `${mainArtist} - ${cleanTitle}${ext}`.replace(/[\\/*?:"<>|]/g, "");
    if (filename.toLowerCase() === expectedFilename.toLowerCase()) {
      console.log(`\n${colors.bright}${colors.green}➜ Skipping (already processed):${colors.reset} ${filename}`);
      return;
    }
  }

  const { trackNum, title, featuredArtist } = parseFilename(filename, inferredArtist);

  let searchTitle = title;
  let searchArtist = forceArtist || inferredArtist || existingTags.artist || "";

  // If the file already has tags, use them as search hints if they don't mismatch the filename significantly
  let useTags = true;
  if (existingTags.title && title) {
    const isFilenameGeneric = /^track\s*\d+$/i.test(title.trim()) || /untitled/i.test(title) || /unknown/i.test(title) || /^audiotrack\d+$/i.test(title.trim());
    if (!isFilenameGeneric) {
      const fileTitleClean = cleanKey(title);
      const tagTitleClean = cleanKey(existingTags.title);
      
      if (fileTitleClean.length >= 4 && !fileTitleClean.includes(tagTitleClean) && !tagTitleClean.includes(fileTitleClean)) {
        useTags = false;
        console.log(`  ${colors.yellow}⚠ Mismatch detected between filename title ("${title}") and tag title ("${existingTags.title}"). Ignoring existing tags as hints.${colors.reset}`);
      }
    }
  }

  if (useTags) {
    if (existingTags.title && !cleanText(existingTags.title).toLowerCase().includes("promo")) {
      searchTitle = cleanText(smartTitleCase(existingTags.title));
    }
    if (existingTags.artist && !forceArtist && !inferredArtist) {
      searchArtist = cleanText(existingTags.artist);
    }
  } else {
    // Ignore existing artist if tags are mismatched
    searchArtist = forceArtist || inferredArtist || "";
  }

  let finalTitle = featuredArtist ? `${searchTitle} (feat. ${featuredArtist})` : searchTitle;
  let finalArtist = forceArtist || searchArtist || "Unknown Artist";
  if (featuredArtist && !forceArtist) {
    finalArtist = `${searchArtist} & ${featuredArtist}`;
  }
  
  let finalAlbum = forceAlbum || inferredAlbum || existingTags.album || "Unknown Album";
  let finalTrack = trackNum || (existingTags.trackNumber ? String(existingTags.trackNumber).split('/')[0] : "");
  let finalYear = globalMetadata?.year || existingTags.year || "2025";
  let finalGenre = globalMetadata?.genre || existingTags.genre || "Afrobeats";
  let artwork = albumArtwork;

  console.log(`\n${colors.bright}${colors.blue}➜ Processing:${colors.reset} ${filename}`);
  
  // Try matching with official tracklist first
  const baseTitleClean = searchTitle.split(/\b(?:ft|feat|featuring)\b/i)[0].trim();
  const normKey = cleanKey(baseTitleClean);
  const fullNormKey = cleanKey(searchTitle);
  let matchedOfficial = false;

  if (tracklistMap && tracklistMap.has(normKey)) {
    const official = tracklistMap.get(normKey);
    console.log(`  ${colors.green}✓ Matched official album tracklist! (${official.title})${colors.reset}`);
    finalTitle = smartTitleCase(official.title);
    finalArtist = official.artist;
    finalTrack = official.trackNumber;
    matchedOfficial = true;
  } else if (tracklistMap && tracklistMap.has(fullNormKey)) {
    const official = tracklistMap.get(fullNormKey);
    console.log(`  ${colors.green}✓ Matched official album tracklist! (${official.title})${colors.reset}`);
    finalTitle = smartTitleCase(official.title);
    finalArtist = official.artist;
    finalTrack = official.trackNumber;
    matchedOfficial = true;
  } else if (trackNumberMap && finalTrack && trackNumberMap.has(String(parseInt(finalTrack, 10)))) {
    const official = trackNumberMap.get(String(parseInt(finalTrack, 10)));
    console.log(`  ${colors.green}✓ Matched official album tracklist via track number #${finalTrack}! (${official.title})${colors.reset}`);
    finalTitle = smartTitleCase(official.title);
    finalArtist = official.artist;
    finalTrack = official.trackNumber;
    matchedOfficial = true;
  } else if (tracklistMap) {
    for (const [key, official] of tracklistMap.entries()) {
      const minLength = Math.min(key.length, normKey.length, fullNormKey.length);
      if (minLength >= 2) {
        // Custom cleaner that cleans "and" / "&"
        const cleanTrack = (str) => {
          return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\band\b/g, '').replace(/[^a-z0-9]/g, '');
        };
        const cleanOfficialKey = cleanTrack(official.title);
        const cleanNormKey = cleanTrack(baseTitleClean);
        const cleanFullNormKey = cleanTrack(searchTitle);

        const match = cleanFullNormKey.includes(cleanOfficialKey) || 
                      cleanOfficialKey.includes(cleanFullNormKey) || 
                      cleanNormKey.includes(cleanOfficialKey) || 
                      cleanOfficialKey.includes(cleanNormKey);

        if (match) {
          console.log(`  ${colors.green}✓ Matched official album tracklist via substring! (${official.title})${colors.reset}`);
          finalTitle = smartTitleCase(official.title);
          finalArtist = official.artist;
          finalTrack = official.trackNumber;
          matchedOfficial = true;
          break;
        }
      }
    }
  }

  // Fetch from unified sources as fallback
  const isGenericTitle = /^track\s*\d+$/i.test(searchTitle.trim()) || /untitled/i.test(searchTitle) || /unknown/i.test(searchTitle);
  if (!matchedOfficial && !isGenericTitle) {
    const candidates = await fetchTrackMetadata(searchArtist, searchTitle);
    const metadata = candidates.length > 0 ? candidates[0] : null;
    if (metadata && metadata.score >= 0.5) {
      console.log(`  ${colors.green}✓ Matches ${metadata.source} database! (Score: ${metadata.score.toFixed(2)})${colors.reset}`);
      finalTitle = metadata.title || finalTitle;
      finalArtist = metadata.artist || finalArtist;
      
      // If matched on Deezer, fetch full track details to extract contributors/guest features
      if (metadata.source === 'Deezer' && metadata.id) {
        try {
          const detailRes = await fetch(`https://api.deezer.com/track/${metadata.id}`);
          if (detailRes.ok) {
            const trackDetail = await detailRes.json();
            if (trackDetail.contributors && trackDetail.contributors.length > 1) {
              const mainArtist = trackDetail.artist?.name || metadata.artist;
              const feats = trackDetail.contributors
                .filter(c => c.name.toLowerCase() !== mainArtist.toLowerCase())
                .map(c => c.name);
              if (feats.length > 0) {
                finalArtist = `${mainArtist} & ${feats.join(' & ')}`;
              }
            }
          }
        } catch (e) {}
      }
      
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
    } else {
      if (metadata) {
        console.log(`  ${colors.yellow}⚠ Low-confidence match in online databases (Score: ${metadata.score.toFixed(2)}). Skipping online tagging.${colors.reset}`);
      } else {
        console.log(`  ${colors.yellow}⚠ No match found in online databases. Skipping online tagging.${colors.reset}`);
      }
    }
  }

  // Reconcile guest features if finalArtist has guest artists but finalTitle does not contain features
  if (finalArtist && !finalTitle.toLowerCase().includes('feat') && !finalTitle.toLowerCase().includes('ft')) {
    const ftMatch = finalArtist.match(/\b(?:ft|feat|featuring)\b\.?\s+(.+)$/i);
    if (ftMatch) {
      const featArtist = ftMatch[1].trim();
      finalTitle = `${finalTitle} (feat. ${featArtist})`;
    } else {
      let mainArtist = forceArtist || inferredArtist || "";
      if (!mainArtist && finalArtist) {
        mainArtist = finalArtist.split(/&|,|\band\b/i)[0].trim();
      }
      if (mainArtist) {
        const mainArtistWords = mainArtist.toLowerCase().split(/\s+/);
        const artists = finalArtist.split(/&|,|\band\b/i).map(s => s.trim());
        const feats = artists.filter(a => {
          const aWords = a.toLowerCase().split(/\s+/);
          return !aWords.every(w => mainArtistWords.includes(w));
        });
        if (feats.length > 0) {
          finalTitle = `${finalTitle} (feat. ${feats.join(' & ')})`;
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

  try {
    const success = writeTags(filepath, tags, artwork);
    if (success) {
      console.log(`  ${colors.green}✓ Tags saved: ${finalArtist} - ${finalTitle} [${finalAlbum}]${colors.reset}`);
      if (artwork) console.log(`  ${colors.green}✓ Cover art embedded successfully.${colors.reset}`);
    } else {
      console.warn(`  ${colors.red}✗ Failed writing tags to ${filename}${colors.reset}`);
    }

    if (shouldRename) {
      let mainArtist = forceArtist || inferredArtist || finalArtist;
      mainArtist = mainArtist.split(/&|,|\band\b/i)[0].trim();
      let newFilename = `${mainArtist} - ${finalTitle}${ext}`;

      newFilename = newFilename.replace(/[\\/*?:"<>|]/g, "");
      let newFilepath = path.join(path.dirname(filepath), newFilename);

      if (filepath !== newFilepath) {
        if (filepath.toLowerCase() !== newFilepath.toLowerCase()) {
          let counter = 1;
          while (fs.existsSync(newFilepath)) {
            const nameWithoutExt = path.parse(newFilename).name;
            newFilepath = path.join(path.dirname(filepath), `${nameWithoutExt} (${counter})${ext}`);
            counter++;
          }
        }
        fs.renameSync(filepath, newFilepath);
        console.log(`  ${colors.cyan}➜ Renamed file to: ${path.basename(newFilepath)}${colors.reset}`);
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
    const ext = targetPath.toLowerCase();
    if (!ext.endsWith('.mp3') && !ext.endsWith('.m4a')) {
      console.error(`${colors.red}Error: Selected file is not an MP3 or M4A file.${colors.reset}`);
      process.exit(1);
    }
    console.log(`${colors.bright}${colors.cyan}MeloTag single file processor starting...${colors.reset}`);
    await processFile(targetPath, forceArtist || "", forceAlbum || "", null, null, null, null, false);
    console.log(`\n${colors.bright}${colors.green}✓ Finished tagging file!${colors.reset}\n`);

  } else if (stats.isDirectory()) {
    console.log(`${colors.bright}${colors.cyan}MeloTag folder processor starting...${colors.reset}`);
    
    const folderName = path.basename(targetPath);
    const inferred = inferFromFolderName(folderName);
    let inferredArtist = forceArtist || inferred.artist || "";
    let inferredAlbum = forceAlbum || inferred.album || "";

    const GENERIC_FOLDER_NAMES = new Set(['songs', 'music', 'downloads', 'tracks', 'mp3', 'temp', 'mixed', 'misc', 'miscellaneous', 'desktop', 'documents', 'workspace', 'tasks', 'projects']);

    if (!inferredArtist && !forceArtist) {
      const parentPath = path.dirname(targetPath);
      const parentFolderName = path.basename(parentPath);
      if (parentFolderName && parentPath !== '/' && !GENERIC_FOLDER_NAMES.has(parentFolderName.toLowerCase().trim())) {
        inferredArtist = parentFolderName;
      }
    }

    const isMixedFolder = args.includes('--mixed') || (!forceArtist && !forceAlbum && GENERIC_FOLDER_NAMES.has(folderName.toLowerCase().trim()));

    if (isMixedFolder) {
      console.log(`\n${colors.bright}${colors.yellow}Auto-detected mixed/compilation folder ("${folderName}"). Processing tracks individually...${colors.reset}`);
    } else {
      console.log(`Inferred Artist: ${colors.bright}${colors.yellow}${inferredArtist || "Unknown Artist"}${colors.reset}`);
      console.log(`Inferred Album:  ${colors.bright}${colors.yellow}${inferredAlbum || "Unknown Album"}${colors.reset}`);
    }

    const files = fs.readdirSync(targetPath).filter(f => {
      const ext = f.toLowerCase();
      return ext.endsWith('.mp3') || ext.endsWith('.m4a');
    });
    if (files.length === 0) {
      console.log(`${colors.red}No MP3 or M4A files found in folder: ${targetPath}${colors.reset}`);
      return;
    }

    let albumArtwork = null;
    let tracklistMap = new Map();
    let trackNumberMap = new Map();
    let resolvedArtist = isMixedFolder ? "" : inferredArtist;
    let resolvedAlbum = isMixedFolder ? "" : inferredAlbum;
    let globalMetadata = isMixedFolder ? null : { year: '2025', genre: 'Afrobeats' };

    if (!isMixedFolder) {
      console.log(`Found ${files.length} tracks. Searching for album-wide metadata across iTunes, Deezer, and MusicBrainz...`);

      const candidates = await searchAlbumAcrossSources(inferredArtist, inferredAlbum);
      if (candidates.length > 0) {
        // Prioritize MusicBrainz and Deezer over iTunes for equal scores
        const sourcePriority = { 'MusicBrainz': 3, 'Deezer': 2, 'iTunes': 1 };
        candidates.sort((a, b) => {
          if (Math.abs(b.score - a.score) < 0.01) {
            return (sourcePriority[b.source] || 0) - (sourcePriority[a.source] || 0);
          }
          return b.score - a.score;
        });

        console.log(`\n${colors.bright}Found ${candidates.length} candidate albums:${colors.reset}`);
        candidates.slice(0, 5).forEach((cand, idx) => {
          console.log(`  [${idx + 1}] [${cand.source}] ${cand.artist} - ${cand.album} (Score: ${cand.score.toFixed(2)})`);
        });

        const minScore = inferredArtist ? 0.5 : 0.6;
        let matchedCandidate = null;
        for (const cand of candidates) {
          if (cand.score < minScore) {
            continue;
          }
          console.log(`\nAttempting to resolve tracklist using candidate [${cand.source}]...`);
          const { tracklistMap: tempMap, trackNumberMap: tempNumMap, metadataOverride } = await fetchTracklist(cand);
          if (tempMap && tempMap.size > 0) {
            tracklistMap = tempMap;
            trackNumberMap = tempNumMap;
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
    } else {
      console.log(`Found ${files.length} tracks. Processing each track individually...`);
    }

    // Process all files
    for (const filename of files.sort()) {
      const filepath = path.join(targetPath, filename);
      await processFile(filepath, resolvedArtist, resolvedAlbum, albumArtwork, tracklistMap, trackNumberMap, globalMetadata, isMixedFolder);
    }

    console.log(`\n${colors.bright}${colors.green}✓ Finished tagging all ${files.length} files in folder!${colors.reset}\n`);
  }
}

main();
