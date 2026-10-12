# Standards-mapping eval harness

Measures retrieval, state-PDF-import coverage (vs. CASE as the answer key), and end-to-end
alignment for the standards-mapping feature (`StandardsMappingAgent` and friends), against
real data on a running server.

Start with [`RUNBOOK.md`](./RUNBOOK.md) for setup and commands. Generator and judge calls
default to Ollama (no human in the loop for either role); the model under test keeps
whatever provider it's actually configured with.

For a free, DB-free sanity check that the pipeline runs end to end (meaningless numbers, by
design): `python -m eval.standards_eval.run selftest --run-dir /tmp/selftest`.
