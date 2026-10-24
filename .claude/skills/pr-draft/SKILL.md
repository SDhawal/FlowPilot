---
name: pr-draft
description: Draft a ready-to-paste pull request title and body for the current branch, in FlowPilot's PR format (matches .github/PULL_REQUEST_TEMPLATE.md). Use when a branch is ready for a PR, or when the human asks for a PR description.
---

# Draft a pull request: $ARGUMENTS

The human opens PRs themselves (no `gh`). Produce text to paste; never push or open the PR.

## Gather (read-only)

1. `git log --oneline main..HEAD` and `git diff --stat main...HEAD`: what the branch contains.
2. The feature spec in `docs/features/` and any ADR the branch touches, especially "Implementation notes", where the build diverged from the plan.
3. The linked issue number, if the human gave one or the spec names one.
4. Verification actually done in this session: commands run and their results. Never claim a check that didn't run.

## Write

**Title:** Conventional Commits, imperative, ≤ 72 characters, matching the main change (`feat: …`, `fix(ci): …`). No trailing period.

**Body:** use exactly these headings (same as `.github/PULL_REQUEST_TEMPLATE.md`):

```markdown
## Summary

<1–3 sentences: what this PR does and the user-visible or operational effect.>

Closes #<issue> <!-- omit the line if there is no issue -->

## Why

<The problem or goal. Link the spec/ADR. One short paragraph.>

## Changes

- <grouped by area: backend / mobile / ci / infra / docs; one line each, the "what", not a commit list>

## How it was verified

- [x] <checks that ran, with results, e.g. "dotnet test: 33/33 passed">
- [ ] <checks still to do, e.g. "preview URL shows Connected" — left unticked>

## Notes for the reviewer

- <divergences from the spec, risks, follow-ups, anything a reviewer should look at first; "None" if empty>
```

## Rules

- Only facts from the branch, the spec and this session. Mark anything unverified as unverified.
- No secrets or connection strings, even partial. Hostnames and public URLs are fine.
- Add the PR attribution line only if the current session's instructions require one.
- Output the title and the body as two separate fenced blocks, so each copies cleanly. Add nothing after them except one line saying which checks are still open.
