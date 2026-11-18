---
title: Security invariants
summary: Rules every change must preserve; the README states them for users, this lists where they are enforced.
read_when:
  - touching the project file, actions, the menu output or the JSON output
  - adding an external program call
---

# Security invariants

1. **No value leaves the process.** Menu and `json` output only carry `Public*` types. `display` is `host:port/path`, never credentials, query or fragment. An `Action` (which may hold a password or a copied value) stays in `Endpoint` and is dropped by `toPublic` (`collect.ts`).
2. **Clicks carry ids only.** `clickParams` (`swiftbar.ts`) refuses any param outside `[A-Za-z0-9._-]`; ids come from `slug`/`uniqueId` (`text.ts`).
3. **Menu text cannot inject SwiftBar parameters.** Every label, path and error goes through `menuText`: no `|`, no line break, no leading `-`.
4. **No shell.** Programs are called by absolute path with an argument list (`system.ts`, `actions.ts`). A `run` entry requires an absolute executable. The only shell scripts are the generated launcher and plugin, whose paths go through `shellQuote`.
5. **The project file is trusted only when safe.** `assertSafeFile` plus `isIgnoredByGit`: in the main worktree, git-ignored and untracked, no symlink for file or folder, owned by the user, not group/world writable. Otherwise it is ignored and the menu says why.
6. **Strict validation.** Unknown keys, unknown `${…}` variables, several actions in one entry: all rejected (`project-config.ts`).
7. **Never read a project's `.env`,** never run project code, `npx`, network or a listening port.
8. **Private storage.** `~/.config/workspace-bar/` is `0700`, `projects.json` `0600`, the project file `0600`.

A change that relaxes one of these needs an explicit decision and an update of the README's "Security" section.
