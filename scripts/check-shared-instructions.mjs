// Guard the shared Claude Code / Codex instruction architecture against drift.
//
// Canonical content:
//   - project rules: AGENTS.md
//   - reusable procedures: .agent-workflows/<name>.md
//
// Tool adapters:
//   - Claude Code: .claude/commands/<name>.md or .claude/skills/<name>/SKILL.md
//   - Codex: .agents/skills/<name>/SKILL.md
//
// See docs/AGENT_WORKFLOWS.md. This runs first in `npm run build`.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_WRAPPER_LINES = 25;
const DEFAULT_PROJECT_DOC_MAX_BYTES = 32 * 1024;
const EXPLICIT_ONLY_WORKFLOWS = new Set(['safe-merge', 'cleanup-worktrees']);
const CLAUDE_ONLY_EXCEPTIONS = new Map([
  [
    'rescue',
    'Claude-specific adapter that delegates a long-running task from Claude Code to Codex.',
  ],
]);
const CRITICAL_WORKFLOW_MARKERS = new Map([
  [
    'next',
    [
      'Never invent work to have something to offer.',
      'git status --porcelain=v1 --branch',
      'Verify before you list.',
      "Read, don't write.",
    ],
  ],
  [
    'handoff',
    [
      'git rev-parse --short HEAD',
      'whether the working tree is clean',
      'last known verification command/result tied to that commit',
      'Do not run verification during handoff.',
      'Create or update no files',
    ],
  ],
  [
    'safe-merge',
    [
      'git pull --ff-only origin main',
      'git merge --ff-only <branch>',
      'git push origin main',
      'Never remove a worktree or delete a branch.',
      'Never use\n   `git merge --no-commit` as a preview',
    ],
  ],
  [
    'cleanup-worktrees',
    [
      'contained in both local `main` and `origin/main`',
      '`git branch -d`, never `-D`',
      'never `git worktree remove --force`',
      '--apply --acknowledge-risks',
      'non-empty unregistered folders are reported',
    ],
  ],
]);
const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.claude',
  '.agents',
  '.codex',
  'dist',
  'worktrees',
  'coverage',
  'playwright-report',
  'test-results',
  '.vercel',
  'video-bench-out',
  '.next',
  'build',
]);

const failures = [];

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function absolute(relative) {
  return path.join(ROOT, ...relative.split('/'));
}

function text(file) {
  return readFileSync(file, 'utf8');
}

function lineCount(file) {
  return text(file).split('\n').length;
}

function checkThinWrapper(file, mustContain, label) {
  if (!existsSync(file)) {
    failures.push(`${label}: missing ${rel(file)}`);
    return;
  }
  const content = text(file);
  if (!content.includes(mustContain)) {
    failures.push(`${label}: ${rel(file)} must reference "${mustContain}"`);
  }
  const lines = lineCount(file);
  if (lines > MAX_WRAPPER_LINES) {
    failures.push(
      `${label}: ${rel(file)} is ${lines} lines; canonical instructions belong in ${mustContain}`,
    );
  }
}

function findFilesNamed(dir, filename, found = []) {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      findFilesNamed(path.join(dir, entry.name), filename, found);
    } else if (entry.name === filename) {
      found.push(path.join(dir, entry.name));
    }
  }
  return found;
}

function parseFrontmatter(file) {
  const lines = text(file).replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end < 0) return null;

  const metadata = {};
  for (let index = 1; index < end; index += 1) {
    const match = lines[index].match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) continue;
    const [, key, rawValue = ''] = match;
    if (rawValue === '>-' || rawValue === '>' || rawValue === '|' || rawValue === '|-') {
      const folded = [];
      while (index + 1 < end && /^\s+/.test(lines[index + 1])) {
        index += 1;
        folded.push(lines[index].trim());
      }
      metadata[key] = folded.join(rawValue.startsWith('>') ? ' ' : '\n').trim();
    } else {
      metadata[key] = rawValue.replace(/^(['"])(.*)\1$/, '$2').trim();
    }
  }
  return metadata;
}

function checkSkillMetadata(file, expectedName, label) {
  const metadata = parseFrontmatter(file);
  if (!metadata) {
    failures.push(`${label}: ${rel(file)} has invalid or missing YAML frontmatter`);
    return;
  }
  if (metadata.name !== expectedName) {
    failures.push(
      `${label}: ${rel(file)} name must be "${expectedName}", found "${metadata.name ?? ''}"`,
    );
  }
  if (!metadata.description) {
    failures.push(`${label}: ${rel(file)} needs a non-empty description`);
  }
}

function repoFiles() {
  const result = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    failures.push(`could not enumerate repository files: ${result.stderr.trim()}`);
    return [];
  }
  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => file.replace(/\\/g, '/'))
    .filter((file) => existsSync(absolute(file)));
}

function directChildrenWithFile(dir, filename) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(dir, entry.name, filename)))
    .map((entry) => entry.name);
}

function configuredInstructionLimit() {
  const config = path.join(ROOT, '.codex', 'config.toml');
  if (!existsSync(config)) return DEFAULT_PROJECT_DOC_MAX_BYTES;
  const match = text(config).match(/^\s*project_doc_max_bytes\s*=\s*(\d+)\s*$/m);
  if (!match) {
    failures.push(
      '.codex/config.toml must declare numeric project_doc_max_bytes for the checked instruction budget',
    );
    return DEFAULT_PROJECT_DOC_MAX_BYTES;
  }
  return Number(match[1]);
}

function isDirectoryAncestor(ancestor, candidate) {
  const relative = path.relative(ancestor, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function checkInstructionChains(agentsFiles) {
  const limit = configuredInstructionLimit();
  for (const leaf of agentsFiles) {
    const leafDir = path.dirname(leaf);
    const chain = agentsFiles.filter((candidate) =>
      isDirectoryAncestor(path.dirname(candidate), leafDir),
    );
    const bytes =
      chain.reduce((sum, file) => sum + Buffer.byteLength(text(file), 'utf8'), 0) +
      Math.max(0, chain.length - 1) * 2;
    if (bytes > limit) {
      failures.push(
        `Codex instruction chain ending at ${rel(leaf)} is ${bytes} bytes, over ` +
          `project_doc_max_bytes=${limit}`,
      );
    }
  }
}

function checkWorkflowScriptReferences(workflowFile) {
  const references = [...text(workflowFile).matchAll(/`(scripts\/[A-Za-z0-9._/-]+)/g)].map(
    (match) => match[1],
  );
  for (const reference of new Set(references)) {
    if (!existsSync(absolute(reference))) {
      failures.push(`${rel(workflowFile)} references missing ${reference}`);
    }
  }
}

function checkCriticalWorkflowContract(name, workflowFile) {
  const content = text(workflowFile);
  const normalizedContent = content.replace(/\s+/g, ' ');
  for (const marker of CRITICAL_WORKFLOW_MARKERS.get(name) ?? []) {
    const normalizedMarker = marker.replace(/\s+/g, ' ');
    if (!normalizedContent.includes(normalizedMarker)) {
      failures.push(
        `${rel(workflowFile)} is missing critical contract marker "${normalizedMarker}"`,
      );
    }
  }
  if (/C:\\Users\\[^\\]+\\\.claude\\/i.test(content)) {
    failures.push(
      `${rel(workflowFile)} references tool-private memory under a user-specific home directory`,
    );
  }
}

const files = repoFiles();
const fileSet = new Set(files);

function checkRepositoryFile(file, label) {
  const relative = rel(file);
  if (!fileSet.has(relative)) {
    failures.push(`${label}: ${relative} is ignored or absent from the repository file set`);
  }
}

// 1. Every repository AGENTS.md has a thin sibling CLAUDE.md importing it.
const agentsFiles = findFilesNamed(ROOT, 'AGENTS.md').filter(
  (file) => rel(file) === 'AGENTS.md' || !rel(file).startsWith('.'),
);
for (const agentsFile of agentsFiles) {
  const claudeFile = path.join(path.dirname(agentsFile), 'CLAUDE.md');
  checkRepositoryFile(agentsFile, 'authoritative project instructions');
  checkRepositoryFile(claudeFile, 'Claude import');
  checkThinWrapper(claudeFile, '@AGENTS.md', 'AGENTS.md/CLAUDE.md pair');
}
checkInstructionChains(agentsFiles);
checkRepositoryFile(absolute('.codex/config.toml'), 'Codex project configuration');

// 2. Every canonical workflow has one thin Claude adapter and one valid Codex skill.
const workflowsDir = path.join(ROOT, '.agent-workflows');
const workflowNames = existsSync(workflowsDir)
  ? readdirSync(workflowsDir)
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.slice(0, -3))
      .sort()
  : [];

for (const name of workflowNames) {
  const canonical = `.agent-workflows/${name}.md`;
  const canonicalFile = absolute(canonical);
  const claudeCommand = absolute(`.claude/commands/${name}.md`);
  const claudeSkill = absolute(`.claude/skills/${name}/SKILL.md`);
  const codexSkill = absolute(`.agents/skills/${name}/SKILL.md`);
  const hasClaudeCommand = existsSync(claudeCommand);
  const hasClaudeSkill = existsSync(claudeSkill);

  checkRepositoryFile(canonicalFile, 'canonical workflow');
  if (!hasClaudeCommand && !hasClaudeSkill) {
    failures.push(`${canonical}: missing Claude command or skill adapter`);
  }
  if (hasClaudeCommand) {
    checkRepositoryFile(claudeCommand, 'Claude command adapter');
    checkThinWrapper(claudeCommand, canonical, 'Claude command adapter');
    const metadata = parseFrontmatter(claudeCommand);
    if (!metadata?.description) {
      failures.push(`Claude command adapter: ${rel(claudeCommand)} needs a description`);
    }
  }
  if (hasClaudeSkill) {
    checkRepositoryFile(claudeSkill, 'Claude skill adapter');
    checkThinWrapper(claudeSkill, canonical, 'Claude skill adapter');
    checkSkillMetadata(claudeSkill, name, 'Claude skill adapter');
  }

  checkRepositoryFile(codexSkill, 'Codex skill adapter');
  checkThinWrapper(codexSkill, canonical, 'Codex skill adapter');
  if (existsSync(codexSkill)) checkSkillMetadata(codexSkill, name, 'Codex skill adapter');
  checkWorkflowScriptReferences(canonicalFile);
  checkCriticalWorkflowContract(name, canonicalFile);

  if (EXPLICIT_ONLY_WORKFLOWS.has(name)) {
    const claudeAdapter = hasClaudeCommand ? claudeCommand : claudeSkill;
    const claudeMetadata = parseFrontmatter(claudeAdapter);
    if (claudeMetadata?.['disable-model-invocation'] !== 'true') {
      failures.push(
        `${rel(claudeAdapter)} must set disable-model-invocation: true for destructive workflow ${name}`,
      );
    }
    const openAiMetadata = absolute(`.agents/skills/${name}/agents/openai.yaml`);
    checkRepositoryFile(openAiMetadata, 'Codex explicit-invocation metadata');
    if (
      !existsSync(openAiMetadata) ||
      !/^\s*allow_implicit_invocation:\s*false\s*$/m.test(text(openAiMetadata))
    ) {
      failures.push(
        `${rel(openAiMetadata)} must set policy.allow_implicit_invocation to false`,
      );
    }
  }
}

// 3. Reverse mapping: no repository-owned adapter silently escapes the canonical workflow.
const claudeCommands = files
  .filter((file) => /^\.claude\/commands\/[^/]+\.md$/.test(file))
  .map((file) => path.basename(file, '.md'));
const claudeSkills = files
  .filter((file) => /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(file))
  .map((file) => file.split('/')[2]);
const codexSkills = directChildrenWithFile(path.join(ROOT, '.agents', 'skills'), 'SKILL.md');

for (const name of new Set([...claudeCommands, ...claudeSkills])) {
  if (workflowNames.includes(name)) continue;
  if (CLAUDE_ONLY_EXCEPTIONS.has(name)) continue;
  failures.push(
    `Claude adapter ${name} has no .agent-workflows/${name}.md and is not an explicit exception`,
  );
}
for (const [name, reason] of CLAUDE_ONLY_EXCEPTIONS) {
  if (![...claudeCommands, ...claudeSkills].includes(name)) {
    failures.push(`documented Claude-only exception ${name} is missing (${reason})`);
  }
}
for (const name of codexSkills) {
  if (!workflowNames.includes(name)) {
    failures.push(
      `.agents/skills/${name}/SKILL.md has no matching .agent-workflows/${name}.md`,
    );
  }
}

// 4. Legacy repository Codex skills must not return and create duplicate registrations.
if (files.some((file) => file.startsWith('.codex/skills/'))) {
  failures.push('legacy .codex/skills files found; repository skills belong in .agents/skills');
}

// Ensure the architecture document itself remains committed/discoverable.
if (!fileSet.has('docs/AGENT_WORKFLOWS.md')) {
  failures.push('missing docs/AGENT_WORKFLOWS.md');
}

if (failures.length > 0) {
  console.error(`\nShared-instructions check failed (${failures.length}):\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('\nSee docs/AGENT_WORKFLOWS.md for the shared-instruction contract.\n');
  process.exit(1);
}

console.log(
  `Shared instructions OK: ${agentsFiles.length} AGENTS.md/CLAUDE.md pair(s), ` +
    `${workflowNames.length} Claude/Codex workflow pair(s), ${CLAUDE_ONLY_EXCEPTIONS.size} ` +
    'documented tool-specific exception(s).',
);
