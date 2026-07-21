# attest — an evidence-cited audit agent

`attest` tests a control the way an audit firm would: it reads the control documentation, writes a test plan, examines the evidence (screenshots, workbooks, CSVs, PDFs, text), reperforms whatever the data allows over the **full population**, and delivers a verdict per control attribute — `SUCCESS`, `FAIL`, or `FURTHER_EVIDENCE_REQUIRED` — where every factual claim carries a citation the harness has verified actually exists. Before anything is signed, an independent **quality-review session tries to refute the assessment** against the same evidence; blocking challenges send it back for revision.

One agent, zero control-specific prompting. The control folder is the input; the same binary tests an access review, a code-review control, or a change-management control it has never seen.

Every run produces three artifacts:

| Artifact | Audience | Contents |
| --- | --- | --- |
| `assessment.json` | machines | Schema-validated verdicts, reasoning, citations, exceptions, evidence requests, reperformance deltas, token accounting |
| `workpaper.md` | reviewers | The audit workpaper: test plan, evidence register with SHA-256 hashes, findings per attribute, exception blocks, a PBC list of open evidence requests |
| `decision-log/*.jsonl` | skeptics | Append-only trail of every model call (with its reasoning summary), every tool call, every analysis (code + result, verbatim), every rejected submission |

## Quickstart

Requirements: **Node.js ≥ 20.12** and an Anthropic API key. (`sharp` and `exceljs` ship prebuilt binaries — no native toolchain needed.)

```bash
cd src
npm install

cp .env.example .env          # then paste your ANTHROPIC_API_KEY into it
# — or —
export ANTHROPIC_API_KEY=sk-ant-...

# test one control
npm run audit -- ../data/user-access-review

# or every control under data/
npm run audit -- ../data
```

The verdict summary prints to the terminal; artifact paths are printed at the end (default `src/runs/<control>/<run-id>/`).

A full run of both provided controls takes a few minutes and a few dollars of tokens — most of it thinking, vision on the PR screenshots, and the quality-review pass. Complete unedited runs (workpapers, assessments, decision logs) are committed under [`sample-runs/`](sample-runs) so you can inspect the output without spending anything.

To give you the flavour — two verbatim fragments from [`sample-runs/user-access-review/workpaper.md`](sample-runs/user-access-review/workpaper.md). The remediation attribute:

> **A3 — ❌ FAIL (confidence: high)**
>
> **Independent reperformance found 2 terminated employees retaining ACTIVE NetSuite access, but the review identified and remediated only 1; a terminated user (Kevin Lewis) was affirmatively marked 'Retain' and his access was neither identified nor remediated.** […] The Summary's assertion that 'All other in-scope accounts reconciled to active/on-leave workers with no exceptions' […] contradicted by my reperformance.

And the quality reviewer catching a subtle temporal-reasoning flaw in the engagement's *secondary* exception — while confirming the verdict itself:

> **Challenge (note) — A3:** The A3 FAIL verdict is sound and rests firmly on Kevin Lewis […]. However, the secondary exception concerning Danielle Goodwin overstates the evidence […] The NetSuite access export was pulled 26 Jun 2026, whereas the review was completed and remediation ticket ITSM-48217 was raised on 30 Jun 2026 — the export predates the ticket by four days. […] the export simply cannot reflect any post-review deprovisioning. […] The verdict survives on Kevin Lewis regardless.

### CLI

```
npm run audit -- <control-folder-or-data-dir> [options]

--sample <name>      only run the named sample (repeatable)
--model <id>         default: claude-opus-4-8   (accuracy was the objective; use --model claude-sonnet-5 for ~5x cheaper runs)
--effort <level>     low | medium | high | xhigh | max   (default: high)
--out <dir>          output root (default: ./runs)
--concurrency <n>    samples assessed in parallel (default: 2)
--no-review          skip the adversarial quality-review pass (faster, cheaper)
```

Checks: `npm test` (45 unit tests), `npm run typecheck`, `npm run lint`, `npm run eval` (below).

## How it works

```
control folder ─► discover ─► PLAN ─► per sample: EXAMINE ⇄ tools ─► CONCLUDE ─► REVIEW ─► artifacts
               (docs, samples, submit_test_plan    open_evidence     submit_assessment   fresh session
                evidence ids,  (approved once,     query_data        (validated, bounced  tries to refute;
                sha256 hashes) applied per sample) record_evidence    back until right)   blocking ⇒ revise
```

**1. Discovery is generic.** Markdown files at the control root are documentation; `samples/` subdirectories are samples; loose files next to `samples/` are shared evidence available to every sample; a control without `samples/` treats its root files as one sample. Layouts are data, not configuration — nothing in the code knows what a "UAR" is.

**2. Plan first, then test.** The agent must submit a test plan — attributes extracted verbatim from the control docs, an interpretation of each as a testable requirement, and procedures mapped to the evidence inventory — before it may examine anything. The plan is approved once per control and applied to every sample, so attribute ids are stable across samples and the plan itself is an inspectable artifact.

**3. Extraction is separated from judgment, and the deterministic parts are actually deterministic.**

- **Workbooks/CSVs** are parsed to a normalised table model before the model sees them: inferred headers, ISO dates, source row numbers, and the things a casual reader misses — hidden sheets, hidden rows/columns, formulas, cell notes — surfaced explicitly with ⚠ flags.
- **Counts, joins, reconciliations are never done "by eye".** The model writes small JavaScript programs against the parsed tables (`query_data`); they run in an isolated VM and the code + result are logged verbatim. A conclusion like "1 of 332 in-scope accounts" traces to an analysis id whose code any reviewer can read and re-run. This is what makes full-population testing practical: the model reasons, the machine counts.
- **Screenshots** are width-normalised and sliced into overlapping high-resolution tiles before being attached, so the details verdicts hinge on — "36 of 37 checks passed", timeline ordering, timestamps — survive the model's image-resolution limit instead of being downscaled into mush.
- **PDFs** attach as native document blocks; text attaches verbatim.

**4. Citations cannot be hallucinated.** Every factual claim in a submission carries `{source, locator, observation}` where `source` is an evidence id (`E1…`) or analysis id (`Q1…`) issued by the harness. Submissions citing a source that doesn't exist, a sheet name that isn't in the workbook, an image tile out of range, or evidence that was never examined are **rejected and bounced back** with the specific errors until the model fixes them. The same gate enforces verdict semantics: `FAIL` requires at least one exception, `FURTHER_EVIDENCE_REQUIRED` requires a precise evidence request (artifact, purpose, source system), and the submission must cover the approved plan exactly.

**The JSON contract** (full schema in [`src/audit/schema.ts`](src/audit/schema.ts), real examples in `sample-runs/*/assessment.json`) — one object per sample, one entry per control attribute:

```jsonc
{
  "attributeId": "A3",
  "verdict": "FAIL",                       // SUCCESS | FAIL | FURTHER_EVIDENCE_REQUIRED
  "confidence": "high",
  "summary": "…one-sentence conclusion…",
  "reasoning": "…full audit rationale citing [E2], [Q3]…",
  "evidence": [ { "source": "Q3", "locator": null, "observation": "2 terminated workers hold ACTIVE accounts…" } ],
  "exceptions": [ { "title": "…", "detail": "…", "severity": "high", "evidence": [ … ] } ],
  "furtherEvidenceRequired": []            // populated for FURTHER_EVIDENCE_REQUIRED, with artifact/purpose/source
}
```

…wrapped with per-sample `reperformance` deltas, `observations`, the overall `conclusion`, the quality-review outcome, evidence hashes and token accounting.

**5. Reperform, don't re-read.** The system prompt encodes the doctrine that distinguishes an auditor from a summariser: system-generated data outranks self-declared assertions; when the evidence contains the underlying population, re-derive the conclusion independently and report every delta against what the original performer recorded; distinguish a deviation (evidence proves a gap → `FAIL`) from an evidence gap (can't tell → `FURTHER_EVIDENCE_REQUIRED`); judge only against the control's own attributes and policies, and surface everything else as observations.

On the provided User Access Review this is the difference that matters: the reviewer's workbook concludes "1 observation, no other exceptions". Reconciling the full 334-account export against the 720-worker HRIS roster finds a second terminated employee — account still active, logging in years after termination, marked "Retain" by the reviewer — which contradicts the recorded conclusion instead of merely re-reading it.

**6. Nothing is signed without a second pair of eyes.** After the assessment is accepted, an **engagement quality review** runs in a fresh session — same evidence, same sandbox, none of the engagement's context — with an adversarial brief: contradict the verdicts, re-derive the decisive analyses (in its own `R1…` id space; it may not cite the engagement's), find missed exceptions. Its confirmations and challenges land in the workpaper; `blocking` challenges send the assessment back for one bounded revision round. This mirrors how audit firms gate workpapers before sign-off (EQR), and it works: in live runs the reviewer has caught real defects — e.g. an internal miscount in a reasoning narrative — while correctly confirming sound verdicts instead of manufacturing objections. `--no-review` skips it when speed matters more than assurance.

## Accuracy — `npm run eval`

Accuracy is the stated objective, so it's measured, not asserted. The eval harness runs the agent end-to-end against three controls and grades the results against [`src/eval/expected/*.json`](src/eval/expected):

- the two provided controls (code review, access review), and
- **a synthetic third control the agent has never seen** (`emergency-change-approval`: a change-log CSV + a CAB approvals mailbox export) as a genericity check, with planted defects — an approval email for a change that was never recorded in the change log (population completeness), a 9-business-day approval sitting next to an exactly-5-day boundary case that must *not* be flagged, and a change with no post-implementation test evidence.

Grading is two-layered, because verdicts alone under-measure an auditor:

- **Verdicts** — each attribute has an `accept` set and a `preferred` verdict. Some attributes have one defensible answer (the missed terminated user makes remediation a `FAIL`); others are legitimate judgment calls (is repo-wide coverage with one unexplained check a pass with an exception, or an evidence request?). The harness reports strict and acceptable accuracy separately rather than pretending judgment variance doesn't exist.
- **Required findings** — regexes for the planted facts that must appear in the assessment. A "correct" verdict that missed `kevin.lewis` is a worse answer than a debatable verdict that caught him; findings are the sharper signal.

Results — `claude-opus-4-8`, effort `high`, quality review on, **3 independent trials** ([full table](src/eval/results/2026-07-06-opus-high-3-trials.md); regenerate with `npm run eval -- --trials 3`):

| Control | Verdicts acceptable | Verdicts preferred | Required findings |
| --- | ---: | ---: | ---: |
| independent-code-review (2 samples × 3 attributes) | 18/18 | 15/18 | 27/27 |
| user-access-review | 9/9 | 6/9 | 21/21 |
| emergency-change-approval (unseen synthetic) | 9/9 | 9/9 | 24/24 |
| **overall, 3 trials** | **36/36 (100%)** | **30/36 (83%)** | **72/72 (100%)** |

Every planted finding was caught in every trial — the terminated user the workbook's reviewer missed (3/3 trials), the change approved by email but absent from the change log (3/3), the check-count discrepancies on both PRs (3/3). Verdicts were **identical across all three trials** — no sampling controls exist on current models, so that stability comes from the harness: deterministic extraction, computed-not-eyeballed analytics, and validation gates. The six "preferred" misses are the same two attributes each trial landing on the acceptable-but-not-preferred side of documented judgment calls (both discussed in `src/eval/expected/*.json`).

## Design decisions

**Why a bounded three-phase loop instead of a free agent.** Auditability comes from structure: a plan that exists before testing, an examination trail, a conclusion that must survive validation. The model is free *within* each phase (what to open, what to query, how to judge) and constrained *between* them. That's also why rejected submissions bounce back instead of failing the run — the harness is the reviewer that won't sign a workpaper with broken tick-marks.

**Why the model sees primary evidence, not summaries of it.** Accuracy was the objective, so the judge examines the actual screenshots and actual records — an extraction layer that pre-digests images into text would launder away exactly the details that decide verdicts. Separation of extraction from judgment lives in the *artifacts* instead: extraction notes (`record_evidence`) and analyses (`query_data`) are logged distinctly from the judgments that cite them.

**Why deterministic compute for data work.** LLMs are unreliable counters and joiners over hundreds of rows, and — more importantly — a count done in the model's head is unreviewable. Model-written, harness-executed, verbatim-logged code makes every number in the output reproducible. Population-scale work (334 accounts × 720 workers here; far larger in real engagements) also simply doesn't fit in a context window as prose; it fits fine as `tables` in a VM.

**Why not zeitlich.** I read [zeitlich](https://github.com/bead-ai/zeitlich) first and borrowed its shapes deliberately — typed tool definitions from zod schemas, a session loop with validated tool results, phase state owned by the harness. I didn't build on it because it solves a different problem than a reviewer running a take-home: durable execution needs Temporal + Redis, and for a single-process CLI whose whole run takes minutes, that buys resilience nobody needs while making `npm install && npm run audit` into an infrastructure exercise. In production this loop maps onto zeitlich almost 1:1 — `createSession` with `defineTool` handlers, the decision log as an observability sink, `query_data` in a real sandbox (E2B/Daytona) instead of `node:vm` — which is exactly where I'd take it next.

**Why Opus at high effort by default.** The brief says accuracy is the only objective, so the default is the most capable generally-available model with thinking enabled; the reasoning summaries land in the decision log, so the "why" behind each judgment is inspectable. `--model` / `--effort` trade cost for accuracy when that changes.

**Determinism posture.** Current models no longer accept `temperature`; runs will vary in wording. What's held fixed instead: parsing and analysis are fully deterministic, citations are validated against issued ids, evidence files are content-hashed, and the decision log captures enough to re-verify any conclusion without re-running the model. That's the same trust model as a human audit: you don't replay the auditor's neurons, you review their workpapers.

## What it handles beyond the two examples

- Any number of controls (`npm run audit -- ../data` runs them all) and any number of samples per control, assessed with bounded concurrency.
- Sample layouts: `samples/<dir>/` (multi-file samples), loose files under `samples/` (each its own sample), shared control-level evidence next to `samples/`, or evidence at the control root (single sample).
- Any reasonable invocation path: the control folder, a directory of controls, the `samples/` directory itself, or one sample directory (`npm run audit -- ../data/independent-code-review/samples/sample-2`).
- Evidence formats: `.xlsx`/`.xlsm`, `.csv`, `.png`/`.jpg`/`.webp`/`.gif`, `.pdf`, `.txt`/`.md`/`.json`/`.log`/`.eml`. Unsupported types are still hashed and listed in the register so nothing silently disappears.
- Multiple policy documents per control (every root `.md` is provided to the agent; `control.md` sorts first).
- Messy workbooks: hidden sheets/rows/columns, formulas, cell notes, cover pages, blank spacer rows, duplicate headers.
- Missing or ambiguous evidence — by design: that's what `FURTHER_EVIDENCE_REQUIRED` with a concrete PBC request is for.

## Limitations, honestly

- **`node:vm` is isolation, not a security boundary.** The sandbox has no filesystem/network/process access and a 3s timeout, and it only ever sees data parsed from local evidence — but a hostile-input production deployment should run analyses in a real sandbox (E2B, Daytona, Firecracker). The tool contract wouldn't change.
- **One-shot sessions.** No resume-from-crash; a failed sample is contained, reported, and re-runnable, but not checkpointed. Durability is what Temporal/zeitlich would add.
- **Vision is bounded by legibility.** Tiling preserves detail well past naive downscaling, but sub-pixel print in a heavily compressed screenshot can still defeat it; the agent is instructed to say what it can't read rather than guess.
- **Judgment variance is real.** The eval's strict-vs-acceptable split measures it instead of hiding it; on genuinely ambiguous attributes the deliverable is defensible reasoning, not verdict roulette.
- **Cost/latency were non-goals** per the brief. Obvious wins if they mattered: Sonnet for extraction turns with Opus held for judgment, batched samples, tighter evidence pruning.

## Repository tour

```
src/
├── cli.ts                  argument parsing, orchestration, run artifacts
├── control/discover.ts     control-folder → docs + samples + evidence ids (layout rules)
├── evidence/               deterministic parsers: xlsx, csv, image tiling, text, pdf; sha256 register
├── agent/
│   ├── prompts.ts          system prompts (engagement doctrine + adversarial review brief)
│   ├── tools.ts            zod → tool schemas; evidence rendering for the model
│   ├── session.ts          plan/examine/conclude/review loops, validation bounce-backs
│   ├── analysis.ts         the query_data VM sandbox + helpers
│   └── sanitize.ts         decodes double-escaped unicode strict tool use sometimes emits
├── audit/
│   ├── schema.ts           the output contract (verdicts, citations, exceptions, review)
│   ├── refs.ts             citation validation against issued evidence/analysis ids
│   └── log.ts              append-only JSONL decision log
├── model/client.ts         Anthropic client: streaming, adaptive thinking, caching, usage
├── report/                 assessment.json builder + workpaper.md renderer
├── eval/                   accuracy harness, expected findings, synthetic control fixtures
└── sample-runs/            committed unedited runs of all three controls (read without a key)
test/                       45 unit tests (parsers, discovery, sandbox, citation gate, sessions)
```

CI (`.github/workflows/ci.yml`) runs typecheck, lint, format and tests on every push.
