#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERSION = '1.0.0';
export const STATE_DIR = '.slim';
export const STATE_FILE = 'codemap.json';
export const LEGACY_STATE_FILE = 'cartography.json';
export const CODEMAP_FILE = 'codemap.md';

// Directory names never worth mapping, pruned before .gitignore is consulted.
// A repository without a .gitignore used to be walked into its dependencies,
// which both drowned the file list and wrote a codemap.md inside node_modules.
// A user .gitignore may add to this set; it is not required for these.
export const ALWAYS_EXCLUDED_DIRS = new Set([
  'node_modules',
  'vendor',
  '.git',
  'dist',
  'build',
  'target',
  '__pycache__',
  '.venv',
  'venv',
]);

// Marks a file whose contents could not be read. A read failure is not an empty
// file: hashing both to '' made an unreadable file compare equal to itself
// forever, so it could never be reported as changed. The sentinel carries the
// cause, so a file that flips from EACCES to readable is a change, and it can
// never collide with an md5 digest.
export const UNREADABLE_PREFIX = '<unreadable:';

export class PatternMatcher {
  regex;

  constructor(patterns) {
    if (!patterns.length) {
      this.regex = null;
      return;
    }

    const regexParts = patterns.map((pattern) => {
      let reg = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      reg = reg.replace(/\\\*\\\*\//g, '(?:.*/)?');
      reg = reg.replace(/\\\*\\\*/g, '.*');
      reg = reg.replace(/\\\*/g, '[^/]*');
      reg = reg.replace(/\\\?/g, '.');

      if (pattern.endsWith('/')) {
        reg += '.*';
      }

      // Git anchors a pattern to the .gitignore's own directory as soon as it
      // contains a slash anywhere other than at the end — 'docs/build' matches
      // only at the root, while 'build' matches at every depth. Keying on a
      // leading slash alone made 'docs/build' match 'a/b/docs/build' too.
      const withoutTrailingSlash = pattern.endsWith('/')
        ? pattern.slice(0, -1)
        : pattern;
      if (withoutTrailingSlash.includes('/')) {
        reg = pattern.startsWith('/') ? `^${reg.slice(1)}` : `^${reg}`;
      } else {
        reg = `(?:^|.*/)${reg}`;
      }

      return `(?:${reg}$)`;
    });

    this.regex = new RegExp(regexParts.join('|'));
  }

  matches(filePath) {
    if (!this.regex) return false;
    return this.regex.test(filePath);
  }
}

export function loadGitignore(root) {
  const gitignorePath = path.join(root, '.gitignore');
  if (!existsSync(gitignorePath)) return [];

  const lines = readFileSync(gitignorePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  // Negation is reported, not implemented. Git resolves '!' by last-match-wins
  // and still refuses to re-include a file whose parent directory is excluded;
  // PatternMatcher compiles one unordered alternation, so it can express
  // neither rule. Half-implementing it would disagree with git in a new way, so
  // the lines are dropped — but never in silence.
  const negations = lines.filter((line) => line.startsWith('!'));
  if (negations.length) {
    console.warn(
      `Warning: ${gitignorePath} has ${negations.length} '!' negation pattern(s); codemap does not support negation and ignores them.`,
    );
  }

  return lines.filter((line) => !line.startsWith('!'));
}

// Which of these paths git ignores, or null when git cannot answer.
// `git check-ignore` already implements every rule PatternMatcher approximates
// — nested .gitignore files, depth anchoring, negation, precedence, the global
// and info/exclude files — so where a repository exists it is both smaller and
// exactly right to ask it. One batched call: a spawn per path would dominate
// the run. Tracked files are deliberately not treated as ignored, which is
// git's own answer for them.
export function gitIgnoredPaths(root, relPaths) {
  const ask = (paths) =>
    spawnSync('git', ['-C', root, 'check-ignore', '-z', '--stdin'], {
      input: paths.map((relPath) => `${relPath}\0`).join(''),
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });

  let result = ask(relPaths);

  // 0 = some ignored, 1 = none ignored. Anything else is git declining to
  // answer: 128 outside a repository, a spawn error with no git installed.
  //
  // And one case that is neither, which cost the whole repository its nested
  // .gitignore handling: git fails the ENTIRE batch with 128 if any single path
  // lies inside a submodule — `fatal: Pathspec 'sub/a.txt' is in submodule
  // 'sub'`. One such path made every other path in the tree fall back to the
  // root-only matcher, and the fallback then announced "not a repository, or
  // not installed", which is false and sends the reader looking in the wrong
  // place. Drop the submodule paths and ask again: a path inside a submodule is
  // that submodule's business, not this map's.
  if (!result.error && result.status === 128) {
    const prefixes = submodulePrefixes(root);
    if (prefixes.length) {
      const outside = relPaths.filter(
        (rel) => !prefixes.some((p) => rel === p || rel.startsWith(`${p}/`)),
      );
      if (outside.length !== relPaths.length) {
        result = ask(outside);
      }
    }
  }

  if (result.error || (result.status !== 0 && result.status !== 1)) {
    // Carry git's own words out. The previous message guessed at the cause and
    // guessed wrong whenever the cause was anything but a missing repository.
    const why = (result.stderr || (result.error && result.error.message) || '')
      .trim()
      .split('\n')[0];
    return { ignored: null, why };
  }

  return { ignored: new Set(result.stdout.split('\0').filter(Boolean)), why: '' };
}

// Repo-relative paths of every registered submodule, or [] if git will not say.
function submodulePrefixes(root) {
  const r = spawnSync('git', ['-C', root, 'submodule', '--quiet', 'foreach', 'echo $sm_path'],
    { encoding: 'utf8' });
  if (r.error || r.status !== 0) return [];
  return r.stdout.split('\n').map((s) => s.trim()).filter(Boolean);
}

// Fallback for a tree git will not answer for. It reads the root .gitignore
// only, so a nested one is unenforced — name the files, because that is the
// point at which the user would be misled by the selection.
function fallbackIgnoredPaths(root, relPaths) {
  const nested = relPaths.filter((rel) => rel.endsWith('/.gitignore'));
  if (nested.length) {
    console.warn(
      `Warning: ${nested.length} nested .gitignore file(s) are NOT applied without git (${nested.join(', ')}); only the root .gitignore is.`,
    );
  }

  const matcher = new PatternMatcher(loadGitignore(root));
  return new Set(relPaths.filter((relPath) => matcher.matches(relPath)));
}

// Diagnostics go to stderr: `files` writes a machine-readable listing on
// stdout, and a preamble there would be indistinguishable from a file path.
function resolveIgnoredPaths(root, relPaths) {
  const { ignored: fromGit, why } = gitIgnoredPaths(root, relPaths);
  if (fromGit) {
    console.warn('Ignore rules: git check-ignore');
    return fromGit;
  }

  console.warn(
    `Ignore rules: built-in matcher — git declined${why ? `: ${why}` : ' (not a repository, or not installed)'}. ` +
      'It applies the root .gitignore only, and diverges from git on: nested .gitignore ' +
      "files, '!' negation, and a directory pattern written without a trailing slash " +
      "('logs' ignores nothing beneath it, 'logs/' does).",
  );
  return fallbackIgnoredPaths(root, relPaths);
}

function isWalkableDir(name) {
  return !name.startsWith('.') && !ALWAYS_EXCLUDED_DIRS.has(name);
}

// This tool's own output. Hashing it would make `changes` dirty the moment
// `init` finishes, because every codemap.md init writes matches the default
// `**/*` include.
function isGeneratedArtefact(relPath) {
  return (
    relPath === CODEMAP_FILE ||
    relPath.endsWith(`/${CODEMAP_FILE}`) ||
    relPath === STATE_DIR ||
    relPath.startsWith(`${STATE_DIR}/`)
  );
}

function walkFiles(root) {
  const files = [];

  function visit(currentDir) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (isWalkableDir(entry.name)) {
          visit(fullPath);
        }
        continue;
      }

      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  visit(root);
  return files.sort();
}

function toRelPath(root, fullPath) {
  const relPath = path.relative(root, fullPath).replaceAll(path.sep, '/');
  return relPath.startsWith('./') ? relPath.slice(2) : relPath;
}

export function selectFiles(
  root,
  includePatterns,
  excludePatterns,
  exceptions,
) {
  const includeMatcher = new PatternMatcher(includePatterns);
  const excludeMatcher = new PatternMatcher(excludePatterns);
  const exceptionSet = new Set(exceptions);

  const candidates = walkFiles(root)
    .map((fullPath) => ({ fullPath, relPath: toRelPath(root, fullPath) }))
    .filter(({ relPath }) => !isGeneratedArtefact(relPath));

  const ignored = resolveIgnoredPaths(
    root,
    candidates.map(({ relPath }) => relPath),
  );

  return candidates
    .filter(({ relPath }) => {
      if (ignored.has(relPath)) return false;
      if (excludeMatcher.matches(relPath) && !exceptionSet.has(relPath)) {
        return false;
      }
      return includeMatcher.matches(relPath) || exceptionSet.has(relPath);
    })
    .map(({ fullPath }) => fullPath);
}

export function computeFileHash(filePath) {
  try {
    const buffer = readFileSync(filePath);
    return createHash('md5').update(buffer).digest('hex');
  } catch (error) {
    const cause = error?.code ?? 'UNKNOWN';
    return `${UNREADABLE_PREFIX}${cause}>`;
  }
}

export function isUnreadableHash(hash) {
  return typeof hash === 'string' && hash.startsWith(UNREADABLE_PREFIX);
}

// One pass that appends each file to every ancestor folder's bucket, rather
// than rescanning every file once per folder — the old shape was
// O(folders x files) and dominated `init` on wide trees.
export function computeFolderHashes(fileHashes) {
  const buckets = new Map();
  const sortedPaths = Object.keys(fileHashes).sort((a, b) =>
    a.localeCompare(b),
  );

  for (const filePath of sortedPaths) {
    const parts = filePath.split('/');
    // A folder's hash covers its whole subtree; the root covers only the files
    // sitting directly in it.
    const owners =
      parts.length === 1
        ? ['.']
        : parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));

    for (const folder of owners) {
      const bucket = buckets.get(folder);
      if (bucket) {
        bucket.push(filePath);
      } else {
        buckets.set(folder, [filePath]);
      }
    }
  }

  const folderHashes = {};
  for (const [folder, filePaths] of buckets) {
    const hasher = createHash('md5');
    for (const filePath of filePaths) {
      hasher.update(`${filePath}:${fileHashes[filePath]}\n`);
    }
    folderHashes[folder] = hasher.digest('hex');
  }
  return folderHashes;
}

export function getFoldersWithFiles(files, root) {
  const folders = new Set(['.']);

  for (const filePath of files) {
    const relPath = path.relative(root, filePath).replaceAll(path.sep, '/');
    const parts = relPath.split('/').slice(0, -1);
    for (let i = 0; i < parts.length; i++) {
      folders.add(parts.slice(0, i + 1).join('/'));
    }
  }

  return folders;
}

// The directory a file belongs to — the one whose codemap.md describes it.
function parentDir(relPath) {
  const parts = relPath.split('/');
  return parts.length === 1 ? '.' : parts.slice(0, -1).join('/');
}

// Every strict ancestor of a directory, root included.
function ancestorDirs(dir) {
  if (dir === '.') return [];
  const parts = dir.split('/');
  const result = ['.'];
  for (let i = 1; i < parts.length; i++) {
    result.push(parts.slice(0, i).join('/'));
  }
  return result;
}

function deepestFirst(a, b) {
  const depth = (dir) => (dir === '.' ? 0 : dir.split('/').length);
  return depth(b) - depth(a) || a.localeCompare(b);
}

// A checkout can commit a symlink at any path this tool writes: a directory's
// codemap.md, `.slim/codemap.json`, the legacy state file. writeFileSync follows
// the link, so the write would land wherever it points, outside the repository
// included. Only a regular file, or nothing, is written; a link is named and
// left alone.
function writeRegularFile(filePath, text) {
  let existing;
  try {
    existing = lstatSync(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (existing && !existing.isFile()) {
    const kind = existing.isSymbolicLink() ? 'a symlink' : 'not a regular file';
    console.error(`${filePath} is ${kind}; not written`);
    return false;
  }
  writeFileSync(filePath, text);
  return true;
}

export function migrateLegacyState(root) {
  const stateDir = path.join(root, STATE_DIR);
  const legacyPath = path.join(stateDir, LEGACY_STATE_FILE);
  const statePath = path.join(stateDir, STATE_FILE);

  if (existsSync(statePath) || !existsSync(legacyPath)) {
    return false;
  }
  // rename moves the link itself, and the state file would then be a link too.
  if (lstatSync(legacyPath).isSymbolicLink()) {
    console.error(`${legacyPath} is a symlink; not migrated`);
    return false;
  }

  mkdirSync(stateDir, { recursive: true });
  renameSync(legacyPath, statePath);
  console.log(
    `Migrated ${STATE_DIR}/${LEGACY_STATE_FILE} -> ${STATE_DIR}/${STATE_FILE}`,
  );
  return true;
}

export function loadState(root) {
  migrateLegacyState(root);
  const statePath = path.join(root, STATE_DIR, STATE_FILE);
  if (!existsSync(statePath)) return null;

  try {
    return JSON.parse(readFileSync(statePath, 'utf8'));
  } catch {
    return null;
  }
}

export function saveState(root, state) {
  const stateDir = path.join(root, STATE_DIR);
  mkdirSync(stateDir, { recursive: true });
  return writeRegularFile(
    path.join(stateDir, STATE_FILE),
    `${JSON.stringify(state, null, 2)}\n`,
  );
}

// The body init seeds. The `<!-- Fixer:` marker is also how `stale` recognises a
// map nobody ever wrote: an empty map registered in AGENTS.md is the worst case
// this tool has, because it reads as authoritative and says nothing.
const EMPTY_BODY = `<!-- Fixer: Fill in this section with architectural understanding -->

## Responsibility

<!-- What is this folder's job in the system? -->

## Design

<!-- Key patterns, abstractions, architectural decisions -->

## Flow

<!-- How does data/control flow through this module? -->

## Integration

<!-- How does it connect to other parts of the system? -->
`;

export const UNWRITTEN_MARKER = '<!-- Fixer: Fill in this section';

// Provenance header. Every codemap.md this tool writes states, in its own first
// lines, the commit it was verified against — because the failure mode of a
// generated map is not being useless, it is being confidently wrong in a file an
// agent was told to trust.
//
// Two forms of the same three facts, deliberately: the comment is what `stale`
// parses, the blockquote is what a reader sees. The comment alone would be
// invisible to a human skimming the rendered file; the prose alone would need
// parsing back out of English.
//
// The block ends at PROVENANCE_END so the fixer has an unambiguous line to write
// below and `update` has an unambiguous span to replace. Nothing here is an `##`
// heading, so the four-heading contract the fixer brief requires is untouched.
export const PROVENANCE_END = '<!-- /codemap:provenance -->';
const PROVENANCE_RE =
  /<!-- codemap:provenance commit=(\S+) date=(\S+) files=(\d+) -->/;

export function renderCodemap(folderName, provenance, body) {
  const { commit, date, files } = provenance;
  const asOf =
    commit === 'none'
      ? `${date} (no commit — not a git repository)`
      : `\`${commit}\` (${date})`;

  return `# ${folderName}/
<!-- codemap:provenance commit=${commit} date=${date} files=${files} -->
> **Generated map — it goes stale.** Current as of ${asOf}, for the ${files} file(s)
> in this directory. Verify with \`codemap.mjs stale --root ./\`; if this directory
> is listed, read the code instead. Header is machine-maintained: rewrite only
> what is below this line.
${PROVENANCE_END}

${body}`;
}

export function readProvenance(text) {
  const match = PROVENANCE_RE.exec(text);
  if (!match) return null;
  return { commit: match[1], date: match[2], files: Number(match[3]) };
}

// Everything the fixer wrote, with the machine-maintained header taken off.
export function stripProvenance(text) {
  const end = text.indexOf(PROVENANCE_END);
  if (end !== -1) {
    return text.slice(end + PROVENANCE_END.length).replace(/^\n+/, '');
  }
  // A map written before this header existed carries its own `# dir/` title.
  // The header supplies that title, so drop it rather than leave two H1s.
  return text.replace(/^# [^\n]*\n+/, '');
}

// The commit a map is being verified against, or null outside a repository and
// in a repository with no commits yet.
export function gitHead(root) {
  const result = spawnSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim() || null;
}

export function runProvenance(root) {
  return {
    commit: gitHead(root) ?? 'none',
    date: new Date().toISOString().slice(0, 10),
  };
}

export function createEmptyCodemap(folderPath, folderName, provenance, files) {
  const codemapPath = path.join(folderPath, CODEMAP_FILE);
  // An existing map is left exactly as it is, header included. `init` runs when
  // there is no state, so it has no grounds to certify a map it did not write —
  // re-stamping one here would silently claim that whatever is on disk describes
  // today's tree. `stale` reports the resulting mismatch instead.
  if (existsSync(codemapPath)) return 'kept';

  return writeRegularFile(
    codemapPath,
    renderCodemap(folderName, { ...provenance, files }, EMPTY_BODY),
  );
}

// Re-stamp a map's header, keeping the body underneath. This is what makes the
// header mean anything after the first run: `update` is the workflow's statement
// that the maps are current, so it must move the header with the state it saves,
// or every header stays pinned to the init commit forever.
//
// It follows that `update` must be run AFTER the fixers have rewritten the maps,
// not before — running it early certifies maps nobody has touched.
export function refreshCodemap(folderPath, folderName, provenance, files) {
  const codemapPath = path.join(folderPath, CODEMAP_FILE);
  const body = existsSync(codemapPath)
    ? stripProvenance(readFileSync(codemapPath, 'utf8'))
    : EMPTY_BODY;

  return writeRegularFile(
    codemapPath,
    renderCodemap(folderName, { ...provenance, files }, body),
  );
}

// Files a directory contributes itself, which is what its own codemap.md
// describes — not its subtree, which its children's maps cover.
function ownFileCounts(root, selectedFiles, folders) {
  const counts = new Map([...folders].map((folder) => [folder, 0]));
  for (const fullPath of selectedFiles) {
    const dir = parentDir(toRelPath(root, fullPath));
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  return counts;
}

function folderLabel(root, folder) {
  return folder === '.' ? path.basename(root) : folder;
}

// An unreadable file can never be diffed by content, so the only way the user
// learns it exists is here.
function reportUnreadable(fileHashes) {
  const unreadable = Object.entries(fileHashes)
    .filter(([, hash]) => isUnreadableHash(hash))
    .sort(([a], [b]) => a.localeCompare(b));

  if (!unreadable.length) return;

  console.log(
    `\n${unreadable.length} unreadable (tracked by failure cause, not content):`,
  );
  for (const [filePath, hash] of unreadable) {
    console.log(`  ! ${filePath} ${hash}`);
  }
}

function buildState(
  root,
  includePatterns,
  excludePatterns,
  exceptions,
  selectedFiles,
  provenance,
) {
  const fileHashes = {};
  for (const filePath of selectedFiles) {
    const relPath = path.relative(root, filePath).replaceAll(path.sep, '/');
    fileHashes[relPath] = computeFileHash(filePath);
  }

  const folders = getFoldersWithFiles(selectedFiles, root);
  const computedHashes = computeFolderHashes(fileHashes);
  const folderHashes = {};
  for (const folder of folders) {
    folderHashes[folder] = computedHashes[folder] ?? '';
  }

  const state = {
    metadata: {
      version: VERSION,
      last_run: new Date().toISOString(),
      // The commit every codemap.md header was stamped with by this run. A map
      // whose header disagrees with it was not written by the run that recorded
      // these hashes, so its freshness is unestablished however clean the hashes
      // look — that is the only handle there is on a hand-edited map.
      commit: provenance.commit,
      date: provenance.date,
      root,
      include_patterns: includePatterns,
      exclude_patterns: excludePatterns,
      exceptions,
    },
    file_hashes: fileHashes,
    folder_hashes: folderHashes,
  };

  return { state, folders };
}

export function cmdInit({ root, include = [], exclude = [], exception = [] }) {
  const resolvedRoot = path.resolve(root);
  if (!existsSync(resolvedRoot) || !statSync(resolvedRoot).isDirectory()) {
    console.error(`Error: ${resolvedRoot} is not a directory`);
    return 1;
  }
  // Existing state is the change baseline. Re-running init would reset it and
  // hide everything that moved since the maps were written.
  migrateLegacyState(resolvedRoot);
  if (existsSync(path.join(resolvedRoot, STATE_DIR, STATE_FILE))) {
    console.error(
      `Error: ${STATE_DIR}/${STATE_FILE} already exists; run \`changes\` to see what moved, or delete it to start over`,
    );
    return 1;
  }

  const includePatterns = include.length ? include : ['**/*'];
  const excludePatterns = exclude;
  const exceptions = exception;

  console.log(`Scanning ${resolvedRoot}...`);
  console.log(`Include patterns: ${JSON.stringify(includePatterns)}`);
  console.log(`Exclude patterns: ${JSON.stringify(excludePatterns)}`);
  console.log(`Exceptions: ${JSON.stringify(exceptions)}`);

  const selectedFiles = selectFiles(
    resolvedRoot,
    includePatterns,
    excludePatterns,
    exceptions,
  );

  console.log(`Selected ${selectedFiles.length} files`);

  const provenance = runProvenance(resolvedRoot);
  const { state, folders } = buildState(
    resolvedRoot,
    includePatterns,
    excludePatterns,
    exceptions,
    selectedFiles,
    provenance,
  );

  if (!saveState(resolvedRoot, state)) return 1;
  console.log(`Created ${STATE_DIR}/${STATE_FILE}`);

  const counts = ownFileCounts(resolvedRoot, selectedFiles, folders);
  let written = 0;
  let kept = 0;
  let refused = 0;
  for (const folder of folders) {
    const folderPath =
      folder === '.' ? resolvedRoot : path.join(resolvedRoot, folder);
    const outcome = createEmptyCodemap(
      folderPath,
      folderLabel(resolvedRoot, folder),
      provenance,
      counts.get(folder) ?? 0,
    );
    if (outcome === 'kept') kept += 1;
    else if (outcome) written += 1;
    else refused += 1;
  }

  console.log(
    `Created ${written} empty codemap.md files (${kept} kept, ${refused} refused), stamped ${provenance.commit} (${provenance.date})`,
  );
  reportUnreadable(state.file_hashes);
  return 0;
}

// The one comparison in this tool: what is on disk now against what the state
// recorded. `changes` reports it per file, `stale` reports it per map — neither
// gets its own notion of what changed.
function diffAgainstState(root, state) {
  const metadata = state.metadata ?? {};
  const currentFiles = selectFiles(
    root,
    metadata.include_patterns ?? ['**/*'],
    metadata.exclude_patterns ?? [],
    metadata.exceptions ?? [],
  );

  const currentHashes = Object.fromEntries(
    currentFiles.map((filePath) => [
      toRelPath(root, filePath),
      computeFileHash(filePath),
    ]),
  );

  const savedHashes = state.file_hashes ?? {};
  const currentPaths = new Set(Object.keys(currentHashes));
  const savedPaths = new Set(Object.keys(savedHashes));

  return {
    currentFiles,
    currentHashes,
    added: [...currentPaths].filter((p) => !savedPaths.has(p)).sort(),
    removed: [...savedPaths].filter((p) => !currentPaths.has(p)).sort(),
    modified: [...currentPaths]
      .filter((p) => savedPaths.has(p) && currentHashes[p] !== savedHashes[p])
      .sort(),
  };
}

export function cmdChanges({ root }) {
  const resolvedRoot = path.resolve(root);
  const state = loadState(resolvedRoot);
  if (!state) {
    console.error("No codemap state found. Run 'init' first.");
    return 1;
  }

  const { currentHashes, added, removed, modified } = diffAgainstState(
    resolvedRoot,
    state,
  );

  reportUnreadable(currentHashes);

  if (!added.length && !removed.length && !modified.length) {
    console.log('No changes detected.');
    return 0;
  }

  if (added.length) {
    console.log(`\n${added.length} added:`);
    for (const filePath of added) console.log(`  + ${filePath}`);
  }

  if (removed.length) {
    console.log(`\n${removed.length} removed:`);
    for (const filePath of removed) console.log(`  - ${filePath}`);
  }

  if (modified.length) {
    console.log(`\n${modified.length} modified:`);
    for (const filePath of modified) console.log(`  ~ ${filePath}`);
  }

  // A directory is remapped when its OWN files changed. Its ancestors hold no
  // description of a grandchild's file; they aggregate their children's
  // Responsibility summaries, and whether a summary actually moved only becomes
  // visible once the child's codemap.md has been rewritten — which this script
  // never reads, so the dependency is not computable from hashes. So the
  // ancestor chain is reported as ONE re-aggregation dispatch, deepest first,
  // instead of a fixer per level: editing src/a/b/c.ts used to spawn four.
  const changedDirs = new Set(
    [...added, ...removed, ...modified].map(parentDir),
  );

  const ancestors = new Set();
  for (const dir of changedDirs) {
    for (const ancestor of ancestorDirs(dir)) {
      if (!changedDirs.has(ancestor)) ancestors.add(ancestor);
    }
  }

  const sortedChanged = [...changedDirs].sort();
  console.log(
    `\n${sortedChanged.length} directories with changed files (one fixer each):`,
  );
  for (const dir of sortedChanged) {
    console.log(`  ${dir}/`);
  }

  if (ancestors.size) {
    const chain = [...ancestors].sort(deepestFirst).map((dir) => `${dir}/`);
    console.log(
      `\n${chain.length} ancestor directories to re-aggregate (ONE dispatch, deepest first):`,
    );
    console.log(`  ${chain.join(' ')}`);
  }

  return 0;
}

// The per-directory file list a codemap fixer is briefed with. Without it the
// orchestrator had to invent the list, and a map that names files nobody opened
// is the failure this whole tool exists to prevent.
//
// Output grammar, one line each: a line starting with '# ' is a comment or a
// directory header; every other line is a repo-relative path.
//
// A path containing a newline, or beginning with '# ', would break that grammar
// and hand the orchestrator two paths that do not exist. Such a path is named on
// stderr and withheld from stdout rather than corrupting the listing: a codemap
// fixer briefed with a phantom path reads a file that is not there and describes
// it anyway. belonging to the
// nearest header above it. A header with no paths under it is a directory that
// contributes no files of its own and only aggregates its children's maps.
export function cmdFiles({ root }) {
  const resolvedRoot = path.resolve(root);
  const state = loadState(resolvedRoot);
  if (!state) {
    console.error("No codemap state found. Run 'init' first.");
    return 1;
  }

  const metadata = state.metadata ?? {};
  const allSelected = selectFiles(
    resolvedRoot,
    metadata.include_patterns ?? ['**/*'],
    metadata.exclude_patterns ?? [],
    metadata.exceptions ?? [],
  );

  // A path holding a newline, or opening with the header marker, cannot be
  // written into a line-per-path listing without splitting into paths that do
  // not exist. Named on stderr and withheld from stdout: a fixer briefed with a
  // phantom path opens nothing and describes it anyway.
  const unlistable = allSelected.filter((f) => f.includes('\n') || f.startsWith('# '));
  const selectedFiles = allSelected.filter((f) => !unlistable.includes(f));
  if (unlistable.length) {
    console.warn(
      `Warning: ${unlistable.length} path(s) cannot appear in this listing because ` +
        'they contain a newline or begin with "# ". They are excluded from stdout ' +
        'and must be handed to a fixer by hand: ' +
        unlistable.map((f) => JSON.stringify(f)).join(', '),
    );
  }

  // Seeded from the same folder set init writes a codemap.md into, so every
  // mapped directory gets a header even when it owns no files.
  const byDirectory = new Map(
    [...getFoldersWithFiles(selectedFiles, resolvedRoot)]
      .sort()
      .map((folder) => [folder, []]),
  );
  for (const fullPath of selectedFiles) {
    const relPath = toRelPath(resolvedRoot, fullPath);
    byDirectory.get(parentDir(relPath)).push(relPath);
  }

  console.log(`# ${byDirectory.size} directories`);
  for (const [folder, files] of byDirectory) {
    const label = folder === '.' ? './' : `${folder}/`;
    const count = `${files.length} file${files.length === 1 ? '' : 's'}`;
    const note = files.length ? '' : '; aggregates child codemaps only';
    console.log(`\n# ${label} (${count}${note})`);
    for (const relPath of files) {
      console.log(relPath);
    }
  }

  return 0;
}

export function cmdUpdate({ root }) {
  const resolvedRoot = path.resolve(root);
  const state = loadState(resolvedRoot);
  if (!state) {
    console.error("No codemap state found. Run 'init' first.");
    return 1;
  }

  const metadata = state.metadata ?? {};
  const includePatterns = metadata.include_patterns ?? ['**/*'];
  const excludePatterns = metadata.exclude_patterns ?? [];
  const exceptions = metadata.exceptions ?? [];

  const selectedFiles = selectFiles(
    resolvedRoot,
    includePatterns,
    excludePatterns,
    exceptions,
  );

  const provenance = runProvenance(resolvedRoot);
  const { state: nextState, folders } = buildState(
    resolvedRoot,
    includePatterns,
    excludePatterns,
    exceptions,
    selectedFiles,
    provenance,
  );

  if (!saveState(resolvedRoot, nextState)) return 1;

  const counts = ownFileCounts(resolvedRoot, selectedFiles, folders);
  let restamped = 0;
  let refused = 0;
  for (const folder of folders) {
    const folderPath =
      folder === '.' ? resolvedRoot : path.join(resolvedRoot, folder);
    const ok = refreshCodemap(
      folderPath,
      folderLabel(resolvedRoot, folder),
      provenance,
      counts.get(folder) ?? 0,
    );
    if (ok) restamped += 1;
    else refused += 1;
  }

  console.log(
    `Updated ${STATE_DIR}/${STATE_FILE} with ${selectedFiles.length} files`,
  );
  console.log(
    `Re-stamped ${restamped} codemap.md headers (${refused} refused) with ${provenance.commit} (${provenance.date})`,
  );
  reportUnreadable(nextState.file_hashes);
  return 0;
}

// How far behind HEAD a recorded commit is, or why that cannot be answered.
//
// Three reasons it cannot, and each gets its own words rather than a number:
// there is no repository, the commit is not in this clone's history because the
// clone is shallow, or the commit is simply unknown — a rewritten history, a
// dropped branch, an edited header. A shallow clone is the case that matters
// most, because a shallow clone is exactly what CI checks out, and a check that
// printed "0 commits behind" there would be wrong in the reassuring direction.
function commitDistance(root, commit) {
  if (!commit || commit === 'none') return { behind: null, note: 'no commit recorded' };

  const result = spawnSync(
    'git',
    ['-C', root, 'rev-list', '--count', `${commit}..HEAD`],
    { encoding: 'utf8' },
  );
  if (!result.error && result.status === 0) {
    return { behind: Number(result.stdout.trim()), note: '' };
  }

  const shallow = spawnSync(
    'git',
    ['-C', root, 'rev-parse', '--is-shallow-repository'],
    { encoding: 'utf8' },
  );
  if (!shallow.error && shallow.stdout.trim() === 'true') {
    return { behind: null, note: 'distance unknowable (shallow clone)' };
  }
  return { behind: null, note: `commit ${commit} not in this history` };
}

// One directory's verdict. Everything that is not demonstrably fresh is stale:
// a map that cannot be checked is not a map that can be trusted, and treating
// "unknown" as "fine" is how a dead document keeps being read as a live one.
function assessCodemap(mapPath, ownChanges, stateCommit) {
  if (!existsSync(mapPath)) {
    return { fresh: false, status: 'MISSING', detail: 'no codemap.md in this directory' };
  }

  const text = readFileSync(mapPath, 'utf8');
  const provenance = readProvenance(text);
  if (!provenance) {
    return {
      fresh: false,
      status: 'NO HEADER',
      detail: 'no provenance header — predates it, or was edited out; unverifiable',
    };
  }
  if (text.includes(UNWRITTEN_MARKER)) {
    return {
      fresh: false,
      status: 'UNWRITTEN',
      provenance,
      detail: 'still the init template — no map was ever written here',
    };
  }
  if (stateCommit && provenance.commit !== stateCommit) {
    return {
      fresh: false,
      status: 'SKEWED',
      provenance,
      detail: `header says ${provenance.commit}, last map run was ${stateCommit} — not refreshed by it`,
    };
  }
  if (ownChanges) {
    return {
      fresh: false,
      status: 'STALE',
      provenance,
      detail: `${ownChanges} file(s) in this directory changed since`,
    };
  }
  return { fresh: true, status: 'FRESH', provenance, detail: 'matches the files it describes' };
}

// Whether each map still describes its directory, in a form a human reads in one
// line and CI reads as an exit code. It adds no comparison of its own: the file
// hashes come from the same diff `changes` runs, and the commit comes from the
// header the map carries.
export function cmdStale({ root }) {
  const resolvedRoot = path.resolve(root);
  const state = loadState(resolvedRoot);
  if (!state) {
    console.error("No codemap state found. Run 'init' first.");
    return 1;
  }

  const { currentFiles, added, removed, modified } = diffAgainstState(
    resolvedRoot,
    state,
  );

  const changedPerDir = new Map();
  for (const filePath of [...added, ...removed, ...modified]) {
    const dir = parentDir(filePath);
    changedPerDir.set(dir, (changedPerDir.get(dir) ?? 0) + 1);
  }

  // Directories the state knows about, plus any that exist now — a directory
  // whose files were all deleted still has a codemap.md describing them.
  const folders = new Set([
    ...Object.keys(state.folder_hashes ?? {}),
    ...getFoldersWithFiles(currentFiles, resolvedRoot),
  ]);

  const stateCommit = state.metadata?.commit ?? null;
  const head = gitHead(resolvedRoot);
  const distances = new Map();

  const rows = [...folders].sort().map((folder) => {
    const mapPath = path.join(
      folder === '.' ? resolvedRoot : path.join(resolvedRoot, folder),
      CODEMAP_FILE,
    );
    const verdict = assessCodemap(
      mapPath,
      changedPerDir.get(folder) ?? 0,
      stateCommit,
    );

    const commit = verdict.provenance?.commit;
    if (commit && !distances.has(commit)) {
      distances.set(commit, commitDistance(resolvedRoot, commit));
    }
    const distance = commit ? distances.get(commit) : null;
    const age = !distance
      ? ''
      : distance.note
        ? `${commit}, ${distance.note}`
        : `${commit}, ${distance.behind} commit(s) behind HEAD`;

    return { folder, ...verdict, age };
  });

  console.log(
    head
      ? `Freshness of ${rows.length} mapped directories against HEAD ${head}:`
      : `Freshness of ${rows.length} mapped directories (not a git repository — file hashes only, no commit provenance):`,
  );

  const width = Math.max(...rows.map((row) => row.folder.length)) + 1;
  for (const row of rows) {
    const label = `${row.folder === '.' ? '.' : row.folder}/`.padEnd(width + 1);
    console.log(
      `  ${row.status.padEnd(10)} ${label} ${row.age ? `${row.age}; ` : ''}${row.detail}`,
    );
  }

  const stale = rows.filter((row) => !row.fresh);
  if (!stale.length) {
    console.log(`\nAll ${rows.length} maps describe the current tree.`);
    return 0;
  }

  console.log(
    `\n${stale.length} of ${rows.length} maps cannot be trusted: ${stale.map((row) => row.folder).join(' ')}`,
  );
  console.log(
    'For each: regenerate it (changes -> fixers -> update), or ignore the map and read the code.',
  );
  return 1;
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { include: [], exclude: [], exception: [] };

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const value = rest[i + 1];

    if (!arg?.startsWith('--')) continue;
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`);
    }

    const key = arg.slice(2);
    if (key === 'include' || key === 'exclude' || key === 'exception') {
      options[key].push(value);
    } else if (key === 'root') {
      options.root = value;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }

    i++;
  }

  return { command, options };
}

export function main(argv = process.argv.slice(2)) {
  try {
    const { command, options } = parseArgs(argv);

    if (!command || !options.root) {
      console.error(
        'Usage: codemap.mjs <init|changes|files|stale|update> --root /path [--include glob] [--exclude glob] [--exception path]',
      );
      return 1;
    }

    if (command === 'init') return cmdInit(options);
    if (command === 'changes') return cmdChanges(options);
    if (command === 'files') return cmdFiles(options);
    if (command === 'stale') return cmdStale(options);
    if (command === 'update') return cmdUpdate(options);

    console.error(`Unknown command: ${command}`);
    return 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

// Both sides are resolved through the filesystem before they are compared.
// Node hands `import.meta.url` back with symlinks already resolved, while
// `process.argv[1]` is whatever the caller typed — so invoking this through a
// link (a symlinked ${CLAUDE_PLUGIN_ROOT}, an npx or bin shim) made the two
// disagree, `main` never ran, and the process exited 0 having done nothing.
// Silent success from the component that rewrites the user's repository.
//
// realpath can fail — a deleted or unreadable entry — and the lexical path is
// the fallback there, which is exactly the comparison this used to make.
function resolvedPath(candidate) {
  const absolute = path.resolve(candidate);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

if (
  process.argv[1] &&
  resolvedPath(process.argv[1]) === resolvedPath(fileURLToPath(import.meta.url))
) {
  process.exit(main());
}
