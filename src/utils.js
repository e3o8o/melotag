// MeloTag — Utility Functions

// --- Promo keyword cleaner ---
// Matches full domains, brand names, and partial suffix variants like "xclusive"
const PROMO_PATTERNS = [
  // Full domain variants first (most specific)
  /xtooxclusive\.com/gi,
  /tooxclusive\.com/gi,
  /notjustok\.com/gi,
  /mp3bullet\.ng/gi,
  /waploaded\.com/gi,
  /naijaloaded\.com/gi,
  /9jaflaver\.com/gi,
  /fakaza\.com/gi,
  /djitunez\.com/gi,
  /ghkwaku\.com/gi,
  /freshpilot\.com/gi,
  /zamusic\.com/gi,
  /mdundo\.com/gi,
  /boomplay\.com/gi,

  // Brand names without TLD
  /xtooxclusive/gi,
  /tooxclusive/gi,
  /notjustok/gi,
  /mp3bullet/gi,
  /waploaded/gi,
  /naijaloaded/gi,
  /9jaflaver/gi,
  /djitunez/gi,
  /ghkwaku/gi,
  /freshpilot/gi,
  /fakaza/gi,
  /zamusic/gi,

  // Partial suffix variants — things like "xclusive", "xclusivez", "xclusives"
  /\bxclusiv(?:e|es|ez)?\b/gi,

  // Generic promotional phrases
  /\bfree\s*mp3\b/gi,
  /\bdownload\b/gi,
  /\bpromo\b/gi,
  /\bexclusive\b/gi,

  // Bracket/paren wrapped promo — e.g. "[XclusivePromo]", "(Waploaded.com)"
  /[\[(][^\]()]*(?:xclusive|promo|download|waploaded|naijaloaded|tooxclusive|notjustok|mp3)[^\]()]*[\])]/gi,
];

export function cleanPromo(text) {
  if (!text) return '';
  let out = text;
  PROMO_PATTERNS.forEach(p => { out = out.replace(p, ''); });
  // Remove empty brackets/parens left behind
  out = out.replace(/\s*\[\s*\]\s*/g, '').replace(/\s*\(\s*\)\s*/g, '');
  // Clean up separators left at end/start after stripping
  out = out.replace(/\s*[-_|]\s*$/, '').replace(/^\s*[-_|]\s*/, '');
  // Normalize whitespace
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

// --- Parse featured artist from title ---
// Returns { baseTitle, featuredArtist }
export function parseFeaturedArtist(title) {
  if (!title) return { baseTitle: title, featuredArtist: '' };
  // Patterns: (feat. X), [feat. X], ft. X, featuring X
  const match = title.match(/\s*[\[(]?\b(?:feat(?:uring)?|ft)\.?\s+([^\]\)]+?)[\])]?\s*$/i);
  if (match) {
    const featuredArtist = match[1].trim();
    const baseTitle = title.slice(0, match.index).trim();
    return { baseTitle, featuredArtist };
  }
  return { baseTitle: title, featuredArtist: '' };
}

// --- Infer artist and album from folder name ---
export function inferFromFolderName(folderName) {
  const parts = folderName.split(/[-_]+/);
  let artist = '';
  let album = '';
  if (parts.length >= 2) {
    artist = parts[0].trim();
    album = parts.slice(1).join(' ').replace(/album/gi, '').trim();
  } else {
    album = folderName.replace(/album/gi, '').trim();
  }
  return {
    artist: cleanPromo(artist),
    album: cleanPromo(album)
  };
}

export function generateId() {
  return 'track-' + Math.random().toString(36).substr(2, 9);
}

export function escapeHTML(str) {
  return str.replace(/[&<>'"]/g,
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

export function formatTime(seconds) {
  if (isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// Smart Filename Parser — strips promo junk then splits into artist / title
export function parseMessyFilename(filename) {
  let name = filename.replace(/\.[^/.]+$/, '');

  // Strip promo tags first (before splitting by dash)
  name = cleanPromo(name);

  // Strip audio/video quality markers
  name = name.replace(/\(official\s*(video|audio|lyrics|music)?\s*\)/gi, '');
  name = name.replace(/\[official\s*(video|audio|lyrics|music)?\s*\]/gi, '');
  name = name.replace(/\b(128|192|320)kbps\b/gi, '');
  name = name.replace(/\blyric\s*video\b/gi, '');
  name = name.replace(/\b(HQ|HD|4K)\b/g, '');

  let parts = name.split(/\s*-\s*|\s*–\s*|\s*—\s*/);
  // Drop any part that looks like a bare domain name
  const domainRegex = /\b([a-zA-Z0-9-]+\.[a-zA-Z]{2,6})\b/i;
  parts = parts.filter(part => !domainRegex.test(part));

  let artist = '';
  let title = '';

  if (parts.length >= 2) {
    artist = cleanPart(parts[0]);
    title = cleanPart(parts[1]);
  } else if (parts.length === 1) {
    title = cleanPart(parts[0]);
  }

  // Final promo pass on each output
  return { artist: cleanPromo(artist), title: cleanPromo(title) };
}

function cleanPart(part) {
  if (!part) return '';
  let cleaned = part.replace(/^[\s\d._-]+/, '');
  cleaned = cleaned.replace(/\s*[([].*?[\])]\s*/g, ' ');
  cleaned = cleanPromo(cleaned);
  return cleaned.replace(/\s+/g, ' ').trim();
}

const LOWERCASE_WORDS = new Set(['a','an','the','of','in','on','at','to','for','but','and','or','nor','is','as','by']);
export function smartTitleCase(text) {
  if (!text) return text;
  const stripped = text.replace(/[^a-zA-Z]/g, '');
  if (stripped.length === 0) return text;
  const lower = stripped === stripped.toLowerCase();
  const upper = stripped === stripped.toUpperCase();
  if (!lower && !upper) return text; // already mixed-case, respect it
  return text.split(/(\s+)/).map((word, i) => {
    const clean = word.toLowerCase();
    if (/\s/.test(word)) return word;
    if (i === 0 || LOWERCASE_WORDS.has(clean) === false) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    return clean;
  }).join('');
}

export function cleanKey(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

