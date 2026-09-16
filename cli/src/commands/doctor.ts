// `noacg doctor` - what this tool will use: the browser, the deployment, its bridge version.
//
// It also answers a question nothing else on the machine answers: is what you are running CURRENT?
// Two halves, both silent when there is nothing to say - the `noacg-graphic` skill an installed
// plugin carries (src/skillVersion.ts), and this CLI against npm's `latest` (src/npmLatest.mjs,
// the same check the MCP plugin's launcher has made since 2026-09-16). Neither can fail the
// command: a version check is a report, and the exit code stays what the browser and the bridge
// say, so a script that gates on `doctor` does not start failing the day a release lands.

import { browserLabel, launchBrowser } from '../browser.js';
import { BridgeClient } from '../bridgeClient.js';
import { cliVersion, configDir, noacgUrl } from '../config.js';
import { displayPrefix, resolveKey } from '../auth.js';
import { fetchLatestVersion, isBehind } from '../npmLatest.mjs';
import { installedSkills, type InstalledSkill } from '../skillVersion.js';
import { EXIT_OK, EXIT_USAGE, refuseStrayArgs, type Out, type ParsedArgs } from '../output.js';

/** The two lines one installed skill copy earns when it disagrees with the CLI running here. */
function staleSkillLines(skill: InstalledSkill, cli: string): string[] | null {
  if (skill.version === cli) return null;
  if (isBehind(skill.version, cli)) {
    return [
      `skill        ${skill.version} in ${skill.harness}, but this CLI ships ${cli} - an installed plugin never updates itself`,
      `             run: ${skill.update}`,
    ];
  }
  if (isBehind(cli, skill.version)) {
    // The other way round: the plugin is current and the CLI executing this is the old copy.
    return [
      `skill        ${skill.version} in ${skill.harness}, NEWER than this CLI (${cli})`,
      '             run: npm i -g @noacg/cli@latest',
    ];
  }
  return null; // a version neither side can order (a prerelease) is not a claim worth making
}

export async function runDoctor(args: ParsedArgs, out: Out): Promise<number> {
  refuseStrayArgs(args, 0);
  const cli = cliVersion();
  // Ask npm first and read the answer last: the browser launch below is seconds and this is a
  // cached read with a 1.5 s cap, so the check costs no wall clock at all. It never rejects.
  const latest = fetchLatestVersion();
  const report: Record<string, unknown> = { cli, url: noacgUrl(), configDir: configDir() };
  // Whether a key is HELD here, not whether it is still honoured - `noacg whoami` asks the
  // deployment; doctor stays a local report that works with no network at all.
  const held = await resolveKey(noacgUrl());
  report.login = held
    ? `${held.stored?.prefix ?? displayPrefix(held.key)}${held.source === 'env' ? ' (NOACG_AGENT_KEY)' : ''} - run \`noacg whoami\` to check it`
    : 'not logged in - run `noacg login` to save into your library';
  const skills = installedSkills();
  report.skills = skills;
  try {
    await launchBrowser();
    report.browser = browserLabel();
  } catch (e) {
    report.browser = null;
    report.browserError = e instanceof Error ? e.message : String(e);
  }
  if (report.browser) {
    try {
      const bridge = await BridgeClient.connect();
      report.bridge = bridge.hello;
      await bridge.close();
    } catch (e) {
      report.bridge = null;
      report.bridgeError = e instanceof Error ? e.message : String(e);
    }
  }
  report.latest = await latest;
  out.result(report);
  out.say(`noacg ${report.cli}`);
  out.say(`deployment   ${report.url}`);
  out.say(`browser      ${report.browser ?? `NONE - ${report.browserError}`}`);
  if (report.bridge) {
    const h = report.bridge as { v: number; app: { commit: string; ref: string } | null };
    out.say(`bridge       v${h.v}${h.app ? ` (${h.app.ref}@${h.app.commit.slice(0, 10)})` : ' (dev server, no version marker)'}`);
  } else if (report.browser) {
    out.say(`bridge       NONE - ${report.bridgeError}`);
  }
  out.say(`config dir   ${report.configDir}`);
  out.say(`login        ${report.login}`);
  // Silent when they match. Every installed copy that differs gets its own two lines, because the
  // command that fixes one harness does nothing for the other.
  for (const skill of skills) for (const line of staleSkillLines(skill, cli) ?? []) out.say(line);
  // And this CLI against npm. `isBehind`, not `!==`, so a checkout built ahead of the published
  // version - every developer of this repo between a bump and its release - is told nothing.
  if (isBehind(cli, report.latest as string | null)) {
    out.say(`update       npm's latest @noacg/cli is ${report.latest} - run: npm i -g @noacg/cli@latest`);
  }
  return report.browser && report.bridge ? EXIT_OK : EXIT_USAGE;
}
