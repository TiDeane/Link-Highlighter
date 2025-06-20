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
