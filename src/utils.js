// MeloTag — Utility Functions

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

// Smart Filename Parser
export function parseMessyFilename(filename) {
  let name = filename.replace(/\.[^/.]+$/, "");

  name = name.replace(/\(official\s*(video|audio|lyrics|music)?\s*\)/gi, '');
  name = name.replace(/\[official\s*(video|audio|lyrics|music)?\s*\]/gi, '');
  name = name.replace(/\b(128|192|320)kbps\b/gi, '');
  name = name.replace(/\blyric\s*video\b/gi, '');
  name = name.replace(/\b(HQ|HD|4K)\b/g, '');

  let parts = name.split(/\s*-\s*|\s*–\s*|\s*—\s*/);
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

  return { artist, title };
}

function cleanPart(part) {
  if (!part) return '';
  let cleaned = part.replace(/^[\s\d._-]+/, '');
  cleaned = cleaned.replace(/\s*[([].*?[\])]\s*/g, ' ');
  return cleaned.replace(/\s+/g, ' ').trim();
}
