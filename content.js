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

    // Re-apply highlights immediately in current tab
    setupHighlighting(linkSet);
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

async function clearHighlights(linkSet) {
  document.querySelectorAll('a').forEach(link => {
    const href = normalizeURL(link.href);
    if (linkSet.has(href)) {
      link.classList.remove('highlighted-link');
    }
  });
}

// Listen for changes in storage (toggle or list update)
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ('isActive' in changes || 'highlightList' in changes)) {
    browser.storage.local.get(['isActive', 'highlightList']).then(({ isActive, highlightList }) => {
      const normalizedSet = new Set(highlightList.map(normalizeURL));

      if (isActive && normalizedSet.size > 0) {
        setupHighlighting(highlightList);
      } else if (normalizedSet.size > 0) {
        clearHighlight(highlightList);
      } else {
        // If list empty or inactive, remove all highlights globally
        document.querySelectorAll('a.highlighted-link').forEach(el => el.classList.remove('highlighted-link'));
      }
    });
  }
});

// On initial load, do the same check
(async () => {
  const { isActive, highlightList = [] } = await browser.storage.local.get(['isActive', 'highlightList']);
  if (isActive && highlightList.length) {
    const normalizedSet = new Set(highlightList.map(normalizeURL));

    setupHighlighting(normalizedSet);
    observeDynamicLinks(normalizedSet);
  }
});

browser.runtime.onMessage.addListener((message) => {
  const normalizedSet = new Set(message.links.map(normalizeURL));

  if (message.action === 'highlightLinks') {
    setupHighlighting(normalizedSet);
  }

  if (message.action === 'clearHighlights') {
    clearHighlights(normalizedSet);
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

// Main highlighting function
async function setupHighlighting() {
  const { isActive, highlightList = [] } = await browser.storage.local.get(['isActive', 'highlightList']);
  if (!isActive || highlightList.length === 0) return;

  const highlightSet = new Set(highlightList.map(normalizeURL));

  // one observer for all links
  const linkObserver = new IntersectionObserver((entries) => {
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
  let pending = false;

  const mutationObserver = new MutationObserver(() => {
    if (pending) return;
    pending = true;

    setTimeout(() => {
      const links = [];
      document.querySelectorAll('a[href]').forEach(link => links.push(link));
      links.forEach(link => linkObserver.observe(link));
      pending = false;
    }, 300); // delay
  });

  mutationObserver.observe(document.body, { childList: true, subtree: true });
}

// Highlights when the URL changes (SPA navigation)
let currentUrl = location.href;
setInterval(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    setupHighlighting();
  }
}, 500);

// Run once on page load
setupHighlighting();
