/* Loaded before both content.js and popup.js, so the two always agree */

/* Highlight appearance (the defaults match highlight.css) */
const DEFAULT_COLORS = { highlightColor: '#ffff00', highlightOpacity: 0.7, outlineColor: '#ffa500', outlineOpacity: 1 };

function toRgba(hex, opacity) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/* A link with its query and hash optionally removed, and no trailing slash */
function cleanURL(url, stripQuery, stripHash) {
  try {
    const u = new URL(url);
    if (stripQuery) u.search = '';
    if (stripHash) u.hash = '';
    return u.origin + u.pathname.replace(/\/$/, '') + u.search + u.hash;
  } catch {
    return url;
  }
}
