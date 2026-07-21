# Test of Control — emergency-change-approval

Emergency changes deployed to production outside the standard change window must be logged, retrospectively approved by the Change Advisory Board (CAB), and supported by post-implementation testing evidence — so that unauthorised or defective changes do not persist in production unnoticed.

| | |
|---|---|
| Control folder | `emergency-change-approval` |
| Performed by | attest veval (claude-opus-4-8, effort high) |
| Run | /home/ubuntu/bead/challenge/src/eval-results/2026-07-06T09-47-32-193Z/trial-1/emergency-change-approval, 2026-07-06T10:02:56.214Z → 2026-07-06T10:02:56.214Z |
| Tokens | 20 in / 12,181 out (cache: 80,838 read) across 10 model calls |

Machine-readable results: `assessment.json`. Full trail of every model call, analysis and validation: `decision-log/`.

## 1. Control documentation
- `control.md` — sha256 `51b8684688676affb18bb4906f8cca3d071f007675331d5c848fc96be7b8bfc3`

## 2. Test plan

### A1 — Every emergency change is recorded as a ticket in the emergency change log

*Interpretation:* Each emergency change in scope must appear as a distinct ticket/record in the emergency change log with a Change ID. Testable: every emergency-severity change in the population has a Change ID row in the change log (E2). Ambiguity: which severities count as 'emergency' — resolve by filtering on the Severity column for emergency/critical designations and treating those as in-scope emergency changes.

*Procedures:*
1. Open E2 (changes-q2-2026.csv) and inspect the Severity column to identify which records are emergency changes.
1. Use query_data over tables["E2"]["data"] to count total records and count of emergency-severity records, and verify each emergency change has a non-blank Change ID.
1. Confirm no emergency change is missing a ticket/Change ID entry.

### A2 — Retrospective CAB approval is obtained within 5 business days of deployment

*Interpretation:* For each emergency change, a CAB approval must exist and be dated no more than 5 business days after the Deployed At date. Testable: Retro Approval Date minus Deployed At <= 5 business days, corroborated by an independent CAB approval record (E1 mailbox). Ambiguity: '5 business days' excludes weekends/holidays — compute business-day difference, exclude weekends (holidays unknown, note as assumption).

*Procedures:*
1. Query E2 for Deployed At, Retro Approval Date, and Approved By for each emergency change.
1. Compute the business-day gap between Deployed At and Retro Approval Date for each emergency change via query_data.
1. Flag any change where the gap exceeds 5 business days, or where Retro Approval Date/Approved By is blank.
1. Corroborate each recorded approval against the independent CAB approvals mailbox (E1): match Change ID, approver, and date; note any approval in the log not evidenced in the mailbox or vice versa.

### A3 — Post-implementation testing evidence is retained for every emergency change

*Interpretation:* Each emergency change must have retained post-implementation test evidence, indicated by a non-blank, meaningful entry in the 'Post-Implementation Test Evidence' column (and ideally a reference to an artifact). Testable: no emergency change has a blank/placeholder test-evidence field.

*Procedures:*
1. Query E2 for the Post-Implementation Test Evidence column for each emergency change.
1. Identify any emergency change with a blank, 'N/A', 'pending', or otherwise non-substantive test-evidence entry via query_data.
1. Where the field references an artifact, note whether the reference is corroborated by any other evidence in the set (E1); flag self-reported-only entries.

*Evidence considerations:* E2 (changes-q2-2026.csv) is the change log itself — largely self-reported/system-of-record data whose Retro Approval Date, Approved By, and Post-Implementation Test Evidence fields are entered by change performers, so they warrant corroboration. E1 (cab-approvals-mailbox.txt) is a semi-independent source: CAB approval emails can corroborate or contradict the Retro Approval Date and Approved By recorded in E2. Cross-checking E2 against E1 is the key reliability test — approvals recorded in the log but absent from the mailbox (or dated inconsistently) are deviations. Business-day gap calculations must be computed, not eyeballed; public-holiday calendar is unknown and will be stated as an assumption. Post-implementation test evidence is only referenced in the log; absent a linked artifact it is self-reported and its retention can only be confirmed at the reference level from the evidence provided.

## 3. Results summary

| Sample | A1 | A2 | A3 |
|---|---|---|---|
| sample-1 | ❌ FAIL | ❌ FAIL | ❌ FAIL |

## Sample: sample-1

### Evidence register

| Id | File | Type | Size | SHA-256 |
|---|---|---|---|---|
| E1 | `cab-approvals-mailbox.txt` | text/plain | 2,519 B | `fbc3970f0fc896dc…` |
| E2 | `changes-q2-2026.csv` | text/csv | 1,357 B | `d907e985d85134ed…` |

### A1 — ❌ FAIL (confidence: high)

**The emergency change log omits at least one emergency change: CHG-2111, which the CAB retrospectively approved but which does not appear in E2.**

The population of emergency changes is the emergency change log E2, which holds 10 records (CHG-2101 to CHG-2110), each with a non-blank Change ID across severities P1/P2/P3 [Q1]. All emergency severities are treated as in-scope because the CAB approvals mailbox issues retrospective-approval emails for P1, P2 and P3 changes alike [E1]. On completeness, the mailbox evidences a further emergency change — CHG-2111 (payments gateway TLS certificate replacement, deployed 2026-06-19 by m.tan) — that the CAB approved on 2026-06-23, with the approver expressly noting 'I could not find this one in the emergency change log - please make sure it gets recorded' [E1]. CHG-2111 is confirmed absent from E2 [Q3]. An emergency change that occurred and was CAB-approved was therefore not recorded as a ticket in the log, so the attribute is not satisfied.

**Evidence:**

| Source | Location | Observation |
|---|---|---|
| Q1 | — | E2 has 10 records CHG-2101..CHG-2110, all with a non-blank Change ID. |
| E1 | CHG-2111 email 2026-06-23 | CAB approved CHG-2111 (deployed 2026-06-19); 'I could not find this one in the emergency change log - please make sure it gets recorded.' |
| Q3 | — | CHG-2111 is not present in E2 (ids run only CHG-2101..CHG-2110). |

> **Exception (high): Emergency change CHG-2111 not recorded in the change log**
> CHG-2111 (payments gateway TLS certificate replacement, deployed 2026-06-19 by m.tan) was retrospectively approved by the CAB on 2026-06-23 but is absent from the emergency change log E2. The approver herself flagged it was missing from the log. An unlogged emergency change defeats the completeness of the change record.
> - [E1 @ CHG-2111 email 2026-06-23] Approval of CHG-2111 with note it could not be found in the emergency change log.
> - [Q3] CHG-2111 absent from E2 population.

### A2 — ❌ FAIL (confidence: high)

**Two of ten logged emergency changes fail the 5-business-day retrospective approval requirement: CHG-2104 was approved 9 business days after deployment and CHG-2107 has no recorded or evidenced approval at all.**

For each logged change I computed the business-day gap between Deployed At and Retro Approval Date (weekends excluded; public holidays unknown and assumed none, which is conservative — including holidays would only lengthen gaps) [Q2]. CHG-2104 (deployed 2026-05-06, approved 2026-05-19) has a 9-business-day gap, exceeding the 5-day limit; the mailbox corroborates the date and the reason ('I was on leave and no delegate was assigned') [Q2][E1]. CHG-2107 (deployed 2026-06-03) has a blank Retro Approval Date and blank Approved By, and no corresponding approval email exists in the mailbox — i.e. no retrospective CAB approval was obtained at all [Q2][E1]. The remaining eight changes were approved within 2-5 business days, and every one of their recorded Retro Approval Dates matches an approval email in the mailbox exactly, providing independent corroboration [Q2][E1]. Because at least one change breached the 5-day window and one had no approval, the attribute is not satisfied.

**Evidence:**

| Source | Location | Observation |
|---|---|---|
| Q2 | — | CHG-2104: 9 business days deployed→retro (LATE); CHG-2107: Retro Approval Date and Approved By blank (MISSING); other 8 within 2-5 business days. |
| E1 | CHG-2104 email 2026-05-19 | 'Apologies for the delayed review - I was on leave and no delegate was assigned.' |
| E1 | mailbox | No approval email exists for CHG-2107; all other changes' recorded dates match a mailbox email. |

> **Exception (medium): CHG-2104 approved 9 business days after deployment (>5)**
> CHG-2104 (roll back faulty pricing config push) deployed 2026-05-06 was not retrospectively approved until 2026-05-19 — 9 business days later, exceeding the 5-business-day limit. Root cause per the CAB is an approver on leave with no delegate assigned.
> - [Q2] CHG-2104 gap = 9 business days.
> - [E1 @ CHG-2104 email 2026-05-19] Delayed review acknowledged; approver on leave, no delegate.

> **Exception (high): CHG-2107 has no retrospective CAB approval**
> CHG-2107 (disable failing fraud-scoring rule FS-114) deployed 2026-06-03 has a blank Retro Approval Date and blank Approved By in the log, and there is no corresponding approval email in the CAB mailbox. No retrospective approval was obtained.
> - [Q2] CHG-2107 Retro Approval Date and Approved By both null.
> - [E1 @ mailbox] No retrospective approval email for CHG-2107.

### A3 — ❌ FAIL (confidence: high)

**Post-implementation test evidence was not retained for CHG-2109, whose test-evidence field reads 'No' and whose CAB approval was conditioned on the still-missing evidence.**

I reviewed the Post-Implementation Test Evidence column for all 10 logged changes [Q3]. Nine records state 'Yes - attached to ticket'; these are self-reported entries with no linked artifact in the evidence set, so they can only be confirmed at the reference level. One record, CHG-2109, reads 'No' — a substantive negative indicating no test evidence was retained [Q3]. This is independently corroborated by the CAB mailbox, where the approval of CHG-2109 is 'conditional on the missing post-implementation test evidence being attached by end of week' [E1], confirming the evidence was not on hand. Because at least one emergency change lacks retained post-implementation testing evidence, the attribute is not satisfied.

**Evidence:**

| Source | Location | Observation |
|---|---|---|
| Q3 | — | CHG-2109 Post-Implementation Test Evidence = 'No'; all other 9 records = 'Yes - attached to ticket'. |
| E1 | CHG-2109 email 2026-06-18 | Approval 'conditional on the missing post-implementation test evidence being attached by end of week.' |

> **Exception (medium): No post-implementation test evidence for CHG-2109**
> CHG-2109 (deployed 2026-06-16) records 'No' in the Post-Implementation Test Evidence field, and the CAB approved it only conditionally on the missing test evidence being attached later. No test evidence was retained for this emergency change at the time of approval.
> - [Q3] CHG-2109 test-evidence field = 'No'.
> - [E1 @ CHG-2109 email 2026-06-18] Conditional approval pending missing post-implementation test evidence.

### Reperformance

| Procedure | Recorded result | Reperformed result | Agreement |
|---|---|---|---|
| Recomputed the business-day gap between Deployed At and Retro Approval Date for all 10 logged emergency changes and compared against the 5-business-day threshold, then cross-checked each recorded Retro Approval Date and approver against the independent CAB approvals mailbox (E1). | The log presents Retro Approval Dates/Approved By as though all changes were retrospectively approved (9 of 10 signed 'CAB (H. Ostrowski)'). | 8 of 10 changes were approved within 5 business days with dates that match the mailbox exactly; CHG-2104 took 9 business days (>5); CHG-2107 has no approval recorded and no mailbox email. Separately, emergency change CHG-2111 is approved in the mailbox but missing from the log. | partially_agrees |

- **Recomputed the business-day gap between Deployed At and Retro Approval Date for all 10 logged emergency changes and compared against the 5-business-day threshold, then cross-checked each recorded Retro Approval Date and approver against the independent CAB approvals mailbox (E1).** — Recorded approvals for 8 changes are corroborated by the mailbox [Q2][E1]. Deltas: CHG-2104 breaches the 5-day window [Q2]; CHG-2107 lacks any approval [Q2][E1]; CHG-2111 is an approved emergency change omitted from the log [E1][Q3].

### Observations (outside attribute scope)

- **Self-reported test-evidence entries lack linked artifacts** — Nine of ten changes state 'Yes - attached to ticket' for post-implementation testing, but no test artifacts are included in the evidence set, so retention can only be confirmed at the reference level. This is not a deviation of the attribute for those nine, but the assertions are uncorroborated. Where the mailbox does reference testing (e.g. CHG-2101 'test results reviewed', CHG-2108 'verified by the integrations team'), it lends limited support.
  - [Q3] Nine records read 'Yes - attached to ticket' with no artifact provided.
  - [E1 @ mailbox] Some emails reference testing having been reviewed/verified.

### Engagement quality review

An independent review session re-examined the evidence and attempted to refute this assessment.

> The assessment withstands review in full. I independently reproduced the E2 population (10 records, CHG-2101..CHG-2110), the business-day gaps, the blank approval, and the mailbox reconciliation. A1 FAIL is supported by an independently-evidenced unlogged emergency change (CHG-2111 in E1, absent from E2). A2 FAIL is supported by CHG-2104 (9 business days > 5) and CHG-2107 (no approval recorded or evidenced). A3 FAIL is supported by CHG-2109's "No" test-evidence entry, corroborated by the CAB's conditional approval. All computations, corroborations, and the doctrine (FAIL only on proven deviations) hold.

**Withstood review:** A1, A2, A3

### Conclusion

All three control attributes fail for this sample. The emergency change log (E2) omits emergency change CHG-2111, which the CAB approved on 2026-06-23 and which the approver flagged as unrecorded (A1). Retrospective approval timeliness fails on two changes — CHG-2104 (9 business days, exceeding the 5-day limit) and CHG-2107 (no approval recorded or evidenced anywhere) (A2). Post-implementation test evidence was not retained for CHG-2109, whose approval was itself conditioned on the still-missing evidence (A3). The remaining changes' recorded approval dates reconcile exactly to the independent CAB mailbox, but the exceptions above are sufficient to conclude the control did not operate effectively over this sample.
