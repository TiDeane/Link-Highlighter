/* Test helpers: a fake chrome.storage shared between fake "tabs" and a fake popup,
   all running the extension's real, unmodified files inside jsdom. */

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

const clone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/* Stands in for chrome.storage.local and chrome.storage.onChanged */
function createStorage(initial = {}) {
  const data = clone(initial);
  const listeners = new Set();
  const writes = []; // every set() call, in order

  function notify(changes) {
    if (Object.keys(changes).length === 0) return;
    // Real browsers deliver onChanged asynchronously
    setTimeout(() => listeners.forEach(listener => listener(clone(changes), 'local')), 0);
  }

  const local = {
    async get(keys) {
      if (keys == null) return clone(data);
      if (typeof keys === 'string') keys = [keys];

      const result = {};
      if (Array.isArray(keys)) {
        for (const key of keys) if (key in data) result[key] = clone(data[key]);
      } else {
        for (const key in keys) result[key] = clone(key in data ? data[key] : keys[key]);
      }
      return result;
    },

    async set(items) {
      writes.push(clone(items));
      const changes = {};
      for (const key in items) {
        if (JSON.stringify(data[key]) === JSON.stringify(items[key])) continue;
        changes[key] = { oldValue: clone(data[key]), newValue: clone(items[key]) };
        data[key] = clone(items[key]);
      }
      notify(changes);
    },

    async remove(keys) {
      const changes = {};
      for (const key of [].concat(keys)) {
        if (!(key in data)) continue;
        changes[key] = { oldValue: clone(data[key]) };
        delete data[key];
      }
      notify(changes);
    }
  };

  return {
    data,
    writes,
    local,
    onChanged: { addListener: listener => listeners.add(listener) },
    api() {
      return { storage: { local, onChanged: this.onChanged }, runtime: { id: 'test-extension-id' } };
    }
  };
}

/* Lets pending promises, storage events and observer callbacks run */
async function settle() {
  for (let i = 0; i < 6; i++) await new Promise(resolve => setTimeout(resolve, 0));
}

/* A controllable IntersectionObserver. Anything inside [data-offscreen] counts as
   outside the viewport until page.scrollIntoView() is called on it. */
function installFakeIntersectionObserver(window) {
  const observers = [];
  observers.checks = 0;      // how many times a link was handed to the extension to check
  observers.stopped = false; // set when the page is closed

  class FakeIntersectionObserver {
    constructor(callback) {
      this.callback = callback;
      this.targets = new Set();
      observers.push(this);
    }

    observe(element) {
      if (this.targets.has(element)) return;
      this.targets.add(element);
      this.deliver(element);
    }

    unobserve(element) {
      this.targets.delete(element);
    }

    disconnect() {
      this.targets.clear();
    }

    deliver(element) {
      // Like a real browser, report on a later turn (there, the next frame)
      setTimeout(() => {
        if (observers.stopped || !this.targets.has(element)) return;
        observers.checks++;
        this.callback([{ target: element, isIntersecting: !element.closest('[data-offscreen]') }], this);
      }, 0).unref(); // a runaway re-check loop must fail a test, not keep the run alive forever
    }
  }

  window.IntersectionObserver = FakeIntersectionObserver;
  return observers;
}

/* Opens a fake tab on `html` and runs content.js in it */
async function openPage(storage, html, { url = 'https://example.com/page' } = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${html}</body></html>`, {
    url,
    runScripts: 'outside-only'
  });
  const { window } = dom;
  const errors = [];

  window.chrome = storage.api();
  window.addEventListener('unhandledrejection', event => errors.push(event.reason));
  window.addEventListener('error', event => errors.push(event.error));
  const observers = installFakeIntersectionObserver(window);

  window.eval(read('content.js'));
  await settle();

  const page = {
    window,
    document: window.document,
    errors,
    observers,
    $: selector => window.document.querySelector(selector),
    $$: selector => [...window.document.querySelectorAll(selector)],

    isHighlighted: selector => page.$(selector).classList.contains('highlighted-link'),
    highlighted: () => page.$$('a.highlighted-link').map(link => link.id),

    async mousedown(selector, init = {}) {
      const target = typeof selector === 'string' ? page.$(selector) : selector;
      target.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, ...init }));
      await settle();
    },

    async scrollIntoView(selector) {
      const element = page.$(selector);
      const container = element.closest('[data-offscreen]');
      if (container) container.removeAttribute('data-offscreen');
      observers.forEach(observer => observer.targets.forEach(target => observer.deliver(target)));
      await settle();
    },

    close() {
      observers.stopped = true;
      window.close();
    },

    /* Simulates the extension being reloaded or updated under an open tab */
    orphan() {
      window.chrome.runtime.id = undefined;
    }
  };

  return page;
}

/* Opens the popup: the real popup.html with popup.js run in it */
async function openPopup(storage) {
  const dom = new JSDOM(read('popup.html'), {
    url: 'https://extension.invalid/popup.html',
    runScripts: 'outside-only'
  });
  const { window } = dom;

  window.chrome = storage.api();
  window.eval(read('popup.js'));
  if (window.document.readyState !== 'loading') {
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  }
  await settle();
  await settle();

  const popup = {
    window,
    document: window.document,
    $: selector => window.document.querySelector(selector),
    $$: selector => [...window.document.querySelectorAll(selector)],

    async click(selector) {
      const element = typeof selector === 'string' ? popup.$(selector) : selector;
      element.click();
      await settle();
    },

    async slide(selector, value) {
      const slider = popup.$(selector);
      slider.value = String(value);
      slider.dispatchEvent(new window.Event('input', { bubbles: true }));
      await settle();
    },

    isOpen: panelId => popup.$('#' + panelId).classList.contains('open')
  };

  return popup;
}

module.exports = { ROOT, read, createStorage, openPage, openPopup, settle };
