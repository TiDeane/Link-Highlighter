let normalizeQueryParams = true;
let normalizeHashFragments = true;

/* In-memory mirror of storage, kept in sync by storage.onChanged */
let isActive = false;
let storedList = [];          // highlightList exactly as stored
let highlightSet = new Set(); // storedList normalized with the current settings

const stateLoaded = chrome.storage.local.get({
  isActive: false,
  highlightList: [],
  normalizeQueryParams: true,
  normalizeHashFragments: true
}).then(state => {
  ({ isActive, normalizeQueryParams, normalizeHashFragments } = state);
  storedList = state.highlightList;
  highlightSet = new Set(storedList.map(normalizeURL));
});

/* Save opened links */
document.addEventListener('mousedown', async (e) => {
  let link = e.target.closest('a');
  if (!link || !link.href) return;

  await stateLoaded;
  if (!isActive) return;

  const normalizedHref = normalizeURL(link.href);

  if (!highlightSet.has(normalizedHref)) {
    // Update locally right away, so rapid clicks don't overwrite each other
    highlightSet.add(normalizedHref);
    storedList = Array.from(highlightSet);
    if (linkObserver) highlightMatchingLinks(new Set([normalizedHref]));
    else setupHighlighting();

    await chrome.storage.local.set({ highlightList: storedList });
  }
});

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

  if (!isActive || highlightSet.size === 0) {
    clearAllHighlights();
    return;
  }

  // one observer for all links
  linkObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;

      const link = entry.target;
      const normalizedHref = normalizeURL(link.href);

      // A re-checked link's href may have changed, so the highlight can also be removed
      if (!highlightSet.has(normalizedHref)) unhighlightLink(link);
      else if (!link.classList.contains('highlighted-link')) highlightLink(link);

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

/* Listen for changes in storage (toggle or list update) */
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area != 'local') return;

  await stateLoaded;

  const settingsChanged = 'normalizeQueryParams' in changes || 'normalizeHashFragments' in changes;

  if ('normalizeQueryParams' in changes) {
    normalizeQueryParams = changes.normalizeQueryParams.newValue;
    if (!normalizeQueryParams) clearAllHighlights();
  } else if ('normalizeHashFragments' in changes) {
    normalizeHashFragments = changes.normalizeHashFragments.newValue;
    if (!normalizeHashFragments) clearAllHighlights();
  }

  if ('isActive' in changes) isActive = changes.isActive.newValue;
  if ('highlightList' in changes) storedList = changes.highlightList.newValue ?? [];

  if (!('isActive' in changes || 'highlightList' in changes || settingsChanged)) return;

  const oldSet = highlightSet;
  highlightSet = new Set(storedList.map(normalizeURL));

  // Common case: only new links were added (a click in this or another tab)
  const onlyAdded = !('isActive' in changes) && !settingsChanged && linkObserver &&
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
