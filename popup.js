document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('toggle');
  const normalizeQuery = document.getElementById('normalize-query');
  const normalizeHash = document.getElementById('normalize-hash');

  // Restore saved state
  const { isActive, normalizeQueryParams, normalizeHashFragments } =
    await chrome.storage.local.get({
      isActive: false,
      normalizeQueryParams: true,
      normalizeHashFragments: true
    });

  toggle.checked = isActive;
  normalizeQuery.checked = normalizeQueryParams;
  normalizeHash.checked = normalizeHashFragments;

  toggle.addEventListener('change', async () => {
    if (toggle.checked) {
      await chrome.storage.local.set({ isActive: true });
    } else {
      await chrome.storage.local.set({ highlightList: [], isActive: false });
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
