import { z } from "zod";

/**
 * The shared contract of the system: what the agent must produce, and the
 * shape of everything we persist. Tool inputs are zod schemas so the model's
 * submissions are validated at the boundary and rejected with actionable
 * errors; the same schemas generate the JSON Schema sent to the API.
 */

export const VERDICTS = ["SUCCESS", "FAIL", "FURTHER_EVIDENCE_REQUIRED"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const VerdictSchema = z.enum(VERDICTS);

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/**
 * A citation. `source` is an evidence id (E1, E2, ...) or an analysis id
 * (Q1, Q2, ...) issued by the harness; anything else is rejected, so every
 * citation in the output points at something that actually exists.
 */
export const EvidenceRefSchema = z.strictObject({
  source: z
    .string()
    .describe("Evidence id (e.g. 'E1') or analysis id (e.g. 'Q2') this fact comes from"),
  locator: z
    .string()
    .nullable()
    .describe(
      "Where inside the source: for workbooks 'sheet:<name>' or 'sheet:<name>!<range>', " +
        "for images 'tile:<n>' or a described region, for analyses null"
    ),
  observation: z.string().describe("The specific fact observed at this location, quoted or stated"),
});
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

export const ExceptionSchema = z.strictObject({
  title: z.string().describe("Short name for the exception, e.g. 'Terminated user retains access'"),
  detail: z.string().describe("What the deviation is, who/what it affects, and why it matters"),
  severity: z.enum(["high", "medium", "low"]),
  evidence: z.array(EvidenceRefSchema).describe("Citations proving the exception"),
});
export type AuditException = z.infer<typeof ExceptionSchema>;

export const EvidenceRequestSchema = z.strictObject({
  artifact: z.string().describe("The specific document/export/record needed"),
  purpose: z.string().describe("What conclusion this artifact would enable"),
  likelySource: z.string().describe("System or party that can produce it"),
});
export type EvidenceRequest = z.infer<typeof EvidenceRequestSchema>;

export const AttributeAssessmentSchema = z.strictObject({
  attributeId: z.string().describe("Id from the approved test plan, e.g. 'A1'"),
  verdict: VerdictSchema,
  confidence: ConfidenceSchema,
  summary: z.string().describe("One or two sentences stating the conclusion"),
  reasoning: z
    .string()
    .describe(
      "Full audit rationale (markdown): what was tested, what the evidence shows, " +
        "how judgment calls were resolved. Reference citations inline as [E1], [Q2]."
    ),
  evidence: z
    .array(EvidenceRefSchema)
    .describe("Citations supporting the verdict. Required for SUCCESS and FAIL."),
  exceptions: z
    .array(ExceptionSchema)
    .describe("Control deviations found. Must be non-empty when verdict is FAIL."),
  furtherEvidenceRequired: z
    .array(EvidenceRequestSchema)
    .describe("Must be non-empty when verdict is FURTHER_EVIDENCE_REQUIRED, empty otherwise"),
});
export type AttributeAssessment = z.infer<typeof AttributeAssessmentSchema>;

export const ReperformanceSchema = z.strictObject({
  procedure: z.string().describe("What was independently reperformed"),
  recordedResult: z.string().describe("The result the original performer recorded"),
  reperformedResult: z.string().describe("The result of the independent reperformance"),
  agreement: z.enum(["agrees", "disagrees", "partially_agrees"]),
  detail: z.string().describe("Explanation of any delta, with citations as [Qn]/[En]"),
});
export type Reperformance = z.infer<typeof ReperformanceSchema>;

export const ObservationSchema = z.strictObject({
  title: z.string(),
  detail: z
    .string()
    .describe("A noteworthy finding outside the strict scope of the control attributes"),
  evidence: z.array(EvidenceRefSchema),
});
export type Observation = z.infer<typeof ObservationSchema>;

export const SubmitAssessmentSchema = z.strictObject({
  attributes: z
    .array(AttributeAssessmentSchema)
    .describe("Exactly one entry per attribute in the approved test plan"),
  reperformance: z
    .array(ReperformanceSchema)
    .describe("Populated when the evidence allowed independent reperformance; else empty"),
  observations: z
    .array(ObservationSchema)
    .describe("Findings worth reporting that no attribute verdict depends on; else empty"),
  conclusion: z
    .string()
    .describe("Overall conclusion for this sample in 2-5 sentences, auditor voice"),
});
export type SubmitAssessment = z.infer<typeof SubmitAssessmentSchema>;

export const PlanAttributeSchema = z.strictObject({
  id: z.string().describe("Sequential id: 'A1', 'A2', ..."),
  text: z.string().describe("The attribute exactly as written in the control documentation"),
  interpretation: z
    .string()
    .describe("What must be true, in testable terms; note ambiguities and how you resolve them"),
  procedures: z
    .array(z.string())
    .describe("Concrete test steps mapped to the kinds of evidence in the inventory"),
});

export const SubmitTestPlanSchema = z.strictObject({
  controlSummary: z.string().describe("The control's objective in your own words, 1-3 sentences"),
  attributes: z.array(PlanAttributeSchema).describe("Every control attribute found in the docs"),
  evidenceConsiderations: z
    .string()
    .describe(
      "Reliability and completeness considerations: which evidence is independent vs " +
        "self-reported, what corroboration or reperformance the data permits"
    ),
});
export type TestPlan = z.infer<typeof SubmitTestPlanSchema>;

export const RecordEvidenceSchema = z.strictObject({
  notes: z
    .array(
      z.strictObject({
        source: z.string().describe("Evidence id (En) or analysis id (Qn)"),
        locator: z.string().nullable(),
        fact: z.string().describe("One extracted fact, stated precisely"),
      })
    )
    .describe("Extraction notes tying facts to their sources"),
});
export type RecordEvidence = z.infer<typeof RecordEvidenceSchema>;

export const OpenEvidenceSchema = z.strictObject({
  evidenceId: z.string().describe("The evidence id to open, e.g. 'E1'"),
});

export const QueryDataSchema = z.strictObject({
  goal: z.string().describe("What this analysis establishes, in one sentence"),
  code: z
    .string()
    .describe(
      "JavaScript to run in the sandbox. Globals: `tables` (parsed tabular evidence), " +
        "`helpers` (norm, parseDate, businessDaysBetween). The value of the final " +
        "expression (or an explicit `return` inside the implicit function) is the result; " +
        "it must be JSON-serialisable. console.log output is captured."
    ),
});

export const ReviewChallengeSchema = z.strictObject({
  attributeId: z.string().describe("The attribute whose assessment is challenged"),
  severity: z
    .enum(["blocking", "note"])
    .describe(
      "'blocking' = the verdict or a load-bearing fact cannot stand as submitted; " +
        "'note' = worth recording but the verdict survives"
    ),
  challenge: z.string().describe("What is wrong or unsupported, stated precisely enough to act on"),
  evidence: z
    .array(EvidenceRefSchema)
    .describe("Citations backing the challenge (may include your own analyses)"),
});
export type ReviewChallenge = z.infer<typeof ReviewChallengeSchema>;

export const SubmitReviewSchema = z.strictObject({
  confirmed: z
    .array(z.string())
    .describe("Attribute ids whose verdict and reasoning withstand the review"),
  challenges: z.array(ReviewChallengeSchema).describe("Empty when everything withstands review"),
  summary: z.string().describe("The reviewer's overall conclusion in 1-3 sentences"),
});
export type SubmitReview = z.infer<typeof SubmitReviewSchema>;

export const QualityReviewSchema = z.object({
  review: SubmitReviewSchema,
  revised: z.boolean(),
  /** Present when a blocking challenge triggered a revision. */
  resolution: z.string().nullable(),
});
export type QualityReview = z.infer<typeof QualityReviewSchema>;

/** ----- Persisted run output (validated before writing) ----- */

export const EvidenceMetaSchema = z.object({
  id: z.string(),
  file: z.string(),
  sha256: z.string(),
  mediaType: z.string(),
  bytes: z.number(),
  shared: z.boolean(),
});
export type EvidenceMeta = z.infer<typeof EvidenceMetaSchema>;

export const UsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  modelCalls: z.number(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const SampleResultSchema = z.object({
  sample: z.string(),
  status: z.enum(["assessed", "error"]),
  evidence: z.array(EvidenceMetaSchema),
  assessment: SubmitAssessmentSchema.nullable(),
  qualityReview: QualityReviewSchema.nullable(),
  error: z.string().nullable(),
  usage: UsageSchema,
  toolCalls: z.number(),
  durationMs: z.number(),
});
export type SampleResult = z.infer<typeof SampleResultSchema>;

export const RunReportSchema = z.object({
  tool: z.object({ name: z.literal("attest"), version: z.string() }),
  run: z.object({
    id: z.string(),
    startedAt: z.string(),
    finishedAt: z.string(),
    model: z.string(),
    effort: z.string(),
    usage: UsageSchema,
  }),
  control: z.object({
    name: z.string(),
    folder: z.string(),
    documents: z.array(z.object({ file: z.string(), sha256: z.string() })),
    testPlan: SubmitTestPlanSchema,
  }),
  samples: z.array(SampleResultSchema),
  summary: z.object({
    verdicts: z.record(z.string(), z.record(z.string(), VerdictSchema)),
    exceptionCount: z.number(),
    evidenceRequestCount: z.number(),
  }),
});
export type RunReport = z.infer<typeof RunReportSchema>;
