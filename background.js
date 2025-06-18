async function sendHighlightsToTab(tabId) {
  try {
    const { isActive, highlightList } = await browser.storage.local.get(['isActive', 'highlightList']);
    if (!isActive || !highlightList?.length) {
      // Explicitly send a clear message if inactive
      await browser.tabs.sendMessage(tabId, {
        action: 'clearHighlights',
        links: highlightList ?? []
      });
      return;
    }

    await browser.tabs.sendMessage(tabId, {
      action: 'highlightLinks',
      links: highlightList
    });
  } catch { };
}

browser.tabs.onCreated.addListener(tab => {
  if (tab.id) sendHighlightsToTab(tab.id);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    setTimeout(() => sendHighlightsToTab(tabId), 1000);
  }
});
