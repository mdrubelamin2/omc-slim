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
 * Self-contained: builds fixtures in a temp dir and removes them. No
 * dependencies beyond node built-ins.
 *
 * Run: node skills/codemap/scripts/codemap.test.mjs
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
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
