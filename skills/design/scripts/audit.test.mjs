import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { audit, summarise, findBrowser, probeSource, probeFunctionSource, nodeTooOld } from './audit.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROBE = resolve(HERE, 'probe.js');
const BROKEN = pathToFileURL(resolve(HERE, '../fixtures/broken.html')).href;
const CLEAN = pathToFileURL(resolve(HERE, '../fixtures/clean.html')).href;

const MUST_TRIP = [
  'documentOverflowX',
  'viewportZoomDisabled',
  'headingLevelSkipped',
  'contrast',
  'tinyText',
  'clippedText',
  'targetSize',
  'transitionAll',
  'layoutTransition',
  'easeInOnInteractive',
  'nonSemanticInteractive',
  'inputFontSize',
  'placeholderWithoutLabel',
  'scaleZeroEntry',
  'reducedMotionDeletes',
  'missingInteractionState',
  'brokenImage'
];

const MUST_ADVISE = ['uniformRadius', 'ghostCard', 'gradientText', 'emDashDensity', 'marketingBuzzword'];

const browserPresent = Boolean(findBrowser());
const needsBrowser = { skip: browserPresent ? false : 'no Chrome-family binary on this machine' };

test('the probe is a single evaluable expression', () => {
  const source = probeSource();
  assert.match(source, /^\(function \(\) \{/);
  assert.match(source.trim(), /\}\)\(\)$/);
});

test('the probe also emits in function form, for an evaluate tool that requires one', () => {
  const fn = probeFunctionSource();
  assert.match(fn, /^\(\) => \{/);
  const compiled = eval('(' + fn + ')');
  assert.equal(typeof compiled, 'function');
  assert.equal(compiled.length, 0);
  assert.ok(fn.includes(probeSource().trim()), 'the wrapper must carry the probe verbatim');
});

test('every check the probe can report is named in MUST_TRIP or MUST_ADVISE or is a gate', () => {
  const source = probeSource();
  const declared = [...source.matchAll(/ran\.push\('([a-zA-Z]+)'\)/g)].map((m) => m[1]);
  const gates = ['scriptError', 'contentHiddenAtRest'];
  const unclaimed = declared.filter(
    (c) => !MUST_TRIP.includes(c) && !MUST_ADVISE.includes(c) && !gates.includes(c)
  );
  assert.deepEqual(
    unclaimed.sort(),
    ['elementOverflowX', 'elementOverlap', 'fixedWidthTextContainer', 'fontNotLoaded', 'hoverNotGated', 'noRealImages'],
    'a new check must be added to the fixtures or listed here as deliberately unfixtured'
  );
});

test('the broken fixture trips every seeded defect', needsBrowser, async () => {
  const result = await audit(BROKEN);
  assert.equal(result.verified, true, result.message);
  const s = summarise(result);
  const tripped = new Set(s.failures.map((f) => f.check));
  for (const check of MUST_TRIP) {
    assert.ok(tripped.has(check), `${check} did not fire on the broken fixture`);
  }
  assert.equal(s.ok, false);
});

test('the broken fixture raises every seeded advisory', needsBrowser, async () => {
  const result = await audit(BROKEN);
  const advised = new Set(summarise(result).advisories.map((f) => f.check));
  for (const check of MUST_ADVISE) {
    assert.ok(advised.has(check), `${check} did not advise on the broken fixture`);
  }
});

test('the clean fixture trips nothing at all', needsBrowser, async () => {
  const result = await audit(CLEAN);
  assert.equal(result.verified, true, result.message);
  const s = summarise(result);
  assert.deepEqual(s.errors, []);
  assert.deepEqual(s.failures, []);
  assert.deepEqual(s.advisories, []);
  assert.equal(s.ok, true);
  assert.ok(s.ran.length >= 25, `only ${s.ran.length} checks ran`);
});

test('an advisory never fails a run', () => {
  const s = summarise({
    findings: [{ check: 'uniformRadius', severity: 'advisory', target: 'body', detail: 'x' }],
    ran: ['uniformRadius']
  });
  assert.equal(s.ok, true);
  assert.equal(s.advisories.length, 1);
});

test('an error gates every later check', () => {
  const s = summarise({
    findings: [{ check: 'scriptError', severity: 'error', target: 'document', detail: 'boom' }],
    ran: ['scriptError'],
    skipped: ['all-checks-after-error'],
    gated: true
  });
  assert.equal(s.ok, false);
  assert.equal(s.gated, true);
  assert.deepEqual(s.skipped, ['all-checks-after-error']);
});

test('the script has no third-party dependency', () => {
  const runtime = [probeSource(), readFileSync(resolve(HERE, 'audit.mjs'), 'utf8')];
  const all = [...runtime, readFileSync(resolve(HERE, 'audit.test.mjs'), 'utf8')];
  for (const source of all) {
    for (const match of source.matchAll(/^import .*? from '([^']+)'/gm)) {
      const spec = match[1];
      assert.ok(
        spec.startsWith('node:') || spec.startsWith('./') || spec.startsWith('../'),
        `${spec} is neither a node builtin nor a relative path`
      );
    }
  }
  const commonjs = new RegExp('\\b' + 'require' + '\\(');
  for (const source of runtime) {
    assert.equal(commonjs.test(source), false, 'no CommonJS resolution in the shipped runtime');
  }
});

test('this Node is new enough to drive the browser', () => {
  assert.equal(nodeTooOld(), false, `Node ${process.versions.node} is below the documented floor`);
});

test('browser discovery falls back to PATH, not only to fixed locations', () => {
  const source = readFileSync(resolve(HERE, 'audit.mjs'), 'utf8');
  assert.match(source, /CHROME_ON_PATH/, 'a machine with Chrome outside the shipped paths must still be found');
  for (const platformKey of ['darwin', 'linux', 'win32']) {
    assert.match(source, new RegExp(platformKey + ':'), `${platformKey} has no candidate list`);
  }
  assert.match(source, /Program Files \(x86\)/, 'the 32-bit Windows install location is the common one');
  assert.match(source, /google-chrome-stable/, 'the Debian package name is the common Linux binary');
});

test('with no browser it fails closed and claims nothing', async () => {
  const saved = process.env.CHROME_PATH;
  const savedPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  process.env.CHROME_PATH = '/nonexistent/browser';
  Object.defineProperty(process, 'platform', { value: 'nonesuch', configurable: true });
  try {
    const result = await audit(BROKEN);
    assert.equal(result.verified, false);
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.ran, []);
    assert.match(result.message, /NOT VISUALLY VERIFIED/);
    assert.match(result.message, /0 assertions ran/);
    assert.match(result.message, /CHROME_PATH/, 'the failure must say how to fix it');
  } finally {
    Object.defineProperty(process, 'platform', savedPlatform);
    if (saved === undefined) delete process.env.CHROME_PATH;
    else process.env.CHROME_PATH = saved;
  }
});

test('deleting an assertion is caught: the suite can fail', needsBrowser, async () => {
  const original = readFileSync(PROBE, 'utf8');
  const gutted = original.replace(
    "        if (fs < min && text.length > (isUi ? 1 : 20)) {\n          fail('tinyText', el, fs + 'px below ' + min + 'px floor');\n        }",
    '        void min;'
  );
  assert.notEqual(gutted, original, 'the mutation target moved; update this test');
  writeFileSync(PROBE, gutted);
  try {
    const result = await audit(BROKEN);
    const tripped = new Set(summarise(result).failures.map((f) => f.check));
    assert.equal(tripped.has('tinyText'), false, 'the gutted probe still reported tinyText');
  } finally {
    writeFileSync(PROBE, original);
  }
  const restored = await audit(BROKEN);
  const trippedAgain = new Set(summarise(restored).failures.map((f) => f.check));
  assert.ok(trippedAgain.has('tinyText'), 'the probe was not restored');
});
