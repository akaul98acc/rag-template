---
allowed-tools: Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(gh pr create:*), Bash(gh pr view:*)
---

You are creating a GitHub Pull Request for the current branch.

1. Check the current branch using `git branch --show-current`.
   - If it is `main` or `master`, stop and tell the user to switch to a feature or fix branch first.
   - If it does not start with `feature/` or `fix/`, warn the user that branches should follow the naming convention `feature/your-feature` or `fix/your-bug` and ask them to confirm before proceeding.
2. Get the diff and commits against main using `git diff main...HEAD` and `git log main...HEAD --oneline`.
3. If there are no changes against main, say so and stop.
4. Generate a PR title and description based on the changes:
   - Title: conventional commits format (feat/fix/chore/docs/refactor + short description)
   - Description: summary of what changed and why, bullet points for key changes
5. Show the proposed title and description and wait for the user to confirm, edit, or cancel.
6. If confirmed, run `gh pr create` with the approved title and description targeting `main`.
7. Show the PR URL to the user.