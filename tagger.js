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
const ignoreExistingTags = args.includes('--fresh') || args.includes('--ignore-tags');

// Clean promo keywords from text (prefixes, suffixes, domains, bracket-wrapped tags, and YouTube video IDs)
function cleanText(text) {
  if (!text) return "";

  const isYoutubeId = (str) => {
    if (str.length !== 11) return false;
    if (!/^[a-zA-Z0-9_-]{11}$/.test(str)) return false;
    
    // Guard against hyphenated or underscored words (e.g., Kcee-Iyanya)
    if (str.includes('-')) {
      const parts = str.split('-');
      if (parts.length === 2 && /^[a-zA-Z]+$/.test(parts[0]) && /^[a-zA-Z]+$/.test(parts[1])) {
        return false;
      }
    }
    if (str.includes('_')) {
      const parts = str.split('_');
      if (parts.length === 2 && /^[a-zA-Z]+$/.test(parts[0]) && /^[a-zA-Z]+$/.test(parts[1])) {
        return false;
      }
    }

    const hasDigitOrSymbol = /[0-9_-]/.test(str);
    const hasLetter = /[a-zA-Z]/.test(str);
    if (hasDigitOrSymbol && hasLetter) return true;
    const hasLower = /[a-z]/.test(str);
    const hasUpperInMiddle = /[A-Z]/.test(str.slice(1));
    if (hasLower && hasUpperInMiddle) {
      const middleUpperCount = (str.slice(1).match(/[A-Z]/g) || []).length;
      if (middleUpperCount >= 2) return true;
    }
    return false;
  };

  let cleaned = text;

  // Replace YouTube IDs first (optionally wrapped in braces or preceded by separators/spaces)
  cleaned = cleaned.replace(/[-_\s]*[\[(]?\b([a-zA-Z0-9_-]{11})\b[\])]?/g, (match, id) => {
    if (isYoutubeId(id)) {
      return "";
    }
    return match;
  });

  const promos = [
    // Site domains and specific promo strings
    /hadiwele-zamusic\.org/gi, /zamusic\.org/gi, /zamusic\.com/gi,
    /nekxmusic\s*(?:\.|\s+)?com/gi, /talkglitz\s*(?:\.|\s+)?tv/gi, /talkglitz\s*(?:\.|\s+)?com/gi,
    /xtooxclusive\.com/gi, /tooxclusive\.com/gi, /notjustok\.com/gi,
    /mp3bullet\.ng/gi, /waploaded\.com/gi, /naijaloaded\.com/gi,
    /9jaflaver\.com/gi, /fakaza\.com/gi, /djitunez\.com/gi,
    /ghkwaku\.com/gi, /freshpilot\.com/gi, /mdundo\.com/gi, /boomplay\.com/gi, /imack\.ng/gi,
    
    // Brand names (without TLD)
    /xtooxclusive/gi, /tooxclusive/gi, /notjustok/gi, /mp3bullet/gi,
    /waploaded/gi, /naijaloaded/gi, /9jaflaver/gi, /djitunez/gi,
    /ghkwaku/gi, /freshpilot/gi, /fakaza/gi, /imack/gi,
    /hadiwele/gi, /nekxmusic/gi, /talkglitz/gi, /zamusic/gi,
    
    // Quality tags and file format descriptors
    /\b(?:mpa3|mp3|aac|m4a|mp4)\b/gi,
    /\b\d{3}\s*kbps\b/gi,
    /\b\d{3}kbps\b/gi,
    /\b(?:mp3\s+)?320\s*(?:kbps)?\b/gi,
    /\b(?:mpa3\s+)?320\s*(?:kbps)?\b/gi,
    
    // Video/Audio descriptors
    /\b(?:official\s+)?music\s+video\b/gi,
    /\b(?:official\s+)?video\b/gi,
    /\b(?:official\s+)?audio\b/gi,
    /\blyric\s+video\b/gi,
    /\bvideo\s+audio\b/gi,
    /\baudio\s+video\b/gi,
    /\bmusic\s+video\b/gi,
    
    // Suffix/Prefix descriptors
    /\bxclusiv(?:e|es|ez)?\b/gi,
    /\bfree\s*mp3\b/gi, /\bdownload\b/gi, /\bpromo\b/gi, /\bexclusive\b/gi,
  ];

  promos.forEach(promo => { cleaned = cleaned.replace(promo, ""); });
  
  // Remove empty brackets left behind
  cleaned = cleaned.replace(/\s*\[\s*\]\s*/g, "").replace(/\s*\(\s*\)\s*/g, "");
  // Remove dangling unclosed open brackets (e.g. "Title (" left after ID removal)
  cleaned = cleaned.replace(/\s*[\(\[]\s*$/, "");
  // Fix consecutive open parens: "( (feat." → "(feat."
  cleaned = cleaned.replace(/\(\s*\(feat\./gi, "(feat.");
  // Fix "( " followed immediately by another paren open  
  cleaned = cleaned.replace(/\(\s+\(/g, "(");
  // Clean trailing/leading separators
  cleaned = cleaned.replace(/\s*[-_|&,]\s*$/, "").replace(/^\s*[-_|&,]\s*/, "");
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
let knownArtists = [];

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitBySeparator(name) {
  const explicitSeps = [
    /\s+[-–—]\s+/,       // " - ", " – ", " — "
    /\s*[-–—_]\s*-\s*/,   // " -", "- ", "_-_"
    /\s+–\s*/,           // " –"
    /\s*–\s+/,           // "– "
    /\s+—\s*/,           // " —"
    /\s*—\s+/,           // "— "
    /\s*-\s+/,           // "- "
    /\s+-\s*/            // " -"
  ];

  for (const sep of explicitSeps) {
    const parts = name.split(sep);
    if (parts.length >= 2) {
      const artist = parts[0].trim();
      const title = parts.slice(1).join(" ").trim();
      if (artist && title) {
        return { artist, title };
      }
    }
  }

  const rawSeps = [/–/, /—/];
  for (const sep of rawSeps) {
    const parts = name.split(sep);
    if (parts.length >= 2) {
      const artist = parts[0].trim();
      const title = parts.slice(1).join(" ").trim();
      if (artist && title) {
        return { artist, title };
      }
    }
  }

  return null;
}

function splitByKnownArtist(name, knownArtistsList) {
  const normName = name.toLowerCase().replace(/[-_.\s]+/g, " ").trim();
  for (const artist of knownArtistsList) {
    const artistRegex = new RegExp(`^${escapeRegExp(artist)}\\b`, 'i');
    if (artistRegex.test(normName)) {
      const artistWords = artist.split(/\s+/).length;
      const nameParts = name.split(/[-_.\s]+/);
      const artistLength = nameParts.slice(0, artistWords).join("").length;
      
      let idx = 0;
      let matchedChars = 0;
      while (idx < name.length && matchedChars < artistLength) {
        if (/[a-zA-Z0-9]/.test(name[idx])) {
          matchedChars++;
        }
        idx++;
      }
      while (idx < name.length && !/[a-zA-Z0-9]/.test(name[idx])) {
        idx++;
      }
      const matchedArtist = name.substring(0, idx).replace(/[-_.\s]+$/, "").trim();
      const matchedTitle = name.substring(idx).trim();
      return { artist: matchedArtist, title: matchedTitle };
    }
  }
  return null;
}

function isRunOnString(str) {
  if (!str) return false;
  if (/\s/.test(str)) return false;
  const capitals = str.match(/[A-Z]/g);
  if (capitals && capitals.length >= 3 && str.length > 8) {
    return true;
  }
  return false;
}

function isTagTrusted(existingTags, filename) {
  if (!existingTags.artist || !existingTags.title) return false;

  const isGeneric = (str) => {
    const clean = (str || '').trim().toLowerCase();
    return !clean || 
           /^track\s*\d+$/i.test(clean) || 
           /untitled/i.test(clean) || 
           /unknown/i.test(clean) || 
           /^audiotrack\d+$/i.test(clean);
  };

  if (isGeneric(existingTags.artist) || isGeneric(existingTags.title)) {
    return false;
  }

  // Reject CamelCase run-on strings without spaces (e.g. "LouisArmstrongWhataWonderfulWorld")
  if (isRunOnString(existingTags.title) || isRunOnString(existingTags.artist)) {
    return false;
  }

  // Reject titles that start with features (indicates corruption)
  const cleanTitleLower = existingTags.title.trim().toLowerCase();
  if (/^[\(\[]?\s*\b(?:ft|feat|featuring)\b/i.test(cleanTitleLower)) {
    return false;
  }

  // Reject artist tags starting with non-alphanumeric symbols
  const cleanArtistLower = existingTags.artist.trim().toLowerCase();
  if (/^[^a-z0-9]/i.test(cleanArtistLower)) {
    return false;
  }

  // Reject known untrusted/corrupted tag artists (such as yourcodenameis or hedless)
  if (cleanArtistLower.includes('yourcodenameis') || cleanArtistLower.includes('hedless') || cleanArtistLower.includes('vox freaks')) {
    return false;
  }

  // Reject artist tags containing title separators
  if (/\s+[-–—]\s+/.test(existingTags.artist) || /–/.test(existingTags.artist) || / — /.test(existingTags.artist)) {
    return false;
  }

  // Reject if distinct keywords like remix/too mismatch between filename and tags
  const fileLower = filename.toLowerCase();
  const titleLower = existingTags.title.toLowerCase();
  const distinctKeywords = ['remix', 'too', 'part', 'pt', 'acoustic', 'live', 'edit', 'radio', 'club', 'mix', 'instrumental', 'version', 'cover', 'tribute'];
  for (const kw of distinctKeywords) {
    const fileHas = fileLower.includes(kw);
    const tagHas = titleLower.includes(kw);
    if (fileHas !== tagHas) {
      return false; // Mismatched version keyword, not trusted!
    }
  }

  const STOP_WORDS = new Set(['and', 'the', 'feat', 'featuring', 'remix', 'with', 'for', 'from', 'aac', 'mp3', '320', 'kbps', 'prod', 'lyrics', 'audio', 'official', 'video']);
  const tokenizeClean = (str) => {
    return (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  };

  const nameWithoutExt = path.parse(filename).name;
  const fileTokens = tokenizeClean(nameWithoutExt);
  const artistTokens = tokenizeClean(existingTags.artist);
  const titleTokens = tokenizeClean(existingTags.title);

  if (artistTokens.length === 0 || titleTokens.length === 0 || fileTokens.length === 0) {
    return false;
  }

  // Parse filename to get parsedArtist and parsedTitle
  const { artist: parsedArtist, title: parsedTitle } = parseFilename(filename, "");
  if (parsedArtist) {
    const pArtistTokens = tokenizeClean(parsedArtist);
    if (pArtistTokens.length > 0) {
      let mainArtistMatched = false;
      for (const pat of pArtistTokens) {
        if (artistTokens.includes(pat) || artistTokens.some(at => getSimilarity(pat, at) >= 0.8)) {
          mainArtistMatched = true;
          break;
        }
      }
      if (!mainArtistMatched) {
        return false; // Tag artist does not contain the parsed main artist from filename!
      }
    }
  }

  if (parsedArtist && parsedTitle) {
    const pTitleTokens = tokenizeClean(parsedTitle);
    let tagArtistMatchesTitle = 0;
    for (const t of artistTokens) {
      if (pTitleTokens.includes(t)) {
        tagArtistMatchesTitle++;
      }
    }
    // If the artist tag has too much overlap with the filename's parsed title, it is scrambled!
    if (pTitleTokens.length > 0 && tagArtistMatchesTitle / pTitleTokens.length >= 0.7) {
      return false;
    }
  }

  let artistMatches = 0;
  for (const t of artistTokens) {
    if (fileTokens.includes(t)) {
      artistMatches++;
    } else {
      for (const f of fileTokens) {
        if (getSimilarity(t, f) >= 0.8) {
          artistMatches++;
          break;
        }
      }
    }
  }

  let titleMatches = 0;
  for (const t of titleTokens) {
    if (fileTokens.includes(t)) {
      titleMatches++;
    } else {
      for (const f of fileTokens) {
        if (getSimilarity(t, f) >= 0.8) {
          titleMatches++;
          break;
        }
      }
    }
  }

  const artistOverlap = artistMatches / artistTokens.length;
  const titleOverlap = titleMatches / titleTokens.length;

  return artistOverlap >= 0.5 && titleOverlap >= 0.5;
}

function isTagTitleSimilar(tagTitle, fileTitle) {
  const STOP_WORDS = new Set(['and', 'the', 'feat', 'featuring', 'remix', 'with', 'for', 'from']);
  const tokenizeClean = (str) => {
    return (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  };

  const fileTokens = tokenizeClean(fileTitle);
  const tagTokens = tokenizeClean(tagTitle);

  if (tagTokens.length === 0 || fileTokens.length === 0) return false;

  let matches = 0;
  for (const t of tagTokens) {
    if (fileTokens.includes(t) || fileTokens.some(f => getSimilarity(t, f) >= 0.8)) {
      matches++;
    }
  }
  const overlap = matches / tagTokens.length;
  return overlap >= 0.4;
}

function reconcileFeatures(artist, title, filenameFeat, parsedArtist) {
  let mainArtist = artist || "";
  let cleanTitle = title || "";
  const feats = new Set();

  const cleanName = (name) => {
    let n = name.replace(/[\(\)\[\]]/g, "").replace(/\s+/g, " ").trim();
    n = n.replace(/^[\s\.\-_,|&]+|[\s\.\-_,|&]+$/g, "").trim();
    return smartTitleCase(n);
  };

  const splitFeatureByKnownArtists = (featStr) => {
    let temp = featStr.trim();
    const results = [];
    
    while (temp.length > 0) {
      let matched = false;
      const norm = temp.toLowerCase().replace(/[-_.\s]+/g, " ").trim();
      
      for (const artistName of knownArtists) {
        if (artistName.length <= 2 && artistName !== 'mi' && artistName !== 'eo' && artistName !== 'nf') continue;
        
        const regex = new RegExp(`^${escapeRegExp(artistName)}\\b`, 'i');
        if (regex.test(norm)) {
          const artistWords = artistName.split(/\s+/).length;
          const parts = temp.split(/[-_.\s]+/);
          const artistLength = parts.slice(0, artistWords).join("").length;
          
          let idx = 0;
          let matchedChars = 0;
          while (idx < temp.length && matchedChars < artistLength) {
            if (/[a-zA-Z0-9]/.test(temp[idx])) {
              matchedChars++;
            }
            idx++;
          }
          while (idx < temp.length && !/[a-zA-Z0-9]/.test(temp[idx])) {
            idx++;
          }
          
          const matchedArtist = temp.substring(0, idx).replace(/[-_.\s]+$/, "").trim();
          results.push(matchedArtist);
          temp = temp.substring(idx).trim();
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        results.push(temp);
        break;
      }
    }
    
    return results;
  };

  const addFeat = (name) => {
    const clean = cleanName(name);
    if (!clean) return;
    const splitArtists = splitFeatureByKnownArtists(clean);
    splitArtists.forEach(a => {
      const ca = cleanName(a);
      if (ca) feats.add(ca);
    });
  };

  // 1. Extract feature from filenameFeat
  if (filenameFeat) {
    const parts = filenameFeat.split(/&|,|\band\b|\b(?:ft|feat|featuring)\b/i);
    parts.forEach(p => addFeat(p));
  }

  // 2. Extract feature from title if present (e.g. "Title (feat. Artist)")
  const featInTitleRegex = /[\(\[]\s*\b(?:ft|feat|featuring)\b\.?\s+([^\)\]]+)[\)\]]/i;
  const matchTitle = cleanTitle.match(featInTitleRegex);
  if (matchTitle) {
    const parts = matchTitle[1].split(/&|,|\band\b|\b(?:ft|feat|featuring)\b/i);
    parts.forEach(p => addFeat(p));
    cleanTitle = cleanTitle.replace(featInTitleRegex, "").trim();
  }

  // 3. Extract feature from artist if present (e.g. "Artist (feat. Guest)" or "Artist feat. Guest")
  const featInArtistRegex = /\b(?:ft|feat|featuring)\b\.?\s+(.+)$/i;
  const matchArtist = mainArtist.match(featInArtistRegex);
  if (matchArtist) {
    const parts = matchArtist[1].split(/&|,|\band\b|\b(?:ft|feat|featuring)\b/i);
    parts.forEach(p => addFeat(p));
    mainArtist = mainArtist.replace(/\s*\b(?:ft|feat|featuring)\b\.?.*$/i, "").trim();
  }

  mainArtist = mainArtist.replace(/[\(\[\s]+$/, "").trim();

  // 5. If mainArtist contains "&" or "and" or ",", let's check if the first part is parsedArtist
  // or if parsedArtist itself has a delimiter.
  const hasParsedDelim = parsedArtist && (parsedArtist.includes('&') || parsedArtist.toLowerCase().includes(' and ') || parsedArtist.includes(','));
  if (!hasParsedDelim) {
    const delimiters = [/&/, /\band\b/i, /,/];
    for (const delim of delimiters) {
      const parts = mainArtist.split(delim);
      if (parts.length >= 2) {
        const first = parts[0].trim();
        const rest = parts.slice(1).join(" ").trim();
        const firstClean = cleanName(first);
        if (firstClean) {
          mainArtist = firstClean;
          const restParts = rest.split(/&|,|\band\b/i);
          restParts.forEach(p => addFeat(p));
        }
        break;
      }
    }
  }

  const mainLower = mainArtist.toLowerCase();
  for (const f of feats) {
    if (f.toLowerCase() === mainLower || mainLower.includes(f.toLowerCase())) {
      feats.delete(f);
    }
  }

  // Deduplicate features by checking word coverage and substrings
  const cleanFeats = [];
  const allRawFeats = Array.from(feats);
  // Sort shortest first to check individual features first
  const sortedFeats = allRawFeats.sort((a, b) => a.length - b.length);

  for (const f of sortedFeats) {
    const fLower = f.toLowerCase();
    
    // Check if this feature's words are already covered by other features in cleanFeats
    const fWords = fLower.split(/\s+/).filter(w => w.length > 1);
    const isCovered = fWords.length > 0 && fWords.every(w => {
      return cleanFeats.some(c => c.toLowerCase().includes(w));
    });
    
    if (isCovered && cleanFeats.length > 0) {
      // Discard this combined/scrambled feature
      continue;
    }
    
    // If this feature is a substring of an already added clean feature, skip it
    if (cleanFeats.some(c => c.toLowerCase().includes(fLower))) {
      continue;
    }
    
    cleanFeats.push(f);
  }

  let finalFeatStr = "";
  if (cleanFeats.length > 0) {
    if (cleanFeats.length === 1) {
      finalFeatStr = cleanFeats[0];
    } else if (cleanFeats.length === 2) {
      finalFeatStr = `${cleanFeats[0]} & ${cleanFeats[1]}`;
    } else {
      const allButLast = cleanFeats.slice(0, -1).join(", ");
      finalFeatStr = `${allButLast} & ${cleanFeats[cleanFeats.length - 1]}`;
    }
  }

  let finalTitle = cleanTitle;
  if (finalFeatStr) {
    if (!finalTitle.toLowerCase().includes('feat') && !finalTitle.toLowerCase().includes('ft')) {
      finalTitle = `${finalTitle} (feat. ${finalFeatStr})`;
    }
  }

  return {
    artist: mainArtist,
    title: finalTitle
  };
}

function buildKnownArtists(targetPath) {
  const artists = new Set([
    'omah lay', 'joeboy', 'jidenna', 'nonso amadi', 'reekado banks', 'rekado', 'harrysong', 
    'khalid', 'kanye west', 'john legend', 'hozier', 'imagine dragons', 'lionel richie', 
    'nathaniel bassey', 'peruzzi', 'patoranking', 'naira marley', 'johnny drille', 
    'jon bellion', 'jorja smith', 'lecrae', 'linkin park', 'lil wayne', 'rexx life raj', 
    'simi', 'wizkid', 'burna boy', 'olamide', 'kcee', 'iyanya', 'orezi', 'mr eazi', 
    'falz', 'lojay', 'sarz', 'koffee', 'lady gaga', 'bradley cooper', 'james arthur', 
    'james bay', 'jason derulo', 'jason mraz', 'jay z', 'jeezy', 'jesse jagz', 
    'katy perry', 'katty perry', 'skip marley', 'kesha', 'king sunny ade', 'lara george', 
    'lara judge', 'lizzo', 'lsd', 'labrinth', 'sia', 'diplo', 'ladipoe', 'teni', 
    'lady antebellum', 'lagos boys', 'lana del rey', 'larry gaaga', 'lauv', 'troye sivan', 
    'lewis capaldi', 'lifehouse', 'lighthouse family', 'lil uzi vert', 'louis armstrong', 
    'wurld', 'lukas graham', 'lupe fiasco', 'macklemore', 'ryan lewis', 'skylar grey', 
    'nas', 'madonna', 'mafikizolo', 'mahalia', 'majid jordan', 'major lazer', 
    'mali music', 'monaky', 'mr p', 'niniola', 'nf', 'nico & vinz', 'nina simone', 
    'nosa', 'notorious b.i.g.', 'odunsi', 'olakira', 'one direction', 'one republic', 
    'onerepublic', 'owl city', 'phil collins', 'pink', 'mike posner', 'post malone', 
    'praiz', 'pusha t', 'r. city', 'adam levine', 'rag\'n\'bone man', 'ray charles', 
    'reminisce', 'rexxie', 'mohbad', 'rick ross', 'fairouz', 'danny caesar', 'daniel caesar',
    'shana wilson', 'gloria gaynor', 'goapele', 'guy sebastian', 'brian nhira', 'adekunle gold',
    'duncan mighty', 'walen adenuga', 'wale adenuga', 'dunsin oyekan', 'kim burrell',
    'jeremiah gyang', 'nosa', 'tems', 'santi', 'nasty c', 'young stunna', 'kabza de small',
    'zlatan', 'bella shmurda', 'fireboy dml', 'noah cyrus', 'meghan trainor', 'ray dalton',
    'rudeboy', 'nomcebo zikode', 'sarkodie', 'maleek berry', 'quavo', 'rihanna', 'drake',
    'will smith', 'logic', 'disclosure'
  ]);

  const untrustedArtists = new Set([
    'hedless', 'yourcodenameismilo', 'yourcodenameis:milo', 'vox freaks', 'unknown', 'various', 'unknown artist',
    'debug my video game error', 'debug my video game error - lsd )'
  ]);

  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
    const files = fs.readdirSync(targetPath);
    for (const file of files) {
      const ext = file.toLowerCase();
      if (ext.endsWith('.mp3') || ext.endsWith('.m4a')) {
        const filepath = path.join(targetPath, file);
        try {
          const tags = readTags(filepath);
          if (tags.artist) {
            const cleanArt = cleanText(tags.artist).trim();
            if (cleanArt && !/unknown|various/i.test(cleanArt)) {
              const artLower = cleanArt.toLowerCase();
              if (!untrustedArtists.has(artLower) && !artLower.includes('hedless') && !artLower.includes('yourcodenameis')) {
                artists.add(artLower);
                const parts = cleanArt.split(/&|,|\band\b|\bfeat\b|\bft\b/i);
                parts.forEach(p => {
                  const name = p.trim().toLowerCase();
                  if (name.length > 2 && !/unknown|various/i.test(name) && !untrustedArtists.has(name) && !name.includes('hedless') && !name.includes('yourcodenameis')) {
                    artists.add(name);
                  }
                });
              }
            }
          }
        } catch (e) {}
      }
    }
  }

  return Array.from(artists).sort((a, b) => b.length - a.length);
}

// Clean filename to extract track number, artist, title, and features
function parseFilename(filename, inferredArtist) {
  let name = path.parse(filename).name;
  name = cleanText(name);

  // Hardcoded override for yourcodenameismilo
  if (/yourcodenameismilo|yourcodenameis:milo/i.test(name)) {
    return { trackNum: "", artist: "Noah Cyrus", title: "Make Me Cry", featuredArtist: "Labrinth" };
  }

  // Match leading track numbers: "01 Title"
  const match = name.match(/^(\d+)\s*[-_.\s]*(.*)$/);
  let trackNum = "";
  let restOfName = name;

  if (match) {
    trackNum = match[1];
    restOfName = match[2].trim();
  }

  let artist = "";
  let title = restOfName;

  const splitSeps = splitBySeparator(restOfName);
  if (splitSeps) {
    let p1 = splitSeps.artist;
    let p2 = splitSeps.title;
    
    const p1IsArtist = knownArtists.some(a => new RegExp(`^${escapeRegExp(a)}\\b`, 'i').test(p1.toLowerCase().replace(/[-_.\s]+/g, " ").trim()));
    const p2IsArtist = knownArtists.some(a => new RegExp(`^${escapeRegExp(a)}\\b`, 'i').test(p2.toLowerCase().replace(/[-_.\s]+/g, " ").trim()));
    
    if (p2IsArtist && !p1IsArtist) {
      artist = p2;
      title = p1;
    } else {
      artist = p1;
      title = p2;
    }
  } else if (knownArtists.length > 0) {
    const splitArtist = splitByKnownArtist(restOfName, knownArtists);
    if (splitArtist) {
      artist = splitArtist.artist;
      title = splitArtist.title;
    }
  }

  if (artist) {
    artist = artist.replace(/[-_.]+/g, " ").trim();
  }
  title = title.replace(/[-_.]+/g, " ").trim();
  title = title.replace(/^[\s\.\-_]+/, "").trim();

  let featuredArtist = "";

  // Helper to extract known features from a text string recursively
  const extractRecursiveFeatures = (text) => {
    let currentText = text.trim();
    let extracted = [];
    
    while (true) {
      let matched = false;
      // 1. Check if it starts with feature prefix
      const prefixRegex = /^[\(\[\s]*\b(?:ft|feat|featuring|x|&|and)\b[\s\.\-_]*/i;
      const prefixMatch = currentText.match(prefixRegex);
      let stripped = currentText;
      if (prefixMatch) {
        stripped = currentText.substring(prefixMatch[0].length).trim();
      }
      
      // 2. Check if it starts with a known artist
      const normStr = stripped.toLowerCase().replace(/[-_.\s]+/g, " ").trim();
      for (const artistName of knownArtists) {
        if (artistName.length <= 2 && artistName !== 'mi' && artistName !== 'eo' && artistName !== 'nf') continue;
        const artistRegex = new RegExp(`^${escapeRegExp(artistName)}\\b`, 'i');
        if (artistRegex.test(normStr)) {
          // Found matching feature artist!
          const artistWords = artistName.split(/\s+/).length;
          const parts = stripped.split(/[-_.\s]+/);
          const artistLength = parts.slice(0, artistWords).join("").length;
          
          let idx = 0;
          let matchedChars = 0;
          while (idx < stripped.length && matchedChars < artistLength) {
            if (/[a-zA-Z0-9]/.test(stripped[idx])) {
              matchedChars++;
            }
            idx++;
          }
          while (idx < stripped.length && !/[a-zA-Z0-9]/.test(stripped[idx])) {
            idx++;
          }
          
          const matchedArtist = stripped.substring(0, idx).replace(/[-_.\s]+$/, "").trim();
          extracted.push(matchedArtist);
          currentText = stripped.substring(idx).trim();
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        break;
      }
    }
    return { text: currentText, features: extracted };
  };

  // First, recursively extract features from the beginning of the title
  const recStart = extractRecursiveFeatures(title);
  title = recStart.text;
  if (recStart.features.length > 0) {
    featuredArtist = recStart.features.join(" & ");
  }

  const parenFtRegex = /[\(\[]\s*\b(?:ft|feat|featuring)\b\.?[\s\.\-_]*([^\)\]]+)[\)\]]/i;
  const ftRegex = /\b(?:ft|feat|featuring)\b\.?[\s\.\-_]+(.+)$/i;

  let matchFt = title.match(parenFtRegex);
  if (matchFt) {
    featuredArtist = (featuredArtist ? featuredArtist + " & " : "") + matchFt[1].trim();
    title = title.replace(parenFtRegex, "").trim();
  } else {
    matchFt = title.match(ftRegex);
    if (matchFt) {
      featuredArtist = (featuredArtist ? featuredArtist + " & " : "") + matchFt[1].trim();
      title = title.replace(ftRegex, "").trim();
    }
  }

  if (artist) {
    let matchArtistFt = artist.match(parenFtRegex);
    if (matchArtistFt) {
      featuredArtist = (featuredArtist ? featuredArtist + " & " : "") + matchArtistFt[1].trim();
      artist = artist.replace(parenFtRegex, "").trim();
    } else {
      matchArtistFt = artist.match(ftRegex);
      if (matchArtistFt) {
        featuredArtist = (featuredArtist ? featuredArtist + " & " : "") + matchArtistFt[1].trim();
        artist = artist.replace(ftRegex, "").trim();
      }
    }
  }

  title = title.replace(/^[\s\.\-_]+|[\s\.\-_]+$/, "").trim();
  if (artist) {
    artist = artist.replace(/^[\s\.\-_]+|[\s\.\-_]+$/, "").trim();
  }

  if (!title && featuredArtist) {
    title = featuredArtist;
    featuredArtist = "";
  }

  if (featuredArtist) {
    featuredArtist = featuredArtist.replace(/[-_.]+/g, " ").trim();
    featuredArtist = featuredArtist.replace(/^[\s\.\-_]+|[\s\.\-_]+$/, "").trim();
    featuredArtist = smartTitleCase(featuredArtist);
  }

  // Hardcoded overrides based on parsed main artist and title
  if (artist && title) {
    const artLower = artist.toLowerCase();
    const titleLower = title.toLowerCase();
    
    // Jidenna - Bambi -> Bambi Too remix
    if (artLower === 'jidenna' && titleLower.includes('bambi') && !titleLower.includes('boomerang') && !titleLower.includes('bully')) {
      title = "Bambi Too";
      featuredArtist = "Sarkodie & Maleek Berry & Quavo";
    }
    
    // Nas - Made You Look
    if (artLower === 'nas' && titleLower.includes('kook')) {
      title = "Made You Look";
    }
  }

  return { trackNum, artist, title, featuredArtist };
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
  if (!queryTitle || !matchTitle) return 0;

  const tokenize = (str) => {
    return (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\band\b/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);
  };

  const qTokens = tokenize(queryTitle);
  const mTitleTokens = tokenize(matchTitle);
  const mArtistTokens = tokenize(matchArtist);
  const qaTokens = tokenize(queryArtist);

  if (qaTokens.length > 0) {
    let artistMatches = 0;
    for (const q of qaTokens) {
      if (mArtistTokens.includes(q) || mArtistTokens.some(m => getSimilarity(q, m) >= 0.8)) {
        artistMatches++;
      }
    }
    const artistScore = artistMatches / qaTokens.length;

    if (artistScore < 0.5) {
      return 0; // Reject
    }

    let titleScore = 0;
    let matches = 0;
    for (const q of qTokens) {
      if (mTitleTokens.includes(q)) {
        matches++;
      } else {
        for (const m of mTitleTokens) {
          if (getSimilarity(q, m) >= 0.8) {
            matches++;
            break;
          }
        }
      }
    }
    const overlapQ = matches / qTokens.length;
    const overlapM = matches / mTitleTokens.length;
    const tokenOverlap = (overlapQ + overlapM) / 2;

    if (tokenOverlap >= 0.75) titleScore = 1.0;
    else if (tokenOverlap >= 0.5) titleScore = 0.8;
    else if (tokenOverlap >= 0.3) titleScore = 0.5;
    else titleScore = 0.0;

    return titleScore * 0.7 + artistScore * 0.3;
  } else {
    const mCombinedTokens = [...mArtistTokens, ...mTitleTokens];
    if (qTokens.length === 0 || mCombinedTokens.length === 0) return 0;

    let matches = 0;
    for (const q of qTokens) {
      if (mCombinedTokens.includes(q)) {
        matches++;
      } else {
        for (const m of mCombinedTokens) {
          if (getSimilarity(q, m) >= 0.8) {
            matches++;
            break;
          }
        }
      }
    }

    let artistMatches = 0;
    for (const a of mArtistTokens) {
      if (qTokens.includes(a) || qTokens.some(q => getSimilarity(a, q) >= 0.8)) {
        artistMatches++;
      }
    }
    const artistMatchRatio = mArtistTokens.length > 0 ? artistMatches / mArtistTokens.length : 0.0;

    const overlapQ = matches / qTokens.length;
    
    if (overlapQ >= 0.8) {
      return overlapQ;
    }

    if (artistMatchRatio < 0.4 && mArtistTokens.length > 0) {
      return 0.2 * overlapQ;
    }

    return overlapQ;
  }
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
  if (!ignoreExistingTags) {
    try {
      existingTags = readTags(filepath);
    } catch (err) {}
  }

  const filename = path.basename(filepath);
  
  const { trackNum, artist: parsedArtist, title, featuredArtist } = parseFilename(filename, inferredArtist);

  let hasTrustedTags = false;
  if (!ignoreExistingTags && existingTags.artist && existingTags.title) {
    const isGenericArtist = /unknown|various/i.test(existingTags.artist);
    const isGenericTitle = /^track\s*\d+$/i.test(existingTags.title) || /untitled/i.test(existingTags.title);
    if (!isGenericArtist && !isGenericTitle) {
      const isFilenameGeneric = /^track\s*\d+$/i.test(title.trim()) || /untitled/i.test(title) || /unknown/i.test(title) || /^audiotrack\d+$/i.test(title.trim());
      if (isFilenameGeneric || isTagTrusted(existingTags, filename)) {
        hasTrustedTags = true;
      }
    }
  }

  if (isMixedFolder && hasTrustedTags && existingTags.hasArtwork) {
    let mainArtist = forceArtist || inferredArtist || existingTags.artist;
    mainArtist = mainArtist.split(/&|,|\band\b/i)[0].trim();
    const cleanTitle = cleanText(existingTags.title);
    const expectedFilename = `${mainArtist} - ${cleanTitle}${ext}`.replace(/[\\/*?:"<>|]/g, "");
    if (filename.toLowerCase() === expectedFilename.toLowerCase()) {
      console.log(`\n${colors.bright}${colors.green}➜ Skipping (already processed):${colors.reset} ${filename}`);
      return;
    }
  }

  let skipOnlineTagging = false;
  let finalTitle = "";
  let finalArtist = "";
  let finalAlbum = "";
  let searchTitle = title;
  let searchArtist = forceArtist || inferredArtist || parsedArtist || existingTags.artist || "";

  if (hasTrustedTags) {
    skipOnlineTagging = true;
    finalArtist = forceArtist || cleanText(existingTags.artist);
    finalTitle = cleanText(existingTags.title);
    finalAlbum = forceAlbum || (existingTags.album ? cleanText(existingTags.album) : "Unknown Album");
    searchArtist = finalArtist;
    searchTitle = finalTitle;
    console.log(`  ${colors.green}✓ Trusted existing tags found: "${finalArtist} - ${finalTitle}" [${finalAlbum}]${colors.reset}`);
  } else {
    let useTags = false;
    if (!ignoreExistingTags && existingTags.title && title) {
      const isFilenameGeneric = /^track\s*\d+$/i.test(title.trim()) || /untitled/i.test(title) || /unknown/i.test(title) || /^audiotrack\d+$/i.test(title.trim());
      if (!isFilenameGeneric && isTagTitleSimilar(existingTags.title, title)) {
        useTags = true;
      }
    }

    if (useTags) {
      if (existingTags.title && !cleanText(existingTags.title).toLowerCase().includes("promo")) {
        searchTitle = cleanText(smartTitleCase(existingTags.title));
      }
      if (existingTags.artist && !forceArtist && !inferredArtist && !parsedArtist) {
        searchArtist = cleanText(existingTags.artist);
      }
    }

    finalTitle = featuredArtist ? `${searchTitle} (feat. ${featuredArtist})` : searchTitle;
    finalArtist = forceArtist || searchArtist || "Unknown Artist";
    if (featuredArtist && !forceArtist) {
      if (searchArtist && searchArtist.toLowerCase() !== 'unknown artist') {
        finalArtist = `${searchArtist} & ${featuredArtist}`;
      } else {
        finalArtist = featuredArtist;
      }
    }
    finalAlbum = forceAlbum || inferredAlbum || existingTags.album || "Unknown Album";
  }

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
  if (skipOnlineTagging) {
    if (!artwork && !existingTags.hasArtwork) {
      console.log(`  Searching online for missing cover art...`);
      const candidates = await fetchTrackMetadata(searchArtist, searchTitle);
      const goodTrackCandidates = candidates.filter(c => c.score >= 0.7);
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
  } else if (!matchedOfficial && !isGenericTitle) {
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

  const reconciled = reconcileFeatures(finalArtist, finalTitle, featuredArtist, parsedArtist);
  finalArtist = reconciled.artist;
  finalTitle = reconciled.title;

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
      let mainArtist = forceArtist || inferredArtist || finalArtist || "";
      mainArtist = mainArtist.split(/&|,|\band\b/i)[0].trim();
      if (mainArtist.toLowerCase() === 'unknown artist') {
        mainArtist = "";
      }
      let newFilename = mainArtist ? `${mainArtist} - ${finalTitle}${ext}` : `${finalTitle}${ext}`;

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
  const targetDir = stats.isFile() ? path.dirname(targetPath) : targetPath;
  knownArtists = buildKnownArtists(targetDir);
  console.log(`Dynamically compiled ${knownArtists.length} known artist names for query routing.`);

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
