import type { EvidenceRef, RunReport } from "../audit/schema.js";

const VERDICT_BADGE: Record<string, string> = {
  SUCCESS: "✅ SUCCESS",
  FAIL: "❌ FAIL",
  FURTHER_EVIDENCE_REQUIRED: "🟡 FURTHER EVIDENCE REQUIRED",
};

/**
 * The human-readable workpaper: everything a reviewer needs to re-verify the
 * conclusions, laid out the way audit workpapers are — plan, evidence
 * register, procedures & findings, exceptions, requests.
 */
export function renderWorkpaper(report: RunReport): string {
  const md: string[] = [];
  const { control, run } = report;

  md.push(`# Test of Control — ${control.name}`);
  md.push("");
  md.push(control.testPlan.controlSummary);
  md.push("");
  md.push(`| | |`);
  md.push(`|---|---|`);
  md.push(`| Control folder | \`${control.name}\` |`);
  md.push(`| Performed by | attest v${report.tool.version} (${run.model}, effort ${run.effort}) |`);
  md.push(`| Run | ${run.id}, ${run.startedAt} → ${run.finishedAt} |`);
  md.push(
    `| Tokens | ${run.usage.inputTokens.toLocaleString()} in / ${run.usage.outputTokens.toLocaleString()} out (cache: ${run.usage.cacheReadTokens.toLocaleString()} read) across ${run.usage.modelCalls} model calls |`
  );
  md.push("");
  md.push(
    `Machine-readable results: \`assessment.json\`. Full trail of every model call, analysis and validation: \`decision-log/\`.`
  );

  md.push("", `## 1. Control documentation`);
  for (const doc of control.documents) {
    md.push(`- \`${doc.file}\` — sha256 \`${doc.sha256}\``);
  }

  md.push("", `## 2. Test plan`, "");
  for (const attr of control.testPlan.attributes) {
    md.push(`### ${attr.id} — ${attr.text}`);
    md.push("", `*Interpretation:* ${attr.interpretation}`, "", `*Procedures:*`);
    for (const step of attr.procedures) md.push(`1. ${step}`);
    md.push("");
  }
  md.push(`*Evidence considerations:* ${control.testPlan.evidenceConsiderations}`);

  md.push("", `## 3. Results summary`, "");
  const attrIds = control.testPlan.attributes.map((a) => a.id);
  md.push(`| Sample | ${attrIds.join(" | ")} |`);
  md.push(`|---|${attrIds.map(() => "---").join("|")}|`);
  for (const sample of report.samples) {
    const cells = attrIds.map((id) => {
      if (sample.status !== "assessed") return "⚠️ error";
      const verdict = report.summary.verdicts[sample.sample]?.[id];
      return verdict ? (VERDICT_BADGE[verdict] ?? verdict) : "—";
    });
    md.push(`| ${sample.sample} | ${cells.join(" | ")} |`);
  }

  for (const sample of report.samples) {
    md.push("", `## Sample: ${sample.sample}`, "");
    md.push(`### Evidence register`, "");
    md.push(`| Id | File | Type | Size | SHA-256 |`);
    md.push(`|---|---|---|---|---|`);
    for (const e of sample.evidence) {
      md.push(
        `| ${e.id} | \`${e.file}\`${e.shared ? " *(shared)*" : ""} | ${e.mediaType} | ${e.bytes.toLocaleString()} B | \`${e.sha256.slice(0, 16)}…\` |`
      );
    }

    if (sample.status !== "assessed" || !sample.assessment) {
      md.push("", `> ⚠️ This sample was not assessed: ${sample.error ?? "unknown error"}`);
      continue;
    }
    const a = sample.assessment;

    for (const attr of a.attributes) {
      md.push(
        "",
        `### ${attr.attributeId} — ${VERDICT_BADGE[attr.verdict] ?? attr.verdict} (confidence: ${attr.confidence})`,
        ""
      );
      md.push(`**${attr.summary}**`, "", attr.reasoning);
      if (attr.evidence.length > 0) {
        md.push("", `**Evidence:**`, "", refTableHeader(), ...attr.evidence.map(refRow));
      }
      for (const exception of attr.exceptions) {
        md.push("", `> **Exception (${exception.severity}): ${exception.title}**`);
        md.push(`> ${exception.detail}`);
        for (const ref of exception.evidence) {
          md.push(`> - ${refInline(ref)}`);
        }
      }
      if (attr.furtherEvidenceRequired.length > 0) {
        md.push("", `**Evidence requested:**`);
        for (const request of attr.furtherEvidenceRequired) {
          md.push(`- **${request.artifact}** (from ${request.likelySource}) — ${request.purpose}`);
        }
      }
    }

    if (a.reperformance.length > 0) {
      md.push("", `### Reperformance`, "");
      md.push(`| Procedure | Recorded result | Reperformed result | Agreement |`);
      md.push(`|---|---|---|---|`);
      for (const r of a.reperformance) {
        md.push(
          `| ${escapeCell(r.procedure)} | ${escapeCell(r.recordedResult)} | ${escapeCell(r.reperformedResult)} | ${r.agreement} |`
        );
      }
      for (const r of a.reperformance.filter((x) => x.agreement !== "agrees")) {
        md.push("", `- **${escapeCell(r.procedure)}** — ${r.detail}`);
      }
    }

    if (a.observations.length > 0) {
      md.push("", `### Observations (outside attribute scope)`, "");
      for (const o of a.observations) {
        md.push(`- **${o.title}** — ${o.detail}`);
        for (const ref of o.evidence) md.push(`  - ${refInline(ref)}`);
      }
    }

    if (sample.qualityReview) {
      const { review, revised, resolution } = sample.qualityReview;
      md.push("", `### Engagement quality review`, "");
      md.push(
        `An independent review session re-examined the evidence and attempted to refute this assessment${revised ? "; blocking challenges were raised and the assessment was revised" : ""}.`
      );
      md.push("", `> ${review.summary}`);
      if (review.confirmed.length > 0) {
        md.push("", `**Withstood review:** ${review.confirmed.join(", ")}`);
      }
      for (const challenge of review.challenges) {
        md.push(
          "",
          `> **Challenge (${challenge.severity}) — ${challenge.attributeId}:** ${challenge.challenge}`
        );
        for (const ref of challenge.evidence) md.push(`> - ${refInline(ref)}`);
      }
      if (resolution) md.push("", `*Resolution:* ${resolution}`);
    }

    md.push("", `### Conclusion`, "", a.conclusion);
  }

  const requests = report.samples.flatMap((s) =>
    (s.assessment?.attributes ?? []).flatMap((attr) =>
      attr.furtherEvidenceRequired.map((r) => ({
        sample: s.sample,
        attribute: attr.attributeId,
        ...r,
      }))
    )
  );
  if (requests.length > 0) {
    md.push("", `## Open evidence requests (PBC)`, "");
    md.push(`| Sample | Attribute | Artifact | Source | Purpose |`);
    md.push(`|---|---|---|---|---|`);
    for (const r of requests) {
      md.push(
        `| ${r.sample} | ${r.attribute} | ${escapeCell(r.artifact)} | ${escapeCell(r.likelySource)} | ${escapeCell(r.purpose)} |`
      );
    }
  }

  md.push("");
  return md.join("\n");
}

function refTableHeader(): string {
  return `| Source | Location | Observation |\n|---|---|---|`;
}

function refRow(ref: EvidenceRef): string {
  return `| ${ref.source} | ${escapeCell(ref.locator ?? "—")} | ${escapeCell(ref.observation)} |`;
}

function refInline(ref: EvidenceRef): string {
  return `[${ref.source}${ref.locator ? ` @ ${ref.locator}` : ""}] ${ref.observation}`;
}

function escapeCell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}
