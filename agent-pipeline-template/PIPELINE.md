# Multi-Agent Development Pipeline

Portable agent definitions for a plan → build → test → triage loop, plus supporting agents for product, review, release, and docs work. All project specifics live in `PROJECT_PROFILE.md` — agent files never hardcode paths, commands, or runtime facts.

## Core loop

```
┌──────────────────┐
│ 06 Product Agent │  (optional) idea/PRD → user stories → planning input
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 01 Planning      │  tracking docs → WORK_PLAN
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 02 Developer     │  WORK_PLAN → code changes → CHANGE_SUMMARY
└────────┬─────────┘
         ▼
┌──────────────────┐
│ 03 Test          │  CHANGE_SUMMARY → TEST_REPORT
└────────┬─────────┘
         │ any FAILs?
         ▼
┌──────────────────┐
│ 04 DevOps        │  TEST_REPORT → BUG_TRIAGE → back to Developer
└──────────────────┘
   (fix cycle: max 3 rounds, then escalate to user)
```

Supporting agents (invoked on demand, not part of every run):
05 Review (pre-merge quality/security pass) · 07 Release (go/no-go readiness) · 08 Docs (tracking-doc sync after a clean run).

## Agent index

| # | Agent | Input | Output |
|---|-------|-------|--------|
| 01 | Planning | tracking docs, triage briefs | `WORK_PLAN_*` |
| 02 | Developer | `WORK_PLAN_*` or `BUG_TRIAGE_*` | `CHANGE_SUMMARY_*` |
| 03 | Test | `CHANGE_SUMMARY_*` | `TEST_REPORT_*` |
| 04 | DevOps | `TEST_REPORT_*` with FAILs | `BUG_TRIAGE_*` |
| 05 | Review | a diff, branch, or CHANGE_SUMMARY | `REVIEW_*` |
| 06 | Product | idea, notes, or PRD | `STORIES_*` |
| 07 | Release | current repo state | `RELEASE_READINESS_*` |
| 08 | Docs | completed pipeline run | updated tracking docs + `DOCS_SYNC_*` |

## Shared conventions (all agents)

1. **Profile first.** Read `PROJECT_PROFILE.md` before anything else. If it's missing, stop and ask the user to create one from the template.
2. **Output location & naming.** All outputs go to `AGENT_OUTPUT` (from profile), named `<TYPE>_<YYYYMMDD>[_<SLUG>][_R<n>].md`. `SLUG` is a short task name (e.g. `PRIVACY_CATALOG`); `R<n>` marks fix-cycle revisions.
3. **Status header.** Every output starts with a machine-readable block so the orchestrator can route without reading the whole document:
   ```
   ---
   agent: planning | developer | test | devops | review | product | release | docs
   status: READY | CLEAN | FAILS | BLOCKED | GO | NO-GO
   next: developer | test | devops | user | done
   counts: <e.g. items=8, or pass=12 fail=2 warn=1>
   input: <filename this run consumed>
   cycle: <fix-cycle round, if applicable>
   ---
   ```
4. **Scoped reading.** Read only your direct input handoff doc plus the profile. Do not scan the whole output folder or re-read tracking docs unless your process says to.
5. **Command policy.** Only run commands in the profile's ALLOWED list. Anything RESTRICTED goes in a "Manual Steps Required" section for the user — never run it.
6. **Stay in lane.** Each agent does only its role. Planning doesn't code; Developer doesn't triage; Test doesn't fix.
7. **Escalate, don't spin.** If blocked (missing input, contradiction in the plan, profile gap), emit `status: BLOCKED`, `next: user`, and state exactly what you need.

## Fix cycle rules

- After a `TEST_REPORT` with FAILs: DevOps triages → Developer fixes → Test **re-tests only the failed items plus a regression spot-check of files touched by the fixes** (delta re-test — do not re-run the full suite of static checks on unchanged items).
- **Cap: 3 fix cycles.** If FAILs remain after round 3, emit `status: BLOCKED`, `next: user`, with a summary of what's still failing and why.
- Pipeline is complete when a `TEST_REPORT` shows `status: CLEAN`.

## Starting the pipeline

Tell the orchestrator: **"Run the planning agent"** (or name any agent directly, e.g. "run the release agent"). The orchestrator invokes each agent in sequence, routing on the `next:` field of each status header, and summarises the outcome when done.
