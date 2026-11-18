---
title: Architecture
summary: How a refresh and a click flow through the modules, and where each concern lives.
read_when:
  - starting any change in src/
  - adding a CLI command, an action type or a project-file key
  - supporting a new AlignFirst registry format
---

# Architecture

A CLI (`src/cli.ts`) that SwiftBar calls every N seconds to print a menu, and calls back with ids when an item is clicked.

## Modules

| File | Role |
| --- | --- |
| `cli.ts` | Commands (`add`, `remove`, `list`, `init`, `check`, `json`, `swiftbar`, `open`, `install`). Only file with side effects on the user's setup. |
| `store.ts` | Followed projects: `~/.config/workspace-bar/projects.json` (`WORKSPACE_BAR_HOME` overrides). Atomic write. |
| `registry.ts` | Read-only parser of the AlignFirst registry, `<main>/.local-wt/workspace-registry/` (`workspaces.json` v4, `dev-servers.json` v1). |
| `system.ts` | External programs by absolute path (`git`, `lsof`, `open`, `pbcopy`, `osascript`) and parsers of their output. |
| `project-config.ts` | Loads and validates `<main>/.local/workspace-bar.json`, expands `${ports.x}`, `${worktree}`, `${branch}`, turns entries into `Endpoint`s. |
| `collect.ts` | Merges store + registry + `git worktree list` + project file into a `Project`; `toPublic` strips actions. |
| `swiftbar.ts` | Renders `PublicProject[]` as SwiftBar lines. |
| `scaffold.ts` | The project file `init` writes, from the registry's port names. |
| `check.ts` | Text report of `check`: the menu per worktree, public data only. |
| `actions.ts` | Runs one `Action` (no shell). |
| `types.ts` | Internal model (`Endpoint` with its `Action`) and public model (`Public*`, no action). |

## Refresh

`swiftbar` / `json` → `listeningPorts()` (one `lsof`) → for each followed project `collectProject()` → `toPublic()` → render or print. A failure in one project becomes `project.error` or `worktree.error` and is shown in the menu; it never breaks the other projects.

Worktrees are the union of `git worktree list` and the registry: a registry entry without a folder is an orphan, a git worktree without ports shows "no ports yet". Without a project file, endpoints fall back to one copy entry per AlignFirst port. AlignFirst allocates ports at `alignfirst dev setup`, not at `workspace setup`: until then, project-file entries that need a port get `action: null` and `unavailable` (greyed out, no click); once the worktree has ports, a missing one is a project-file error.

## Click

SwiftBar runs the launcher with `open <project> <worktree> <endpoint>`. `cli.ts` collects that project again, finds the endpoint by id and runs its action. Values are re-resolved at click time; they never pass through SwiftBar.

## Install layout

`install` writes a launcher `~/.config/workspace-bar/workspace-bar` (pins `process.execPath` and the repo path) and a plugin `workspace-bar.<interval>.sh` in SwiftBar's plugin folder that only execs the launcher. SwiftBar reads the interval from the file name. Re-run `install` after moving the repo or changing Node.

## Registry formats

`registry.ts` accepts exact versions and fails closed on anything else. When AlignFirst changes its format, add the new version explicitly with a test in `test/registry-system.test.ts`; never guess.
