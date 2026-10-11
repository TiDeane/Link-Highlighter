document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('toggle');
  const showToggle = document.getElementById('show-highlights');
  const clearButton = document.getElementById('clear');
  const clearConfirm = document.getElementById('clear-confirm');
  const linkCount = document.getElementById('link-count');
  const normalizeQuery = document.getElementById('normalize-query');
  const normalizeHash = document.getElementById('normalize-hash');

  // Restore saved state
  const { isActive, showHighlights, highlightList, normalizeQueryParams, normalizeHashFragments } =
    await chrome.storage.local.get({
      isActive: false,
      showHighlights: true,
      highlightList: [],
      normalizeQueryParams: true,
      normalizeHashFragments: true
    });

  toggle.checked = isActive;
  showToggle.checked = showHighlights;
  updateLinkCount(highlightList.length);
  normalizeQuery.checked = normalizeQueryParams;
  normalizeHash.checked = normalizeHashFragments;

  toggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ isActive: toggle.checked });
  });

  showToggle.addEventListener('change', async () => {
    await chrome.storage.local.set({ showHighlights: showToggle.checked });
  });

  // First click reveals the confirmation (clicking again cancels), second button clears
  clearButton.addEventListener('click', () => {
    clearConfirm.hidden = !clearConfirm.hidden;
  });

  clearConfirm.addEventListener('click', async () => {
    clearConfirm.hidden = true;
    await chrome.storage.local.set({ highlightList: [] });
  });

  function updateLinkCount(count) {
    linkCount.textContent = count;
    clearButton.disabled = count === 0;
    if (count === 0) clearConfirm.hidden = true;
  }

  // Keep the count current while the popup is open
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'highlightList' in changes) {
      updateLinkCount((changes.highlightList.newValue ?? []).length);
    }
  });

  normalizeQuery.addEventListener('change', async () => {
    await chrome.storage.local.set({ normalizeQueryParams: normalizeQuery.checked });
  });

  normalizeHash.addEventListener('change', async () => {
    await chrome.storage.local.set({ normalizeHashFragments: normalizeHash.checked });
  });
});

/* Chrome and Firefox have slightly different animations */
const isFirefox = typeof InstallTrigger !== 'undefined';
document.body.classList.add(isFirefox ? 'firefox' : 'chrome');

document.querySelector('.section-header').addEventListener('click', () => {
  const container = document.querySelector('.options-container');
  const arrow = document.querySelector('.arrow');
  const advancedOptions = document.querySelector('.advanced-options');

  advancedOptions.classList.toggle('expanded');
  container.classList.toggle('visible');
  arrow.classList.toggle('up');
});
