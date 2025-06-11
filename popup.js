document.addEventListener('DOMContentLoaded', async () => {
  const toggle = document.getElementById('toggle');

  // Restore saved state
  const { isActive } = await browser.storage.local.get('isActive');
  toggle.checked = !!isActive;

  toggle.addEventListener('change', async () => {
    if (toggle.checked) {
      await browser.storage.local.set({ isActive: true });
    } else {
      await browser.storage.local.set({ myList: [] });
      await browser.storage.local.set({ isActive: false });
    }
  });
});
