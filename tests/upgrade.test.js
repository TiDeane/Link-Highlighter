/* Existing users must not lose their highlights when the extension updates.
   Each test starts from storage as an older version would have left it, then runs
   the current popup and content script together against it. */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createStorage, openPage, openPopup, settle } = require('./helpers');

const LINKS = `
  <a id="a" href="https://site.test/a">A</a>
  <a id="b" href="https://site.test/b">B</a>
  <a id="c" href="https://site.test/c">C</a>
`;

describe('updating from version 1.5 (single toggle, no showHighlights key)', () => {
  test('a user with the extension on keeps every saved link, still highlighted', async () => {
    const list = ['https://site.test/a', 'https://site.test/b'];
    const storage = createStorage({ isActive: true, highlightList: list });

    const page = await openPage(storage, LINKS);
    const popup = await openPopup(storage);

    assert.deepEqual(page.highlighted(), ['a', 'b']);
    assert.deepEqual(storage.data.highlightList, list);
    assert.equal(popup.$('#toggle').checked, true);
    assert.equal(popup.$('#show-highlights').checked, true);
    assert.equal(popup.$('#link-count').textContent, '2');
    assert.deepEqual(storage.writes, [], 'loading the new version must not rewrite anything');
  });

  test('that user keeps tracking: the next link is added to the old list', async () => {
    const storage = createStorage({ isActive: true, highlightList: ['https://site.test/a', 'https://site.test/b'] });
    const page = await openPage(storage, LINKS);

    await page.mousedown('#c');

    assert.deepEqual(storage.data.highlightList, ['https://site.test/a', 'https://site.test/b', 'https://site.test/c']);
    assert.deepEqual(page.highlighted(), ['a', 'b', 'c']);
  });

  test('a user with custom normalization settings keeps them and their matches', async () => {
    const list = ['https://site.test/a?tab=1', 'https://site.test/b#section'];
    const storage = createStorage({ isActive: true, normalizeQueryParams: false, normalizeHashFragments: false, highlightList: list });

    const page = await openPage(storage, `
      <a id="exact-query" href="https://site.test/a?tab=1">a tab 1</a>
      <a id="other-query" href="https://site.test/a?tab=2">a tab 2</a>
      <a id="exact-hash" href="https://site.test/b#section">b section</a>
      <a id="no-hash" href="https://site.test/b">b</a>
    `);
    const popup = await openPopup(storage);

    assert.deepEqual(page.highlighted(), ['exact-query', 'exact-hash']);
    assert.equal(popup.$('#normalize-query').checked, false);
    assert.equal(popup.$('#normalize-hash').checked, false);
    assert.deepEqual(storage.data.highlightList, list);
  });

  test('a user with the extension off stays off, with nothing tracked or shown', async () => {
    const storage = createStorage({ isActive: false, highlightList: [] });

    const page = await openPage(storage, LINKS);
    const popup = await openPopup(storage);
    await page.mousedown('#a');

    assert.equal(popup.$('#toggle').checked, false);
    assert.deepEqual(page.highlighted(), []);
    assert.deepEqual(storage.data, { isActive: false, highlightList: [] });
  });

  test('a user who never opened the popup stays off', async () => {
    const storage = createStorage();

    const page = await openPage(storage, LINKS);
    const popup = await openPopup(storage);
    await page.mousedown('#a');

    assert.equal(popup.$('#toggle').checked, false);
    assert.deepEqual(storage.data, {});
  });

  test('a large list survives the update and further use', async () => {
    const list = Array.from({ length: 2000 }, (_, i) => `https://site.test/profile/${i}`);
    const storage = createStorage({ isActive: true, highlightList: list });

    const page = await openPage(storage, LINKS + '<a id="p1999" href="https://site.test/profile/1999/?utm=x#top">1999</a>');
    const popup = await openPopup(storage);
    assert.equal(popup.$('#link-count').textContent, '2000');
    assert.deepEqual(page.highlighted(), ['p1999']);

    await page.mousedown('#a');
    await settle();

    assert.equal(storage.data.highlightList.length, 2001);
    assert.deepEqual(storage.data.highlightList.slice(0, 2000), list);
    assert.equal(storage.data.highlightList[2000], 'https://site.test/a');
    assert.equal(popup.$('#link-count').textContent, '2001');
  });

  test('the highlight looks the same as before: no custom colors are applied', async () => {
    const storage = createStorage({ isActive: true, highlightList: ['https://site.test/a'] });
    const page = await openPage(storage, LINKS);

    assert.equal(page.document.documentElement.getAttribute('style'), null);
  });
});

describe('everyday use after the update', () => {
  test('turning tracking off in the popup no longer clears the list', async () => {
    const list = ['https://site.test/a', 'https://site.test/b'];
    const storage = createStorage({ isActive: true, highlightList: list });
    const page = await openPage(storage, LINKS);
    const popup = await openPopup(storage);

    await popup.click('#toggle');

    assert.deepEqual(storage.data.highlightList, list);
    assert.deepEqual(page.highlighted(), ['a', 'b']);
  });

  test('hiding, showing, recoloring and changing normalization never change the saved list', async () => {
    const list = ['https://site.test/a', 'https://site.test/b'];
    const storage = createStorage({ isActive: true, highlightList: list });
    const page = await openPage(storage, LINKS);
    const popup = await openPopup(storage);

    await popup.click('#show-highlights');
    await popup.click('#show-highlights');
    await popup.click(popup.$$('#highlight-swatches .swatch')[1]);
    await popup.slide('#outline-opacity', 0.5);
    await popup.click('#reset-colors');
    await popup.click('#normalize-query');
    await popup.click('#normalize-query');
    await popup.click('#normalize-hash');
    await popup.click('#normalize-hash');
    await popup.click('#toggle');
    await popup.click('#toggle');
    await popup.click('#clear');
    await popup.click('#clear');

    assert.deepEqual(storage.data.highlightList, list);
    assert.deepEqual(page.highlighted(), ['a', 'b']);
  });

  test('only "Are you sure?" empties the list, in the popup and on every page', async () => {
    const storage = createStorage({ isActive: true, highlightList: ['https://site.test/a', 'https://site.test/b'] });
    const page = await openPage(storage, LINKS);
    const popup = await openPopup(storage);

    await popup.click('#clear');
    await popup.click('#clear-confirm');

    assert.deepEqual(storage.data.highlightList, []);
    assert.deepEqual(page.highlighted(), []);
    assert.equal(storage.data.isActive, true, 'tracking stays on after clearing');

    await page.mousedown('#c');
    assert.deepEqual(storage.data.highlightList, ['https://site.test/c']);
    assert.deepEqual(page.highlighted(), ['c']);
  });

  test('popup toggles and the page stay in step', async () => {
    const storage = createStorage();
    const page = await openPage(storage, LINKS);
    const popup = await openPopup(storage);

    await page.mousedown('#a');
    assert.deepEqual(page.highlighted(), [], 'tracking is off by default');

    await popup.click('#toggle');
    await page.mousedown('#a');
    assert.deepEqual(page.highlighted(), ['a']);
    assert.equal(popup.$('#link-count').textContent, '1');

    await popup.click('#show-highlights');
    await page.mousedown('#b');
    assert.deepEqual(page.highlighted(), []);
    assert.equal(popup.$('#link-count').textContent, '2');

    await popup.click('#show-highlights');
    assert.deepEqual(page.highlighted(), ['a', 'b']);
  });
});
