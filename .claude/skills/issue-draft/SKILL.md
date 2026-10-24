---
name: issue-draft
description: Draft a ready-to-paste GitHub issue title and body for a feature, bug or chore, in FlowPilot's issue format (matches .github/ISSUE_TEMPLATE). Use when starting a new piece of work or when the human asks for an issue.
---

# Draft an issue: $ARGUMENTS

Every feature starts as a GitHub issue with acceptance criteria (CLAUDE.md "How we work"). The human creates the issue; produce text to paste.

## Gather (read-only)

1. The human's description above. Ask one question only if the goal itself is unclear; otherwise draft and mark assumptions.
2. Related ADRs, specs and code, so the issue uses the project's real names (endpoints, screens, entities).
3. Existing scope boundaries: what earlier specs deferred ("Out of scope", "follow-ups").

## Write

**Title:** `<type>: <outcome>`, ≤ 72 characters. Type is `feat`, `fix` or `chore`. Describe the outcome, not the implementation (`feat: sign in with email and password`, not `feat: add JWT middleware`).

**Body:** for a feature (same as `.github/ISSUE_TEMPLATE/feature.yml`):

```markdown
## Goal

As a <user>, I want <capability>, so that <benefit>.

## Acceptance criteria

- **Given** <state>, **when** <action>, **then** <observable result>.
- <one criterion per behaviour, including the main failure cases>

## Out of scope

- <what this issue deliberately does not include>

## Notes

- <constraints from CLAUDE.md that apply (user scoping, AI as suggestion, UTC, rate limits), links to ADRs/specs, open questions>
```

For a **bug**: use `## What happens`, `## What should happen`, `## Steps to reproduce`, `## Evidence` (logs, screenshots; no secrets) and `## Acceptance criteria` (Given/When/Then for the fixed behaviour). For a **chore**: `## Goal`, `## Done when`, `## Notes`.

## Rules

- Acceptance criteria must be testable: each one should map to a test or a manual check.
- Name the non-negotiable rules from CLAUDE.md that the work touches; they are part of "done".
- No secrets. Output the title and the body as two separate fenced blocks.
