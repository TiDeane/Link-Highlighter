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
    highlightLinks(linkSet);
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

async function highlightLinks(linkSet) {
  document.querySelectorAll('a').forEach(link => {
    const href = normalizeURL(link.href);
    if (linkSet.has(href)) {
      link.classList.add('highlighted-link');
    }
  });
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
        highlightLinks(highlightList);
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
browser.storage.local.get(['isActive', 'highlightList']).then(({ isActive, highlightList }) => {
  if (isActive && highlightList && highlightList.length) {
    const normalizedSet = new Set(highlightList.map(normalizeURL));

    highlightLinks(normalizedSet);
    observeDynamicLinks(normalizedSet);
  }
});

browser.runtime.onMessage.addListener((message) => {
  const normalizedSet = new Set(message.links.map(normalizeURL));

  if (message.action === 'highlightLinks') {
    highlightLinks(normalizedSet);
  }

  if (message.action === 'clearHighlights') {
    clearHighlights(normalizedSet);
  }
});

let pending = false;
function observeDynamicLinks() {
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(async () => {
      const { isActive, highlightList = [] } = await browser.storage.local.get(['isActive', 'highlightList']);
      if (isActive && highlightList.length) {
        const normalizedSet = new Set(highlightList.map(normalizeURL));
        highlightLinks(normalizedSet);
      }
      pending = false;
    }, 1000); // debounce
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

let currentUrl = location.href;
setInterval(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    // When URL changes (SPA navigation), re-highlight links
    browser.storage.local.get(['isActive', 'highlightList']).then(({ isActive, highlightList }) => {
      if (isActive && highlightList.length) {
        const normalizedSet = new Set(highlightList.map(normalizeURL));
        highlightLinks(normalizedSet);
      }
    });
  }
}, 1000); // check every second