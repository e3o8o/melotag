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

// Search iTunes suggestions
async function fetchiTunesMetadata(artist, trackTitle) {
  // Build a query with artist and cleaned track title
  const query = `${artist || ''} ${trackTitle}`.trim();
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=5`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'MeloTag/1.0' } });
    if (res.ok) {
      const data = await res.json();
      const results = data.results || [];
      for (const item of results) {
        const resArtist = (item.artistName || "").toLowerCase();
        const resTitle = (item.trackName || "").toLowerCase();
        
        // Match artist and title
        const artistMatch = !artist || resArtist.includes(artist.toLowerCase()) || artist.toLowerCase().includes(resArtist);
        const titleMatch = resTitle.includes(trackTitle.toLowerCase()) || trackTitle.toLowerCase().includes(resTitle);
        
        if (artistMatch && titleMatch) {
          return item;
        }
      }
    }
  } catch (err) {
    // Fail silently
  }
  return null;
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
async function processFile(filepath, inferredArtist, inferredAlbum, albumArtwork, tracklistMap) {
  const filename = path.basename(filepath);
  const { trackNum, title, featuredArtist } = parseFilename(filename, inferredArtist);

  let finalTitle = featuredArtist ? `${title} (feat. ${featuredArtist})` : title;
  let finalArtist = forceArtist || inferredArtist || "Unknown Artist";
  if (featuredArtist && !forceArtist) {
    finalArtist = `${inferredArtist} & ${featuredArtist}`;
  }
  
  let finalAlbum = forceAlbum || inferredAlbum || "Unknown Album";
  let finalTrack = trackNum;
  let finalYear = "2025";
  let finalGenre = "Afrobeats";
  let artwork = albumArtwork;

  console.log(`\n${colors.bright}${colors.blue}➜ Processing:${colors.reset} ${filename}`);
  
  // Try matching with official tracklist first
  // Strip featured details when creating the normalization key to ensure clean matches
  const baseTitleClean = title.split(/\b(?:ft|feat|featuring)\b/i)[0].trim();
  const normKey = baseTitleClean.toLowerCase().replace(/[^a-z0-9]/g, "");
  let matchedOfficial = false;

  if (tracklistMap && tracklistMap.has(normKey)) {
    const official = tracklistMap.get(normKey);
    console.log(`  ${colors.green}✓ Matched official album tracklist! (${official.title})${colors.reset}`);
    finalTitle = smartTitleCase(official.title);
    finalArtist = official.artist;
    finalTrack = official.trackNumber;
    matchedOfficial = true;
  } else if (tracklistMap) {
    // Try matching if the tracklist key is contained in the filename's normKey (or vice-versa)
    for (const [key, official] of tracklistMap.entries()) {
      if (key.length >= 4 && (normKey.includes(key) || key.includes(normKey))) {
        console.log(`  ${colors.green}✓ Matched official album tracklist via substring! (${official.title})${colors.reset}`);
        finalTitle = smartTitleCase(official.title);
        finalArtist = official.artist;
        finalTrack = official.trackNumber;
        matchedOfficial = true;
        break;
      }
    }
  }

  // Fetch from iTunes as fallback/supplement
  if (!matchedOfficial) {
    const metadata = await fetchiTunesMetadata(inferredArtist, title);
    if (metadata) {
      console.log(`  ${colors.green}✓ Matches iTunes database!${colors.reset}`);
      finalTitle = metadata.trackName || finalTitle;
      finalArtist = metadata.artistName || finalArtist;
      
      // Lock album name if we are processing a folder representing an album
      if (!inferredAlbum) {
        finalAlbum = metadata.collectionName || finalAlbum;
      }
      
      finalTrack = String(metadata.trackNumber || finalTrack);
      finalGenre = metadata.primaryGenreName || finalGenre;
      const date = metadata.releaseDate || "";
      if (date && date.length >= 4) {
        finalYear = date.substring(0, 4);
      }

      if (!artwork) {
        const artUrl = (metadata.artworkUrl100 || "").replace("100x100bb.jpg", "1000x1000bb.jpg");
        if (artUrl) {
          console.log(`  ${colors.cyan}⬇ Downloading cover art from iTunes...${colors.reset}`);
          artwork = await downloadArtwork(artUrl);
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
    // Strip comments, web URLs, PRIV tags, etc.
    NodeID3.removeTags(filepath);

    // Write clean tags
    const success = NodeID3.write(tags, filepath);
    if (success) {
      console.log(`  ${colors.green}✓ Tags saved: ${finalArtist} - ${finalTitle} [${finalAlbum}]${colors.reset}`);
      if (artwork) console.log(`  ${colors.green}✓ Cover art embedded successfully.${colors.reset}`);
    } else {
      console.warn(`  ${colors.red}✗ Failed writing tags to ${filename}${colors.reset}`);
    }

    // Rename file if enabled
    if (shouldRename) {
      let newFilename = "";
      if (finalTrack) {
        newFilename = `${String(finalTrack).padStart(2, '0')} - ${finalTitle}.mp3`;
      } else {
        newFilename = `${finalTitle}.mp3`;
      }

      // Remove illegal characters from filename
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
    await processFile(targetPath, forceArtist || "", forceAlbum || "", null, null);
    console.log(`\n${colors.bright}${colors.green}✓ Finished tagging file!${colors.reset}\n`);

  } else if (stats.isDirectory()) {
    console.log(`${colors.bright}${colors.cyan}MeloTag folder processor starting...${colors.reset}`);
    
    // Infer artist & album names from folder name
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

    console.log(`Found ${files.length} tracks. Searching for album-wide cover art...`);

    // Fetch album metadata from Deezer to get tracklist & cover art
    let albumArtwork = null;
    let tracklistMap = new Map();
    const albumQuery = `${inferredArtist} ${inferredAlbum}`;
    let resolvedArtist = inferredArtist;
    let resolvedAlbum = inferredAlbum;
    
    try {
      const albumSearchRes = await fetch(`https://api.deezer.com/search/album?q=${encodeURIComponent(albumQuery)}`);
      if (albumSearchRes.ok) {
        const searchData = await albumSearchRes.json();
        const albums = searchData.data || [];
        if (albums.length > 0) {
          const albumId = albums[0].id;
          resolvedArtist = forceArtist || albums[0].artist?.name || inferredArtist;
          resolvedAlbum = forceAlbum || albums[0].title || inferredAlbum;

          const artUrl = albums[0].cover_xl || albums[0].cover_big || albums[0].cover;
          if (artUrl) {
            console.log(`${colors.green}Found album cover art on Deezer: ${artUrl}${colors.reset}`);
            albumArtwork = await downloadArtwork(artUrl);
          }
          
          // Get tracklist
          const tracksRes = await fetch(`https://api.deezer.com/album/${albumId}/tracks`);
          if (tracksRes.ok) {
            const tracksData = await tracksRes.json();
            const tracks = tracksData.data || [];
            console.log(`${colors.green}Retrieved official tracklist from Deezer (${tracks.length} tracks). Fetching track details...${colors.reset}`);
            
            // Parallel fetch details for all tracks to resolve contributors (features)
            const trackDetails = await Promise.all(
              tracks.map(async (t) => {
                try {
                  const detailRes = await fetch(`https://api.deezer.com/track/${t.id}`);
                  if (detailRes.ok) {
                    return await detailRes.json();
                  }
                } catch (e) {
                  // Fallback to basic track info
                }
                return t;
              })
            );

            trackDetails.forEach(t => {
              let finalT = smartTitleCase(t.title || "");
              let finalA = t.artist?.name || resolvedArtist;

              // Extract features from contributors
              if (t.contributors && t.contributors.length > 1) {
                const mainArtist = t.artist?.name || resolvedArtist;
                const feats = t.contributors
                  .filter(c => c.name.toLowerCase() !== mainArtist.toLowerCase())
                  .map(c => c.name);
                
                if (feats.length > 0) {
                  finalT = `${finalT} (feat. ${feats.join(' & ')})`;
                  finalA = `${mainArtist} & ${feats.join(' & ')}`;
                }
              }

              // Store by clean title key
              const key = t.title.toLowerCase().replace(/[^a-z0-9]/g, "");
              const shortKey = (t.title_short || "").toLowerCase().replace(/[^a-z0-9]/g, "");
              
              const trackInfo = {
                title: finalT,
                trackNumber: String(t.track_position),
                artist: finalA
              };
              
              tracklistMap.set(key, trackInfo);
              if (shortKey && !tracklistMap.has(shortKey)) {
                tracklistMap.set(shortKey, trackInfo);
              }
            });
          }
        }
      }
    } catch (err) {
      console.warn("Deezer tracklist fetch failed:", err.message);
    }

    // Process all MP3 files
    for (const filename of files.sort()) {
      const filepath = path.join(targetPath, filename);
      await processFile(filepath, resolvedArtist, resolvedAlbum, albumArtwork, tracklistMap);
    }

    console.log(`\n${colors.bright}${colors.green}✓ Finished tagging all ${files.length} files in folder!${colors.reset}\n`);
  }
}

main();
