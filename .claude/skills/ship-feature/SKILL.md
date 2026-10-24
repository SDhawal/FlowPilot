---
name: ship-feature
description: Run the full FlowPilot feature workflow end to end - spec, backend, client generation, frontend, tests, review - pausing for human approval at each gate. Use when starting a feature from a GitHub issue.
disable-model-invocation: true
---

# Ship feature: $ARGUMENTS

Follow these gates in order. **Stop and wait for the human at every ⏸.**

0. **Issue** — If there is no GitHub issue yet, draft one with `/issue-draft`. ⏸ Human creates the issue.
1. **Spec** — Use the `architect` agent to write `docs/features/<name>.md` from the issue/description above. ⏸ Human approves or edits the spec.
2. **Branch** — Give the human the commands to run (`git switch main`, `git pull`, `git switch -c feat/<name>`), with what each one does. ⏸ Human creates the branch.
3. **Backend** — For each [backend] task in the spec, use `/new-endpoint` (or the `dotnet-backend` agent for non-endpoint work). Commit after each task (Conventional Commits).
4. **Contract** — Run `/gen-client`. Commit the regenerated client.
5. **Frontend** — For each [mobile] task, use `/new-screen` (or the `rn-frontend` agent). Commit after each task.
6. **Tests** — Use `test-engineer` to fill gaps against the acceptance criteria. Run all checks.
7. **Review** — Use `code-reviewer`. Fix every BLOCKER, then re-run the reviewer. ⏸ Human reads the diff.
8. **PR** — Draft the title and body with `/pr-draft`. ⏸ Human pushes and opens the PR.
9. **Debrief** — After the merge, write the task debrief (see CLAUDE.md "How we work").

Never push, merge, or force anything without explicit human instruction.
