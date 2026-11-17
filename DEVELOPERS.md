# Developer Reference

Node 24+ (see `engines` in `package.json`), npm.

```sh
npm install          # dev dependencies only (TypeScript, Node types)
npm test             # node --test on test/, no install needed
npm run typecheck    # tsc --noEmit
```

Run the CLI from the sources: `node src/cli.ts <command>` (`json` prints the full state without secrets, handy to check a change). `swiftbar` needs `WORKSPACE_BAR_PLUGIN` set to the plugin path. Set `WORKSPACE_BAR_HOME` to a temporary folder to avoid touching the real `~/.config/workspace-bar/`.

Tests cover the pure parsers and renderers (registry, `git worktree list`, `lsof`, project file, SwiftBar output); system calls stay out of them. Add a test next to any parsing or validation change.

Start with `docs/architecture.md`; read `docs/security-invariants.md` before touching the project file, actions or menu output.
