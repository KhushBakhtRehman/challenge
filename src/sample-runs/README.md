# Committed sample runs

One complete, unedited run per control — `claude-opus-4-8`, effort `high`, quality review enabled — so the output can be inspected without an API key:

- `workpaper.md` — the reviewer-facing deliverable (start here)
- `assessment.json` — the machine-readable verdicts with citations
- `decision-log/*.jsonl` — every model call (with reasoning summary), tool call, sandbox analysis (code + result), validation rejection, and the quality-review exchange

These are the runs graded as trial 1 in the eval results table in [`../README.md`](../README.md). Regenerate with `npm run audit -- <control-folder>` from `src/`.
