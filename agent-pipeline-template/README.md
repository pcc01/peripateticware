# Agent Pipeline Template

A portable multi-agent development pipeline: plan → build → test → triage, plus product, review, release, and docs agents. Works with any orchestrating Claude session (Cowork, Claude Code, etc.).

## Adopting in a new project

1. Copy this folder into your repo as `agents/`.
2. Create `agents/output/` (add it to `.gitignore` if you don't want run artifacts committed).
3. Fill in `PROJECT_PROFILE.md` — paths, stack, runtime facts, and crucially the ALLOWED/RESTRICTED command lists. This is the only file that changes per project.
4. Delete this README's adoption section if you like, and start: tell Claude **"Run the planning agent."**

## Design notes

- **All project specifics live in `PROJECT_PROFILE.md`.** Agent files are generic; never edit them with project facts.
- **Status headers** on every output let the orchestrator route on one line instead of re-reading documents.
- **Delta re-testing** and a **3-round fix-cycle cap** keep loops cheap and bounded.
- **Developer self-checks** (syntax/type checks before handoff) prevent trivial errors from costing a full test cycle.
- Core loop = agents 01–04. Agents 05–08 are on-demand.

## Files

| File | Purpose |
|------|---------|
| `PROJECT_PROFILE.md` | Per-project config (the only file you edit) |
| `PIPELINE.md` | Orchestration rules + shared conventions |
| `01_planning_agent.md` | State assessment → work plan |
| `02_developer_agent.md` | Work plan → code changes |
| `03_test_agent.md` | Changes → test report |
| `04_devops_agent.md` | Failures → triage brief |
| `05_review_agent.md` | Quality/security review (on demand) |
| `06_product_agent.md` | Idea/PRD → user stories (on demand) |
| `07_release_agent.md` | Go/no-go readiness (on demand) |
| `08_docs_agent.md` | Tracking-doc sync after clean runs |
