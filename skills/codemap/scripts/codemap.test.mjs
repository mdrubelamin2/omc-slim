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
 * ...and the freshness contract, against the complaint that a generated map is
 * worse than no map once it goes stale:
 *
 *   9. every generated codemap.md states the commit, date and file count it was
 *      written against, without breaking the four-heading contract
 *  10. `update` re-stamps that header and keeps the body the fixer wrote
 *  11. `stale` is silent and zero when nothing moved, non-zero and specific when
 *      it did, and it names the unverifiable cases instead of passing them
 *  12. outside a repository, and in a shallow clone, it says what it cannot
 *      answer rather than printing a wrong number
 *  13. the AGENTS.md block the skill installs teaches the check — that block is
 *      auto-loaded into every session, and it is what turns a stale map into
 *      poisoned context
 *
 * ...and one fail-open in how the script decides it was run at all:
 *
 *  14. invoked through a symlink it still does the work, instead of exiting 0
 *      having written nothing
 *
 * ...and the state baseline:
 *
 *  15. `init` migrates legacy `.slim/cartography.json` and refuses to overwrite
 *      state that exists, so a re-run cannot reset the change baseline
 *
 * ...and containment, since the tool writes into the user's checkout:
 *
 *  16. a committed symlink at a path it writes is refused and named, never
 *      written through, and the run goes on without it
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
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PROVENANCE_END,
  PatternMatcher,
  computeFileHash,
  computeFolderHashes,
  isUnreadableHash,
  readProvenance,
} from './codemap.mjs';

const SCRIPT = fileURLToPath(new URL('./codemap.mjs', import.meta.url));
const SKILL = fileURLToPath(new URL('../SKILL.md', import.meta.url));
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

function git(root, ...args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
}

function gitCommit(root, message) {
  const add = git(root, 'add', '-A');
  if (add.error || add.status !== 0) return false;
  const commit = git(
    root,
    '-c', 'user.email=test@example.com',
    '-c', 'user.name=Test',
    'commit', '-qm', message,
  );
  return !commit.error && commit.status === 0;
}

function headSha(root) {
  return git(root, 'rev-parse', '--short', 'HEAD').stdout.trim();
}

const WRITTEN_BODY = `## Responsibility
Service layer for orders.

## Design
One adapter.

## Flow
In, then out.

## Integration
Consumed by checkout.
`;

// What a codemap fixer does to the file init seeded: replace the body, leave the
// machine-maintained header where it is.
function fixerRewrite(mapPath) {
  const text = readFileSync(mapPath, 'utf8');
  const end = text.indexOf(PROVENANCE_END);
  if (end === -1) throw new Error(`no provenance header in ${mapPath}`);
  writeFileSync(
    mapPath,
    `${text.slice(0, end + PROVENANCE_END.length)}\n\n${WRITTEN_BODY}`,
  );
}

function headings(text) {
  return text
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3).trim());
}

// A status can contain a space ('NO HEADER'), so key on the padded directory
// label rather than on a column count.
function staleRow(output, directory) {
  return output.split('\n').find((line) => line.includes(` ${directory} `));
}

// The block the skill tells the orchestrator to paste into the user's AGENTS.md.
function agentsMdBlock() {
  const match = /```markdown\n(## Repository Map\n[\s\S]*?)```/.exec(
    readFileSync(SKILL, 'utf8'),
  );
  return match ? match[1] : null;
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
  {
    // Every map init writes states what it was written against, or a reader has
    // no way to tell a current map from one describing a tree that moved on.
    name: 'init stamps commit, date and file count on every codemap.md',
    check() {
      const root = fixture('provenance', {
        'main.js': 'a',
        'src/app.js': 'b',
        'src/lib.js': 'c',
      });
      if (!gitInit(root) || !gitCommit(root, 'one')) {
        console.log('      (skipped: git not available)');
        return null;
      }

      run('init', '--root', root);
      const sha = headSha(root);
      const today = new Date().toISOString().slice(0, 10);
      const expectedCounts = { '.': 1, src: 2 };

      for (const [directory, files] of Object.entries(expectedCounts)) {
        const text = readFileSync(path.join(root, directory, 'codemap.md'), 'utf8');
        const provenance = readProvenance(text);
        if (!provenance) return `${directory}: no provenance header:\n${text}`;
        if (provenance.commit !== sha) {
          return `${directory}: commit ${provenance.commit}, HEAD is ${sha}`;
        }
        if (provenance.date !== today) return `${directory}: date ${provenance.date}`;
        if (provenance.files !== files) {
          return `${directory}: files=${provenance.files}, expected ${files}`;
        }
        // The header must not cost the fixer its four-heading contract, and it
        // must leave an unambiguous line to write below.
        if (headings(text).join(',') !== 'Responsibility,Design,Flow,Integration') {
          return `${directory}: headings ${headings(text).join(',')}`;
        }
        if (!text.includes(PROVENANCE_END)) return `${directory}: no end marker`;
        if (!/machine-maintained/i.test(text)) {
          return `${directory}: header does not say it is machine-maintained`;
        }
      }
      return null;
    },
  },
  {
    // The header is only worth reading if it moves. Pinned to the init commit
    // forever it would age into exactly the artefact it warns about.
    name: 'update re-stamps the header and keeps the body the fixer wrote',
    check() {
      const root = fixture('restamp', { 'main.js': 'a', 'src/app.js': 'b' });
      if (!gitInit(root) || !gitCommit(root, 'one')) {
        console.log('      (skipped: git not available)');
        return null;
      }

      run('init', '--root', root);
      const initSha = headSha(root);
      fixerRewrite(path.join(root, 'src/codemap.md'));

      // A map written before headers existed: no header, its own H1 on top.
      writeFileSync(
        path.join(root, 'codemap.md'),
        `# legacy/\n\n${WRITTEN_BODY}`,
      );

      writeFileSync(path.join(root, 'src/app.js'), 'changed');
      if (!gitCommit(root, 'two')) return 'second commit failed';
      const newSha = headSha(root);
      if (newSha === initSha) return 'HEAD did not move; test proves nothing';

      run('update', '--root', root);

      for (const directory of ['.', 'src']) {
        const text = readFileSync(path.join(root, directory, 'codemap.md'), 'utf8');
        const provenance = readProvenance(text);
        if (!provenance) return `${directory}: header lost by update`;
        if (provenance.commit !== newSha) {
          return `${directory}: still stamped ${provenance.commit}, HEAD is ${newSha}`;
        }
        if (!text.includes('Service layer for orders.')) {
          return `${directory}: body was clobbered:\n${text}`;
        }
        if (headings(text).join(',') !== 'Responsibility,Design,Flow,Integration') {
          return `${directory}: headings ${headings(text).join(',')}`;
        }
        if ((text.match(/^# /gm) ?? []).length !== 1) {
          return `${directory}: ${(text.match(/^# /gm) ?? []).length} H1 titles`;
        }
      }
      return null;
    },
  },
  {
    name: 'stale passes only while the maps match the tree',
    check() {
      const root = fixture('freshness', {
        'main.js': 'a',
        'src/app.js': 'b',
        'src/deep/mod.js': 'c',
      });
      if (!gitInit(root) || !gitCommit(root, 'one')) {
        console.log('      (skipped: git not available)');
        return null;
      }

      run('init', '--root', root);
      for (const directory of ['.', 'src', 'src/deep']) {
        fixerRewrite(path.join(root, directory, 'codemap.md'));
      }
      run('update', '--root', root);

      const fresh = run('stale', '--root', root);
      if (fresh.status !== 0) return `fresh tree reported stale:\n${fresh.output}`;
      if (!fresh.stdout.includes('All 3 maps describe the current tree.')) {
        return `no clean verdict:\n${fresh.stdout}`;
      }

      writeFileSync(path.join(root, 'src/app.js'), 'changed');
      const stale = run('stale', '--root', root);
      if (stale.status === 0) return `a changed file did not fail:\n${stale.output}`;

      const row = staleRow(stale.stdout, 'src/');
      if (!row || !row.includes('STALE')) return `src/ not marked stale:\n${stale.stdout}`;
      if (!/1 file\(s\)/.test(row)) return `src/ row has no file count: ${row}`;
      if (!row.includes('commit(s) behind HEAD')) {
        return `src/ row has no commit distance: ${row}`;
      }
      for (const untouched of ['./', 'src/deep/']) {
        const other = staleRow(stale.stdout, untouched);
        if (!other || !other.includes('FRESH')) {
          return `${untouched} dragged in by a sibling's change: ${other}`;
        }
      }
      return null;
    },
  },
  {
    // Anything that cannot be checked is reported as unusable rather than
    // waved through. A map nobody can verify is the artefact the complaint is
    // about, and "no news" is how it survives.
    name: 'stale refuses to certify a map it cannot check',
    check() {
      const root = fixture('unverifiable', {
        'main.js': 'a',
        'legacy/old.js': 'b',
        'blank/new.js': 'c',
        'edited/x.js': 'd',
      });
      if (!gitInit(root) || !gitCommit(root, 'one')) {
        console.log('      (skipped: git not available)');
        return null;
      }

      run('init', '--root', root);
      for (const directory of ['.', 'legacy', 'blank', 'edited']) {
        fixerRewrite(path.join(root, directory, 'codemap.md'));
      }
      run('update', '--root', root);

      // Predates provenance headers.
      writeFileSync(path.join(root, 'legacy/codemap.md'), `# legacy/\n\n${WRITTEN_BODY}`);
      // Init template nobody ever filled in.
      const blank = path.join(root, 'blank/codemap.md');
      const kept = readFileSync(blank, 'utf8');
      writeFileSync(
        blank,
        kept.replace(WRITTEN_BODY, '<!-- Fixer: Fill in this section with architectural understanding -->\n'),
      );
      // Header hand-edited to claim a provenance the last run did not give it.
      const edited = path.join(root, 'edited/codemap.md');
      writeFileSync(
        edited,
        readFileSync(edited, 'utf8').replace(/commit=\S+/, 'commit=deadbee'),
      );

      const result = run('stale', '--root', root);
      if (result.status === 0) return `three broken maps passed:\n${result.output}`;

      const expected = {
        'legacy/': 'NO HEADER',
        'blank/': 'UNWRITTEN',
        'edited/': 'SKEWED',
      };
      for (const [directory, status] of Object.entries(expected)) {
        const row = staleRow(result.stdout, directory);
        if (!row || !row.includes(status)) {
          return `${directory} not ${status}: ${row}\n${result.stdout}`;
        }
      }
      const clean = staleRow(result.stdout, './');
      if (!clean || !clean.includes('FRESH')) {
        return `the one good map was condemned too: ${clean}`;
      }
      return null;
    },
  },
  {
    // Two places a commit distance is unanswerable. Printing '0 commits behind'
    // in either would be wrong in the reassuring direction, and a shallow clone
    // is precisely what CI checks out.
    name: 'stale says what it cannot answer instead of guessing a number',
    check() {
      const outside = fixture('nogit', { 'main.js': 'a' });
      run('init', '--root', outside);
      const noRepo = run('stale', '--root', outside);
      if (!noRepo.stdout.includes('not a git repository')) {
        // Inside this checkout a fixture can still be in a repo; only assert
        // the no-repo wording when git really declined.
        if (!/commit=none/.test(readFileSync(path.join(outside, 'codemap.md'), 'utf8'))) {
          console.log('      (no-repo half skipped: fixture is inside a git repository)');
        } else {
          return `no-repo run did not say so:\n${noRepo.stdout}`;
        }
      } else if (/commit\(s\) behind/.test(noRepo.stdout)) {
        return `invented a distance outside a repository:\n${noRepo.stdout}`;
      }

      const source = fixture('shallow-src', { 'main.js': 'a' });
      if (!gitInit(source) || !gitCommit(source, 'one')) {
        console.log('      (shallow half skipped: git not available)');
        return null;
      }
      run('init', '--root', source);
      fixerRewrite(path.join(source, 'codemap.md'));
      run('update', '--root', source);
      if (!gitCommit(source, 'two')) return 'commit of the maps failed';
      writeFileSync(path.join(source, 'later.js'), 'b');
      if (!gitCommit(source, 'three')) return 'third commit failed';

      const shallow = path.join(workspace, 'shallow-clone');
      const cloned = spawnSync(
        'git',
        ['clone', '-q', '--depth', '1', '--no-local', `file://${source}`, shallow],
        { encoding: 'utf8' },
      );
      if (cloned.error || cloned.status !== 0) {
        console.log('      (shallow half skipped: clone unavailable)');
        return null;
      }

      const result = run('stale', '--root', shallow);
      if (!result.stdout.includes('shallow clone')) {
        return `shallow clone not named:\n${result.stdout}`;
      }
      if (/commit\(s\) behind/.test(result.stdout)) {
        return `printed a distance it cannot know:\n${result.stdout}`;
      }
      return null;
    },
  },
  {
    // This block is appended to the user's AGENTS.md, which Claude Code loads
    // into every session. An unconditional "read codemap.md before any task" is
    // the line that turns one stale map into poisoned context repo-wide.
    name: 'the AGENTS.md block teaches the freshness check, not blind trust',
    check() {
      const block = agentsMdBlock();
      if (!block) return 'no ```markdown Repository Map block in SKILL.md';

      if (!/\bstale\b/.test(block)) return `no freshness check in the block:\n${block}`;
      if (!/read the code/i.test(block)) {
        return `no fallback when the check fails:\n${block}`;
      }
      if (/Before working on any task, read `codemap.md`/.test(block)) {
        return `still instructs unconditional trust:\n${block}`;
      }
      // It is auto-loaded into every session, so its length is a permanent tax.
      const lines = block.trim().split('\n').length;
      if (lines > 16) return `${lines} lines is too long for an auto-loaded block`;
      return null;
    },
  },
  {
    name: 'init migrates legacy state and refuses to overwrite existing state',
    check() {
      const root = fixture('legacy-state', { 'src/a.js': 'a' });
      mkdirSync(path.join(root, '.slim'), { recursive: true });
      writeFileSync(
        path.join(root, '.slim', 'cartography.json'),
        JSON.stringify({ files: {}, folders: {} }),
      );
      const init = run('init', '--root', root);
      if (init.status === 0) {
        return `init overwrote migrated state:\n${init.output}`;
      }
      if (!existsSync(path.join(root, '.slim', 'codemap.json'))) {
        return `legacy state was not migrated:\n${init.output}`;
      }
      if (existsSync(path.join(root, '.slim', 'cartography.json'))) {
        return 'legacy file left behind after migration';
      }
      if (!/already exists/.test(init.output)) {
        return `no refusal naming the existing state:\n${init.output}`;
      }
      const fresh = fixture('fresh-state', { 'src/a.js': 'a' });
      const first = run('init', '--root', fresh);
      if (first.status !== 0) return `first init failed:\n${first.output}`;
      const second = run('init', '--root', fresh);
      if (second.status === 0) {
        return `second init reset the baseline:\n${second.output}`;
      }
      return null;
    },
  },
  {
    // The main guard compared `path.resolve(process.argv[1])`, which keeps
    // symlinks, against `import.meta.url`, which Node has already resolved. Run
    // through a link — a symlinked ${CLAUDE_PLUGIN_ROOT}, an npx or bin shim —
    // they disagreed, `main` never ran, and the process exited 0 having written
    // nothing. The caller sees success from the component that rewrites the
    // repository, so it has to be asserted on the WORK, not on the exit code.
    name: 'invoked through a symlink it still runs, rather than exiting 0 silently',
    check() {
      const root = fixture('symlinked-entry', { 'src/app.js': 'a' });
      const link = path.join(workspace, 'codemap-link.mjs');
      rmSync(link, { force: true });
      symlinkSync(SCRIPT, link);

      const result = spawnSync(process.execPath, [link, 'init', '--root', root], {
        encoding: 'utf8',
      });
      const output = `${result.stdout}${result.stderr}`;

      if (result.status !== 0) return `init failed through the link:\n${output}`;
      if (!existsSync(path.join(root, '.slim', 'codemap.json'))) {
        return `exited ${result.status} without writing any state:\n${output}`;
      }
      if (!existsSync(path.join(root, 'src', 'codemap.md'))) {
        return `no codemap.md was written:\n${output}`;
      }
      return null;
    },
  },
  {
    // A checkout can commit `src/codemap.md` as a symlink to a file the user
    // owns. writeFileSync follows it, so `init` would create the link's target
    // and `update` would overwrite it, both outside the repository. Two links:
    // a dangling one, which is the write init would otherwise make, and a live
    // one, which is the write update would otherwise make.
    name: 'a symlinked codemap.md is refused by name, not written through',
    check() {
      const root = fixture('symlinked-map', {
        'src/a.js': 'a',
        'lib/b.js': 'b',
      });
      const outside = path.join(workspace, 'symlinked-map-targets');
      mkdirSync(outside, { recursive: true });
      const absent = path.join(outside, 'absent.md');
      const kept = path.join(outside, 'keep.md');
      writeFileSync(kept, 'the user\'s own file\n');
      symlinkSync(absent, path.join(root, 'src', 'codemap.md'));
      symlinkSync(kept, path.join(root, 'lib', 'codemap.md'));

      const init = run('init', '--root', root);
      if (init.status !== 0) return `init failed:\n${init.output}`;
      if (existsSync(absent)) return 'init wrote through the dangling link';
      if (!/src\/codemap\.md is a symlink; not written/.test(init.stderr)) {
        return `stderr does not name the refused link:\n${init.output}`;
      }
      if (!/\(\d+ kept, 1 refused\)/.test(init.output)) {
        return `stdout does not count the refusal:\n${init.output}`;
      }
      if (!existsSync(path.join(root, '.slim', 'codemap.json'))) {
        return `the rest of init did not run:\n${init.output}`;
      }

      const update = run('update', '--root', root);
      if (update.status !== 0) return `update failed:\n${update.output}`;
      if (readFileSync(kept, 'utf8') !== 'the user\'s own file\n') {
        return 'update wrote through the live link';
      }
      if (!/lib\/codemap\.md is a symlink; not written/.test(update.stderr)) {
        return `stderr does not name the refused link:\n${update.output}`;
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
