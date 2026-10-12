/* content.js: tracking opened links, normalization, highlighting, colors */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createStorage, openPage, settle } = require('./helpers');

const LINKS = `
  <a id="a" href="https://site.test/a">A</a>
  <a id="b" href="https://site.test/b">B</a>
  <a id="c" href="https://site.test/c">C</a>
`;

describe('tracking opened links', () => {
  test('saves a link when tracking is on', async () => {
    const storage = createStorage({ isActive: true });
    const page = await openPage(storage, LINKS);

    await page.mousedown('#a');

    assert.deepEqual(storage.data.highlightList, ['https://site.test/a']);
  });

  test('saves nothing when tracking is off (the default)', async () => {
    const storage = createStorage();
    const page = await openPage(storage, LINKS);

    await page.mousedown('#a');

    assert.equal(storage.data.highlightList, undefined);
    assert.deepEqual(storage.writes, []);
  });

  test('counts middle-clicks and ctrl-clicks, which open links in a new tab', async () => {
    const storage = createStorage({ isActive: true });
    const page = await openPage(storage, LINKS);

    await page.mousedown('#a', { button: 1 });
    await page.mousedown('#b', { ctrlKey: true });

    assert.deepEqual(storage.data.highlightList, ['https://site.test/a', 'https://site.test/b']);
  });

  test('saves the link when an element inside it is pressed', async () => {
    const storage = createStorage({ isActive: true });
    const page = await openPage(storage, '<a id="card" href="https://site.test/card"><div><img id="img"></div></a>');

    await page.mousedown('#img');

    assert.deepEqual(storage.data.highlightList, ['https://site.test/card']);
  });

  test('ignores presses outside links and on links without an href', async () => {
    const storage = createStorage({ isActive: true });
    const page = await openPage(storage, '<p id="text">text</p><a id="nohref">no href</a>');

    await page.mousedown('#text');
    await page.mousedown('#nohref');

    assert.deepEqual(storage.writes, []);
  });

  test('does not save the same link twice', async () => {
    const storage = createStorage({ isActive: true });
    const page = await openPage(storage, LINKS);

    await page.mousedown('#a');
    await page.mousedown('#a');

    assert.deepEqual(storage.data.highlightList, ['https://site.test/a']);
    assert.equal(storage.writes.length, 1);
  });

  test('keeps both links when two are pressed in quick succession', async () => {
    const storage = createStorage({ isActive: true });
    const page = await openPage(storage, LINKS);

    // No waiting between the two presses
    page.$('#a').dispatchEvent(new page.window.MouseEvent('mousedown', { bubbles: true }));
    page.$('#b').dispatchEvent(new page.window.MouseEvent('mousedown', { bubbles: true }));
    await settle();

    assert.deepEqual(storage.data.highlightList, ['https://site.test/a', 'https://site.test/b']);
  });

  test('adds to an existing list without dropping earlier links', async () => {
    const storage = createStorage({ isActive: true, highlightList: ['https://site.test/old1', 'https://site.test/old2'] });
    const page = await openPage(storage, LINKS);

    await page.mousedown('#a');

    assert.deepEqual(storage.data.highlightList, ['https://site.test/old1', 'https://site.test/old2', 'https://site.test/a']);
  });

  test('starts tracking as soon as the popup toggle is turned on', async () => {
    const storage = createStorage();
    const page = await openPage(storage, LINKS);

    await storage.local.set({ isActive: true });
    await settle();
    await page.mousedown('#a');

    assert.deepEqual(storage.data.highlightList, ['https://site.test/a']);
  });

  test('stops tracking when the toggle is turned off, and keeps the saved links', async () => {
    const storage = createStorage({ isActive: true, highlightList: ['https://site.test/a'] });
    const page = await openPage(storage, LINKS);

    await storage.local.set({ isActive: false });
    await settle();
    await page.mousedown('#b');

    assert.deepEqual(storage.data.highlightList, ['https://site.test/a']);
    assert.deepEqual(page.highlighted(), ['a']);
  });

  test('a tab left over from before an extension reload does nothing and does not throw', async () => {
    const storage = createStorage({ isActive: true });
    const page = await openPage(storage, LINKS);

    page.orphan();
    await page.mousedown('#a');

    assert.deepEqual(storage.writes, []);
    assert.deepEqual(page.errors, []);
    assert.deepEqual(page.highlighted(), []);
  });
});

describe('URL normalization', () => {
  const VARIANTS = `
    <a id="plain" href="https://site.test/profile">plain</a>
    <a id="slash" href="https://site.test/profile/">trailing slash</a>
    <a id="query" href="https://site.test/profile?tab=repos">query</a>
    <a id="hash" href="https://site.test/profile#about">hash</a>
    <a id="other" href="https://site.test/other">other</a>
  `;

  test('by default, strips the query, the hash and a trailing slash', async () => {
    const storage = createStorage({ isActive: true });
    const page = await openPage(storage, '<a id="a" href="https://site.test/profile/?tab=repos#about">A</a>');

    await page.mousedown('#a');

    assert.deepEqual(storage.data.highlightList, ['https://site.test/profile']);
  });

  test('by default, every variant of a saved page is highlighted', async () => {
    const storage = createStorage({ highlightList: ['https://site.test/profile'] });
    const page = await openPage(storage, VARIANTS);

    assert.deepEqual(page.highlighted(), ['plain', 'slash', 'query', 'hash']);
  });

  test('with query normalization off, links that differ by query are distinct', async () => {
    const storage = createStorage({ isActive: true, normalizeQueryParams: false });
    const page = await openPage(storage, VARIANTS);

    await page.mousedown('#query');

    assert.deepEqual(storage.data.highlightList, ['https://site.test/profile?tab=repos']);
    assert.deepEqual(page.highlighted(), ['query']);
  });

  test('with hash normalization off, links that differ by hash are distinct', async () => {
    const storage = createStorage({ isActive: true, normalizeHashFragments: false });
    const page = await openPage(storage, VARIANTS);

    await page.mousedown('#hash');

    assert.deepEqual(storage.data.highlightList, ['https://site.test/profile#about']);
    assert.deepEqual(page.highlighted(), ['hash']);
  });

  test('turning a normalization option on re-applies highlighting immediately', async () => {
    const storage = createStorage({ normalizeQueryParams: false, highlightList: ['https://site.test/profile?tab=repos'] });
    const page = await openPage(storage, VARIANTS);
    assert.deepEqual(page.highlighted(), ['query']);

    await storage.local.set({ normalizeQueryParams: true });
    await settle();

    assert.deepEqual(page.highlighted(), ['plain', 'slash', 'query', 'hash']);
  });

  test('turning a normalization option off removes the highlights that no longer match', async () => {
    const storage = createStorage({ highlightList: ['https://site.test/profile?tab=repos'] });
    const page = await openPage(storage, VARIANTS);
    assert.deepEqual(page.highlighted(), ['plain', 'slash', 'query', 'hash']);

    await storage.local.set({ normalizeQueryParams: false });
    await settle();

    assert.deepEqual(page.highlighted(), ['query']);
  });

  test('changing a normalization option does not change the saved list by itself', async () => {
    const list = ['https://site.test/profile?tab=repos', 'https://site.test/profile#about'];
    const storage = createStorage({ normalizeQueryParams: false, normalizeHashFragments: false, highlightList: list });
    await openPage(storage, VARIANTS);

    await storage.local.set({ normalizeQueryParams: true });
    await settle();
    await storage.local.set({ normalizeQueryParams: false });
    await settle();

    assert.deepEqual(storage.data.highlightList, list);
  });

  test('the next tracked click saves the whole list in its normalized form', async () => {
    const storage = createStorage({
      isActive: true,
      normalizeQueryParams: false,
      highlightList: ['https://site.test/profile?tab=repos', 'https://site.test/profile?tab=stars']
    });
    const page = await openPage(storage, VARIANTS);

    await storage.local.set({ normalizeQueryParams: true });
    await settle();
    await page.mousedown('#other');

    assert.deepEqual(storage.data.highlightList, ['https://site.test/profile', 'https://site.test/other']);
  });
});

describe('highlighting saved links', () => {
  test('highlights saved links when a page loads, and only those', async () => {
    const storage = createStorage({ highlightList: ['https://site.test/a', 'https://site.test/c'] });
    const page = await openPage(storage, LINKS);

    assert.deepEqual(page.highlighted(), ['a', 'c']);
  });

  test('highlights nothing when the list is empty', async () => {
    const page = await openPage(createStorage(), LINKS);

    assert.deepEqual(page.highlighted(), []);
    assert.equal(page.observers.length, 0);
  });

  test('highlights saved links even when tracking is off', async () => {
    const storage = createStorage({ isActive: false, highlightList: ['https://site.test/a'] });
    const page = await openPage(storage, LINKS);

    assert.deepEqual(page.highlighted(), ['a']);
  });

  test('highlights a link below the fold only once it scrolls into view', async () => {
    const storage = createStorage({ highlightList: ['https://site.test/a', 'https://site.test/far'] });
    const page = await openPage(storage, LINKS + '<div data-offscreen><a id="far" href="https://site.test/far">far</a></div>');
    assert.deepEqual(page.highlighted(), ['a']);

    await page.scrollIntoView('#far');

    assert.deepEqual(page.highlighted(), ['a', 'far']);
  });

  test('highlights the pressed link right away, and other links to the same page', async () => {
    const storage = createStorage({ isActive: true, highlightList: ['https://site.test/c'] });
    const page = await openPage(storage, LINKS + '<a id="a2" href="https://site.test/a?ref=nav">A again</a>');

    await page.mousedown('#a');

    assert.deepEqual(page.highlighted(), ['a', 'c', 'a2']);
  });

  test('highlights the very first link that is saved', async () => {
    const storage = createStorage({ isActive: true });
    const page = await openPage(storage, LINKS);

    await page.mousedown('#b');

    assert.deepEqual(page.highlighted(), ['b']);
  });

  test('highlights links added to the page later', async () => {
    const storage = createStorage({ highlightList: ['https://site.test/new'] });
    const page = await openPage(storage, LINKS + '<div id="feed"></div>');

    page.$('#feed').innerHTML = '<article><a id="new" href="https://site.test/new">new</a><a id="unsaved" href="https://site.test/x">x</a></article>';
    await settle();

    assert.deepEqual(page.highlighted(), ['new']);
  });

  test('highlights a link that gets its href after being inserted (lazy-rendered posters)', async () => {
    const storage = createStorage({ highlightList: ['https://site.test/film'] });
    const page = await openPage(storage, '<a id="poster">poster</a>');
    assert.deepEqual(page.highlighted(), []);

    page.$('#poster').setAttribute('href', 'https://site.test/film');
    await settle();

    assert.deepEqual(page.highlighted(), ['poster']);
  });

  test('restores a highlight when the page re-renders the link and wipes its class', async () => {
    const storage = createStorage({ highlightList: ['https://site.test/a'] });
    const page = await openPage(storage, LINKS);

    page.$('#a').className = 'frame';
    await settle();

    assert.equal(page.isHighlighted('#a'), true);
    assert.equal(page.$('#a').classList.contains('frame'), true);
  });

  test('removes the highlight when a link is changed to point at an unsaved page', async () => {
    const storage = createStorage({ highlightList: ['https://site.test/a'] });
    const page = await openPage(storage, LINKS);

    page.$('#a').setAttribute('href', 'https://site.test/elsewhere');
    await settle();

    assert.deepEqual(page.highlighted(), []);
  });

  test('clearing the list removes every highlight', async () => {
    const storage = createStorage({ highlightList: ['https://site.test/a', 'https://site.test/b'] });
    const page = await openPage(storage, LINKS);

    await storage.local.set({ highlightList: [] });
    await settle();

    assert.deepEqual(page.highlighted(), []);
    assert.equal(page.$$('.highlighted-link-inline').length, 0);
  });

  test('does not highlight links to other pages or other sites with the same path', async () => {
    const storage = createStorage({ highlightList: ['https://site.test/a'] });
    const page = await openPage(storage, `
      <a id="same" href="https://site.test/a">same</a>
      <a id="longer" href="https://site.test/a/more">longer path</a>
      <a id="othersite" href="https://other.test/a">other site</a>
      <a id="http" href="http://site.test/a">http</a>
    `);

    assert.deepEqual(page.highlighted(), ['same']);
  });

  test('matches relative links against the page they are on', async () => {
    const storage = createStorage({ highlightList: ['https://example.com/docs/intro'] });
    const page = await openPage(storage, '<a id="rel" href="/docs/intro">intro</a>', { url: 'https://example.com/page' });

    assert.deepEqual(page.highlighted(), ['rel']);
  });
});

describe('idle pages', () => {
  // Regression: re-checking a link must not itself trigger another re-check
  test('once every link has been checked, the page goes quiet', async () => {
    const storage = createStorage({ highlightList: ['https://site.test/a'] });
    const page = await openPage(storage, `
      <a id="a" class="nav-item" href="https://site.test/a">saved</a>
      <a id="b" class="nav-item" href="https://site.test/b">unsaved, with a class</a>
      <a id="c" href="https://site.test/c">unsaved, without a class</a>
    `);

    try {
      const checks = page.observers.checks;
      await settle();
      await settle();

      assert.equal(page.observers.checks, checks);
      assert.deepEqual(page.highlighted(), ['a']);
    } finally {
      page.close();
    }
  });

  test('a class change made by the page causes one re-check, not an endless series', async () => {
    const storage = createStorage({ highlightList: ['https://site.test/a'] });
    const page = await openPage(storage, '<a id="a" href="https://site.test/a">saved</a><a id="b" class="x" href="https://site.test/b">unsaved</a>');

    try {
      const checks = page.observers.checks;
      page.$('#b').classList.add('hovered');
      await settle();
      await settle();

      assert.equal(page.observers.checks, checks + 1);
      assert.deepEqual(page.highlighted(), ['a']);
    } finally {
      page.close();
    }
  });
});

describe('the Show Highlights toggle', () => {
  test('hides highlights on load when off, and keeps the saved links', async () => {
    const list = ['https://site.test/a', 'https://site.test/b'];
    const storage = createStorage({ showHighlights: false, highlightList: list });
    const page = await openPage(storage, LINKS);

    assert.deepEqual(page.highlighted(), []);
    assert.deepEqual(storage.data.highlightList, list);
  });

  test('turning it off removes highlights, turning it back on restores them', async () => {
    const storage = createStorage({ highlightList: ['https://site.test/a', 'https://site.test/b'] });
    const page = await openPage(storage, LINKS);

    await storage.local.set({ showHighlights: false });
    await settle();
    assert.deepEqual(page.highlighted(), []);

    await storage.local.set({ showHighlights: true });
    await settle();
    assert.deepEqual(page.highlighted(), ['a', 'b']);
  });

  test('with showing off and tracking on, a pressed link is saved but not highlighted', async () => {
    const storage = createStorage({ isActive: true, showHighlights: false });
    const page = await openPage(storage, LINKS);

    await page.mousedown('#a');

    assert.deepEqual(storage.data.highlightList, ['https://site.test/a']);
    assert.deepEqual(page.highlighted(), []);

    await storage.local.set({ showHighlights: true });
    await settle();
    assert.deepEqual(page.highlighted(), ['a']);
  });
});

describe('highlight layout (inline-block only for inline links)', () => {
  const PAGE = `
    <style>.nav a { display: flex; } .block { display: block; }</style>
    <a id="inline" href="https://site.test/inline">inline text link</a>
    <nav class="nav"><a id="flex" href="https://site.test/flex"><svg></svg><span>Repositories</span></a></nav>
    <a id="block" class="block" href="https://site.test/block">block link</a>
  `;
  const list = ['https://site.test/inline', 'https://site.test/flex', 'https://site.test/block'];

  test('an inline link gets the inline-block class', async () => {
    const page = await openPage(createStorage({ highlightList: list }), PAGE);

    assert.equal(page.isHighlighted('#inline'), true);
    assert.equal(page.$('#inline').classList.contains('highlighted-link-inline'), true);
  });

  test('flex and block links are highlighted without changing their display', async () => {
    const page = await openPage(createStorage({ highlightList: list }), PAGE);

    for (const id of ['#flex', '#block']) {
      assert.equal(page.isHighlighted(id), true);
      assert.equal(page.$(id).classList.contains('highlighted-link-inline'), false);
    }
  });

  test('the same rule applies to a link highlighted by pressing it', async () => {
    const page = await openPage(createStorage({ isActive: true, highlightList: ['https://site.test/seed'] }), PAGE);

    await page.mousedown('#flex');
    await page.mousedown('#inline');

    assert.equal(page.$('#flex').classList.contains('highlighted-link-inline'), false);
    assert.equal(page.$('#inline').classList.contains('highlighted-link-inline'), true);
  });
});

describe('several tabs', () => {
  test('a link saved in one tab is highlighted in the others', async () => {
    const storage = createStorage({ isActive: true, highlightList: ['https://site.test/c'] });
    const tab1 = await openPage(storage, LINKS);
    const tab2 = await openPage(storage, LINKS);

    await tab1.mousedown('#a');

    assert.deepEqual(tab2.highlighted(), ['a', 'c']);
  });

  test('the other tabs do not rebuild their observers when a link is added', async () => {
    const storage = createStorage({ isActive: true, highlightList: ['https://site.test/c'] });
    const tab1 = await openPage(storage, LINKS);
    const tab2 = await openPage(storage, LINKS);
    const before = tab2.observers.length;

    await tab1.mousedown('#a');
    await tab1.mousedown('#b');

    assert.equal(tab2.observers.length, before);
    assert.equal(tab1.observers.length, before);
  });

  test('the first link saved anywhere shows up in a tab that had nothing to highlight', async () => {
    const storage = createStorage({ isActive: true });
    const tab1 = await openPage(storage, LINKS);
    const tab2 = await openPage(storage, LINKS);

    await tab1.mousedown('#b');

    assert.deepEqual(tab2.highlighted(), ['b']);
  });

  test('links saved from two tabs are all kept', async () => {
    const storage = createStorage({ isActive: true });
    const tab1 = await openPage(storage, LINKS);
    const tab2 = await openPage(storage, LINKS);

    await tab1.mousedown('#a');
    await tab2.mousedown('#b');
    await tab1.mousedown('#c');

    assert.deepEqual(storage.data.highlightList, ['https://site.test/a', 'https://site.test/b', 'https://site.test/c']);
    assert.deepEqual(tab1.highlighted(), ['a', 'b', 'c']);
    assert.deepEqual(tab2.highlighted(), ['a', 'b', 'c']);
  });

  test('links pressed in two tabs at the same moment are both kept', async () => {
    const storage = createStorage({ isActive: true, highlightList: ['https://site.test/c'] });
    const tab1 = await openPage(storage, LINKS);
    const tab2 = await openPage(storage, LINKS);

    // Neither tab has heard about the other's link when it saves its own
    tab1.$('#a').dispatchEvent(new tab1.window.MouseEvent('mousedown', { bubbles: true }));
    tab2.$('#b').dispatchEvent(new tab2.window.MouseEvent('mousedown', { bubbles: true }));
    await settle();
    await settle();

    assert.deepEqual([...storage.data.highlightList].sort(), ['https://site.test/a', 'https://site.test/b', 'https://site.test/c']);
    assert.deepEqual(tab1.highlighted(), ['a', 'b', 'c']);
    assert.deepEqual(tab2.highlighted(), ['a', 'b', 'c']);
  });

  test('a tab that missed changes does not drop them when it saves a link', async () => {
    const storage = createStorage({ isActive: true, highlightList: ['https://site.test/c'] });
    const page = await openPage(storage, LINKS);

    // Saved elsewhere while this tab was frozen or in the back/forward cache
    storage.changeUnnoticed({ highlightList: ['https://site.test/c', 'https://site.test/x', 'https://site.test/b'] });
    await page.mousedown('#a');

    assert.deepEqual(storage.data.highlightList, ['https://site.test/c', 'https://site.test/x', 'https://site.test/b', 'https://site.test/a']);
    assert.deepEqual(page.highlighted(), ['a', 'b', 'c'], 'and it catches up on the links it missed');
  });

  test('a tab that missed a clear does not bring the cleared links back', async () => {
    const storage = createStorage({ isActive: true, highlightList: ['https://site.test/b', 'https://site.test/c'] });
    const page = await openPage(storage, LINKS);

    storage.changeUnnoticed({ highlightList: [] });
    await page.mousedown('#a');

    assert.deepEqual(storage.data.highlightList, ['https://site.test/a']);
    assert.deepEqual(page.highlighted(), ['a']);
  });

  test('clearing and hiding apply to every tab', async () => {
    const storage = createStorage({ highlightList: ['https://site.test/a'] });
    const tab1 = await openPage(storage, LINKS);
    const tab2 = await openPage(storage, LINKS);

    await storage.local.set({ showHighlights: false });
    await settle();
    assert.deepEqual([tab1.highlighted(), tab2.highlighted()], [[], []]);

    await storage.local.set({ showHighlights: true });
    await settle();
    assert.deepEqual([tab1.highlighted(), tab2.highlighted()], [['a'], ['a']]);

    await storage.local.set({ highlightList: [] });
    await settle();
    assert.deepEqual([tab1.highlighted(), tab2.highlighted()], [[], []]);
  });
});

describe('custom highlight colors', () => {
  const htmlStyle = page => page.document.documentElement.getAttribute('style');
  const cssVar = (page, name) => page.document.documentElement.style.getPropertyValue(name);

  test('with the default colors, the page is left untouched', async () => {
    const page = await openPage(createStorage({ highlightList: ['https://site.test/a'] }), LINKS);

    assert.equal(htmlStyle(page), null);
  });

  test('saved custom colors are applied when a page loads', async () => {
    const storage = createStorage({ highlightColor: '#5ce1ff', highlightOpacity: 0.5, outlineColor: '#1e88e5', outlineOpacity: 0.25 });
    const page = await openPage(storage, LINKS);

    assert.equal(cssVar(page, '--link-highlighter-bg'), 'rgba(92, 225, 255, 0.5)');
    assert.equal(cssVar(page, '--link-highlighter-outline'), 'rgba(30, 136, 229, 0.25)');
  });

  test('changing one setting keeps the others at their current values', async () => {
    const page = await openPage(createStorage(), LINKS);
    const storage = page.window.chrome.storage;

    await storage.local.set({ outlineOpacity: 0 });
    await settle();

    assert.equal(cssVar(page, '--link-highlighter-bg'), 'rgba(255, 255, 0, 0.7)');
    assert.equal(cssVar(page, '--link-highlighter-outline'), 'rgba(255, 165, 0, 0)');
  });

  test('a color change applies live without re-checking any link', async () => {
    const storage = createStorage({ highlightList: ['https://site.test/a'] });
    const page = await openPage(storage, LINKS);
    const before = page.observers.length;

    await storage.local.set({ highlightColor: '#7dff6b' });
    await settle();

    assert.equal(cssVar(page, '--link-highlighter-bg'), 'rgba(125, 255, 107, 0.7)');
    assert.equal(page.observers.length, before);
    assert.deepEqual(page.highlighted(), ['a']);
  });

  test('resetting to the defaults removes the variables again', async () => {
    const storage = createStorage({ highlightColor: '#7dff6b', outlineColor: '#2e9e44' });
    const page = await openPage(storage, LINKS);

    await storage.local.set({ highlightColor: '#ffff00', highlightOpacity: 0.7, outlineColor: '#ffa500', outlineOpacity: 1 });
    await settle();

    assert.equal(cssVar(page, '--link-highlighter-bg'), '');
    assert.equal(cssVar(page, '--link-highlighter-outline'), '');
  });
});
