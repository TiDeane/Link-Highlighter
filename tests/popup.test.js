/* popup.html + popup.js: toggles, clear button, expandable rows, customization */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createStorage, openPopup, settle } = require('./helpers');

const DEFAULT_COLORS = { highlightColor: '#ffff00', highlightOpacity: 0.7, outlineColor: '#ffa500', outlineOpacity: 1 };

describe('toggles', () => {
  test('a fresh install shows tracking off, showing on and both normalizations on', async () => {
    const popup = await openPopup(createStorage());

    assert.equal(popup.$('#toggle').checked, false);
    assert.equal(popup.$('#show-highlights').checked, true);
    assert.equal(popup.$('#normalize-query').checked, true);
    assert.equal(popup.$('#normalize-hash').checked, true);
  });

  test('opening the popup writes nothing to storage', async () => {
    const storage = createStorage();
    await openPopup(storage);

    assert.deepEqual(storage.writes, []);
  });

  test('shows the saved state', async () => {
    const popup = await openPopup(createStorage({
      isActive: true, showHighlights: false, normalizeQueryParams: false, normalizeHashFragments: false
    }));

    assert.equal(popup.$('#toggle').checked, true);
    assert.equal(popup.$('#show-highlights').checked, false);
    assert.equal(popup.$('#normalize-query').checked, false);
    assert.equal(popup.$('#normalize-hash').checked, false);
  });

  test('each toggle saves its own setting', async () => {
    const storage = createStorage();
    const popup = await openPopup(storage);

    await popup.click('#toggle');
    await popup.click('#show-highlights');
    await popup.click('#normalize-query');
    await popup.click('#normalize-hash');

    assert.deepEqual(storage.data, {
      isActive: true, showHighlights: false, normalizeQueryParams: false, normalizeHashFragments: false
    });
  });

  test('turning tracking off keeps the saved links', async () => {
    const list = ['https://site.test/a', 'https://site.test/b'];
    const storage = createStorage({ isActive: true, highlightList: list });
    const popup = await openPopup(storage);

    await popup.click('#toggle');

    assert.equal(storage.data.isActive, false);
    assert.deepEqual(storage.data.highlightList, list);
  });

  test('turning showing off keeps the saved links', async () => {
    const list = ['https://site.test/a'];
    const storage = createStorage({ highlightList: list });
    const popup = await openPopup(storage);

    await popup.click('#show-highlights');

    assert.deepEqual(storage.data.highlightList, list);
  });
});

describe('Clear Highlights', () => {
  const list = ['https://site.test/a', 'https://site.test/b', 'https://site.test/c'];

  test('shows how many links are saved', async () => {
    const popup = await openPopup(createStorage({ highlightList: list }));

    assert.equal(popup.$('#link-count').textContent, '3');
    assert.equal(popup.$('#clear').disabled, false);
  });

  describe('the count follows the normalization settings', () => {
    const sections = ['https://wiki.test/JS#History', 'https://wiki.test/JS#Syntax', 'https://wiki.test/JS#Security', 'https://wiki.test/Other'];
    const tabs = ['https://git.test/user?tab=repos', 'https://git.test/user?tab=stars', 'https://git.test/user'];

    test('with both options on, links to the same page count once', async () => {
      const popup = await openPopup(createStorage({ highlightList: [...sections, ...tabs] }));

      assert.equal(popup.$('#link-count').textContent, '3'); // JS, Other, user
    });

    test('with hash normalization off, each section counts', async () => {
      const popup = await openPopup(createStorage({ normalizeHashFragments: false, highlightList: sections }));

      assert.equal(popup.$('#link-count').textContent, '4');
    });

    test('with query normalization off, each query counts', async () => {
      const popup = await openPopup(createStorage({ normalizeQueryParams: false, highlightList: tabs }));

      assert.equal(popup.$('#link-count').textContent, '3');
    });

    test('recounts as soon as an option is toggled, without changing what is saved', async () => {
      const storage = createStorage({ highlightList: sections });
      const popup = await openPopup(storage);
      assert.equal(popup.$('#link-count').textContent, '2');

      await popup.click('#normalize-hash');
      assert.equal(popup.$('#link-count').textContent, '4');

      await popup.click('#normalize-hash');
      assert.equal(popup.$('#link-count').textContent, '2');
      assert.deepEqual(storage.data.highlightList, sections);
    });

    test('a trailing slash never makes a second link', async () => {
      const popup = await openPopup(createStorage({ highlightList: ['https://site.test/a', 'https://site.test/a/'] }));

      assert.equal(popup.$('#link-count').textContent, '1');
    });

    test('a link saved again in another form does not raise the count while it stays one page', async () => {
      const storage = createStorage({ highlightList: ['https://wiki.test/JS#History'] });
      const popup = await openPopup(storage);

      await storage.local.set({ highlightList: ['https://wiki.test/JS#History', 'https://wiki.test/JS#Syntax'] });
      await settle();

      assert.equal(popup.$('#link-count').textContent, '1');
    });

    test('Clear Highlights still removes every saved link', async () => {
      const storage = createStorage({ highlightList: sections });
      const popup = await openPopup(storage);

      await popup.click('#clear');
      await popup.click('#clear-confirm');

      assert.deepEqual(storage.data.highlightList, []);
      assert.equal(popup.$('#link-count').textContent, '0');
    });
  });

  test('is disabled when nothing is saved', async () => {
    const popup = await openPopup(createStorage());

    assert.equal(popup.$('#link-count').textContent, '0');
    assert.equal(popup.$('#clear').disabled, true);
  });

  test('the confirmation is hidden until the row is clicked', async () => {
    const popup = await openPopup(createStorage({ highlightList: list }));
    assert.equal(popup.isOpen('clear-panel'), false);
    assert.equal(popup.$('#clear').getAttribute('aria-expanded'), 'false');

    await popup.click('#clear');

    assert.equal(popup.isOpen('clear-panel'), true);
    assert.equal(popup.$('#clear').getAttribute('aria-expanded'), 'true');
  });

  test('clicking the row alone clears nothing', async () => {
    const storage = createStorage({ highlightList: list });
    const popup = await openPopup(storage);

    await popup.click('#clear');

    assert.deepEqual(storage.data.highlightList, list);
    assert.deepEqual(storage.writes, []);
  });

  test('clicking the row a second time cancels', async () => {
    const storage = createStorage({ highlightList: list });
    const popup = await openPopup(storage);

    await popup.click('#clear');
    await popup.click('#clear');

    assert.equal(popup.isOpen('clear-panel'), false);
    assert.deepEqual(storage.data.highlightList, list);
  });

  test('"Are you sure?" clears the list and nothing else', async () => {
    const storage = createStorage({ isActive: true, showHighlights: true, highlightColor: '#7dff6b', highlightList: list });
    const popup = await openPopup(storage);

    await popup.click('#clear');
    await popup.click('#clear-confirm');

    assert.deepEqual(storage.data, { isActive: true, showHighlights: true, highlightColor: '#7dff6b', highlightList: [] });
    assert.equal(popup.isOpen('clear-panel'), false);
    assert.equal(popup.$('#link-count').textContent, '0');
    assert.equal(popup.$('#clear').disabled, true);
  });

  test('the count follows links saved while the popup is open', async () => {
    const storage = createStorage({ highlightList: list });
    const popup = await openPopup(storage);

    await storage.local.set({ highlightList: [...list, 'https://site.test/d'] });
    await settle();

    assert.equal(popup.$('#link-count').textContent, '4');
  });

  test('an open confirmation closes if the list is emptied elsewhere', async () => {
    const storage = createStorage({ highlightList: list });
    const popup = await openPopup(storage);
    await popup.click('#clear');

    await storage.local.set({ highlightList: [] });
    await settle();

    assert.equal(popup.isOpen('clear-panel'), false);
    assert.equal(popup.$('#clear').disabled, true);
  });
});

describe('expandable rows', () => {
  for (const [name, panel] of [['Customize Highlights', 'colors-panel'], ['Advanced Options', 'advanced-panel']]) {
    test(`${name} is collapsed by default and opens and closes on click`, async () => {
      const popup = await openPopup(createStorage());
      const row = popup.$(`[aria-controls="${panel}"]`);
      assert.equal(row.textContent.trim(), name);
      assert.equal(popup.isOpen(panel), false);

      await popup.click(row);
      assert.equal(popup.isOpen(panel), true);
      assert.equal(row.getAttribute('aria-expanded'), 'true');

      await popup.click(row);
      assert.equal(popup.isOpen(panel), false);
      assert.equal(row.getAttribute('aria-expanded'), 'false');
    });
  }

  test('opening a row closes the one that was open, so only one is open at a time', async () => {
    const popup = await openPopup(createStorage({ highlightList: ['https://site.test/a'] }));

    await popup.click('[aria-controls="colors-panel"]');
    await popup.click('[aria-controls="advanced-panel"]');
    assert.deepEqual(['clear-panel', 'colors-panel', 'advanced-panel'].map(popup.isOpen), [false, false, true]);
    assert.equal(popup.$('[aria-controls="colors-panel"]').getAttribute('aria-expanded'), 'false');

    await popup.click('#clear');
    assert.deepEqual(['clear-panel', 'colors-panel', 'advanced-panel'].map(popup.isOpen), [true, false, false]);
  });

  test('opening one row leaves the others closed', async () => {
    const popup = await openPopup(createStorage({ highlightList: ['https://site.test/a'] }));

    await popup.click('[aria-controls="colors-panel"]');

    assert.equal(popup.isOpen('colors-panel'), true);
    assert.equal(popup.isOpen('advanced-panel'), false);
    assert.equal(popup.isOpen('clear-panel'), false);
  });
});

describe('Customize Highlights', () => {
  const swatches = (popup, row) => popup.$$(`#${row} .swatch`);
  const pressed = (popup, row) => swatches(popup, row).filter(s => s.getAttribute('aria-pressed') === 'true').map(s => s.dataset.color);
  const previews = popup => popup.$$('.color-preview');

  test('offers six inner highlight colors and six matching outline colors', async () => {
    const popup = await openPopup(createStorage());

    assert.equal(swatches(popup, 'highlight-swatches').length, 6);
    assert.equal(swatches(popup, 'outline-swatches').length, 6);
  });

  test('has no free color picker', async () => {
    const popup = await openPopup(createStorage());

    assert.equal(popup.$$('input[type="color"]').length, 0);
  });

  test('the defaults are the first swatch of each row, at 70% and 100%', async () => {
    const popup = await openPopup(createStorage());

    assert.deepEqual(pressed(popup, 'highlight-swatches'), ['#ffff00']);
    assert.deepEqual(pressed(popup, 'outline-swatches'), ['#ffa500']);
    assert.equal(swatches(popup, 'highlight-swatches')[0].dataset.color, '#ffff00');
    assert.equal(swatches(popup, 'outline-swatches')[0].dataset.color, '#ffa500');
    assert.equal(popup.$('#highlight-opacity').value, '0.7');
    assert.equal(popup.$('#highlight-opacity-value').textContent, '70%');
    assert.equal(popup.$('#outline-opacity').value, '1');
    assert.equal(popup.$('#outline-opacity-value').textContent, '100%');
  });

  test('clicking an inner highlight swatch saves and selects that color', async () => {
    const storage = createStorage();
    const popup = await openPopup(storage);
    const swatch = swatches(popup, 'highlight-swatches')[2];

    await popup.click(swatch);

    assert.equal(storage.data.highlightColor, swatch.dataset.color);
    assert.deepEqual(pressed(popup, 'highlight-swatches'), [swatch.dataset.color]);
    assert.equal(storage.data.outlineColor, undefined);
  });

  test('clicking an outline swatch saves and selects that color', async () => {
    const storage = createStorage();
    const popup = await openPopup(storage);
    const swatch = swatches(popup, 'outline-swatches')[3];

    await popup.click(swatch);

    assert.equal(storage.data.outlineColor, swatch.dataset.color);
    assert.deepEqual(pressed(popup, 'outline-swatches'), [swatch.dataset.color]);
    assert.equal(storage.data.highlightColor, undefined);
  });

  test('the opacity sliders save their values and show them as a percentage', async () => {
    const storage = createStorage();
    const popup = await openPopup(storage);

    await popup.slide('#highlight-opacity', 0.35);
    await popup.slide('#outline-opacity', 0);

    assert.equal(storage.data.highlightOpacity, 0.35);
    assert.equal(storage.data.outlineOpacity, 0);
    assert.equal(popup.$('#highlight-opacity-value').textContent, '35%');
    assert.equal(popup.$('#outline-opacity-value').textContent, '0%');
  });

  test('the inner highlight cannot be made fully invisible, the outline can', async () => {
    const popup = await openPopup(createStorage());

    assert.equal(popup.$('#highlight-opacity').min, '0.1');
    assert.equal(popup.$('#outline-opacity').min, '0');
  });

  test('shows two example links, and both follow the chosen colors and opacities', async () => {
    const popup = await openPopup(createStorage());
    assert.equal(previews(popup).length, 2);

    await popup.click(swatches(popup, 'highlight-swatches')[2]); // #5ce1ff
    await popup.slide('#highlight-opacity', 0.5);
    await popup.click(swatches(popup, 'outline-swatches')[2]);   // #1e88e5
    await popup.slide('#outline-opacity', 0.25);

    for (const preview of previews(popup)) {
      assert.equal(preview.style.backgroundColor, 'rgba(92, 225, 255, 0.5)');
      assert.equal(preview.style.outlineColor, 'rgba(30, 136, 229, 0.25)');
    }
  });

  test('the box at the end of each row previews the chosen color at the chosen opacity', async () => {
    const popup = await openPopup(createStorage({ highlightColor: '#5ce1ff', highlightOpacity: 0.5, outlineColor: '#1e88e5', outlineOpacity: 0.25 }));

    assert.equal(popup.$('#highlight-chosen').style.getPropertyValue('--chosen-color'), 'rgba(92, 225, 255, 0.5)');
    assert.equal(popup.$('#outline-chosen').style.getPropertyValue('--chosen-color'), 'rgba(30, 136, 229, 0.25)');
  });

  test('shows the saved custom settings when reopened', async () => {
    const popup = await openPopup(createStorage({ highlightColor: '#ff8ad8', highlightOpacity: 0.4, outlineColor: '#d81b60', outlineOpacity: 0.6 }));

    assert.deepEqual(pressed(popup, 'highlight-swatches'), ['#ff8ad8']);
    assert.deepEqual(pressed(popup, 'outline-swatches'), ['#d81b60']);
    assert.equal(popup.$('#highlight-opacity-value').textContent, '40%');
    assert.equal(popup.$('#outline-opacity-value').textContent, '60%');
  });

  test('the popup accent stays the stylesheet orange whatever outline color is chosen', async () => {
    const popup = await openPopup(createStorage({ outlineColor: '#8e44ad' }));

    await popup.click(swatches(popup, 'outline-swatches')[2]);

    assert.equal(popup.document.documentElement.style.getPropertyValue('--accent'), '');
  });

  test('Reset to Default restores all four settings and leaves the links alone', async () => {
    const list = ['https://site.test/a'];
    const storage = createStorage({ highlightColor: '#ff8ad8', highlightOpacity: 0.4, outlineColor: '#d81b60', outlineOpacity: 0.6, highlightList: list });
    const popup = await openPopup(storage);

    await popup.click('#reset-colors');

    assert.deepEqual(storage.data, { ...DEFAULT_COLORS, highlightList: list });
    assert.deepEqual(pressed(popup, 'highlight-swatches'), ['#ffff00']);
    assert.deepEqual(pressed(popup, 'outline-swatches'), ['#ffa500']);
    assert.equal(popup.$('#highlight-opacity-value').textContent, '70%');
    assert.equal(popup.$('#outline-opacity-value').textContent, '100%');
  });
});
