# Test of Control — user-access-review

User access to in-scope systems is reviewed on a periodic basis by an appropriate system/data owner to confirm that only authorised individuals retain access appropriate to their role, and any inappropriate or excessive access identified is remediated in a timely manner. This sample tests a Q2 2026 NetSuite user access review.

| | |
|---|---|
| Control folder | `user-access-review` |
| Performed by | attest veval (claude-opus-4-8, effort high) |
| Run | /home/ubuntu/bead/challenge/src/eval-results/2026-07-06T09-47-32-193Z/trial-1/user-access-review, 2026-07-06T10:00:14.800Z → 2026-07-06T10:00:14.800Z |
| Tokens | 26 in / 25,870 out (cache: 159,699 read) across 13 model calls |

Machine-readable results: `assessment.json`. Full trail of every model call, analysis and validation: `decision-log/`.

## 1. Control documentation
- `control.md` — sha256 `f24f6997a29f47dc3651deee460df64886e35f81854901246099986d576d693c`

## 2. Test plan

### A1 — Access reviews are performed on a periodic basis (e.g. quarterly)

*Interpretation:* The review must be performed within the defined period and dated within it. The parenthetical 'e.g. quarterly' is an example, not a fixed mandate; the operative requirement is that reviews are periodic. For this sample (labelled Q2 2026), I will confirm the review pertains to and was performed during/around the Q2 2026 period and that review dates fall within a reasonable window for that quarter. Ambiguity: exact required cadence/deadline is not specified in the control; I will treat evidence of a dated Q2 review as satisfying periodicity and note if timing is unclear.

*Procedures:*
1. Open E2 Cover sheet to identify the review period, system in scope, and stated performance/completion dates.
1. Query E2 'Access Review' sheet Review Date column to establish min/max/distribution of review dates and confirm they fall within the Q2 2026 window.
1. Compare the review period on the Cover with the review dates to confirm the review corresponds to the stated period.

### A2 — Access is reviewed and approved by an appropriate system or data owner

*Interpretation:* Every in-scope user account must be reviewed and an approval/decision recorded, and the reviewer(s) must be an appropriate system or data owner (i.e. have authority over the NetSuite system/data). Testable: (a) each account has a Reviewer Decision and a named Reviewer; (b) the reviewer(s) identity indicates an appropriate owner; (c) reviewer's own access, if in scope, is not solely self-reviewed by that person for their own account. Ambiguity: 'appropriate owner' not named in control — I will assess via Cover sheet designation of the review owner and reviewer names, and corroborate against HRIS role/title.

*Procedures:*
1. Open E2 Cover and Summary sheets to identify who owns/approved the review and their title/role.
1. Query E2 'Access Review' to count records with a populated Reviewer Decision and populated Reviewed By, and identify blanks.
1. Query distinct 'Reviewed By' values and their decision counts to identify the reviewer population.
1. Corroborate reviewer identity/authority against E1 HRIS export (Job Title, Department, Employment Status) by matching reviewer email/name.
1. Check whether any reviewer reviewed their own account (Reviewed By email equals the record's Email).

### A3 — Inappropriate or excessive access identified during the review is remediated in a timely manner

*Interpretation:* For every account flagged during the review as inappropriate/excessive (e.g. Reviewer Decision = revoke/remove/modify, or comments indicating action needed), remediation must have been performed and evidenced, in a timely manner. Testable: identify all 'flagged' decisions; confirm each has evidence of remediation (e.g. Account Status now inactive/disabled, or a completion note) within a reasonable timeframe. Ambiguity: 'timely' undefined — I will assess relative to review date and any SLA stated on Cover/Summary, and flag if no remediation evidence exists.

*Procedures:*
1. Query E2 'Access Review' to identify all records whose Reviewer Decision is anything other than a clean 'keep/retain/approve' (e.g. revoke, remove, modify, disable, terminate).
1. For each flagged record, cross-reference E2 'System Access Export' Account Status to see whether access was disabled/removed.
1. Cross-reference flagged/removed users against E1 HRIS Employment Status and Termination Date to validate the review decisions and identify terminated employees still active.
1. Compare flagged users' terminations/decisions against review/provisioning dates to assess remediation timeliness.
1. Read E2 Cover and Summary & Observations sheets for any remediation tracking, deadlines, or open items.
1. Reconcile the E2 System Access Export population (334) against E1 active NetSuite-relevant employees to detect accounts not reviewed or belonging to terminated staff.

*Evidence considerations:* E2 is the review workpaper itself and contains self-reported assertions on the Cover, Summary, Access Review decisions, and sign-offs — these are management representations and rank below system-generated data. The 'System Access Export' sheet (Account Status, Last Login, Date Provisioned, MFA) is closer to system-generated and can corroborate or contradict reviewer decisions and remediation. E1 (HRIS export) is an independent-of-NetSuite source that lets me test whether reviewed users are current employees, whether terminated staff retain access, and whether the reviewer holds an appropriate role/title. Key reperformance opportunities: (1) join Access Review vs System Access Export on Email to confirm all provisioned accounts were reviewed and none extra; (2) join both against E1 HRIS to find terminated-but-active accounts and validate revoke decisions; (3) recompute completeness of decisions/sign-offs; (4) recompute review-date range vs the stated quarter; (5) check self-review by comparing Reviewed By against account owner. Watch for the count discrepancy (334 access rows vs 720 HRIS employees), hidden Notes cells in E1, and any formula/total mismatches on the Cover/Summary sheets.

## 3. Results summary

| Sample | A1 | A2 | A3 |
|---|---|---|---|
| sample-1 | ✅ SUCCESS | ✅ SUCCESS | ❌ FAIL |

## Sample: sample-1

### Evidence register

| Id | File | Type | Size | SHA-256 |
|---|---|---|---|---|
| E1 | `hris-employee-export.xlsx` | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet | 60,772 B | `c36956c06dc841a1…` |
| E2 | `uar-netsuite-q2-2026.xlsx` | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet | 42,432 B | `4bdb491f51e4152b…` |

### A1 — ✅ SUCCESS (confidence: high)

**The NetSuite Q2 2026 access review was performed on a quarterly cadence and all decisions are dated 2026-06-30, within the Q2 2026 period.**

The Cover identifies the engagement as a 'Periodic (Quarterly) User Access Review' for NetSuite (Production), Review Period Q2 2026, with Review Completed 2026-06-30 and an electronic sign-off dated 2026-06-30 [E2 sheet:Cover]. All 334 Access Review records carry a single Review Date of 2026-06-30, which falls within the Q2 2026 quarter (Apr-Jun 2026) [Q1]. Both the NetSuite access source and the independent Workday roster were exported 26 Jun 2026 [E2 sheet:Cover!B9-B10], consistent with a quarter-end review. The control does not fix an exact cadence beyond 'periodic (e.g. quarterly)'; a dated Q2 review completed at quarter-end satisfies the periodicity requirement.

**Evidence:**

| Source | Location | Observation |
|---|---|---|
| E2 | sheet:Cover | Review Period = Q2 2026; Review Type = Periodic (Quarterly) User Access Review; Review Completed 2026-06-30; sign-off 2026-06-30. |
| Q1 | — | All 334 Access Review records have Review Date 2026-06-30. |

### A2 — ✅ SUCCESS (confidence: medium)

**Every in-scope account was reviewed and a decision recorded, and the review was approved by the designated NetSuite system owner (Priya Nadkarni, Director, Finance Systems); no self-review occurred.**

All 334 accounts have a populated Reviewer Decision and a named reviewer with no blanks [Q1]. The sole reviewer/approver is Priya Nadkarni, designated on the Cover as 'Director, Finance Systems (System Owner)', with an electronic approval sign-off dated 2026-06-30 [E2 sheet:Cover]. A NetSuite system access review approved by the NetSuite system owner is an appropriate owner for the system/data in scope. No self-review risk exists: Priya Nadkarni holds no NetSuite account in the export [Q3]. I could not independently corroborate her title/authority because she does not appear in the HRIS export [Q3]; the appropriateness rests on the Cover's designation (a management representation). Given the system-owner designation and the absence of a self-review conflict, the attribute is met, though the inability to corroborate the reviewer's role via an independent source lowers confidence and is noted as an observation. Note: the reviewer's decisions were not uniformly accurate (see A3), but that is a remediation/effectiveness matter rather than a question of whether an appropriate owner performed and approved the review.

**Evidence:**

| Source | Location | Observation |
|---|---|---|
| Q1 | — | All 334 records have a populated Reviewer Decision and Reviewed By = Priya Nadkarni; no blanks. |
| E2 | sheet:Cover | Reviewer/Approver = Priya Nadkarni, Director, Finance Systems (System Owner); approved electronically 2026-06-30. |
| Q3 | — | Priya Nadkarni holds no NetSuite account (no self-review) and does not appear in the HRIS export. |

### A3 — ❌ FAIL (confidence: high)

**Independent reperformance found 2 terminated employees retaining ACTIVE NetSuite access, but the review identified and remediated only 1; a terminated user (Kevin Lewis) was affirmatively marked 'Retain' and his access was neither identified nor remediated.**

The control requires inappropriate/excessive access identified in the review to be remediated in a timely manner, and the review's stated objective was to reconcile access to the Workday roster. Reperforming that reconciliation over the full in-scope population, I joined all in-scope NetSuite accounts to the HRIS export and found TWO terminated workers with ACTIVE NetSuite access [Q3]: Danielle Goodwin (terminated 2021-12-03) and Kevin Lewis (terminated 2021-07-26). The review only flagged one. Danielle Goodwin was correctly identified, marked 'Revoke', and remediation initiated via ticket ITSM-48217 (due within 5 business days) [E2 sheet:Summary & Observations!B10-B12], though her account remained Active in the source export with a last login of 2026-06-14 [Q5], so completion of deprovisioning is not yet evidenced. Kevin Lewis, however, was marked 'Retain' with the comment 'Confirmed with line manager - access still required.' [Q4], directly contradicting HRIS which shows him terminated 2021-07-26; his account is still Active with a last login of 2026-06-04 [Q5]. This is inappropriate access to a production financial system by a terminated individual that the review failed to identify and did not remediate. The Summary's assertion that 'All other in-scope accounts reconciled to active/on-leave workers with no exceptions' and the conclusion of 'one noted exception' [E2 sheet:Summary & Observations!B10-B12] are contradicted by my reperformance. Because a recorded conclusion is contradicted by reperformance and inappropriate access exists that was not remediated, this is a deviation. (The 12 Inactive accounts all correctly map to terminated workers, confirming deprovisioning worked for those [Q5]; the 8 'On Leave' active accounts are legitimate and not exceptions.)

**Evidence:**

| Source | Location | Observation |
|---|---|---|
| Q3 | — | Two Terminated HRIS workers retain ACTIVE NetSuite access: Danielle Goodwin (term 2021-12-03) and Kevin Lewis (term 2021-07-26). |
| Q4 | — | Kevin Lewis (A/P Clerk, terminated 2021-07-26) received Reviewer Decision 'Retain' with comment 'Confirmed with line manager - access still required.' |
| Q5 | — | Kevin Lewis account Active, last login 2026-06-04; Danielle Goodwin account Active, last login 2026-06-14; all 12 Inactive accounts map to Terminated workers. |
| E2 | sheet:Summary & Observations!B10-B12 | Only Danielle Goodwin flagged; states all other accounts reconciled with no exceptions; conclusion 'Control operating with one noted exception.' |

> **Exception (high): Terminated employee retains active access, not identified or remediated**
> Kevin Lewis (kevin.lewis@northpeakfinancial.com, A/P Clerk) was terminated in HRIS on 2021-07-26 yet retains ACTIVE NetSuite (Production) access with a last login of 2026-06-04 [Q3][Q4][Q5]. The reviewer marked the account 'Retain' with the comment 'Confirmed with line manager - access still required.' [Q4], which is contradicted by the independent Workday roster. This inappropriate access (~4.9 years post-termination) was neither identified during the review nor remediated, and no remediation ticket exists for it, undermining the control's purpose of ensuring only authorised individuals retain access.
> - [Q4] Kevin Lewis marked 'Retain' despite HRIS termination 2021-07-26.
> - [Q5] Kevin Lewis account Active, last login 2026-06-04.

> **Exception (medium): Identified revocation not evidenced as completed**
> Danielle Goodwin (terminated 2021-12-03) was correctly flagged for revocation with ticket ITSM-48217 raised (due within 5 business days) [E2 sheet:Summary & Observations!B10-B12], but her NetSuite account is still Active in the source export with a last login of 2026-06-14 [Q5]. Remediation was initiated but its completion is not evidenced; the only support is a raised ticket, a self-reported assertion. Timeliness is also poor given access persisted ~4.5 years after termination before detection.
> - [E2 @ sheet:Summary & Observations!B10] Danielle Goodwin flagged; ticket ITSM-48217 raised, due within 5 business days.
> - [Q5] Danielle Goodwin account still Active, last login 2026-06-14.

### Reperformance

| Procedure | Recorded result | Reperformed result | Agreement |
|---|---|---|---|
| Independently reconciled all in-scope NetSuite accounts (334, less 2 out-of-scope service accounts) against the HRIS/Workday export by email to identify terminated or otherwise non-active workers retaining active NetSuite access. | Review recorded 1 exception: only Danielle Goodwin identified as terminated-but-active; 'All other in-scope accounts reconciled to active/on-leave workers with no exceptions.' | Found 2 terminated workers with ACTIVE NetSuite access: Danielle Goodwin (term 2021-12-03) and Kevin Lewis (term 2021-07-26). Kevin Lewis was marked 'Retain' and not flagged. | disagrees |
| Verified completeness of review decisions, reviewer population, review dating, and Access Review vs System Access Export population reconciliation. | 332 in-scope accounts reviewed (331 Retain, 1 Revoke), 2 service accounts out of scope, reviewed by Priya Nadkarni, completed 2026-06-30. | Confirmed: 334 records each fully populated (331 Retain, 1 Revoke, 2 N/A-Out of Scope), all reviewed by Priya Nadkarni, all dated 2026-06-30; populations reconcile fully with no orphan accounts. | agrees |

- **Independently reconciled all in-scope NetSuite accounts (334, less 2 out-of-scope service accounts) against the HRIS/Workday export by email to identify terminated or otherwise non-active workers retaining active NetSuite access.** — The review missed one terminated-but-active account. Kevin Lewis [Q3][Q4] is terminated per HRIS (2021-07-26) yet Active in NetSuite with last login 2026-06-04 [Q5], and was incorrectly retained. The 12 Inactive accounts all correctly map to terminated workers and the 8 On-Leave active accounts are legitimate [Q3][Q5], so the sole delta is Kevin Lewis.

### Observations (outside attribute scope)

- **Reviewer's authority could not be independently corroborated** — The reviewer/approver Priya Nadkarni is designated on the Cover as Director, Finance Systems (System Owner) [E2 sheet:Cover] but does not appear in the HRIS/Workday export [Q3], so her role and employment could not be independently corroborated. Appropriateness of the approver rests solely on the workpaper's self-designation.
  - [E2 @ sheet:Cover] Reviewer/Approver = Priya Nadkarni, Director, Finance Systems (System Owner).
  - [Q3] Priya Nadkarni does not appear in the HRIS export.
- **Terminated users continued logging into NetSuite post-termination** — Both terminated-but-active accounts show recent logins (Kevin Lewis 2026-06-04; Danielle Goodwin 2026-06-14) [Q5], indicating live use of production financial system access years after termination (2021-07-26 and 2021-12-03 respectively), which elevates the risk from these access gaps.
  - [Q5] Kevin Lewis last login 2026-06-04; Danielle Goodwin last login 2026-06-14.

### Engagement quality review

An independent review session re-examined the evidence and attempted to refute this assessment.

> All three verdicts withstand review. A1 (SUCCESS) and A2 (SUCCESS) are fully corroborated by independent re-derivation (complete, quarter-end-dated decisions; single designated system owner; no self-review; reviewer appropriately not corroborable in HRIS). A3 (FAIL) is correct and well-supported: reperformance confirms two terminated-but-active accounts where the review flagged only one, with Kevin Lewis affirmatively retained. The sole recorded item is a note: A3's secondary exception on Danielle Goodwin infers a remediation failure from an export (26 Jun) that predates the review/ticket (30 Jun), which the evidence does not support — this does not disturb the FAIL verdict.

**Withstood review:** A1, A2

> **Challenge (note) — A3:** The A3 FAIL verdict is sound and rests firmly on Kevin Lewis (terminated 2021-07-26, marked 'Retain', account Active with last login 2026-06-04, not identified or remediated). However, the secondary exception concerning Danielle Goodwin overstates the evidence for a remediation-completion/timeliness deviation. The NetSuite access export was pulled 26 Jun 2026, whereas the review was completed and remediation ticket ITSM-48217 was raised on 30 Jun 2026 — the export predates the ticket by four days. Danielle Goodwin's account therefore necessarily still shows 'Active' in that export, so the observation 'still Active in the source export ... so completion of deprovisioning is not yet evidenced' cannot demonstrate a failed or untimely remediation; the export simply cannot reflect any post-review deprovisioning. For the identified item, remediation was ticketed with a 5-business-day SLA and no breach is evidenced, so no proven remediation-timeliness deviation exists for Danielle Goodwin. The '~4.5 years' framing also conflates the historical access gap with remediation timeliness (which runs from identification). The verdict survives on Kevin Lewis regardless.
> - [E2 @ sheet:Cover] Source of Access = 'NetSuite > Setup > Users/Roles export (26 Jun 2026)' (B9); Review Completed = 2026-06-30 (B13).
> - [E2 @ sheet:Summary & Observations] Danielle Goodwin flagged for immediate revocation; deprovisioning ticket ITSM-48217 raised, due within 5 business days (B10).
> - [R3] Danielle Goodwin appears Active with last login 2026-06-14 in the export — an export dated 26 Jun 2026, i.e. before the 30 Jun review completion and ticket, so it cannot evidence non-completion of remediation.

### Conclusion

The Q2 2026 NetSuite user access review was performed on a quarterly basis and completed 2026-06-30 (A1 SUCCESS), and every in-scope account was reviewed and approved by the designated NetSuite system owner with no self-review (A2 SUCCESS, medium confidence as the reviewer could not be corroborated in HRIS). However, remediation of inappropriate access fails (A3 FAIL): independent reconciliation to the Workday roster identified two terminated employees retaining active access, but the review flagged only one; Kevin Lewis (terminated 2021-07-26) was incorrectly marked 'Retain' and his access was neither identified nor remediated, contradicting the workpaper's 'no other exceptions' conclusion. The one identified item (Danielle Goodwin) has a remediation ticket but no evidence of completed deprovisioning. The control is not operating effectively for the remediation attribute.
