// Save opened links
document.addEventListener('mousedown', async (e) => {
  let link = e.target.closest('a');
  if (!link || !link.href) return;

  const { isActive, highlightList = [] } = await browser.storage.local.get(['isActive', 'highlightList']);
  if (!isActive) return;

  const normalizedHref = normalizeURL(link.href);
  const linkSet = new Set(highlightList.map(normalizeURL));

  if (!linkSet.has(normalizedHref)) {
    linkSet.add(normalizedHref);
    await browser.storage.local.set({ highlightList: Array.from(linkSet) });
  }
});

function normalizeURL(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname.replace(/\/$/, '');
  } catch {
    return url;
  }
}

function clearAllHighlights() {
  document.querySelectorAll('a.highlighted-link').forEach(link => {
    link.classList.remove('highlighted-link');
  });

  cleanupObservers();
}

let linkObserver = null;
let mutationObserver = null;

// Main highlighting function
async function setupHighlighting() {
  const { isActive, highlightList = [] } = await browser.storage.local.get(['isActive', 'highlightList']);

  cleanupObservers();

  if (!isActive || highlightList.length === 0) {
    clearAllHighlights();
    return;
  }

  const highlightSet = new Set(highlightList.map(normalizeURL));

  // one observer for all links
  linkObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const link = entry.target;
        const normalizedHref = normalizeURL(link.href);
        if (highlightSet.has(normalizedHref)) {
          link.classList.add('highlighted-link');
          linkObserver.unobserve(link);
        }
      }
    });
  }, {
    root: null,
    threshold: 0.1
  });

  document.querySelectorAll('a[href]').forEach(link => {
    linkObserver.observe(link);
  });

  observeNewLinks(linkObserver);
}

// Watch for new <a> elements being added to the DOM
function observeNewLinks(linkObserver) {
  if (mutationObserver) {
    mutationObserver.disconnect();
  }

  mutationObserver = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.matches && node.matches('a[href]')) {
            linkObserver.observe(node);
          }
          node.querySelectorAll && node.querySelectorAll('a[href]').forEach(linkObserver.observe, linkObserver);
        }
      });
    });
  });

  mutationObserver.observe(document.body, { childList: true, subtree: true });
}

function cleanupObservers() {
  if (linkObserver) {
    linkObserver.disconnect();
    linkObserver = null;
  }
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
}

// Listen for changes in storage (toggle or list update)
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ('isActive' in changes || 'highlightList' in changes)) {
    setupHighlighting();
  }
});

// Run once on page load
setupHighlighting();
