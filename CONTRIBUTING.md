# Contributing

```bash
bun install
bun run check        # typecheck, tests, build
bunx vsce package --no-dependencies
```

Press F5 in VS Code with this folder open to start an Extension Development Host, or install the packaged `.vsix` with `code --install-extension stint-0.1.0.vsix`. Set `stint.apiUrl` to `http://localhost:3210` to work against a local Stint server.

- TypeScript strict, no comments, camelCase file names, tests next to the code.
- Pure logic (editor detection, the heartbeat schedule, paths and excludes) lives outside `extension.ts` and has tests.
- Never send file contents or paths outside the project.
- Conventional Commits, imperative and lower-case.

How releases reach the Visual Studio Marketplace and Open VSX is described in [the CLI repository's publishing guide](https://github.com/getstint/stint-cli/blob/main/docs/publishing.md#vs-code-marketplace-and-open-vsx).
