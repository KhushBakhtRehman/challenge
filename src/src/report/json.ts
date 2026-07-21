import type { ControlFolder } from "../control/discover.js";
import {
  RunReportSchema,
  type RunReport,
  type SampleResult,
  type TestPlan,
  type Usage,
  type Verdict,
} from "../audit/schema.js";

export function buildRunReport(args: {
  version: string;
  runId: string;
  startedAt: string;
  model: string;
  effort: string;
  usage: Usage;
  control: ControlFolder;
  plan: TestPlan;
  samples: SampleResult[];
}): RunReport {
  const verdicts: Record<string, Record<string, Verdict>> = {};
  let exceptionCount = 0;
  let evidenceRequestCount = 0;
  for (const sample of args.samples) {
    if (!sample.assessment) continue;
    verdicts[sample.sample] = {};
    for (const attr of sample.assessment.attributes) {
      (verdicts[sample.sample] as Record<string, Verdict>)[attr.attributeId] = attr.verdict;
      exceptionCount += attr.exceptions.length;
      evidenceRequestCount += attr.furtherEvidenceRequired.length;
    }
  }

  const report: RunReport = {
    tool: { name: "attest", version: args.version },
    run: {
      id: args.runId,
      startedAt: args.startedAt,
      finishedAt: new Date().toISOString(),
      model: args.model,
      effort: args.effort,
      usage: args.usage,
    },
    control: {
      name: args.control.name,
      folder: args.control.path,
      documents: args.control.documents.map(({ file, sha256 }) => ({ file, sha256 })),
      testPlan: args.plan,
    },
    samples: args.samples,
    summary: { verdicts, exceptionCount, evidenceRequestCount },
  };
  // Validate our own output against the published schema before writing it.
  return RunReportSchema.parse(report);
}
