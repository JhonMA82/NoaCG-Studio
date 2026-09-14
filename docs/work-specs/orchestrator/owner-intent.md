We want to evolve the **NoaCG Orchestrator and development workflow** using the strongest ideas from **OpenAI Symphony, OpenAI harness engineering, GitHub Spec Kit, and Anthropic's work on context engineering and long-running agents**.

Do not assume we should install or reproduce any of these systems. Study them, inspect our existing Orchestrator, and determine what should be adopted, adapted, rejected, or left alone.

## Goal

Move substantial NoaCG work toward:

**owner intent / North Star → spec → plan → bounded tasks → autonomous execution → verification → convergence → landing**

while preserving the autonomy, throughput and hard-won reliability of our existing Orchestrator.

The same NoaCG orchestration model must work with **both Codex and Claude Code**, while allowing each runtime to use its native strengths.

## Why

Our current system already has significant work invested in parallel workers, worktrees, queues, recovery, handoffs, validation, day/night waves and serialized landing.

Do not replace working mechanisms simply because another architecture looks cleaner. First determine **why each important mechanism exists, which failure it prevents, and which invariant it protects**.

The new architecture should solve several recurring problems:

* **context rot:** large accumulated contexts reduce agent focus and reliability;
* **context anxiety:** agents facing oversized work rush toward completion or declare incomplete work finished;
* large features are unrealistically treated as one-shot tasks;
* subagent details can overwhelm the master Orchestrator;
* product intent can drift through plans, handoffs and agent assumptions;
* “done” can mean “the agent stopped” rather than “the requested behaviour actually exists.”

## Context must be treated as a scarce resource

Design explicitly for context efficiency.

Investigate a model based on:

* small, high-signal always-loaded instructions;
* just-in-time retrieval and progressive disclosure;
* fresh agent contexts where useful rather than indefinitely growing sessions;
* durable external state instead of conversation history as project memory.

Subagents should **not send all of their investigation, tool output and history back through the master Orchestrator**.

Prefer durable artifacts: code, tests, task state, findings, logs, structured handoffs or other repository/external records. Workers should normally return only the concise information and references the Orchestrator needs to coordinate the next action.

Determine the simplest architecture that achieves this with the systems NoaCG already has.

## Prevent oversized one-shot work

A large product goal can remain large, but an individual agent assignment must be tractable.

Explicitly detect work that is too large for a reliable bounded agent session.

When necessary, decompose:

**epic / parent intent → smaller specs or milestones → independently verifiable tasks**

Study Spec Kit's current complex-feature / “spec of specs” approach, but adapt it rather than copying it mechanically.

A feature such as a major editor should never be marked complete merely because an agent made substantial progress before exhausting its context.

Preserve the parent intent across every smaller spec so decomposition does not cause product drift.

## Product authority

Establish a lightweight authority hierarchy equivalent to:

**OWNER INTENT
→ NORTH STAR / GOALS / PRODUCT PRINCIPLES
→ ACTIVE SPEC
→ PLAN
→ TASKS
→ IMPLEMENTATION
→ VERIFICATION**

Do not duplicate authoritative product principles unnecessarily. Investigate whether NoaCG's existing North Star/goals can serve the role that Spec Kit calls a constitution.

Handoffs and discoveries are operational evidence, not independent sources of product truth.

Distinguish clearly between:

* owner-stated requirement/intent;
* agent-derived design decision or assumption;
* rationale/evidence.

Agents may challenge my proposed solution if they find a better way to achieve the goal, but they must not silently change the goal.

## Specs and owner involvement

I am happy to participate in the **specification stage**, especially for substantial or direction-changing work.

For major work, make the spec the natural place where I can review the desired outcome, say yes/no, or steer it before expensive implementation begins.

Once the agreed intent/spec is clear, implementation should become highly autonomous.

Do not impose this ceremony on small fixes or routine maintenance.

A useful spec should remain compact and describe primarily:

* problem and why;
* desired outcome/behaviour;
* alignment with relevant NoaCG goals;
* important existing behaviour that must remain true;
* non-goals/boundaries;
* observable acceptance criteria.

Technical implementation belongs downstream in the plan.

## Completion means convergence, not agent confidence

This is important.

“No more work performed” or “agent says done” must not equal completion.

Investigate a convergence mechanism similar in intent to Spec Kit's current approach:

**spec + acceptance criteria ↔ actual implementation + verification evidence**

If meaningful gaps remain, create/continue work rather than declaring completion.

A large feature can therefore span many contexts, workers and sessions while maintaining one durable definition of what complete actually means.

Verification should measure real behaviour where possible, not merely the presence of text, markers or regex matches.

## Symphony

Study OpenAI Symphony carefully.

Determine separately:

1. Which Symphony concepts our existing Orchestrator already implements.
2. Which concepts would genuinely improve it.
3. Whether any actual Symphony implementation/components can sensibly be reused.
4. Which parts are inherently Codex/App-Server-specific.
5. Which should instead inspire a provider-neutral NoaCG equivalent.

Do **not** automatically replace our Orchestrator with Symphony.

Remember that NoaCG must support both **Codex and Claude Code as orchestration runtimes**.

Shared concepts such as specs, tasks, durable state, dependencies, completion and landing should remain provider-neutral.

Provider adapters may exploit native capabilities such as Codex App Server/subagents/worktrees or Claude Code subagents/hooks/teams/worktrees without forcing both runtimes into the lowest common denominator.

## Preserve what already works

Before significant changes, map the current Orchestrator's important behaviours to the invariants they protect.

Pay particular attention to our existing work around:

* continuous autonomous waves;
* dependency-aware parallel work;
* stalled/dead-worker recovery;
* starvation prevention;
* durable handoffs;
* landing visibility and failure recovery;
* serialized landing;
* owner authority boundaries.

Prefer simplification when newer native capabilities make custom machinery unnecessary, but only after demonstrating that the relevant invariant survives.

## Deliverable

Treat this as an architecture review **and, where justified, implementation work**.

Inspect the repository and current authoritative documentation first.

Then:

1. map our current system against Symphony, Spec Kit and the relevant context/harness patterns;
2. identify the smallest set of changes that materially improve NoaCG;
3. design how specs, context, durable worker artifacts, decomposition and convergence fit the existing Orchestrator;
4. identify anything we should remove or simplify rather than adding more machinery;
5. implement safe improvements incrementally with verification;
6. avoid a giant migration or retroactive specification project.

## Done when

The resulting workflow should demonstrably make it harder for:

* context growth to degrade decision quality;
* oversized tasks to be rushed or prematurely declared complete;
* worker details to flood the master context;
* product intent to drift;
* requirements to disappear during decomposition;
* incomplete features to be marked done;
* Codex-specific architecture to lock Claude Code out, or vice versa.

And it should make it easier for:

* me to steer product intent through specs;
* agents to retrieve only the context they need;
* large goals to progress through many reliable smaller steps;
* workers to operate independently with concise coordination;
* the Orchestrator to run autonomously for long periods;
* actual verification evidence to determine when work has converged.

Above all, **make the existing NoaCG system genuinely better and simpler, not merely more sophisticated.**
