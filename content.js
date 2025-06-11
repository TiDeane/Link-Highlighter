// Save clicked links
document.addEventListener('mousedown', (e) => {
  let link = e.target.closest('a');
  if (!link || !link.href) return;

  browser.storage.local.get('myList').then((res) => {
    const list = res.myList || [];
    if (!list.includes(link.href)) {
      list.push(link.href);
      browser.storage.local.set({ myList: list });
    }
  });
});

// ---

function highlightLinks(links) {
  links.forEach(href => {
    // Find all matching links on the page
    const anchors = document.querySelectorAll(`a[href="${href}"]`);
    anchors.forEach(a => a.classList.add('highlighted-link'));
  });
}

function clearHighlight(links) {
  links.forEach(href => {
    const anchors = document.querySelectorAll(`a[href="${href}"]`);
    anchors.forEach(a => a.classList.remove('highlighted-link'));
  });
}

// Listen for changes in storage (toggle or list update)
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ('isActive' in changes || 'myList' in changes)) {
    browser.storage.local.get(['isActive', 'myList']).then(({ isActive, myList }) => {
      if (isActive && myList && myList.length) {
        highlightLinks(myList);
      } else if (myList && myList.length) {
        clearHighlight(myList);
      } else {
        // If list empty or inactive, remove all highlights globally
        document.querySelectorAll('a.highlighted-link').forEach(el => el.classList.remove('highlighted-link'));
      }
    });
  }
});;

// On initial load, do the same check
browser.storage.local.get(['isActive', 'myList']).then(({ isActive, myList }) => {
  if (isActive && myList && myList.length) {
    highlightLinks(myList);
  }
});

// Clear highlights immediately upon toggle off
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'clearHighlights') {
    document.querySelectorAll('a.highlighted-link').forEach(el => {
      el.classList.remove('highlighted-link');
    });
  }
});