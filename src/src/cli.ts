import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { discoverControls, type ControlFolder } from "./control/discover.js";
import { DecisionLog } from "./audit/log.js";
import type { SampleResult } from "./audit/schema.js";
import { loadEvidence } from "./evidence/inventory.js";
import type { TableSheet } from "./evidence/types.js";
import { ModelClient, type Effort } from "./model/client.js";
import { planControl, runSample } from "./agent/session.js";
import { buildRunReport } from "./report/json.js";
import { renderWorkpaper } from "./report/workpaper.js";

const USAGE = `attest — evidence-cited control testing

Usage:
  npm run audit -- <control-folder-or-data-dir> [options]

Arguments:
  path                 A control folder, a directory of control folders (e.g. ../data),
                       a control's samples/ directory, or a single sample directory

Options:
  --sample <name>      Only run the named sample (repeatable)
  --model <id>         Model id (default: $ATTEST_MODEL or claude-opus-4-8)
  --effort <level>     low | medium | high | xhigh | max (default: $ATTEST_EFFORT or high)
  --out <dir>          Output root (default: ./runs)
  --concurrency <n>    Samples assessed in parallel (default: 2)
  --no-review          Skip the adversarial quality-review pass (faster, cheaper)
  --help               Show this help

Examples:
  npm run audit -- ../data/user-access-review
  npm run audit -- ../data/independent-code-review --sample sample-2
  npm run audit -- ../data
`;

interface CliOptions {
  path: string;
  samples: string[];
  model: string;
  effort: Effort;
  out: string;
  concurrency: number;
  qualityReview: boolean;
}

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    path: "",
    samples: [],
    model: process.env["ATTEST_MODEL"] ?? "claude-opus-4-8",
    effort: (process.env["ATTEST_EFFORT"] as Effort) ?? "high",
    out: "./runs",
    concurrency: 2,
    qualityReview: true,
  };
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    process.exit(0);
  }
  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift() as string;
    switch (arg) {
      case "--sample":
        options.samples.push(expectValue(args, arg));
        break;
      case "--model":
        options.model = expectValue(args, arg);
        break;
      case "--effort": {
        const effort = expectValue(args, arg) as Effort;
        if (!EFFORTS.includes(effort)) fail(`--effort must be one of ${EFFORTS.join(", ")}`);
        options.effort = effort;
        break;
      }
      case "--out":
        options.out = expectValue(args, arg);
        break;
      case "--concurrency":
        options.concurrency = Math.max(1, Number(expectValue(args, arg)) || 1);
        break;
      case "--no-review":
        options.qualityReview = false;
        break;
      default:
        if (arg.startsWith("-")) fail(`unknown option ${arg}\n\n${USAGE}`);
        if (options.path) fail(`unexpected extra argument ${arg}`);
        options.path = arg;
    }
  }
  if (!options.path) fail(`missing <path> argument\n\n${USAGE}`);
  return options;
}

function expectValue(args: string[], flag: string): string {
  const value = args.shift();
  if (value === undefined) fail(`${flag} needs a value`);
  return value as string;
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function loadDotEnv(): void {
  for (const candidate of [".env", join(import.meta.dirname, "..", ".env")]) {
    try {
      process.loadEnvFile(candidate);
      return;
    } catch {
      // no .env here — fine
    }
  }
}

const color = {
  on: process.stderr.isTTY,
  paint(code: string, text: string): string {
    return this.on ? `\x1b[${code}m${text}\x1b[0m` : text;
  },
  verdict(v: string): string {
    if (v === "SUCCESS") return this.paint("32", v);
    if (v === "FAIL") return this.paint("31", v);
    return this.paint("33", v);
  },
  dim(text: string): string {
    return this.paint("2", text);
  },
  bold(text: string): string {
    return this.paint("1", text);
  },
};

async function pool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index] as T);
    }
  });
  await Promise.all(lanes);
  return results;
}

async function preloadTableSheets(control: ControlFolder): Promise<Map<string, TableSheet[]>> {
  const sheets = new Map<string, TableSheet[]>();
  const seen = new Set<string>();
  for (const sample of control.samples) {
    for (const file of sample.evidence) {
      if (file.kind !== "table" || seen.has(file.absPath)) continue;
      seen.add(file.absPath);
      const content = await loadEvidence(file);
      if (content.kind === "table") sheets.set(file.absPath, content.sheets);
    }
  }
  return sheets;
}

async function runControl(control: ControlFolder, options: CliOptions): Promise<number> {
  const runId = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const startedAt = new Date().toISOString();
  const outDir = resolve(options.out, control.name, runId);
  mkdirSync(join(outDir, "decision-log"), { recursive: true });

  console.error(color.bold(`\n▶ ${control.name}`));
  console.error(color.dim(`  model ${options.model} (effort ${options.effort}) → ${outDir}`));

  const samples =
    options.samples.length > 0
      ? control.samples.filter((s) => options.samples.includes(s.name))
      : control.samples;
  if (samples.length === 0) {
    fail(
      `no samples match ${options.samples.join(", ")} in ${control.name} (has: ${control.samples.map((s) => s.name).join(", ")})`
    );
  }

  const model = new ModelClient({ model: options.model, effort: options.effort });
  const controlLog = new DecisionLog(join(outDir, "decision-log", "control.jsonl"));
  controlLog.append({
    type: "run_started",
    model: options.model,
    effort: options.effort,
    control: control.name,
    argv: process.argv.slice(2),
  });
  controlLog.append({
    type: "control_docs_loaded",
    documents: control.documents.map(({ file, sha256 }) => ({ file, sha256 })),
  });

  const tableSheets = await preloadTableSheets(control);

  console.error(color.dim("  planning…"));
  const plan = await planControl(
    { model, log: controlLog, progress: (m) => console.error(color.dim(`  [plan] ${m}`)) },
    control,
    tableSheets
  );

  const results = await pool(
    samples,
    options.concurrency,
    async (sample): Promise<SampleResult> => {
      const log = new DecisionLog(join(outDir, "decision-log", `${sample.name}.jsonl`));
      console.error(
        color.dim(`  [${sample.name}] examining ${sample.evidence.length} evidence file(s)…`)
      );
      return runSample(
        { model, log, progress: (m) => console.error(color.dim(`  [${sample.name}] ${m}`)) },
        control,
        plan,
        sample,
        tableSheets,
        { qualityReview: options.qualityReview }
      );
    }
  );

  const version = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"))
    .version as string;

  const report = buildRunReport({
    version,
    runId,
    startedAt,
    model: options.model,
    effort: options.effort,
    usage: model.totals,
    control,
    plan,
    samples: results,
  });

  writeFileSync(join(outDir, "assessment.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(join(outDir, "workpaper.md"), renderWorkpaper(report), "utf8");

  console.log(color.bold(`\n${control.name}`));
  for (const sample of results) {
    console.log(`  ${sample.sample}`);
    if (sample.status !== "assessed" || !sample.assessment) {
      console.log(`    ${color.verdict("FAIL")} run error: ${sample.error}`);
      continue;
    }
    for (const attr of sample.assessment.attributes) {
      console.log(`    ${attr.attributeId} ${color.verdict(attr.verdict)} — ${attr.summary}`);
    }
  }
  console.log(color.dim(`\n  assessment: ${join(outDir, "assessment.json")}`));
  console.log(color.dim(`  workpaper:  ${join(outDir, "workpaper.md")}`));
  console.log(color.dim(`  decisions:  ${join(outDir, "decision-log")}`));
  console.log(
    color.dim(
      `  tokens: ${model.totals.inputTokens.toLocaleString()} in / ${model.totals.outputTokens.toLocaleString()} out, ` +
        `cache ${model.totals.cacheReadTokens.toLocaleString()} read / ${model.totals.cacheWriteTokens.toLocaleString()} written`
    )
  );

  return results.every((r) => r.status === "assessed") ? 0 : 2;
}

async function main(): Promise<void> {
  loadDotEnv();
  const options = parseArgs(process.argv.slice(2));
  if (!process.env["ANTHROPIC_API_KEY"]) {
    fail("ANTHROPIC_API_KEY is not set. Export it or put it in src/.env (see src/.env.example).");
  }

  const controls = discoverControls(resolve(options.path));
  let exitCode = 0;
  for (const control of controls) {
    exitCode = Math.max(exitCode, await runControl(control, options));
  }
  process.exit(exitCode);
}

main().catch((error: unknown) => {
  console.error(
    `\nfatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
  );
  process.exit(1);
});
