/**
 * End-to-end smoke test.
 *
 * Loads the built extension into a real (headless) Chrome, drives it through
 * the DevTools protocol, and checks the two behaviours that are hard to unit
 * test: per-match dynamic grouping and the tab-strip ordering invariant.
 *
 *   node scripts/e2e.mjs
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DIST = new URL('../dist', import.meta.url).pathname;

/** Prefer an installed Chrome for Testing; branded Chrome ignores --load-extension. */
function resolveChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const browsersDir = new URL('../.cache/browsers/chrome', import.meta.url).pathname;
  try {
    for (const version of readdirSync(browsersDir)) {
      const candidate = join(
        browsersDir,
        version,
        `chrome-${version.includes('mac_arm') ? 'mac-arm64' : 'mac-x64'}`,
        'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      );
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    // Not installed.
  }
  return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
}

const CHROME = resolveChrome();
const DEBUG_PORT = 9333;
const APP_PORT = 8099;

const log = (...args) => console.log('[e2e]', ...args);
let failures = 0;
function check(name, condition, detail = '') {
  if (condition) {
    log(`✓ ${name}`);
  } else {
    failures += 1;
    log(`✗ ${name} ${detail}`);
  }
}

// --- a tiny server whose pages have meaningful titles -----------------------
const server = createServer((req, res) => {
  const match = /^\/t\/([^/?#]+)/.exec(req.url ?? '');
  const title = match ? decodeURIComponent(match[1]) : 'home';
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><head><title>${title}</title></head><body>${title}</body></html>`);
});
await new Promise((resolve) => server.listen(APP_PORT, '127.0.0.1', resolve));
log(`serving http://127.0.0.1:${APP_PORT}`);

// --- launch Chrome with the unpacked extension ------------------------------
const profile = join(new URL('../.cache', import.meta.url).pathname, 'chrome-e2e-profile');
rmSync(profile, { recursive: true, force: true });
mkdirSync(profile, { recursive: true });
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    `--crash-dumps-dir=${profile}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
chrome.stderr.on('data', (chunk) => {
  const text = String(chunk);
  if (/error|fail/i.test(text) && !/Fontconfig|GPU|dbus|Voice|Bluetooth/i.test(text)) {
    log('chrome stderr:', text.trim().slice(0, 300));
  }
});

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let nextId = 0;
    socket.addEventListener('open', () =>
      resolve({
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const id = ++nextId;
            pending.set(id, { res, rej });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close: () => socket.close(),
      }),
    );
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      if (message.error) entry.rej(new Error(JSON.stringify(message.error)));
      else entry.res(message.result);
    });
    socket.addEventListener('error', () => reject(new Error(`WebSocket failed: ${url}`)));
  });
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed');
  }
  return result.result.value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll an async predicate until it returns a truthy value or the timeout hits. */
async function waitFor(fn, timeout = 20000, interval = 400) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = await fn();
    if (last) return last;
    await sleep(interval);
  }
  return last;
}

async function findServiceWorker() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
      const worker = targets.find(
        (t) => t.type === 'service_worker' && t.url.includes('service-worker-loader'),
      );
      if (worker) return worker;
    } catch {
      // Chrome not up yet.
    }
    await sleep(500);
  }
  throw new Error('extension service worker never appeared');
}

/** The target is listed before its JS context exists; wait until chrome.* is usable. */
async function waitForWorkerReady(cdp, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const ready = await evaluate(
        cdp,
        'typeof chrome !== "undefined" && !!(chrome.runtime && chrome.storage && chrome.tabs)',
      );
      if (ready) return true;
    } catch {
      // Context not created yet.
    }
    await sleep(300);
  }
  return false;
}

const RULESET = {
  version: 1,
  rules: [
    {
      id: 'r_ticket',
      name: 'Tickets',
      enabled: true,
      match: { pattern: 'ticket-(\\d+)', target: 'title', mode: 'regex', flags: 'i' },
      group: { mode: 'perMatch', template: 'ticket-$1' },
      priority: 10,
    },
  ],
  settings: { enabled: true, debounceMs: 120, groupExistingOnStartup: false },
};

let cdp;
try {
  const worker = await findServiceWorker();
  log('service worker target found');
  cdp = await connect(worker.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await waitForWorkerReady(cdp);

  const version = await evaluate(cdp, 'chrome.runtime.getManifest().version');
  check('extension manifest loads', typeof version === 'string', String(version));

  await evaluate(
    cdp,
    `chrome.storage.local.set(${JSON.stringify({ ruleset: RULESET })}).then(() => true)`,
  );
  log('rules seeded');

  // A fresh window with deliberately interleaved tabs.
  const urls = ['plain-A', 'ticket-123', 'plain-B', 'ticket-456'].map(
    (name) => `http://127.0.0.1:${APP_PORT}/t/${name}`,
  );
  const windowId = await evaluate(
    cdp,
    `chrome.windows.create({ url: ${JSON.stringify(urls)}, focused: true }).then((w) => w.id)`,
  );

  const readState = `(async () => {
    const tabs = await chrome.tabs.query({ windowId: ${windowId} });
    const groups = await chrome.tabGroups.query({ windowId: ${windowId} });
    return {
      tabs: tabs.sort((a, b) => a.index - b.index).map((t) => ({ id: t.id, title: t.title, groupId: t.groupId })),
      groups: groups.map((g) => ({ id: g.id, title: g.title, color: g.color })),
    };
  })()`;

  let state = await waitFor(async () => {
    const snapshot = await evaluate(cdp, readState);
    return snapshot.tabs.length === 4 && snapshot.groups.length === 2 ? snapshot : null;
  });
  state ??= { tabs: [], groups: [] };
  const titles = state.tabs.map((t) => t.title);
  const groupTitles = state.groups.map((g) => g.title).sort();
  check(
    'per-match groups created for each ticket id',
    groupTitles.length === 2 &&
      groupTitles.includes('ticket-123') &&
      groupTitles.includes('ticket-456'),
    JSON.stringify(groupTitles),
  );
  check(
    'groups are contiguous and left of ungrouped tabs',
    titles[0] === 'ticket-123' &&
      titles[1] === 'ticket-456' &&
      titles.slice(2).sort().join(',') === 'plain-A,plain-B',
    JSON.stringify(titles),
  );

  // Requirement 4: a brand-new group must land after the other groups and
  // before the ungrouped tabs.
  await evaluate(
    cdp,
    `chrome.tabs.create({ windowId: ${windowId}, url: 'http://127.0.0.1:${APP_PORT}/t/ticket-789', active: false }).then(() => true)`,
  );
  state = await waitFor(async () => {
    const snapshot = await evaluate(cdp, readState);
    if (process.env.E2E_DEBUG) {
      log('phase2', JSON.stringify(snapshot.tabs.map((t) => t.title)), JSON.stringify(snapshot.groups));
    }
    return snapshot.tabs.length === 5 && snapshot.groups.length === 3 ? snapshot : null;
  });
  state ??= { tabs: [], groups: [] };
  const titles2 = state.tabs.map((t) => t.title);
  const groupTitles2 = state.groups.map((g) => g.title);
  check(
    'new group is created for the new ticket',
    groupTitles2.includes('ticket-789'),
    JSON.stringify(groupTitles2),
  );
  check(
    'new group lands after existing groups, before ungrouped tabs',
    JSON.stringify(titles2) ===
      JSON.stringify(['ticket-123', 'ticket-456', 'ticket-789', 'plain-A', 'plain-B']),
    JSON.stringify(titles2),
  );

  const groupsByTitle = Object.fromEntries(state.groups.map((g) => [g.title, g]));
  check(
    'dynamic groups get distinct colours',
    groupsByTitle['ticket-123'].color !== groupsByTitle['ticket-456'].color,
    JSON.stringify(state.groups),
  );
} catch (err) {
  failures += 1;
  log('✗ fatal:', err instanceof Error ? err.message : String(err));
} finally {
  cdp?.close();
  chrome.kill('SIGKILL');
  server.close();
  rmSync(profile, { recursive: true, force: true });
}

log(failures === 0 ? 'ALL E2E CHECKS PASSED' : `${failures} E2E CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
