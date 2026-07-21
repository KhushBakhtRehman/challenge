import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { planControl, runSample } from "../agent/session.js";
import { DecisionLog } from "../audit/log.js";
import { discoverControl } from "../control/discover.js";
import { loadEvidence } from "../evidence/inventory.js";
import type { TableSheet } from "../evidence/types.js";
import { ModelClient, type Effort } from "../model/client.js";
import { buildRunReport } from "../report/json.js";
import { renderWorkpaper } from "../report/workpaper.js";
import { gradeReport, type ControlExpectation, type ControlGrade } from "./grade.js";

/**
 * Accuracy harness: runs the agent end-to-end against controls with known
 * expected findings and grades the results. `npm run eval` — see
 * eval/expected/*.json for what "correct" means and why.
 */

const PACKAGE_ROOT = resolve(import.meta.dirname, "..", "..");

const CONTROL_PATHS: Record<string, string> = {
  "independent-code-review": resolve(PACKAGE_ROOT, "..", "data", "independent-code-review"),
  "user-access-review": resolve(PACKAGE_ROOT, "..", "data", "user-access-review"),
  "emergency-change-approval": resolve(
    PACKAGE_ROOT,
    "src",
    "eval",
    "fixtures",
    "emergency-change-approval"
  ),
};

interface EvalOptions {
  controls: string[];
  trials: number;
  model: string;
  effort: Effort;
}

function parseArgs(argv: string[]): EvalOptions {
  const options: EvalOptions = {
    controls: Object.keys(CONTROL_PATHS),
    trials: 1,
    model: process.env["ATTEST_MODEL"] ?? "claude-opus-4-8",
    effort: (process.env["ATTEST_EFFORT"] as Effort) ?? "high",
  };
  const args = [...argv];
  const picked: string[] = [];
  while (args.length > 0) {
    const arg = args.shift() as string;
    if (arg === "--control") picked.push(args.shift() ?? "");
    else if (arg === "--trials") options.trials = Math.max(1, Number(args.shift()) || 1);
    else if (arg === "--model") options.model = args.shift() ?? options.model;
    else if (arg === "--effort") options.effort = (args.shift() ?? options.effort) as Effort;
    else {
      console.error(`unknown eval option ${arg}`);
      process.exit(1);
    }
  }
  if (picked.length > 0) {
    for (const name of picked) {
      if (!CONTROL_PATHS[name]) {
        console.error(
          `unknown control '${name}' — known: ${Object.keys(CONTROL_PATHS).join(", ")}`
        );
        process.exit(1);
      }
    }
    options.controls = picked;
  }
  return options;
}

function loadDotEnv(): void {
  for (const candidate of [".env", join(PACKAGE_ROOT, ".env")]) {
    try {
      process.loadEnvFile(candidate);
      return;
    } catch {
      /* not present */
    }
  }
}

async function evaluateControl(
  name: string,
  options: EvalOptions,
  outDir: string
): Promise<ControlGrade> {
  const controlPath = CONTROL_PATHS[name] as string;
  if (!existsSync(controlPath)) {
    throw new Error(`control folder missing: ${controlPath} (run from the repo's src/ directory)`);
  }
  const expectation = JSON.parse(
    readFileSync(join(PACKAGE_ROOT, "src", "eval", "expected", `${name}.json`), "utf8")
  ) as ControlExpectation;

  const control = discoverControl(controlPath);
  mkdirSync(join(outDir, "decision-log"), { recursive: true });

  const tableSheets = new Map<string, TableSheet[]>();
  for (const sample of control.samples) {
    for (const file of sample.evidence) {
      if (file.kind !== "table" || tableSheets.has(file.absPath)) continue;
      const content = await loadEvidence(file);
      if (content.kind === "table") tableSheets.set(file.absPath, content.sheets);
    }
  }

  const model = new ModelClient({ model: options.model, effort: options.effort });
  const controlLog = new DecisionLog(join(outDir, "decision-log", "control.jsonl"));
  const progress = (scope: string) => (message: string) =>
    console.error(`  [${name}/${scope}] ${message}`);

  const plan = await planControl(
    { model, log: controlLog, progress: progress("plan") },
    control,
    tableSheets
  );

  const samples = [];
  for (const sample of control.samples) {
    const log = new DecisionLog(join(outDir, "decision-log", `${sample.name}.jsonl`));
    samples.push(
      await runSample(
        { model, log, progress: progress(sample.name) },
        control,
        plan,
        sample,
        tableSheets
      )
    );
  }

  const report = buildRunReport({
    version: "eval",
    runId: outDir,
    startedAt: new Date().toISOString(),
    model: options.model,
    effort: options.effort,
    usage: model.totals,
    control,
    plan,
    samples,
  });
  writeFileSync(join(outDir, "assessment.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(join(outDir, "workpaper.md"), renderWorkpaper(report), "utf8");

  return gradeReport(report, expectation);
}

function renderSummary(options: EvalOptions, trials: ControlGrade[][]): string {
  const lines: string[] = [];
  lines.push(`# attest eval run — ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push(
    `Model: \`${options.model}\` (effort \`${options.effort}\`), trials: ${trials.length}`
  );
  lines.push(`Harness: \`npm run eval -- --trials ${trials.length}\``);
  lines.push("");
  lines.push(`| Control | Trial | Verdicts acceptable | Verdicts preferred | Required findings |`);
  lines.push(`| --- | ---: | ---: | ---: | ---: |`);

  const overall = { acceptable: 0, strict: 0, verdicts: 0, found: 0, mentions: 0 };
  trials.forEach((grades, t) => {
    for (const grade of grades) {
      const {
        verdictsAcceptable,
        verdictsStrict,
        verdictsTotal,
        requiredMentionsFound,
        requiredMentionsTotal,
      } = grade.totals;
      overall.acceptable += verdictsAcceptable;
      overall.strict += verdictsStrict;
      overall.verdicts += verdictsTotal;
      overall.found += requiredMentionsFound;
      overall.mentions += requiredMentionsTotal;
      lines.push(
        `| ${grade.control} | ${t + 1} | ${verdictsAcceptable}/${verdictsTotal} | ${verdictsStrict}/${verdictsTotal} | ${requiredMentionsFound}/${requiredMentionsTotal} |`
      );
    }
  });
  lines.push(
    `| **overall** | | **${overall.acceptable}/${overall.verdicts} (${pct(overall.acceptable, overall.verdicts)})** | **${overall.strict}/${overall.verdicts} (${pct(overall.strict, overall.verdicts)})** | **${overall.found}/${overall.mentions} (${pct(overall.found, overall.mentions)})** |`
  );

  lines.push("", `## Detail (trial 1)`, "");
  lines.push(`| Control | Attribute | Sample | Verdict | Acceptable? | Missed required findings |`);
  lines.push(`| --- | --- | --- | --- | --- | --- |`);
  for (const grade of trials[0] ?? []) {
    for (const attr of grade.attributes) {
      const missed = attr.mentions
        .filter((m) => m.required && !m.found)
        .map((m) => `\`${m.pattern}\``);
      lines.push(
        `| ${grade.control} | ${attr.attributeId} ${attr.attributeText.slice(0, 46)}… | ${attr.sample} | ${attr.verdict ?? "—"} | ${attr.acceptable ? "yes" : `**no** (accept: ${attr.accept.join("/")})`} | ${missed.join(", ") || "—"} |`
      );
    }
    for (const sampleCheck of grade.sampleMentions) {
      const missed = sampleCheck.mentions
        .filter((m) => m.required && !m.found)
        .map((m) => `\`${m.pattern}\``);
      if (missed.length > 0) {
        lines.push(
          `| ${grade.control} | (sample-wide) | ${sampleCheck.sample} | | | ${missed.join(", ")} |`
        );
      }
    }
    if (grade.unmatchedExpectations.length > 0) {
      lines.push(
        `| ${grade.control} | ⚠ unmatched expectations: ${grade.unmatchedExpectations.join("; ")} | | | | |`
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${Math.round((n / d) * 100)}%`;
}

async function main(): Promise<void> {
  loadDotEnv();
  if (!process.env["ANTHROPIC_API_KEY"]) {
    console.error("error: ANTHROPIC_API_KEY is not set (see src/.env.example)");
    process.exit(1);
  }
  const options = parseArgs(process.argv.slice(2));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const root = resolve(PACKAGE_ROOT, "eval-results", stamp);

  const trials: ControlGrade[][] = [];
  for (let trial = 1; trial <= options.trials; trial++) {
    const grades: ControlGrade[] = [];
    for (const name of options.controls) {
      console.error(`\n▶ eval trial ${trial}/${options.trials}: ${name}`);
      grades.push(await evaluateControl(name, options, join(root, `trial-${trial}`, name)));
    }
    trials.push(grades);
  }

  const summary = renderSummary(options, trials);
  const summaryPath = join(root, "summary.md");
  writeFileSync(summaryPath, summary, "utf8");
  console.log(`\n${summary}`);
  console.log(`written: ${summaryPath}`);

  const last = trials.at(-1) ?? [];
  const allAcceptable = last.every((g) => g.totals.verdictsAcceptable === g.totals.verdictsTotal);
  const allFound = last.every(
    (g) => g.totals.requiredMentionsFound === g.totals.requiredMentionsTotal
  );
  process.exit(allAcceptable && allFound ? 0 : 3);
}

main().catch((error: unknown) => {
  console.error(
    `fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
  );
  process.exit(1);
});
