let normalizeQueryParams = true;
let normalizeHashFragments = true;

chrome.storage.local.get({ normalizeQueryParams, normalizeHashFragments})
  .then(settings => {({ normalizeQueryParams, normalizeHashFragments } = settings);
});

// Save opened links
document.addEventListener('mousedown', async (e) => {
  let link = e.target.closest('a');
  if (!link || !link.href) return;

  const { isActive, highlightList = [] } = await chrome.storage.local.get(['isActive', 'highlightList']);
  if (!isActive) return;

  const normalizedHref = normalizeURL(link.href);
  const linkSet = new Set(highlightList.map(normalizeURL));

  if (!linkSet.has(normalizedHref)) {
    linkSet.add(normalizedHref);
    await chrome.storage.local.set({ highlightList: Array.from(linkSet) });
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

function clearAllHighlights() {
  document.querySelectorAll('a.highlighted-link').forEach(link => {
    link.classList.remove('highlighted-link');
  });
}

let linkObserver = null;
let mutationObserver = null;

/* Main highlighting function */
async function setupHighlighting() {
  const { isActive, highlightList = [] } = await chrome.storage.local.get(['isActive', 'highlightList']);
  // console.log(highlightList);

  cleanupObservers()

  if (!isActive || highlightList.length === 0) {
    clearAllHighlights();
    return;
  }

  const highlightSet = new Set(highlightList.map(normalizeURL));

  // one observer for all links
  linkObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;

      const link = entry.target;
      const normalizedHref = normalizeURL(link.href);

      if (highlightSet.has(normalizedHref)) {
        link.classList.add('highlighted-link');
      }

      linkObserver.unobserve(link);
    }
  }, { root: null, threshold: 0.1, rootMargin: '100px' });

  document.querySelectorAll('a[href]').forEach(link => { linkObserver.observe(link); });

  observeNewLinks(linkObserver);
}

/* Watch for new <a> elements being added to the DOM */
function observeNewLinks(linkObserver) {
  if (mutationObserver) mutationObserver.disconnect();

  mutationObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
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

  mutationObserver.observe(document.body, { childList: true, subtree: true });
}

function cleanupObservers() {
  if (linkObserver) linkObserver.disconnect();
  if (mutationObserver) mutationObserver.disconnect();

  mutationObserver = null;
  linkObserver = null;
}

/* Listen for changes in storage (toggle or list update) */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area != 'local') return;

  if ('normalizeQueryParams' in changes) {
    normalizeQueryParams = changes.normalizeQueryParams.newValue;
    if (!normalizeQueryParams) clearAllHighlights();
  } else if ('normalizeHashFragments' in changes) {
    normalizeHashFragments = changes.normalizeHashFragments.newValue;
    if (!normalizeHashFragments) clearAllHighlights();
  }

  if ('isActive' in changes || 'highlightList' in changes || 'normalizeQueryParams' in changes || 'normalizeHashFragments' in changes) {
    setupHighlighting();
  }
});

/* Run once on page load */
setupHighlighting();
