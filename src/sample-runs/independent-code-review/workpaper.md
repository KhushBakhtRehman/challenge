# Test of Control — independent-code-review

Ensures the 4-eyes principle over code changes: every change merged to the main branch and released to production is reviewed and approved by an independent code reviewer (someone other than the author) before merge, and testing meets the organization's testing policy. This prevents any single individual from unilaterally pushing code to production.

| | |
|---|---|
| Control folder | `independent-code-review` |
| Performed by | attest veval (claude-opus-4-8, effort high) |
| Run | /home/ubuntu/bead/challenge/src/eval-results/2026-07-06T09-47-32-193Z/trial-1/independent-code-review, 2026-07-06T09:54:26.007Z → 2026-07-06T09:54:26.007Z |
| Tokens | 22 in / 29,396 out (cache: 109,704 read) across 11 model calls |

Machine-readable results: `assessment.json`. Full trail of every model call, analysis and validation: `decision-log/`.

## 1. Control documentation
- `control.md` — sha256 `b2e8fed5571bf98e22b6c35a374f7d8032ae9cc966a15b2ad4a44b20c451c43e`
- `testing-policy.md` — sha256 `b04d0136cd60b752004381d97f19b76095c99f963f90d4697abda350dc2566a0`

## 2. Test plan

### A1 — Code Reviews are performed prior to committing a change to the main branch

*Interpretation:* For the sampled change there must be a code review that occurred BEFORE the change was merged/committed to the main (default) branch. Testable: locate the pull request review event and the merge/commit event; confirm the review approval timestamp precedes the merge timestamp. Ambiguity: 'committing to main' — interpreted as the PR merge to the default/protected branch (main/master). Need PR review status plus merge status/timestamp.

*Procedures:*
1. Open the PR screenshot(s) for the sample and identify the merge event, target branch (main/master), and merge timestamp/commit SHA.
1. Open the commit screenshot to confirm the change landed on the main branch and capture the commit date.
1. Confirm a review/approval exists on the PR and that its timestamp precedes the merge; record ordering explicitly.
1. Note whether merge was blocked until review approval (branch protection / 'changes approved' status).

### A2 — Code Review approvals are performed by independent code reviewers

*Interpretation:* The reviewer who approved the change must be a different person than the author/committer of the change (independence / 4-eyes). Testable: identify the PR author and the approving reviewer(s); confirm they are distinct identities. A self-approval or a merge with no independent approver is a deviation.

*Procedures:*
1. From the PR screenshot, identify the author/opener of the pull request.
1. Identify who approved/reviewed the PR (reviewer names, 'approved these changes' events).
1. Compare author vs approver identities to confirm they are distinct individuals.
1. Confirm the approver is a genuine reviewer, not the same account performing the merge without review.

### A3 — Testing is performed in accordance with the testing policy

*Interpretation:* The change must satisfy the Testing Policy: automated test suites (unit/integration/e2e) pass in CI before merge, results visible in PR status checks, and coverage thresholds met (unit 80% line, branch 70%, function 80%; critical paths 100%) — unless the change qualifies for a documented policy exception (e.g., docs-only, refactoring verified by existing tests, dependency updates, build scripts). Testable: locate CI status checks on the PR showing tests passing and any coverage report; if coverage evidence is absent, assess whether an exception applies. Ambiguity: policy lists thresholds but evidence may only show pass/fail checks and a coverage report image; evaluate against what is demonstrable.

*Procedures:*
1. Open the coverage report image (if provided) and read the coverage percentages (line/branch/function); compare against policy thresholds.
1. Open the PR screenshot and read the CI/status checks section: identify which test suites ran and whether they passed before merge.
1. Assess whether the change type qualifies for a testing-policy exception (e.g., test-size reduction, config/build change, dependency bump) and document the basis.
1. Tie the observed CI/coverage evidence back to the specific policy requirements met or not demonstrated.

*Evidence considerations:* Evidence consists of GitHub screenshots (PR pages, commit pages, coverage report) — system-generated UI from an independent platform (GitHub), which is relatively reliable for author/reviewer identities, timestamps, merge status, and CI check results, but is a static screenshot that can be cropped and does not itself prove nothing was altered off-screen. Independence (A2) can be corroborated by comparing the PR author name against the approver name shown on the same PR page. Ordering for A1 can be checked by comparing review-approval timestamps to the merge/commit timestamps visible in the PR timeline and commit page. For A3, the coverage report (sample-1 E1) is independent CI output, but its linkage to the specific PR/commit must be verified (matching commit SHA/branch); sample-2 has no coverage report in the inventory, so coverage compliance may only be demonstrable via CI status checks or an applicable exception. No underlying tabular population is provided, so procedures rely on careful reading of the images rather than reperformance over a dataset.

## 3. Results summary

| Sample | A1 | A2 | A3 |
|---|---|---|---|
| sample-1 | ✅ SUCCESS | ✅ SUCCESS | ✅ SUCCESS |
| sample-2 | ✅ SUCCESS | ✅ SUCCESS | 🟡 FURTHER EVIDENCE REQUIRED |

## Sample: sample-1

### Evidence register

| Id | File | Type | Size | SHA-256 |
|---|---|---|---|---|
| E1 | `samples/sample-1/Screenshot 2025-11-14 at 14-27-50 Coverage Report.png` | image/png | 840,334 B | `8f61944da615a9b6…` |
| E2 | `samples/sample-1/Screenshot 2025-11-14 at 14-28-31 Shrink relationComplexityError test size by jakebailey · Pull Request #62754 · microsoft_TypeScript.png` | image/png | 1,589,450 B | `42507184ec698eb6…` |
| E3 | `samples/sample-1/Screenshot 2025-11-14 at 14-29-21 Shrink relationComplexityError test size · microsoft_TypeScript@9e76dd2.png` | image/png | 705,765 B | `50b7f21b92364817…` |

### A1 — ✅ SUCCESS (confidence: high)

**An independent review approval by RyanCavanaugh occurred (17 hours ago) before the PR was merged to microsoft:main (16 hours ago), satisfying review-before-merge.**

PR #62754 targeted the default protected branch microsoft:main [E2 tile:1]. The timeline shows jakebailey requested review 17 hours ago, RyanCavanaugh 'approved these changes' 17 hours ago, and then jakebailey merged commit ea48ded into microsoft:main 16 hours ago [E2 tile:1, tile:2]. The approval event (17h ago) precedes the merge event (16h ago), so a code review was performed prior to committing the change to main. The PR also went through auto-merge (squash) which GitHub gates on the required approval, and the commit 9e76dd2 landed on main [E2 tile:1]. Ordering: review approval BEFORE merge is confirmed.

**Evidence:**

| Source | Location | Observation |
|---|---|---|
| E2 | tile:1 | RyanCavanaugh approved these changes 17 hours ago; PR targets microsoft:main. |
| E2 | tile:2 | jakebailey merged commit ea48ded into microsoft:main 16 hours ago (after the approval). |

### A2 — ✅ SUCCESS (confidence: high)

**The approving reviewer (RyanCavanaugh) is a distinct individual from the PR author/committer (jakebailey), meeting the 4-eyes independence requirement.**

The PR was authored, assigned to, and merged by jakebailey [E2 tile:1, tile:2]. The human approval came from RyanCavanaugh, who 'approved these changes' and carries the green check in the Reviewers panel [E2 tile:1]. Author (jakebailey) and approver (RyanCavanaugh) are distinct identities, so this is not a self-approval. Copilot (AI) also reviewed 'on behalf of jakebailey' and generated no comments [E2 tile:1, tile:2]; the AI reviewer is not relied upon for independence, but the human independent approval from RyanCavanaugh satisfies the attribute regardless.

**Evidence:**

| Source | Location | Observation |
|---|---|---|
| E2 | tile:1 | Author/assignee jakebailey; RyanCavanaugh approved these changes with a green check in Reviewers. |
| E2 | tile:2 | jakebailey merged the commit — the merger is the author, but a distinct reviewer (RyanCavanaugh) approved beforehand. |

### A3 — ✅ SUCCESS (confidence: medium)

**CI test suites ran on the pull request before merge and passed (Status: Success), and the coverage report shows summary line/branch/function coverage above policy thresholds; the change is a test-size reduction limited to test and baseline files.**

The change is a test-only modification — reducing the relationComplexityError compiler test's Digits type and refreshing baseline files (4 files changed, +10 -10) [E2 tile:1, tile:2]. CI ran via ci.yml on: pull_request and completed with Status: Success (17m 44s), with all jobs green: the 15-job test matrix (Test Node 14-24 across ubuntu/windows/macos), coverage, lint, knip, format, browser-integration, typecheck, smoke, package-size, misc, self-check, and baselines [E3 tile:1]. Results were visible as PR status checks (Checks tab; '36 of 37 checks passed') and the required check passed, allowing the merge [E2 tile:1, tile:2]. A coverage artifact was produced by the run [E3 tile:2], and the Coverage Report shows codebase-wide summary metrics of Statements 94.62% (line, >=80%), Branches 89.48% (>=70%), and Functions 94.79% (>=80%) — all meeting the testing-policy thresholds [E1 tile:1]. Individual low-coverage files (e.g., debug.ts 29.99%) are pre-existing legacy code unaffected by this change [E1 tile:1]. Testing was therefore performed in accordance with the testing policy. Confidence is medium because the Coverage Report image is not annotated with the specific commit SHA (linkage inferred from the run's coverage artifact), and the PR reports one non-passing check (36 of 37), which I could not confirm as a genuine test failure versus a skipped/neutral check.

**Evidence:**

| Source | Location | Observation |
|---|---|---|
| E3 | tile:1 | CI run #34653 for PR #62754, Status: Success; all test-matrix and quality jobs (coverage, lint, typecheck, smoke, baselines, etc.) green. |
| E1 | tile:1 | Coverage summary: Statements 94.62%, Branches 89.48%, Functions 94.79% — above policy thresholds of 80/70/80%. |
| E2 | tile:2 | Change is limited to one test file and three baseline files; merged with '36 of 37 checks passed'. |

### Reperformance

| Procedure | Recorded result | Reperformed result | Agreement |
|---|---|---|---|
| Independently reconstructed the event ordering from the PR timeline to confirm review approval preceded merge to main. | PR shown as Merged into microsoft:main with RyanCavanaugh approval. | Approval at 17 hours ago precedes merge at 16 hours ago; ordering confirmed. | agrees |

### Observations (outside attribute scope)

- **One PR status check did not pass (36 of 37)** — The merge banner states '36 of 37 checks passed' [E2 tile:2], while the Actions CI run reports overall Status: Success with all displayed jobs green [E3 tile:1]. The single non-passing check could not be identified from the provided screenshots; it may be a skipped, neutral, or non-required check rather than a test failure. It did not block the merge (the required check passed), but the specific check's status is not demonstrable from the evidence.
  - [E2 @ tile:2] '36 of 37 checks passed' at merge.
  - [E3 @ tile:1] CI run Status: Success with all listed jobs green.
- **Coverage report not explicitly tied to the sampled commit SHA** — The Coverage Report [E1] shows codebase coverage well above thresholds but is not labeled with commit 9e76dd2/ea48ded or branch; linkage to this PR is inferred from the coverage job/artifact in CI run #34653 for PR #62754 [E3 tile:1, tile:2]. A coverage report annotated with the commit SHA would remove this residual uncertainty.
  - [E1 @ tile:1] Coverage Report summary with no visible commit/branch identifier.
  - [E3 @ tile:2] Coverage artifact (39.2 MB) produced by CI run #34653 for PR #62754.

### Engagement quality review

An independent review session re-examined the evidence and attempted to refute this assessment.

> The assessment withstands review. A1 and A2 are firmly supported by the E2 PR timeline: RyanCavanaugh (a distinct individual from author/merger jakebailey) approved the change before the merge of commit ea48ded into microsoft:main, satisfying both review-before-merge and 4-eyes independence. A3's SUCCESS-medium verdict is defensible: the tied CI run #34653 (E3) is fully green across the test matrix and quality jobs, coverage (E1) exceeds all policy thresholds, and the change is test-only; the two residual uncertainties (the unidentified non-passing check in "36 of 37" and the coverage report's missing commit SHA) are honestly recorded as observations and do not constitute proven deviations. No contradicted conclusions, unsupported claims, missed exceptions, or doctrine errors were found.

**Withstood review:** A1, A2, A3

### Conclusion

All three attributes are satisfied for sample-1 (PR #62754, microsoft/TypeScript). An independent human reviewer (RyanCavanaugh) approved the change before the author (jakebailey) merged it into microsoft:main, satisfying both the review-before-merge (A1) and independence/4-eyes (A2) requirements. CI test suites ran on the pull request and passed with coverage above the policy's line/branch/function thresholds for this test-only change (A3). Two non-blocking items are noted as observations: one PR status check did not pass (36 of 37) and the coverage report is not explicitly annotated with the sampled commit SHA.

## Sample: sample-2

### Evidence register

| Id | File | Type | Size | SHA-256 |
|---|---|---|---|---|
| E1 | `samples/sample-2/Screenshot 2025-11-14 at 14-31-38 feat use Node.js timers by default · denoland_deno@12cde71.png` | image/png | 828,793 B | `d05f335ec5bf3e90…` |
| E2 | `samples/sample-2/Screenshot 2025-11-14 at 14-32-05 feat use Node.js timers by default by bartlomieju · Pull Request #31272 · denoland_deno.png` | image/png | 1,526,323 B | `6c6784e2c63b583a…` |

### A1 — ✅ SUCCESS (confidence: high)

**An independent approval by dsherret was recorded 20 hours ago, one hour before bartlomieju merged the PR to denoland:main 19 hours ago, so review preceded the merge to the main branch.**

PR #31272 was merged into the default/protected branch denoland:main (Merged status, '...merged 7 commits into denoland:main') [E2 tile:1]. The PR timeline shows dsherret 'approved these changes 20 hours ago' [E2 tile:2], and bartlomieju 'merged commit 7ada8d6 into denoland:main 19 hours ago' [E2 tile:2]. '20 hours ago' is earlier in time than '19 hours ago', so the approval preceded the merge/commit to main. The merge note also records '33 of 36 checks passed', consistent with a status-gated merge. The requirement — a code review before the change was committed to main — is satisfied.

**Evidence:**

| Source | Location | Observation |
|---|---|---|
| E2 | tile:1 | Status 'Merged'; bartlomieju merged 7 commits into denoland:main from bartlomieju:node_timers. |
| E2 | tile:2 | dsherret approved these changes 20 hours ago. |
| E2 | tile:2 | bartlomieju merged commit 7ada8d6 into denoland:main 19 hours ago; 33 of 36 checks passed. |

### A2 — ✅ SUCCESS (confidence: high)

**The PR author/committer bartlomieju was approved by a different individual, dsherret, satisfying the 4-eyes / independence requirement.**

The PR was opened and authored by bartlomieju, who also performed the merge [E2 tile:1, tile:2]. The approving reviewer was dsherret, shown with a green check in the Reviewers panel and with an explicit 'dsherret approved these changes 20 hours ago' event and 'LGTM' comment [E2 tile:1, tile:2]. bartlomieju and dsherret are distinct identities, so the approval was performed by an independent reviewer, not a self-approval. Copilot (AI) was also requested and left a review comment (Pull Request Overview) but did not provide the approval; independence is established by the human reviewer dsherret regardless [E2 tile:1].

**Evidence:**

| Source | Location | Observation |
|---|---|---|
| E2 | tile:1 | bartlomieju is the PR author (commented, Member); Reviewers panel lists dsherret with a green check. |
| E2 | tile:2 | dsherret approved these changes 20 hours ago with 'LGTM'; bartlomieju performed the merge. |

### A3 — 🟡 FURTHER EVIDENCE REQUIRED (confidence: medium)

**CI test suites ran and passed before merge (workflow run Success; 33 of 36 checks passed), but no code-coverage report tied to the merged commit is in evidence, so coverage-threshold compliance required by the testing policy cannot be confirmed and the change is a functional feature not qualifying for a policy exception.**

The testing policy requires (a) all automated suites pass in CI before merge with results visible in PR status checks, and (b) coverage thresholds be met (unit 80% line, branch 70%, function 80%; critical paths 100%) with coverage reports reviewed during code review, unless an exception applies.

Test execution is demonstrated: the ci.yml workflow run #71281 for this PR/branch (bartlomieju #31272, bartlomieju:node_timers) reports Status: Success with green checks across unit/integration test jobs (test debug/release on macOS, Windows, Linux x86_64/aarch64), lint jobs and build libs; only 'publish canary' is neutral/skipped [E1 tile:1]. Annotations are warnings/notices (pwsh cleanup, macOS-13 deprecation) not test failures [E1 tile:1]. The PR merge note records '33 of 36 checks passed' [E2 tile:2], and the head commit 12cde71 carries a green check while only intermediate commits show red X marks [E2 tile:2], consistent with the final state passing.

However, no coverage report is present in this sample's evidence [E1 tile:2]. The change is a functional, behavior-affecting feature (replacing Web API timers with Node.js timer APIs — a breaking change) [E2 tile:1], so it does not qualify for the documentation-only, dependency-bump, build-script, or no-behavioral-change refactoring exceptions. Because coverage evidence is absent and no exception applies, compliance with the coverage-threshold portion of the policy cannot be concluded either way — this is an evidence gap, not a proven deviation. The test-execution portion of the policy is satisfied.

**Evidence:**

| Source | Location | Observation |
|---|---|---|
| E1 | tile:1 | CI workflow run #71281 (ci.yml, on: pull_request) for bartlomieju #31272 / bartlomieju:node_timers, Status: Success, 39m 22s; test/lint/build jobs green, publish canary neutral. |
| E1 | tile:2 | Artifacts section shows a produced build artifact; no code-coverage report is displayed. |
| E2 | tile:2 | Merge note: '33 of 36 checks passed'; head commit 12cde71 has a green check. |
| E2 | tile:1 | PR describes a breaking functional change replacing Web API timers with Node.js timer APIs. |

**Evidence requested:**
- **Code coverage report (line/branch/function %) generated by the CI run for commit 12cde71 / PR #31272** (from CI/CD pipeline coverage job (e.g., coverage artifact or coverage status check) for denoland/deno PR #31272) — Confirm coverage meets policy thresholds (unit 80% line, 70% branch, 80% function; 100% for critical paths) for the merged change.

### Reperformance

| Procedure | Recorded result | Reperformed result | Agreement |
|---|---|---|---|
| Independently re-derived the ordering of review approval vs. merge to main from the PR timeline timestamps. | PR merged to denoland:main after dsherret approval. | Approval recorded 20 hours ago; merge recorded 19 hours ago — approval precedes merge by ~1 hour. | agrees |
| Independently compared PR author identity against approving reviewer identity for independence. | Change approved by an independent reviewer. | Author bartlomieju vs approver dsherret — distinct individuals. | agrees |

### Observations (outside attribute scope)

- **Author performed the merge** — The PR author bartlomieju also executed the merge to main; this does not violate the control since an independent reviewer (dsherret) approved beforehand, but under strict branch-protection practice the merge action being taken by the author is worth noting.
  - [E2 @ tile:2] bartlomieju merged commit 7ada8d6 into denoland:main.
- **3 of 36 checks not passing at merge** — The merge summary shows '33 of 36 checks passed'; the overall ci.yml workflow run is Success with 'publish canary' neutral/skipped, indicating the 3 non-passing checks are most likely neutral/skipped rather than failures, but the specific status of the 3 was not individually confirmed from the evidence.
  - [E2 @ tile:2] 33 of 36 checks passed.
  - [E1 @ tile:1] Workflow Status Success; publish canary shown neutral (0s).

### Engagement quality review

An independent review session re-examined the evidence and attempted to refute this assessment.

> The assessment withstands review. A1 (approval 20h ago preceding merge to denoland:main 19h ago, after the final commit 12cde71) and A2 (author bartlomieju vs. independent human approver dsherret; Copilot only commented) are both supported by the E2 PR timeline. A3's FURTHER_EVIDENCE_REQUIRED is defensible: E1 shows ci.yml #71281 Success for head commit 12cde71 with test suites green, but no coverage report is in evidence and the breaking functional feature qualifies for no policy exception — an evidence gap, not a proven deviation. The '33 of 36 checks' point is appropriately recorded as an observation rather than over-claimed.

**Withstood review:** A1, A2, A3

### Conclusion

For PR #31272, the 4-eyes control operated effectively: an independent reviewer (dsherret) approved the change 20 hours ago, one hour before author bartlomieju merged it into denoland:main 19 hours ago, satisfying both the pre-merge review (A1) and reviewer-independence (A2) attributes. Testing partially demonstrates policy compliance — the ci.yml workflow run passed (Success) with unit/integration/lint suites green and status checks visible in the PR — but no code-coverage report tied to the merged commit 12cde71 is in the evidence, and the change is a functional breaking feature that does not qualify for a testing-policy exception, so coverage-threshold compliance (A3) cannot be concluded without the coverage artifact.

## Open evidence requests (PBC)

| Sample | Attribute | Artifact | Source | Purpose |
|---|---|---|---|---|
| sample-2 | A3 | Code coverage report (line/branch/function %) generated by the CI run for commit 12cde71 / PR #31272 | CI/CD pipeline coverage job (e.g., coverage artifact or coverage status check) for denoland/deno PR #31272 | Confirm coverage meets policy thresholds (unit 80% line, 70% branch, 80% function; 100% for critical paths) for the merged change. |
