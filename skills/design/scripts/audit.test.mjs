import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { audit, summarise, findBrowser, probeSource, probeFunctionSource, nodeTooOld } from './audit.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROBE = resolve(HERE, 'probe.js');
const BROKEN = pathToFileURL(resolve(HERE, '../fixtures/broken.html')).href;
const CLEAN = pathToFileURL(resolve(HERE, '../fixtures/clean.html')).href;
const DEFERRED = pathToFileURL(resolve(HERE, '../fixtures/deferred.html')).href;
const NO_IMAGERY = pathToFileURL(resolve(HERE, '../fixtures/no-imagery.html')).href;
const AUDIT_CLI = resolve(HERE, 'audit.mjs');

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
  const gates = ['scriptError', 'contentHiddenAtRest', 'documentNotRendered'];
  const unclaimed = declared.filter(
    (c) => !MUST_TRIP.includes(c) && !MUST_ADVISE.includes(c) && !gates.includes(c)
  );
  assert.deepEqual(
    unclaimed.sort(),
    ['elementOverflowX', 'elementOverlap', 'fixedWidthTextContainer', 'fontNotLoaded', 'hoverNotGated', 'noRealImages'],
    'a new check must be added to the fixtures or listed here as deliberately unfixtured'
  );
});

test('no check is registered twice, because ran.length is the published denominator', () => {
  const declared = [...probeSource().matchAll(/ran\.push\('([a-zA-Z]+)'\)/g)].map((m) => m[1]);
  const seen = new Set();
  const twice = declared.filter((c) => (seen.has(c) ? true : (seen.add(c), false)));
  assert.deepEqual(twice, [], 'a duplicate inflates "N of M" in every report');
});

test('a page that renders after its load event is an error, not a clean pass', needsBrowser, async () => {
  const result = await audit(DEFERRED);
  assert.equal(result.verified, true, result.message);
  const s = summarise(result);
  assert.equal(s.gated, true, 'an unrendered document must gate every later check');
  assert.ok(
    s.errors.some((f) => f.check === 'documentNotRendered'),
    'a scripted document with no text was measured as if it were a page'
  );
});

test('sections with no imagery fail, because defaults.md gates that half', needsBrowser, async () => {
  const result = await audit(NO_IMAGERY);
  assert.equal(result.verified, true, result.message);
  const s = summarise(result);
  assert.ok(s.failures.some((f) => f.check === 'noRealImages'), 'noRealImages did not fail');
  assert.equal(s.ok, false);
});

test('an svg counts as imagery, so the clean fixture does not trip the image gate', needsBrowser, async () => {
  const s = summarise(await audit(CLEAN));
  assert.ok(!s.failures.some((f) => f.check === 'noRealImages'));
});

test('a viewport argument that does not parse stops the run instead of measuring the default', () => {
  assert.throws(
    () => execFileSync(process.execPath, [AUDIT_CLI, CLEAN, '--width', 'abc'], { stdio: 'pipe' }),
    (error) => error.status === 2,
    'a bad --width used to reach Chrome as NaN and silently measure 1280'
  );
});

test('the report names the viewport it measured', needsBrowser, () => {
  const out = execFileSync(process.execPath, [AUDIT_CLI, CLEAN, '--width', '900'], { encoding: 'utf8' });
  assert.match(out, /checks passed on .* at 900x\d+/);
});

test('a file:// URL is audited as itself, not re-resolved as a relative path', needsBrowser, () => {
  const out = execFileSync(process.execPath, [AUDIT_CLI, CLEAN], { encoding: 'utf8' });
  assert.ok(out.includes('fixtures/clean.html'), out);
  assert.ok(!out.includes('NOT VISUALLY VERIFIED'), out);
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
  const savedPath = process.env.PATH;
  const savedPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  process.env.CHROME_PATH = '/nonexistent/browser';
  process.env.PATH = '';
  Object.defineProperty(process, 'platform', { value: 'nonesuch', configurable: true });
  assert.equal(findBrowser(), null, 'the no-browser case is not being simulated');
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
    process.env.PATH = savedPath;
    if (saved === undefined) delete process.env.CHROME_PATH;
    else process.env.CHROME_PATH = saved;
  }
});

test('deleting an assertion is caught: the suite can fail', needsBrowser, async () => {
  // The mutant goes to a temp copy and the tracked probe is only ever read.
  // Mutating it in place left it gutted in the working tree on any abort
  // between the write and the restore, and two concurrent runs restored each
  // other's mutants — the class hooks/mutate-runner.mjs removed for the hooks.
  const original = readFileSync(PROBE, 'utf8');
  const gutted = original.replace(
    "        if (fs < min && text.length > (isUi ? 1 : 20)) {\n          fail('tinyText', el, fs + 'px below ' + min + 'px floor');\n        }",
    '        void min;'
  );
  assert.notEqual(gutted, original, 'the mutation target moved; update this test');

  const sandbox = mkdtempSync(join(tmpdir(), 'omc-slim-probe-'));
  const variant = join(sandbox, 'probe.js');
  writeFileSync(variant, gutted);
  try {
    // The broken fixture fails by design, so a non-zero exit is the expected
    // outcome and its stdout is the result.
    let out;
    try {
      out = execFileSync(process.execPath, [AUDIT_CLI, BROKEN, '--json'], {
        encoding: 'utf8',
        env: { ...process.env, OMC_SLIM_PROBE_PATH: variant },
      });
    } catch (failure) {
      out = failure.stdout;
    }
    // --json prints the payload and then the human report, which carries no
    // braces, so the last one closes the JSON.
    const findings = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)).findings || [];
    assert.equal(
      findings.some((f) => f.check === 'tinyText'),
      false,
      'the gutted probe still reported tinyText'
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }

  assert.equal(readFileSync(PROBE, 'utf8'), original, 'the tracked probe was modified');
  const restored = await audit(BROKEN);
  const trippedAgain = new Set(summarise(restored).failures.map((f) => f.check));
  assert.ok(trippedAgain.has('tinyText'), 'the probe still reports tinyText');
});
