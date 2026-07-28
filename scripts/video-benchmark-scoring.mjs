/**
 * Score deterministic benchmark evidence only. A rejected generation may leave the
 * starter composition mounted in the app, so stale gate, screenshot, or render data must
 * never give that model credit.
 */
export function machineScore(item) {
  if (!item.ok || item.automatedChecks?.generationSuccess === false) return 0;

  const checks = item.automatedChecks;
  let score = 20;
  if (checks ? checks.typeScriptBuildSuccess : item.gate?.ok) score += 20;
  if (checks ? checks.engineCompatibility : item.gate?.probed) score += 10;
  if (checks ? checks.visualCompleteness : !(item.issues ?? []).length) score += 15;
  if (checks ? checks.dataFieldCorrectness : !(item.deadVars ?? []).length) score += 10;
  if (item.render?.attempted && item.render.ok) score += 10;
  score += Math.max(0, 15 - (item.repairRounds ?? 0) * 7.5);
  return score;
}
