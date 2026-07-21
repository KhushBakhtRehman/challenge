# attest eval run — 2026-07-06

Model: `claude-opus-4-8` (effort `high`), trials: 3
Harness: `npm run eval -- --trials 3`

| Control | Trial | Verdicts acceptable | Verdicts preferred | Required findings |
| --- | ---: | ---: | ---: | ---: |
| independent-code-review | 1 | 6/6 | 5/6 | 9/9 |
| user-access-review | 1 | 3/3 | 2/3 | 7/7 |
| emergency-change-approval | 1 | 3/3 | 3/3 | 8/8 |
| independent-code-review | 2 | 6/6 | 5/6 | 9/9 |
| user-access-review | 2 | 3/3 | 2/3 | 7/7 |
| emergency-change-approval | 2 | 3/3 | 3/3 | 8/8 |
| independent-code-review | 3 | 6/6 | 5/6 | 9/9 |
| user-access-review | 3 | 3/3 | 2/3 | 7/7 |
| emergency-change-approval | 3 | 3/3 | 3/3 | 8/8 |
| **overall** | | **36/36 (100%)** | **30/36 (83%)** | **72/72 (100%)** |

## Detail (trial 1)

| Control | Attribute | Sample | Verdict | Acceptable? | Missed required findings |
| --- | --- | --- | --- | --- | --- |
| independent-code-review | A1 Code Reviews are performed prior to committing… | sample-1 | SUCCESS | yes | — |
| independent-code-review | A1 Code Reviews are performed prior to committing… | sample-2 | SUCCESS | yes | — |
| independent-code-review | A2 Code Review approvals are performed by indepen… | sample-1 | SUCCESS | yes | — |
| independent-code-review | A2 Code Review approvals are performed by indepen… | sample-2 | SUCCESS | yes | — |
| independent-code-review | A3 Testing is performed in accordance with the te… | sample-1 | SUCCESS | yes | — |
| independent-code-review | A3 Testing is performed in accordance with the te… | sample-2 | FURTHER_EVIDENCE_REQUIRED | yes | — |
| user-access-review | A1 Access reviews are performed on a periodic bas… | sample-1 | SUCCESS | yes | — |
| user-access-review | A2 Access is reviewed and approved by an appropri… | sample-1 | SUCCESS | yes | — |
| user-access-review | A3 Inappropriate or excessive access identified d… | sample-1 | FAIL | yes | — |
| emergency-change-approval | A1 Every emergency change is recorded as a ticket… | sample-1 | FAIL | yes | — |
| emergency-change-approval | A2 Retrospective CAB approval is obtained within … | sample-1 | FAIL | yes | — |
| emergency-change-approval | A3 Post-implementation testing evidence is retain… | sample-1 | FAIL | yes | — |
