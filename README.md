# Bead Audit Agent Challenge

> **Submission (Khush Bakht Rehman):** the solution — `attest`, an evidence-cited audit agent with an adversarial quality-review pass — lives in [`src/`](src). Start with [`src/README.md`](src/README.md) for setup, design decisions and measured results; committed example output is under [`src/sample-runs/`](src/sample-runs). Run it with `cd src && npm install && npm run audit -- ../data`.

## Overview

Welcome to our Audit Agent Challenge. This task will give you a flavor of the work you will be doing at Bead and help us understand how you tackle loosely defined problems. This repository contains all instructions and supporting documents needed to get started.

## Background

Many tasks in the world of auditing require verifying that a specific policy or procedure has been followed. To assess this, the auditor selects a random sample and collects evidence to verify whether the requirements are met for each.

## The Task

We provide two example controls under `data/`, each with its control description, control attributes, and evidence samples:

### 1. Independent Code Review (`data/independent-code-review/`)

A control that ensures systems can't be changed unless a set of prerequisites is true. You are provided with the control description, control attributes, a testing policy, and a few evidence samples, in this case, screenshots of GitHub pull requests showing the changes made.

### 2. User Access Review (`data/user-access-review/`)

A control that ensures user access to systems is periodically reviewed and remains appropriate. The evidence is two Excel workbooks:

- `uar-netsuite-q2-2026.xlsx` — the Q2 2026 access review performed on NetSuite (Production), with the raw system access export (source data), the reviewer's worksheet, and a summary sheet documenting one observation.
- `hris-employee-export.xlsx` — an HRIS (Workday) employee roster export used as the independent source of truth.

Testing this control involves **reperforming** the review: reconcile the NetSuite access export against the HRIS roster and compare your conclusion to the reviewer's.

## Expected Output

- For each sample and control attribute, provide a JSON object that includes the assessments and contextual details of how the conclusion was formed
- The assessment can be SUCCESS, FAIL, FURTHER_EVIDENCE_REQUIRED

## Constraints

- You can use any language, framework, models, APIs, or technologies you feel best suited for the task. We have [developed our own harness](https://github.com/bead-ai/zeitlich/) if you need a starting point.
- You can use any AI tooling or coding agents you are familiar with. If you do, it is helpful to share session recordings, prompts, plans or threads to show us how you work.
- There are no cost, performance or data privacy requirements. Accuracy is the only objective for now.
- We will let you decide how generic your solution should be. For this task, it is enough if it can cover this particular controls with various inputs (we will test it with a set of different inputs).
- Aim for a generic solution that can handle both controls by using the context provided, without specific prompting for either
- Auditing often means making judgments with imperfect input. A good auditor balances detail and efficiency.
- The more detailed and auditable the output, the better.
- We can provide you with API keys with resonable token budgets if needed

## Submission

1. Fork this repository
2. Add your solution to the `src` folder and provide a CLI command to run against the sample folder
3. Please ensure that there are detailed instructions to set up and run your code

# Next Steps

After submission, we will test your solution with more samples for this control and discuss the results with you.

## Notes

- If there are any open questions that need clarification you can reach out to the team.
- If you came across this repository and think this is a fun problem to solve - we are hiring https://usebead.ai/careers
