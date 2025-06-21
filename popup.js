document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('toggle');

  // Restore saved state
  const { isActive } = await chrome.storage.local.get('isActive');
  toggle.checked = !!isActive;

  toggle.addEventListener('change', async () => {
    if (toggle.checked) {
      await chrome.storage.local.set({ isActive: true });
    } else {
      await chrome.storage.local.set({ highlightList: [], isActive: false });
    }
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
