// Guards the AGENTS.md/CLAUDE.md split and the .agent-workflows/ shared-workflow pattern
// against drift (memory/agents-md-codex-parity.md). The rule this enforces: every canonical
// file has exactly ONE place its real content lives, and every tool-specific wrapper is thin
// - a pointer, not a copy. If a wrapper grows real content again, or stops pointing at its
// canonical file, or a Codex mirror goes missing, this fails loudly instead of the two tools
// silently drifting apart.
//
// Checked:
//   1. Every AGENTS.md (root + any nested src/*/AGENTS.md) has a sibling CLAUDE.md that
//      imports it (`@AGENTS.md`) and stays under the thin-wrapper line budget.
//   2. Every .agent-workflows/<name>.md has:
//        - at least one Claude-side wrapper (.claude/commands/<name>.md or
//          .claude/skills/<name>/SKILL.md) that references it and stays thin;
//        - a .codex/skills/<name>/SKILL.md that references it and stays thin (this is the
//          actual Codex-parity guarantee - without it, Codex silently has no skill at all).
//   3. No orphan .codex/skills/<name>/SKILL.md without a matching .agent-workflows/<name>.md
//      - a Codex skill with nothing canonical behind it is exactly the kind of file this
//        pattern exists to prevent.
//
// Run directly: node scripts/check-shared-instructions.mjs
// Wired into `npm run build` as the first (fast) step.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_WRAPPER_LINES = 25;
const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'worktrees', // sibling git worktrees live under .claude/worktrees/ - never scan into another one
  'coverage',
  'playwright-report',
  'test-results',
  '.vercel',
  'video-bench-out',
  '.next',
  'build',
]);

const failures = [];

function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, '/');
}

function lineCount(file) {
  return readFileSync(file, 'utf8').split('\n').length;
}

/** Fail unless `file` exists, contains `mustContain`, and is within the thin-wrapper budget. */
function checkThinWrapper(file, mustContain, label) {
  if (!existsSync(file)) {
    failures.push(`${label}: missing ${rel(file)}`);
    return;
  }
  const text = readFileSync(file, 'utf8');
  if (!text.includes(mustContain)) {
    failures.push(
      `${label}: ${rel(file)} no longer contains "${mustContain}" - has it been rewritten ` +
        'with its own content instead of pointing at the canonical file?',
    );
  }
  const lines = lineCount(file);
  if (lines > MAX_WRAPPER_LINES) {
    failures.push(
      `${label}: ${rel(file)} is ${lines} lines (over the ${MAX_WRAPPER_LINES}-line thin-` +
        'wrapper budget) - looks like real content leaked back in instead of living in the ' +
        'canonical file.',
    );
  }
}

/** Recursively find every file named `filename`, skipping SKIP_DIR_NAMES at any depth. */
function findFilesNamed(dir, filename, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name) || entry.name.startsWith('.claude')) continue;
      findFilesNamed(path.join(dir, entry.name), filename, found);
    } else if (entry.name === filename) {
      found.push(path.join(dir, entry.name));
    }
  }
  return found;
}

// 1. AGENTS.md <-> CLAUDE.md pairs.
// .claude itself is skipped by findFilesNamed (it has its own commands/skills, not AGENTS.md
// pairs), and the root AGENTS.md needs a manual check since findFilesNamed only walks src/.
const agentsFiles = [
  path.join(ROOT, 'AGENTS.md'),
  ...findFilesNamed(path.join(ROOT, 'src'), 'AGENTS.md'),
].filter((f) => existsSync(f));

for (const agentsFile of agentsFiles) {
  const claudeFile = path.join(path.dirname(agentsFile), 'CLAUDE.md');
  checkThinWrapper(claudeFile, '@AGENTS.md', 'AGENTS.md/CLAUDE.md pair');
}

// 2. .agent-workflows/<name>.md <-> Claude command/skill <-> Codex skill.
const workflowsDir = path.join(ROOT, '.agent-workflows');
const names = existsSync(workflowsDir)
  ? readdirSync(workflowsDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -3))
  : [];

for (const name of names) {
  const canonical = `.agent-workflows/${name}.md`;
  const claudeCommand = path.join(ROOT, '.claude', 'commands', `${name}.md`);
  const claudeSkill = path.join(ROOT, '.claude', 'skills', name, 'SKILL.md');
  const codexSkill = path.join(ROOT, '.codex', 'skills', name, 'SKILL.md');

  const hasClaudeCommand = existsSync(claudeCommand);
  const hasClaudeSkill = existsSync(claudeSkill);
  if (!hasClaudeCommand && !hasClaudeSkill) {
    failures.push(
      `${canonical}: no Claude-side wrapper found (expected .claude/commands/${name}.md or ` +
        `.claude/skills/${name}/SKILL.md)`,
    );
  }
  if (hasClaudeCommand) checkThinWrapper(claudeCommand, canonical, 'Claude command wrapper');
  if (hasClaudeSkill) checkThinWrapper(claudeSkill, canonical, 'Claude skill wrapper');

  checkThinWrapper(codexSkill, canonical, 'Codex skill wrapper');
}

// 3. No orphan Codex skills without canonical backing.
const codexSkillsDir = path.join(ROOT, '.codex', 'skills');
if (existsSync(codexSkillsDir)) {
  for (const entry of readdirSync(codexSkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!names.includes(entry.name)) {
      failures.push(
        `.codex/skills/${entry.name}/SKILL.md has no matching .agent-workflows/${entry.name}.md - ` +
          'either add the canonical file or remove this orphan skill.',
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`\nShared-instructions check failed (${failures.length}):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    '\nSee AGENTS.md "Architecture map" and memory/agents-md-codex-parity.md for the pattern: ' +
      'real content lives in AGENTS.md / .agent-workflows/<name>.md; every other file just points at it.\n',
  );
  process.exit(1);
}

console.log(
  `Shared instructions OK: ${agentsFiles.length} AGENTS.md/CLAUDE.md pair(s), ${names.length} shared workflow(s) mirrored into Claude + Codex.`,
);
