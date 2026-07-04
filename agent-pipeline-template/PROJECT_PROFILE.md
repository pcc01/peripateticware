# Project Profile — <PROJECT NAME>

> Fill this in once per project. Agents read this file first and take all paths, commands, and runtime facts from here. Keep it under ~100 lines — this is loaded by every agent on every run.

## Identity
- **Project:** <name>
- **One-line description:** <what it is>
- **Repo root:** <the workspace folder connected to the session>

## Paths
- **AGENT_OUTPUT:** `<repo root>/agents/output/`
- **REGRESSION_LOG:** `<repo root>/REGRESSION_LOG.md`
- **TRACKING_DOCS** (read by Planning Agent, in priority order):
  - `<STATUS doc — current sprint/state>`
  - `<HANDOFF doc — last session notes>`
  - `<BACKLOG/checklist docs>`

## Stack
- **Backend:** <language, framework, ORM, DB>
- **Frontend:** <framework, build tool>
- **Other:** <mobile, workers, etc.>

## Runtime facts
- **Services:** <name → URL/port, container name if Docker>
- **Health check:** `<command, e.g. curl http://localhost:8000/health → {"status":"ok"}>`
- **Auth:** <token type, storage key, header format>
- **Routing quirks:** <proxy rewrites, path prefixes>
- **DB connection:** <connection string or how to find it>

## Command policy
- **ALLOWED** (agents may run without asking):
  - Read-only shell: `ls`, `grep`, `find`, `git diff/log/status`
  - Syntax checks: `<e.g. python -m py_compile, npx tsc --noEmit>`
  - Local HTTP reads: `curl` against localhost health/GET endpoints
- **RESTRICTED** (never run — flag in "Manual Steps Required" for the user):
  - `<e.g. docker *, npm install, pip install, migrations, deploys>`

## Test policy
- **Automated tests agents may run:** `<command, or "none — static verification only">`
- **Runtime verification:** <what's reachable from the sandbox, if anything>

## Conventions & quirks
- <e.g. file-write workarounds, naming conventions, permanent do-not-touch files>

## Escalation contacts
- **User:** <name> — owns all RESTRICTED commands and final sign-off
