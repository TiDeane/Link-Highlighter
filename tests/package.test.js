/* Static checks on the files that ship: manifest, stylesheets, shared defaults */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { ROOT, read } = require('./helpers');

const manifest = JSON.parse(read('manifest.json'));
const exists = file => fs.existsSync(path.join(ROOT, file));

describe('manifest', () => {
  test('every file it references exists', () => {
    const files = [
      manifest.action.default_popup,
      ...Object.values(manifest.action.default_icon),
      ...Object.values(manifest.icons),
      ...manifest.content_scripts.flatMap(script => [...script.js, ...(script.css ?? [])])
    ];

    for (const file of files) assert.equal(exists(file), true, `${file} is missing`);
  });

  test('asks for the storage permission only', () => {
    assert.deepEqual(manifest.permissions, ['storage']);
    assert.equal(manifest.host_permissions, undefined);
  });

  test('runs the content script on every page', () => {
    assert.deepEqual(manifest.content_scripts[0].matches, ['<all_urls>']);
    // shared.js first: content.js uses what it defines
    assert.deepEqual(manifest.content_scripts[0].js, ['shared.js', 'content.js']);
  });

  test('ships nothing from the test setup', () => {
    const shipped = JSON.stringify(manifest);
    for (const name of ['tests', 'node_modules', 'package.json']) {
      assert.equal(shipped.includes(name), false, `the manifest mentions ${name}`);
    }
  });

  test('keeps the Firefox add-on id', () => {
    assert.equal(manifest.browser_specific_settings.gecko.id, '{93070e97-cab0-454a-bdf1-df682dbe42f6}');
  });
});

describe('store package (npm run package)', () => {
  const zipped = require('../package.json').scripts.package.split('link-highlighter.zip').pop().trim().split(/\s+/);
  const isZipped = file => zipped.includes(file) || zipped.includes(file.split('/')[0]);

  test('contains every file the manifest and the popup need', () => {
    const { document } = new JSDOM(read('popup.html')).window;
    const needed = [
      'manifest.json',
      manifest.action.default_popup,
      ...Object.values(manifest.icons),
      ...manifest.content_scripts.flatMap(script => [...script.js, ...(script.css ?? [])]),
      ...[...document.querySelectorAll('script[src]')].map(el => el.getAttribute('src')),
      ...[...document.querySelectorAll('link[rel="stylesheet"]')].map(el => el.getAttribute('href')),
      ...[...document.querySelectorAll('img[src]')].map(el => el.getAttribute('src'))
    ];

    for (const file of needed) assert.equal(isZipped(file), true, `${file} is not in the package`);
  });

  test('contains nothing from the test setup', () => {
    for (const name of ['tests', 'node_modules', 'package.json', 'package-lock.json']) {
      assert.equal(zipped.includes(name), false, `${name} would be packaged`);
    }
    for (const file of zipped) assert.equal(exists(file), true, `${file} does not exist`);
  });
});

describe('popup.html', () => {
  const { document } = new JSDOM(read('popup.html')).window;

  test('every script, stylesheet and image it loads exists', () => {
    const files = [
      ...[...document.querySelectorAll('script[src]')].map(el => el.getAttribute('src')),
      ...[...document.querySelectorAll('link[rel="stylesheet"]')].map(el => el.getAttribute('href')),
      ...[...document.querySelectorAll('img[src]')].map(el => el.getAttribute('src'))
    ];

    assert.notEqual(files.length, 0);
    for (const file of files) assert.equal(exists(file), true, `${file} is missing`);
  });

  test('loads shared.js before popup.js', () => {
    const scripts = [...document.querySelectorAll('script[src]')].map(el => el.getAttribute('src'));

    assert.deepEqual(scripts, ['shared.js', 'popup.js']);
  });

  test('has no inline scripts, which extension pages are not allowed to run', () => {
    assert.equal(document.querySelectorAll('script:not([src])').length, 0);
    assert.equal(/\son[a-z]+\s*=/i.test(read('popup.html')), false);
  });

  test('every expandable row points at a panel that exists', () => {
    const rows = [...document.querySelectorAll('.expander')];

    assert.equal(rows.length, 3);
    for (const row of rows) {
      const panel = document.getElementById(row.getAttribute('aria-controls'));
      assert.ok(panel, `no panel for ${row.textContent.trim()}`);
      assert.equal(panel.classList.contains('collapsible'), true);
    }
  });
});

describe('stylesheet injected into pages', () => {
  const css = read('highlight.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [...css.matchAll(/([^{}]+)\{/g)].map(match => match[1].trim());

  test('highlight.css is the only stylesheet injected', () => {
    assert.deepEqual(manifest.content_scripts[0].css, ['highlight.css']);
  });

  test('only styles the highlight classes, so nothing leaks onto websites', () => {
    assert.deepEqual(selectors, ['.highlighted-link', '.highlighted-link-inline']);
  });

  test('inline-block is only on the class added to inline links', () => {
    const rule = name => css.match(new RegExp(`\\${name}\\s*\\{([^}]*)\\}`))[1];

    assert.equal(rule('.highlighted-link').includes('display'), false);
    assert.match(rule('.highlighted-link-inline'), /display:\s*inline-block/);
  });
});

describe('default colors', () => {
  const defaultsIn = file => {
    const literal = read(file).match(/const DEFAULT_COLORS = (\{[^}]*\});/)[1];
    return new Function(`return ${literal}`)();
  };

  test('are defined once, in shared.js, for both the content script and the popup', () => {
    for (const file of ['content.js', 'popup.js']) {
      assert.equal(/const DEFAULT_COLORS\s*=/.test(read(file)), false, `${file} has its own copy`);
      assert.equal(/function (cleanURL|toRgba)\(/.test(read(file)), false, `${file} has its own copy of a shared function`);
    }
    assert.deepEqual(Object.keys(defaultsIn('shared.js')), ['highlightColor', 'highlightOpacity', 'outlineColor', 'outlineOpacity']);
  });

  test('the fallbacks in highlight.css match them', () => {
    const { highlightColor, highlightOpacity, outlineColor, outlineOpacity } = defaultsIn('shared.js');
    const css = read('highlight.css');

    assert.equal(highlightColor, '#ffff00');
    assert.equal(highlightOpacity, 0.7);
    assert.match(css, /var\(--link-highlighter-bg,\s*rgba\(255,\s*255,\s*0,\s*0\.7\)\)/);

    assert.equal(outlineColor, '#ffa500'); // the CSS keyword "orange"
    assert.equal(outlineOpacity, 1);
    assert.match(css, /var\(--link-highlighter-outline,\s*orange\)/);
  });

  test('each outline preset lines up with a highlight preset, defaults first', () => {
    const presets = name => new Function(`return ${read('popup.js').match(new RegExp(`const ${name} = (\\[[^\\]]*\\]);`))[1]}`)();
    const highlight = presets('HIGHLIGHT_PRESETS');
    const outline = presets('OUTLINE_PRESETS');

    assert.equal(highlight.length, outline.length);
    assert.equal(highlight[0], defaultsIn('shared.js').highlightColor);
    assert.equal(outline[0], defaultsIn('shared.js').outlineColor);
    for (const color of [...highlight, ...outline]) assert.match(color, /^#[0-9a-f]{6}$/);
  });
});
