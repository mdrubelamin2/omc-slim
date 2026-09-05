#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { platform } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROBE_PATH = resolve(HERE, 'probe.js');
const SETTLE_MS = 600;
const LAUNCH_TIMEOUT_MS = 15000;
const EVAL_TIMEOUT_MS = 20000;

const MIN_NODE_MAJOR = 22;

const CHROME_CANDIDATES = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ],
  linux: [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/opt/google/chrome/chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
    '/usr/bin/brave-browser',
    '/usr/bin/microsoft-edge-stable',
    '/usr/bin/microsoft-edge'
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Chromium\\Application\\chrome.exe'
  ]
};

const CHROME_ON_PATH = [
  'google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium',
  'brave-browser', 'microsoft-edge-stable', 'microsoft-edge', 'chrome'
];

const HEADLESS_FLAG = '--headless=new';

const ERROR_TRAP = `
window.__designAuditErrors = window.__designAuditErrors || [];
window.addEventListener('error', function (e) { window.__designAuditErrors.push(String(e.message)); });
window.addEventListener('unhandledrejection', function (e) { window.__designAuditErrors.push('unhandled rejection: ' + String(e.reason)); });
`;

export function probeSource() {
  return readFileSync(PROBE_PATH, 'utf8');
}

export function probeFunctionSource() {
  return '() => {\n  return ' + probeSource().trim() + ';\n}\n';
}

export function errorTrapSource() {
  return ERROR_TRAP;
}

function onPath(name) {
  const dirs = (process.env.PATH || '').split(platform() === 'win32' ? ';' : ':');
  const suffixes = platform() === 'win32' ? ['.exe', ''] : [''];
  for (const dir of dirs) {
    if (!dir) continue;
    for (const suffix of suffixes) {
      const full = resolve(dir, name + suffix);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

export function findBrowser() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const candidate of CHROME_CANDIDATES[platform()] || []) {
    if (existsSync(candidate)) return candidate;
  }
  for (const name of CHROME_ON_PATH) {
    const found = onPath(name);
    if (found) return found;
  }
  return null;
}

export function nodeTooOld() {
  return Number(process.versions.node.split('.')[0]) < MIN_NODE_MAJOR;
}

export function summarise(result) {
  const findings = result.findings || [];
  const errors = findings.filter((f) => f.severity === 'error');
  const failures = findings.filter((f) => f.severity === 'fail');
  const advisories = findings.filter((f) => f.severity === 'advisory');
  return {
    ok: errors.length === 0 && failures.length === 0,
    errors,
    failures,
    advisories,
    ran: result.ran || [],
    skipped: result.skipped || [],
    gated: Boolean(result.gated)
  };
}

function unavailable(reason) {
  return {
    verified: false,
    reason,
    findings: [],
    ran: [],
    skipped: ['every-check'],
    message: 'NOT VISUALLY VERIFIED. ' + reason + '. 0 assertions ran.'
  };
}

async function connect(wsUrl) {
  if (typeof WebSocket !== 'function') {
    throw new Error('this Node build has no global WebSocket; Node 22 or newer is required');
  }
  const socket = new WebSocket(wsUrl);
  await new Promise((ok, no) => {
    socket.onopen = ok;
    socket.onerror = () => no(new Error('could not open a DevTools connection'));
  });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { ok, no } = pending.get(message.id);
      pending.delete(message.id);
      message.error ? no(new Error(message.error.message)) : ok(message.result);
    }
  };
  const send = (method, params = {}) => new Promise((ok, no) => {
    const id = ++nextId;
    pending.set(id, { ok, no });
    socket.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); no(new Error(method + ' timed out')); }
    }, EVAL_TIMEOUT_MS);
  });
  return { send, close: () => socket.close() };
}

async function launch(browser, width, height) {
  const child = spawn(browser, [
    HEADLESS_FLAG,
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${width},${height}`,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const browserWs = await new Promise((ok, no) => {
    let buffer = '';
    const timer = setTimeout(() => no(new Error('the browser did not report a DevTools endpoint')), LAUNCH_TIMEOUT_MS);
    child.stderr.on('data', (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/ws:\/\/[^\s]+/);
      if (match) { clearTimeout(timer); ok(match[0]); }
    });
    child.on('exit', (code) => { clearTimeout(timer); no(new Error('the browser exited with code ' + code)); });
  });

  const origin = 'http://' + new URL(browserWs).host;
  const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
  let wsUrl = null;
  while (!wsUrl && Date.now() < deadline) {
    const targets = await fetch(origin + '/json/list').then((r) => r.json()).catch(() => []);
    const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (page) wsUrl = page.webSocketDebuggerUrl;
    else await new Promise((ok) => setTimeout(ok, 100));
  }
  if (!wsUrl) throw new Error('the browser exposed no page target');
  return { child, wsUrl };
}

export async function audit(target, { width = 1280, height = 800 } = {}) {
  if (nodeTooOld()) {
    return unavailable(
      `this Node is ${process.versions.node} and the audit needs ${MIN_NODE_MAJOR} or newer for its built-in WebSocket. ` +
      'Run the checks through a connected browser tool with --probe instead'
    );
  }
  const browser = findBrowser();
  if (!browser) {
    return unavailable(
      'no browser tool is connected and no Chrome-family binary was found. ' +
      'Set CHROME_PATH, or run the checks through a connected browser tool with --probe'
    );
  }

  let child, session;
  try {
    const launched = await launch(browser, width, height);
    child = launched.child;
    const { send, close } = await connect(launched.wsUrl);
    session = { close };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: ERROR_TRAP });

    const loaded = new Promise((ok) => setTimeout(ok, LAUNCH_TIMEOUT_MS));
    await send('Page.navigate', { url: target });
    await Promise.race([
      new Promise((ok) => setTimeout(ok, SETTLE_MS)),
      loaded
    ]);
    await new Promise((ok) => setTimeout(ok, SETTLE_MS));

    const evaluated = await send('Runtime.evaluate', {
      expression: probeSource(),
      returnByValue: true,
      awaitPromise: false
    });

    if (evaluated.exceptionDetails) {
      throw new Error(evaluated.exceptionDetails.exception?.description || 'the probe threw');
    }
    const value = evaluated.result?.value;
    if (!value || typeof value !== 'object') {
      throw new Error('the probe returned no result');
    }
    return { verified: true, target, ...value };
  } catch (failure) {
    return unavailable('the browser ran but the audit could not complete: ' + failure.message);
  } finally {
    session?.close();
    child?.kill();
  }
}

function report(result) {
  if (!result.verified) {
    console.log(result.message);
    console.log('Unverified: every check in floor.md that needs a rendered page.');
    console.log('Ask before adding a check the project does not already have.');
    return 2;
  }
  const s = summarise(result);
  const total = s.ran.length;
  const tripped = new Set([...s.errors, ...s.failures].map((f) => f.check));
  console.log(`${total - tripped.size} of ${total} checks passed on ${result.target}`);
  for (const f of [...s.errors, ...s.failures]) {
    console.log(`  ${f.severity.toUpperCase().padEnd(8)} ${f.check} — ${f.target} — ${f.detail}`);
  }
  for (const f of s.advisories) {
    console.log(`  advisory ${f.check} — ${f.target} — ${f.detail}`);
  }
  if (s.gated) console.log('  Every later check was skipped: fix the error first.');
  for (const skip of s.skipped) console.log(`  not run: ${skip}`);
  console.log(`${s.failures.length} failing, ${s.errors.length} error, ${s.advisories.length} advisory (advisory never fails a build).`);
  return s.ok ? 0 : 1;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const args = process.argv.slice(2);
  if (args[0] === '--probe') {
    process.stdout.write(probeSource());
    process.exit(0);
  }
  if (args[0] === '--probe-fn') {
    process.stdout.write(probeFunctionSource());
    process.exit(0);
  }
  if (!args[0]) {
    console.error('usage: audit.mjs <url|file> [--width N] [--height N]');
    console.error('       audit.mjs --probe      emit the probe as an expression, for a REPL-style evaluate tool');
    console.error('       audit.mjs --probe-fn   emit it wrapped as a function, for an evaluate tool that requires one');
    process.exit(2);
  }
  const widthArg = args.indexOf('--width');
  const heightArg = args.indexOf('--height');
  const target = /^https?:\/\//.test(args[0]) ? args[0] : pathToFileURL(resolve(args[0])).href;
  const result = await audit(target, {
    width: widthArg > -1 ? Number(args[widthArg + 1]) : 1280,
    height: heightArg > -1 ? Number(args[heightArg + 1]) : 800
  });
  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
  process.exit(report(result));
}
