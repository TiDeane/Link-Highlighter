let normalizeQueryParams = true;
let normalizeHashFragments = true;

/* In-memory mirror of storage, kept in sync by storage.onChanged */
let isActive = false;       // whether newly opened links are saved
let showHighlights = true;  // whether saved links are highlighted
let storedList = [];          // highlightList exactly as stored
let highlightSet = new Set(); // storedList normalized with the current settings

/* Highlight appearance (the defaults match highlight.css) */
const DEFAULT_COLORS = { highlightColor: '#ffff00', highlightOpacity: 0.7, outlineColor: '#ffa500', outlineOpacity: 1 };
let colors = { ...DEFAULT_COLORS };

const stateLoaded = chrome.storage.local.get({
  isActive: false,
  showHighlights: true,
  highlightList: [],
  normalizeQueryParams: true,
  normalizeHashFragments: true,
  ...DEFAULT_COLORS
}).then(state => {
  for (const key in DEFAULT_COLORS) colors[key] = state[key];
  applyColors();

  ({ isActive, showHighlights, normalizeQueryParams, normalizeHashFragments } = state);
  storedList = state.highlightList;
  highlightSet = new Set(storedList.map(normalizeURL));
});

/* Save opened links */
document.addEventListener('mousedown', async (e) => {
  let link = e.target.closest('a');
  if (!link || !link.href) return;

  // The extension was reloaded or updated, and this copy of the script is orphaned
  if (!chrome.runtime?.id) {
    cleanupObservers();
    return;
  }

  await stateLoaded;
  if (!isActive) return;

  const normalizedHref = normalizeURL(link.href);

  if (!highlightSet.has(normalizedHref)) {
    // Update locally right away, so rapid clicks don't overwrite each other
    highlightSet.add(normalizedHref);
    storedList = Array.from(highlightSet);
    if (linkObserver) highlightMatchingLinks(new Set([normalizedHref]));
    else if (showHighlights) setupHighlighting();

    await chrome.storage.local.set({ highlightList: storedList });
  }
});

function toRgba(hex, opacity) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/* Pass custom colors to highlight.css through CSS variables on <html> */
function applyColors() {
  const style = document.documentElement.style;
  const isDefault = Object.keys(DEFAULT_COLORS).every(key => colors[key] === DEFAULT_COLORS[key]);

  // Leave the page untouched unless the user customized something
  if (isDefault) {
    style.removeProperty('--link-highlighter-bg');
    style.removeProperty('--link-highlighter-outline');
    return;
  }

  style.setProperty('--link-highlighter-bg', toRgba(colors.highlightColor, colors.highlightOpacity));
  style.setProperty('--link-highlighter-outline', toRgba(colors.outlineColor, colors.outlineOpacity));
}

function normalizeURL(url) {
  try {
    const u = new URL(url);
    if (normalizeQueryParams) u.search = '';
    if (normalizeHashFragments) u.hash = '';
    return u.origin + u.pathname.replace(/\/$/, '') + u.search + u.hash;
  } catch {
    return url;
  }
}

function highlightLink(link) {
  // inline-block lets the highlight wrap images and block content, but it would
  // break links that have their own layout (flex nav items, etc.), so it's only
  // applied to plain inline links
  if (getComputedStyle(link).display === 'inline') {
    link.classList.add('highlighted-link', 'highlighted-link-inline');
  } else {
    link.classList.add('highlighted-link');
  }
}

function unhighlightLink(link) {
  link.classList.remove('highlighted-link', 'highlighted-link-inline');
}

function clearAllHighlights() {
  document.querySelectorAll('a.highlighted-link').forEach(unhighlightLink);
}

/* Highlight links matching newly added URLs, without rebuilding the observers */
function highlightMatchingLinks(addedSet) {
  document.querySelectorAll('a[href]:not(.highlighted-link)').forEach(link => {
    if (addedSet.has(normalizeURL(link.href))) highlightLink(link);
  });
}

let linkObserver = null;
let mutationObserver = null;

/* Main highlighting function */
async function setupHighlighting() {
  await stateLoaded;

  cleanupObservers()

  if (!showHighlights || highlightSet.size === 0) {
    clearAllHighlights();
    return;
  }

  // one observer for all links
  linkObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;

      const link = entry.target;
      const normalizedHref = normalizeURL(link.href);

      // A re-checked link's href may have changed, so the highlight can also be removed.
      // Only touch the class when it has to change: any write to it, even one that
      // changes nothing, is reported to the mutation observer, which re-checks the link
      const isHighlighted = link.classList.contains('highlighted-link');
      if (highlightSet.has(normalizedHref)) {
        if (!isHighlighted) highlightLink(link);
      } else if (isHighlighted) {
        unhighlightLink(link);
      }

      linkObserver.unobserve(link);
    }
  }, { root: null, threshold: 0.1, rootMargin: '100px' });

  document.querySelectorAll('a[href]').forEach(link => { linkObserver.observe(link); });

  observeNewLinks(linkObserver);
}

/* Watch for new <a> elements being added to the DOM, and for existing ones
   getting their href set or their highlight class wiped by a page re-render */
function observeNewLinks(linkObserver) {
  if (mutationObserver) mutationObserver.disconnect();

  mutationObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        const link = mutation.target;
        if (link.tagName !== 'A' || !link.hasAttribute('href')) continue;

        // Re-check links whose href changed or that lost their highlight
        if (mutation.attributeName === 'href' || !link.classList.contains('highlighted-link')) {
          linkObserver.observe(link);
        }
        continue;
      }

      // Unobserve removed links
      for (const node of mutation.removedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        if (node.matches && node.matches('a[href]')) {
          linkObserver.unobserve(node);
        }

        if (node.querySelectorAll) {
          node.querySelectorAll('a[href]').forEach(link => linkObserver.unobserve(link));
        }
      }

      // Observe added links
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        if (node.matches && node.matches('a[href]')) {
          linkObserver.observe(node);
        }

        if (node.querySelectorAll) {
          node.querySelectorAll('a[href]').forEach(link => { linkObserver.observe(link); });
        }
      }
    }
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href', 'class']
  });
}

function cleanupObservers() {
  if (linkObserver) linkObserver.disconnect();
  if (mutationObserver) mutationObserver.disconnect();

  mutationObserver = null;
  linkObserver = null;
}

/* Listen for changes in storage (toggles, settings or list update) */
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area != 'local') return;

  await stateLoaded;

  // Color changes only need the CSS variables updated, not a re-check of links
  let colorsChanged = false;
  for (const key in DEFAULT_COLORS) {
    if (key in changes) {
      colors[key] = changes[key].newValue ?? DEFAULT_COLORS[key];
      colorsChanged = true;
    }
  }
  if (colorsChanged) applyColors();

  const settingsChanged = 'normalizeQueryParams' in changes || 'normalizeHashFragments' in changes;

  if ('normalizeQueryParams' in changes) {
    normalizeQueryParams = changes.normalizeQueryParams.newValue;
    if (!normalizeQueryParams) clearAllHighlights();
  } else if ('normalizeHashFragments' in changes) {
    normalizeHashFragments = changes.normalizeHashFragments.newValue;
    if (!normalizeHashFragments) clearAllHighlights();
  }

  if ('isActive' in changes) isActive = changes.isActive.newValue;
  if ('showHighlights' in changes) showHighlights = changes.showHighlights.newValue ?? true;
  if ('highlightList' in changes) storedList = changes.highlightList.newValue ?? [];

  if (!('showHighlights' in changes || 'highlightList' in changes || settingsChanged)) return;

  const oldSet = highlightSet;
  highlightSet = new Set(storedList.map(normalizeURL));

  // Common case: only new links were added (a click in this or another tab)
  const onlyAdded = !('showHighlights' in changes) && !settingsChanged && linkObserver &&
    [...oldSet].every(url => highlightSet.has(url));

  if (onlyAdded) {
    const addedSet = new Set([...highlightSet].filter(url => !oldSet.has(url)));
    if (addedSet.size > 0) highlightMatchingLinks(addedSet);
  } else {
    setupHighlighting();
  }
});

/* Run once on page load */
setupHighlighting();
