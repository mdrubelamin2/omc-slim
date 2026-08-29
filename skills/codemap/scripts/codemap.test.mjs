#!/usr/bin/env node
/**
 * omc-slim — codemap.mjs regression check
 *
 * Pins the four defects an adversarial audit found, plus the folder-hash
 * rewrite that fixed them being slow:
 *
 *   1. an unreadable file is not hashed as empty, and a change of cause is a
 *      change (silent data loss: '' === '' made it permanently invisible)
 *   2. node_modules is pruned without a .gitignore, and no codemap.md is
 *      written into it
 *   3. a '!' negation in .gitignore is reported rather than dropped in silence
 *   4. `init` then `changes` is clean — the tool does not hash its own output
 *   5. computeFolderHashes agrees with the O(folders x files) version it
 *      replaced, on a tree with nesting, root-level files and empty folders
 *
 * ...and the three a second audit found:
 *
 *   6. `files` emits the per-directory file list the fixer brief pastes, and it
 *      covers exactly the directories init writes a codemap.md into (A2)
 *   7. a changed leaf dispatches one fixer for its own directory, not one per
 *      ancestor (C1)
 *   8. ignore rules come from `git check-ignore` in a repository — nested
 *      .gitignore files included — and the fallback matcher anchors a pattern
 *      containing a slash to the root, as git does (C2)
 *
 * Self-contained: builds fixtures in a temp dir and removes them. No
 * dependencies beyond node built-ins.
 *
 * Run: node skills/codemap/scripts/codemap.test.mjs
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PatternMatcher,
  computeFileHash,
  computeFolderHashes,
  isUnreadableHash,
} from './codemap.mjs';

const SCRIPT = fileURLToPath(new URL('./codemap.mjs', import.meta.url));
const workspace = mkdtempSync(path.join(tmpdir(), 'codemap-test-'));

function run(...args) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
  });
  return { ...result, output: `${result.stdout}${result.stderr}` };
}

function fixture(name, files) {
  const root = path.join(workspace, name);
  for (const [relPath, contents] of Object.entries(files)) {
    const fullPath = path.join(root, relPath);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents);
  }
  return root;
}

// What init actually recorded, independent of any reporting command.
function selectedPaths(root) {
  const state = JSON.parse(
    readFileSync(path.join(root, '.slim', 'codemap.json'), 'utf8'),
  );
  return Object.keys(state.file_hashes).sort();
}

function gitInit(root) {
  const result = spawnSync('git', ['init', '-q', root], { encoding: 'utf8' });
  return !result.error && result.status === 0;
}

// The `files` grammar the skill's dispatch brief is written against: '# ' lines
// are comments or directory headers, every other line is a path under the
// nearest header above it.
function parseFilesListing(stdout) {
  const byDirectory = new Map();
  let current = null;

  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const header = /^# (\S+\/) \(/.exec(line);
    if (header) {
      current = header[1];
      byDirectory.set(current, []);
      continue;
    }
    if (line.startsWith('# ')) continue;
    if (!current) throw new Error(`path before any header: ${line}`);
    byDirectory.get(current).push(line);
  }

  return byDirectory;
}

function indentedBlock(output, headingPattern) {
  const match = new RegExp(`${headingPattern}\\n((?:  .*\\n?)+)`).exec(output);
  if (!match) return null;
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

// The implementation computeFolderHashes replaced, kept as the oracle.
function computeFolderHashReference(folder, fileHashes) {
  const folderFiles = Object.entries(fileHashes)
    .filter(
      ([filePath]) =>
        filePath.startsWith(`${folder}/`) ||
        (folder === '.' && !filePath.includes('/')),
    )
    .sort(([a], [b]) => a.localeCompare(b));

  if (!folderFiles.length) return '';

  const hasher = createHash('md5');
  for (const [filePath, hash] of folderFiles) {
    hasher.update(`${filePath}:${hash}\n`);
  }
  return hasher.digest('hex');
}

const cases = [
  {
    name: 'unreadable file is not hashed as empty content',
    check() {
      const root = fixture('unreadable', { 'locked.txt': 'secret' });
      const locked = path.join(root, 'locked.txt');
      chmodSync(locked, 0o000);
      const hash = computeFileHash(locked);
      chmodSync(locked, 0o644);

      if (!isUnreadableHash(hash)) return `not flagged unreadable: ${hash}`;
      if (!hash.includes('EACCES')) return `cause not carried: ${hash}`;
      if (hash === computeFileHash(path.join(root, 'missing.txt'))) {
        return 'EACCES is indistinguishable from ENOENT';
      }
      return null;
    },
  },
  {
    // The only cause-to-cause flip reachable in practice is EACCES <->
    // ERR_FS_FILE_TOO_LARGE, and pinning that needs a 2 GB fixture. What is
    // cheap to pin, and what the user actually needs, is that the file is
    // named at all: hashed as '' it was reported nowhere.
    name: 'init and changes name the files they could not read',
    check() {
      const root = fixture('reported', { 'a.txt': 'hello', 'locked.txt': 'x' });
      const locked = path.join(root, 'locked.txt');
      chmodSync(locked, 0o000);

      const init = run('init', '--root', root);
      const changes = run('changes', '--root', root);
      chmodSync(locked, 0o644);

      for (const [label, result] of [
        ['init', init],
        ['changes', changes],
      ]) {
        if (!/1 unreadable/.test(result.output)) {
          return `${label} did not count it:\n${result.output}`;
        }
        if (!result.output.includes('locked.txt')) {
          return `${label} did not name it:\n${result.output}`;
        }
      }
      return null;
    },
  },
  {
    name: 'node_modules is pruned without a .gitignore',
    check() {
      const root = fixture('deps', {
        'src/app.js': 'app',
        'node_modules/pkg/index.js': 'dep',
        'dist/bundle.js': 'built',
      });
      const init = run('init', '--root', root);

      if (!init.output.includes('Selected 1 files')) {
        return `unexpected selection:\n${init.output}`;
      }
      const listing = run('changes', '--root', root);
      if (listing.output.includes('node_modules')) {
        return `node_modules reached hashing:\n${listing.output}`;
      }
      return null;
    },
  },
  {
    name: 'gitignore negation is reported, not silently dropped',
    check() {
      const root = fixture('negation', {
        'a.js': 'a',
        '.gitignore': 'build/\n!build/keep.js\n',
      });
      const init = run('init', '--root', root);
      return init.stderr.includes('negation') && init.stderr.includes('.gitignore')
        ? null
        : `no warning on stderr:\n${init.stderr}`;
    },
  },
  {
    name: 'init leaves changes clean',
    check() {
      const root = fixture('clean', { 'main.js': 'a', 'src/lib.js': 'b' });
      run('init', '--root', root);
      const changes = run('changes', '--root', root);
      return changes.output.includes('No changes detected.')
        ? null
        : `not clean after init:\n${changes.output}`;
    },
  },
  {
    name: 'computeFolderHashes matches the implementation it replaced',
    check() {
      const fileHashes = {
        'root.js': 'aa',
        'README.md': 'bb',
        'src/app.js': 'cc',
        'src/deep/nested/mod.js': 'dd',
        'src/deep/other.js': 'ee',
        'Src/case.js': 'ff',
        'zz/last.js': 'gg',
      };
      const folders = [
        '.',
        'src',
        'src/deep',
        'src/deep/nested',
        'Src',
        'zz',
        'empty',
      ];
      const actual = computeFolderHashes(fileHashes);

      for (const folder of folders) {
        const expected = computeFolderHashReference(folder, fileHashes);
        if ((actual[folder] ?? '') !== expected) {
          return `${folder}: ${actual[folder]} != ${expected}`;
        }
      }
      return null;
    },
  },
  {
    // A2: the brief tells a fixer to read "the file list codemap.mjs reported
    // for this dir". Nothing reported one, so every run invented it.
    name: 'files lists each mapped directory with the files it contributes',
    check() {
      const root = fixture('listing', {
        'main.js': 'a',
        'src/app.js': 'b',
        'src/deep/other.js': 'c',
        'src/deep/nested/mod.js': 'd',
      });
      run('init', '--root', root);
      const listing = run('files', '--root', root);

      if (listing.status !== 0) return `files failed:\n${listing.output}`;

      const byDirectory = parseFilesListing(listing.stdout);
      const expected = {
        './': ['main.js'],
        'src/': ['src/app.js'],
        'src/deep/': ['src/deep/other.js'],
        'src/deep/nested/': ['src/deep/nested/mod.js'],
      };

      const headers = [...byDirectory.keys()].sort().join(' ');
      if (headers !== Object.keys(expected).sort().join(' ')) {
        return `headers ${headers}:\n${listing.stdout}`;
      }

      for (const [directory, files] of Object.entries(expected)) {
        const actual = byDirectory.get(directory).join(' ');
        if (actual !== files.join(' ')) {
          return `${directory} listed [${actual}], expected [${files.join(' ')}]`;
        }
        // Every header must be a directory init wrote a codemap.md into,
        // or the orchestrator dispatches a fixer at a path with no map.
        const mapPath = path.join(root, directory, 'codemap.md');
        if (!existsSync(mapPath)) return `no codemap.md for header ${directory}`;
      }
      return null;
    },
  },
  {
    // C1: one edit under src/a/b used to report '.', 'src', 'src/a' and
    // 'src/a/b' as equals — four fixers, three of them rewriting a map whose
    // own files had not changed.
    name: 'a changed leaf dispatches one fixer, not one per ancestor',
    check() {
      const root = fixture('ancestors', {
        'top.js': 'a',
        'src/a/other.ts': 'b',
        'src/a/b/c.ts': 'c',
      });
      run('init', '--root', root);
      writeFileSync(path.join(root, 'src/a/b/c.ts'), 'changed');
      const changes = run('changes', '--root', root);

      const perFixer = indentedBlock(
        changes.output,
        'directories with changed files \\(one fixer each\\):',
      );
      if (!perFixer) return `no per-fixer section:\n${changes.output}`;
      if (perFixer.join(' ') !== 'src/a/b/') {
        return `dispatches ${perFixer.length}: ${perFixer.join(' ')}`;
      }

      const batch = indentedBlock(
        changes.output,
        'ancestor directories to re-aggregate \\(ONE dispatch, deepest first\\):',
      );
      if (!batch) return `no ancestor batch:\n${changes.output}`;
      if (batch.length !== 1) return `ancestors not batched: ${batch.length} lines`;
      if (batch[0] !== 'src/a/ src/ ./') {
        return `ancestor chain wrong or misordered: ${batch[0]}`;
      }
      return null;
    },
  },
  {
    // C2, first half: git owns the semantics wherever a repository exists, so
    // a nested .gitignore is enforced instead of never being read.
    name: 'ignore rules come from git check-ignore, nested .gitignore included',
    check() {
      const root = fixture('gitignored', {
        'keep.js': 'k',
        '.gitignore': 'root-ignored.js\n',
        'root-ignored.js': 'x',
        'sub/.gitignore': 'hidden.js\n',
        'sub/hidden.js': 'h',
        'sub/shown.js': 's',
      });
      if (!gitInit(root)) {
        console.log('      (skipped: git not available)');
        return null;
      }

      const init = run('init', '--root', root);
      if (!init.stderr.includes('Ignore rules: git check-ignore')) {
        return `did not delegate to git:\n${init.output}`;
      }

      // Asserted against the recorded selection, not the `files` listing, so
      // this fails for its own reason rather than A2's.
      const selected = selectedPaths(root);
      for (const ignored of ['sub/hidden.js', 'root-ignored.js']) {
        if (selected.includes(ignored)) {
          return `${ignored} was selected: ${selected.join(' ')}`;
        }
      }
      if (!selected.includes('sub/shown.js')) {
        return `sub/shown.js was dropped: ${selected.join(' ')}`;
      }
      return null;
    },
  },
  {
    // C2, second half: the fallback matcher used to anchor on a leading slash
    // only, so 'docs/generated/' matched 'a/b/docs/generated/' too.
    name: 'a gitignore pattern containing a slash is anchored to the root',
    check() {
      if (new PatternMatcher(['docs/generated/']).matches('a/b/docs/generated/y.js')) {
        return "'docs/generated/' matched below the root";
      }
      if (!new PatternMatcher(['docs/generated/']).matches('docs/generated/x.js')) {
        return "'docs/generated/' stopped matching at the root";
      }
      if (!new PatternMatcher(['generated/']).matches('a/b/generated/y.js')) {
        return "'generated/' stopped matching at depth";
      }

      const root = fixture('anchoring', {
        'keep.js': 'k',
        '.gitignore': 'docs/generated/\n',
        'docs/generated/x.js': 'x',
        'a/b/docs/generated/y.js': 'y',
      });
      const init = run('init', '--root', root);

      // Only meaningful where the fallback actually ran; inside a git
      // repository git answers instead, and it is already covered above.
      if (!init.stderr.includes('built-in matcher')) {
        console.log('      (end-to-end skipped: fixture is inside a git repository)');
        return null;
      }

      const selected = selectedPaths(root);
      if (selected.includes('docs/generated/x.js')) {
        return `root-anchored path was selected: ${selected.join(' ')}`;
      }
      if (!selected.includes('a/b/docs/generated/y.js')) {
        return `path below the anchor was ignored: ${selected.join(' ')}`;
      }
      return null;
    },
  },
];

let failed = 0;
for (const testCase of cases) {
  let reason;
  try {
    reason = testCase.check();
  } catch (err) {
    reason = `harness error: ${err && err.message}`;
  }
  if (reason) {
    failed++;
    console.log(`FAIL  ${testCase.name}`);
    console.log(`      ${reason}`);
  } else {
    console.log(`PASS  ${testCase.name}`);
  }
}

rmSync(workspace, { recursive: true, force: true });
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed === 0 ? 0 : 1);
