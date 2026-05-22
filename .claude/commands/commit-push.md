---
allowed-tools: Bash(git diff:*), Bash(git diff --cached:*), Bash(git add -A:*), Bash(git commit:*), Bash(git push:*), Bash(git branch:*)
---

Review all staged and unstaged changes using `git diff` and `git diff --cached`, then:

1. If there are no changes to commit, say so and stop.
2. Check the current branch using `git branch --show-current`. If it is `main` or `master`, warn the user and ask them to confirm they want to push directly to this branch before proceeding.
3. Generate a concise commit message following conventional commits format: feat/fix/chore/docs/refactor + short description.
4. Show the proposed commit message and wait for the user to confirm, edit, or cancel.
5. If confirmed, run `git add -A`, commit with the approved message, and push to the current branch.