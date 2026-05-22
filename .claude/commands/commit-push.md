Review all staged and unstaged changes using `git diff` and `git diff --cached`, then:

1. Generate a concise, conventional commit message based on the actual changes
2. Show the proposed commit message to the user for review/editing
3. Wait for confirmation before proceeding
4. If confirmed, stage all changes (`git add -A`), commit with the message, and push to the current branch

Follow conventional commits format: feat/fix/chore/docs/refactor + short description.

DO NOT auto-commit the code. Always ask for users approval before committing.