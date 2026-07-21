import type { RunReport, Verdict } from "../audit/schema.js";

/**
 * Grading is two-layered because verdicts alone under-measure an auditor:
 *
 * - Verdicts: some attributes have one defensible verdict, others are
 *   genuine judgment calls — expectations carry an `accept` set and a
 *   `preferred` verdict so we can report strict and acceptable accuracy
 *   separately.
 * - Findings: regexes that must appear somewhere in the assessment
 *   (reasoning, exceptions, observations, conclusion). Catching the planted
 *   facts — the missed terminated user, the unticketed change — is the
 *   real test; a "right" verdict that missed them is a worse answer.
 */

export interface AttributeExpectation {
  /** Case-insensitive regex matched against the attribute text from the plan. */
  match: string;
  samples: Record<
    string,
    {
      accept: Verdict[];
      preferred: Verdict;
      mustMention?: string[];
      shouldMention?: string[];
    }
  >;
}

export interface ControlExpectation {
  control: string;
  notes?: string;
  attributes: AttributeExpectation[];
  sampleChecks?: Record<string, { mustMention?: string[]; shouldMention?: string[] }>;
}

export interface MentionOutcome {
  pattern: string;
  found: boolean;
  required: boolean;
}

export interface AttributeGrade {
  sample: string;
  attributeId: string;
  attributeText: string;
  verdict: Verdict | null;
  preferred: Verdict;
  accept: Verdict[];
  acceptable: boolean;
  strict: boolean;
  mentions: MentionOutcome[];
}

export interface ControlGrade {
  control: string;
  attributes: AttributeGrade[];
  sampleMentions: { sample: string; mentions: MentionOutcome[] }[];
  /** Expectations that matched no attribute in the plan (a grading problem, not a model one). */
  unmatchedExpectations: string[];
  totals: {
    verdictsAcceptable: number;
    verdictsStrict: number;
    verdictsTotal: number;
    requiredMentionsFound: number;
    requiredMentionsTotal: number;
  };
}

export function gradeReport(report: RunReport, expectation: ControlExpectation): ControlGrade {
  const attributes: AttributeGrade[] = [];
  const unmatched: string[] = [];

  for (const expected of expectation.attributes) {
    const regex = new RegExp(expected.match, "i");
    const planAttr = report.control.testPlan.attributes.find((a) => regex.test(a.text));
    if (!planAttr) {
      unmatched.push(expected.match);
      continue;
    }
    for (const [sampleName, want] of Object.entries(expected.samples)) {
      const sample = report.samples.find((s) => s.sample === sampleName);
      const assessed = sample?.assessment?.attributes.find((a) => a.attributeId === planAttr.id);
      const verdict = assessed?.verdict ?? null;
      const attributeCorpus = assessed ? JSON.stringify(assessed) : "";
      const mentions = [
        ...(want.mustMention ?? []).map((pattern) => check(pattern, attributeCorpus, true)),
        ...(want.shouldMention ?? []).map((pattern) => check(pattern, attributeCorpus, false)),
      ];
      attributes.push({
        sample: sampleName,
        attributeId: planAttr.id,
        attributeText: planAttr.text,
        verdict,
        preferred: want.preferred,
        accept: want.accept,
        acceptable: verdict !== null && want.accept.includes(verdict),
        strict: verdict === want.preferred,
        mentions,
      });
    }
  }

  const sampleMentions: ControlGrade["sampleMentions"] = [];
  for (const [sampleName, checks] of Object.entries(expectation.sampleChecks ?? {})) {
    const sample = report.samples.find((s) => s.sample === sampleName);
    const corpus = sample?.assessment ? JSON.stringify(sample.assessment) : "";
    sampleMentions.push({
      sample: sampleName,
      mentions: [
        ...(checks.mustMention ?? []).map((pattern) => check(pattern, corpus, true)),
        ...(checks.shouldMention ?? []).map((pattern) => check(pattern, corpus, false)),
      ],
    });
  }

  const allMentions = [
    ...attributes.flatMap((a) => a.mentions),
    ...sampleMentions.flatMap((s) => s.mentions),
  ];
  return {
    control: expectation.control,
    attributes,
    sampleMentions,
    unmatchedExpectations: unmatched,
    totals: {
      verdictsAcceptable: attributes.filter((a) => a.acceptable).length,
      verdictsStrict: attributes.filter((a) => a.strict).length,
      verdictsTotal: attributes.length,
      requiredMentionsFound: allMentions.filter((m) => m.required && m.found).length,
      requiredMentionsTotal: allMentions.filter((m) => m.required).length,
    },
  };
}

function check(pattern: string, corpus: string, required: boolean): MentionOutcome {
  return { pattern, found: new RegExp(pattern, "i").test(corpus), required };
}
