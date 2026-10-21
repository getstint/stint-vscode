# Security policy

## Reporting a vulnerability

Please don't open a public issue for security problems. Report them privately through [GitHub's advisory form](https://github.com/getstint/stint-vscode/security/advisories/new), or email security@getstint.dev.

Include what you found, how to reproduce it, and what someone could do with it. You'll get a reply within a week, and we'll keep you updated until it's fixed.

## Supported versions

Only the latest release on the Visual Studio Marketplace and Open VSX receives security fixes. Editors update extensions automatically unless you turned that off.

## Keeping your key safe

- Your key lives in `~/.stint/config.json`. Don't commit it or paste it into issues.
- If a key leaks, revoke it in **Settings › API key** on getstint.dev and run `npx getstint login` again.
- Stint never sends file contents, selections or keystrokes. See [What it sends](README.md#what-it-sends) for exactly what leaves your machine.
