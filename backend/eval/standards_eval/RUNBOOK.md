# Standards evaluation: runbook (prod server)

This measures, on your real data and models:

1. **Retrieval**: vector-only vs hybrid vs hybrid + graph expansion, with and without the
   state jurisdiction filter, plus exactly what `StandardsMappingAgent` retrieves today.
2. **State PDF import vs CASE**: how much of the official standards the PDF import captures
   (CASE is the answer key), for the current pipeline and a proposed fix.
3. **End-to-end alignment**: the real `StandardsMappingAgent` classifier fed candidates from
   each arm, including PDF-sourced vs CASE-sourced standards at the same scope.

States: Texas, Georgia, North Carolina. Subjects: math and science. Grades 6-8.

**Safety.** The harness only reads from the database. PDF extraction is a dry run (nothing is
written to `standards_sets`), and agent calls run with `db=None`, so no `agent_runs` rows are
written. It does spend API credits (see Cost).

All commands run on the server host, from the repo root. Results go to `./logs/standards_eval/`
on the host, because `/app/logs` is bind-mounted.

---

## 0. One-time setup (about 5 minutes)

```bash
# --- adjust these two lines ---
REPO=~/peripateticware                 # repo root on the server (where docker-compose.prod.yml is)
ZIP=~/standards_eval.zip               # the zip, copied here with scp
# ------------------------------
cd "$REPO"
unzip -o "$ZIP" -d backend/                     # creates backend/eval/standards_eval/
docker cp backend/eval/. peripateticware-backend:/app/eval/
mkdir -p logs/standards_eval/pdfs
cp backend/eval/standards_eval/manifest.json logs/standards_eval/manifest.json

# Settings check: expect claude / voyage / 512 on prod
docker exec -w /app peripateticware-backend python -c "from core.config import settings as s; print(s.LLM_PROVIDER, s.EMBEDDING_PROVIDER, s.VECTOR_DIMENSION)"
```

If you recreate the backend container (`up -d`), repeat the `docker cp` line. Results in
`logs/` are kept.

Define a shortcut for the rest of the session. The judge and generator default to Ollama
(no human in the loop for either role, so there's no reason to spend Anthropic credits here;
the model under test is unaffected by this setting):

```bash
EV="docker exec -w /app -e EVAL_JUDGE_PROVIDER=ollama -e EVAL_JUDGE_MODEL=qwen2.5:14b-instruct peripateticware-backend python -m eval.standards_eval.run --manifest /app/logs/standards_eval/manifest.json"
```

Pass `-e EVAL_JUDGE_PROVIDER=claude -e EVAL_JUDGE_MODEL=claude-sonnet-5` instead only when you
specifically want a stronger/independent judge than any local model can give you (e.g. to
calibrate spotcheck agreement before trusting Ollama's judgments) — that's an intentional
exception, not the default.

## 1. Download the state PDFs (host)

```bash
cd "$REPO/logs/standards_eval/pdfs"
curl -fL -o tx_math_ch111b.pdf    "https://tea.texas.gov/laws-and-rules/sboe-rules-tac/sboe-tac-currently-effect/ch111b.pdf"
curl -fL -o tx_science_ch112b.pdf "https://tea.texas.gov/laws-and-rules/sboe-rules-tac/sboe-tac-currently-effect/ch112b.pdf"
curl -fL -o ga_math_k8.pdf        "https://lor2.gadoe.org/gadoe/file/1d6838d1-8779-4109-9e54-e179997dc18f/1/Georgia-K-8-Mathematics-Standards.pdf"
curl -fL -o ga_science_6.pdf      "https://www.georgiastandards.org/Georgia-Standards/Documents/Science-Sixth-Grade-Georgia-Standards.pdf"
curl -fL -o ga_science_7.pdf      "https://www.georgiastandards.org/Georgia-Standards/Documents/Science-Seventh-Grade-Georgia-Standards.pdf"
curl -fL -o ga_science_8.pdf      "https://www.georgiastandards.org/Georgia-Standards/Documents/Science-Eighth-Grade-Georgia-Standards.pdf"
curl -fL -o nc_math_k8.pdf        "https://files.nc.gov/dpi/documents/curriculum/mathematics/scos/0617-adopted-k-8-standards.pdf"
# NC science (2023): no direct PDF link was found. Download it from the NC DPI science page
# and save it as nc_science_k12.pdf in this folder.
file *.pdf        # every line should say "PDF document"; an HTML error page means the link moved
cd "$REPO"
```

## 2. Pick the frameworks (read-only, seconds)

```bash
$EV frameworks
```

For each target this prints the matching CASE frameworks, how many items fall in grades 6-8,
and the association types each has. **Edit `logs/standards_eval/manifest.json`**: put the
right framework id(s) into each target's `"framework_ids"`. Pick the version that matches
the PDF, and one framework per subject unless the state splits a subject by grade. If
`framework_ids` is left empty, every framework with grade 6-8 items is used, which is wrong
when an old and a new version both exist.

Then freeze the corpus:

```bash
$EV corpus
```

It prints leaves, how many are embedded, and how many have `precedes` or cross-framework
edges. If it warns about unembedded leaves, run the backfill for that state first, e.g.
`docker exec -w /app peripateticware-backend python scripts/backfill_standards_embeddings.py --jurisdiction TX`.

## 3. Set PDF page ranges

K-8 documents (GA math, NC math) must be limited to the grade 6-8 pages, or grades K-5 will
count as noise:

```bash
$EV pdf-pages --only GA:math,NC:math,NC:science
```

Put the ranges in the manifest, e.g. `"pages": "41-78"`. Leave `null` for the TX
middle-school chapters and the GA science files, which are already grade-specific.

## 4. Smoke test (a few minutes, about $1)

Run every stage on 3 queries per target, plus one PDF, and read the result before spending
on the full run. The full run later resumes from here: the same first 3 queries are reused.

```bash
$EV testset --limit 3
$EV retrieval
$EV pdf-extract --only TX:math
$EV pdf-match   --only TX:math
$EV alignment
$EV report
less logs/standards_eval/run1/report.md
```

Check these:
- `logs/standards_eval/run1/testset.jsonl`: the activities should read like real teacher
  entries and should not quote the standard.
- The `Errors` columns should be 0.
- The TX:math PDF line should show a sensible number of criteria.

## 5. Full run (detached, roughly 45-90 minutes)

```bash
docker exec -d -w /app -e EVAL_JUDGE_PROVIDER=claude -e EVAL_JUDGE_MODEL=claude-sonnet-5 peripateticware-backend \
  sh -c "python -m eval.standards_eval.run all --manifest /app/logs/standards_eval/manifest.json > /app/logs/standards_eval/run1.log 2>&1"
tail -f logs/standards_eval/run1.log
```

Every stage resumes where it stopped: if the run dies, run the same command again. To re-run
a single stage, use `$EV <stage>`. To redo a PDF extraction, delete its
`logs/standards_eval/run1/pdf_<STATE>_<subject>_<variant>.json` first.

## 6. Results

- `logs/standards_eval/run1/report.md`: the comparison tables
- `logs/standards_eval/run1/metrics.json`: the same numbers, machine-readable
- `logs/standards_eval/run1/spotcheck.csv`: 50 judge decisions for a person to check. Fill
  the `human` column (`full`/`partial`/`none` for pdf_match rows, `applies`/`no` for
  alignment rows), then run `$EV report` again to get judge-human agreement.

Send back `report.md` and `metrics.json` and I'll interpret them.

## Optional: human-written queries

Generated activities are a proxy. For a stronger test, add 10-20 real activity descriptions
from you or the Farm, Forest, Sea teachers to the manifest, with the standards codes they
should map to. Then re-run `testset`, `retrieval`, `alignment` and `report`. Only the new
queries are processed.

```json
"human_queries": [
  {"state": "TX", "subject": "math", "grade": 7, "gold_codes": ["111.27.b.4.D"],
   "activity": "At the farmers market, students compare the price per pound of three kinds of berries..."}
]
```

Use the codes exactly as they appear in `corpus_*.json`.

## Cost and time (estimates)

About 240 generated queries (6 targets x 40). Roughly 700 calls to the judge model and about
1,500 calls to the model under test. With the Ollama default, the judge and generator calls
are free (local inference) — remaining cost is whatever the model under test and the
embedding provider charge, which depends on how `StandardsMappingAgent` and the corpus are
configured wherever you're running this (prod vs a local/scratch DB). If you opt into a
Claude judge (see above), expect it alone to add back **roughly $10-20** at current list
prices. Reduce `sample_per_target` in the manifest to spend less either way. Alignment runs
4 calls in parallel; change that with `--concurrency`.

## Self-test (dev machine only, never prod)

`python -m eval.standards_eval.run selftest --run-dir /tmp/selftest` seeds synthetic data
and uses a fake LLM, so it must point at a **scratch** database. It refuses to run if any
real standards framework exists.
