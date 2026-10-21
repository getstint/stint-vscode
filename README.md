# Stint for VS Code

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-007ACC?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=getstint.stint)
[![License](https://img.shields.io/badge/license-MIT-blue)](https://github.com/getstint/stint-vscode/blob/main/LICENSE)

Free coding time tracking for VS Code, Cursor, Windsurf, VSCodium and every other VS Code fork. See where your hours go by project, language, branch and editor, next to what your AI agents did, on [getstint.dev](https://getstint.dev). No paid tier.

## Get started

1. Install **Stint** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=getstint.stint), or search “Stint” in the Extensions view. Cursor, Windsurf and VSCodium install from Open VSX, coming soon.
2. Click **Sign in to Stint** in the status bar, or run **Stint: Sign in** from the Command Palette.
3. Your code is copied. Approve it in the browser that opens, and you're done.

If you already signed in with the CLI (`npx getstint`), the extension picks up the same account automatically.

Today's coding time shows in the status bar. Click it to open your dashboard.

## Track your AI agents too

Run **Stint: Track AI agents** to connect Claude Code, Codex CLI, Gemini CLI and OpenCode through [the Stint CLI](https://github.com/getstint/stint-cli). Agent time is counted separately from yours.

## What it sends

- **Sent:** timestamps, the project (the git repository's folder name, or the workspace name), branch, language, the file path relative to the project, whether you saved, the editor name and the line count.
- **Never sent:** file contents, selections, keystrokes, terminal output, or any path outside the project.

Files matching `stint.excludePatterns` are never tracked. Untitled editors are skipped unless you turn on `stint.trackUntitled`.

## Settings

| Setting                 | Default | Description                                                                   |
| ----------------------- | ------- | ----------------------------------------------------------------------------- |
| `stint.apiUrl`          | empty   | Stint server. Empty means getstint.dev, or the server the CLI is signed in to |
| `stint.statusBar`       | `true`  | Show today's time in the status bar                                           |
| `stint.trackUntitled`   | `false` | Count time in untitled editors                                                |
| `stint.excludePatterns` | `[]`    | Globs to never track, such as `**/secret/**`                                  |

## Commands

**Stint: Sign in** · **Stint: Sign out** · **Stint: Open dashboard** · **Stint: Track AI agents** · **Stint: Show status** · **Stint: Send queued activity now**

## Offline

Activity is batched every 30 seconds. If Stint can't be reached, it waits in `~/.stint/queue.jsonl`, the same queue the CLI uses, and goes out with the next batch.

## Privacy and source

The extension is MIT licensed and open source: [github.com/getstint/stint-vscode](https://github.com/getstint/stint-vscode).
