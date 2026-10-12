/* Highlight appearance (the defaults match highlight.css) */
const DEFAULT_COLORS = { highlightColor: '#ffff00', highlightOpacity: 0.7, outlineColor: '#ffa500', outlineOpacity: 1 };
const HIGHLIGHT_PRESETS = ['#ffff00', '#7dff6b', '#5ce1ff', '#ff8ad8', '#ffb347', '#c9a0ff'];
// Each outline preset is a darker shade of the highlight preset in the same position
const OUTLINE_PRESETS = ['#ffa500', '#2e9e44', '#1e88e5', '#d81b60', '#e65100', '#8e44ad'];

function toRgba(hex, opacity) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

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

  // Expandable rows (Clear Highlights, Advanced Options) open the panel they control
  function setExpanded(button, open) {
    button.setAttribute('aria-expanded', open);
    document.getElementById(button.getAttribute('aria-controls')).classList.toggle('open', open);
  }

  document.querySelectorAll('.expander').forEach(button => {
    button.addEventListener('click', () => {
      setExpanded(button, button.getAttribute('aria-expanded') !== 'true');
    });
  });

  // Clear Highlights reveals the confirmation (clicking again cancels), second button clears
  clearConfirm.addEventListener('click', async () => {
    setExpanded(clearButton, false);
    await chrome.storage.local.set({ highlightList: [] });
  });

  function updateLinkCount(count) {
    linkCount.textContent = count;
    clearButton.disabled = count === 0;
    if (count === 0) setExpanded(clearButton, false);
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

  /* ----- Highlight colors ----- */

  const colorPreviews = document.querySelectorAll('.color-preview');
  const colors = await chrome.storage.local.get(DEFAULT_COLORS);

  // Each color has a row of preset swatches, followed by a preview of the chosen color and opacity
  const pickers = [
    { key: 'highlightColor', opacityKey: 'highlightOpacity', presets: HIGHLIGHT_PRESETS, row: document.getElementById('highlight-swatches'), chosen: document.getElementById('highlight-chosen') },
    { key: 'outlineColor', opacityKey: 'outlineOpacity', presets: OUTLINE_PRESETS, row: document.getElementById('outline-swatches'), chosen: document.getElementById('outline-chosen') }
  ];

  const sliders = [
    { key: 'highlightOpacity', slider: document.getElementById('highlight-opacity'), label: document.getElementById('highlight-opacity-value') },
    { key: 'outlineOpacity', slider: document.getElementById('outline-opacity'), label: document.getElementById('outline-opacity-value') }
  ];

  async function setColor(key, value) {
    colors[key] = value;
    renderColors();
    await chrome.storage.local.set({ [key]: value });
  }

  function renderColors() {
    for (const { key, opacityKey, row, chosen } of pickers) {
      chosen.style.setProperty('--chosen-color', toRgba(colors[key], colors[opacityKey]));
      row.querySelectorAll('.swatch').forEach(swatch => {
        swatch.setAttribute('aria-pressed', swatch.dataset.color === colors[key]);
      });
    }

    for (const { key, slider, label } of sliders) {
      slider.value = colors[key];
      label.textContent = Math.round(colors[key] * 100) + '%';
    }

    colorPreviews.forEach(preview => {
      preview.style.backgroundColor = toRgba(colors.highlightColor, colors.highlightOpacity);
      preview.style.outlineColor = toRgba(colors.outlineColor, colors.outlineOpacity);
    });
  }

  for (const { key, presets, row, chosen } of pickers) {
    for (const color of presets) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'swatch';
      swatch.dataset.color = color;
      swatch.title = color;
      swatch.style.backgroundColor = color;
      swatch.addEventListener('click', () => setColor(key, color));
      row.insertBefore(swatch, chosen);
    }
  }

  for (const { key, slider } of sliders) {
    slider.addEventListener('input', () => setColor(key, Number(slider.value)));
  }

  document.getElementById('reset-colors').addEventListener('click', async () => {
    Object.assign(colors, DEFAULT_COLORS);
    renderColors();
    await chrome.storage.local.set(DEFAULT_COLORS);
  });

  renderColors();
});
