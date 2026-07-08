# State Compliance Templates

Each file in this directory is a plain-text prompt fragment that is appended
to `system_base.txt` when generating a compliance report for that state.

## How to add a state template

1. Create a file named `<state_code_lowercase>.txt` (e.g. `california.txt`).
2. Write the required fields and any state-specific language as plain text.
3. The agent will load it automatically for requests with `jurisdiction=<STATE_CODE>`.

## Template contents

A good template includes:
- List of required fields for a valid report in that state
- Any mandatory language (e.g. "declaration of intent", "notice of intent filed")
- Specific section headings the state authority expects
- Citation of the relevant state statute (e.g. RCW 28A.200.010 for Washington)

## Fallback

If no state-specific template exists, `default.txt` is used and
`needs_human_review` is forced to `true` in the agent output.
