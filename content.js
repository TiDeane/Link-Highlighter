// Save opened links
document.addEventListener('mousedown', async (e) => {
  let link = e.target.closest('a');
  if (!link || !link.href) return;

  const { isActive, highlightList = [] } = await browser.storage.local.get(['isActive', 'highlightList']);
  if (!isActive) return;

  if (!highlightList.includes(link.href)) {
    highlightList.push(link.href);
    await browser.storage.local.set({ highlightList });

    // Re-apply highlights immediately in current tab
    highlightLinks(highlightList);
  }
});

async function highlightLinks(links) {
  document.querySelectorAll('a').forEach(link => {
    if (links.includes(link.href)) {
      link.classList.add('highlighted-link');
    }
  });
}

async function clearHighlights(links) {
  document.querySelectorAll('a').forEach(link => {
    if (links.includes(link.href)) {
      link.classList.remove('highlighted-link');
    }
  });
}

// Listen for changes in storage (toggle or list update)
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ('isActive' in changes || 'highlightList' in changes)) {
    browser.storage.local.get(['isActive', 'highlightList']).then(({ isActive, highlightList }) => {
      if (isActive && highlightList && highlightList.length) {
        highlightLinks(highlightList);
      } else if (highlightList && highlightList.length) {
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
    highlightLinks(highlightList);
    observeDynamicLinks(highlightList);
  }
});

browser.runtime.onMessage.addListener((message) => {
  if (message.action === 'highlightLinks' && Array.isArray(message.links)) {
    highlightLinks(message.links);
  }

  if (message.action === 'clearHighlights') {
    clearHighlights(message.links);
  }
});

let pending = false;
function observeDynamicLinks(links) {
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      highlightLinks(links);
      pending = false;
    }, 300); // small debounce
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

let currentUrl = location.href;
setInterval(() => {
  if (location.href !== currentUrl) {
    currentUrl = location.href;
    // When URL changes (SPA navigation), re-highlight links
    browser.storage.local.get(['isActive', 'myList']).then(({ isActive, myList }) => {
      if (isActive && myList && myList.length) {
        highlightLinks(myList);
      }
    });
  }
}, 500); // check every 0.5s