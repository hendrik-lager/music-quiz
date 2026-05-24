#!/bin/bash
# Run once after cloning to install git hooks

REPO_DIR="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_DIR/.git/hooks"

cp "$REPO_DIR/scripts/post-merge" "$HOOKS_DIR/post-merge"
chmod +x "$HOOKS_DIR/post-merge"

echo "Git hooks installed. Auto-deployment active after git pull."
