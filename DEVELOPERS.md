# Developer Reference

Node 24+ (`.nvmrc`), npm.

```sh
npm install          # dev dependencies only (Biome, TypeScript, Node types, AlignFirst for the e2e test)
npm test             # unit tests, test/*.test.ts
npm run typecheck    # tsc --noEmit
npm run lint         # biome check: format, lint, import order
npm run format       # biome check --write
npm run test:e2e     # end-to-end test, test/e2e/*.e2e.ts
```

CI (`.github/workflows/ci.yml`, Ubuntu) runs all of them plus `npx alignfirst docmap --check`.

Run the CLI from the sources: `node src/cli.ts <command>`, or the npm scripts (`npm run add`, `list`, `check`, `json`…) (`json` prints the full state without secrets, handy to check a change). `swiftbar` needs `WORKSPACE_BAR_PLUGIN` set to the plugin path. Set `WORKSPACE_BAR_HOME` to a temporary folder to avoid touching the real `~/.config/workspace-bar/`.

## Tests

Unit tests cover the pure parsers and renderers (registry, `git worktree list`, `lsof`, project file, SwiftBar output); system calls stay out of them. Add a test next to any parsing or validation change.

The end-to-end test builds a real project from `test/fixtures/e2e-project/` in a temp folder, with a temp `HOME`: the pinned `alignfirst` dev dependency creates its workspaces, ports (47300–47399) and dev server, then the test runs `src/cli.ts` as SwiftBar would and clicks a harmless `run` entry. It needs git. Bumping the `alignfirst` dev dependency is the contract test for a new registry format (see "Registry formats" in `docs/architecture.md`).

`src/system.ts` calls `/usr/sbin/lsof`, a macOS path. On Linux CI, `test/fixtures/linux-lsof.sh` is installed there and execs Linux's `/usr/bin/lsof`: on both systems the status dots of the e2e test come from the real dev server's socket.

Biome leaves Markdown alone (Docmap frontmatter) and allows `${…}` in plain strings in `src/project-config.ts` and `test/`, where it is the project file's template syntax.

`schemas/workspace-bar.schema.json` must accept exactly what `checkConfig` (`src/project-config.ts`) accepts: a unit test compares its keys with `ROOT_KEYS`, `ENTRY_KEYS` and `ACTION_KEYS`. Change both together.

Start with `docs/architecture.md`; read `docs/security-invariants.md` before touching the project file, actions or menu output.
