# workspace-bar

## Start every session with the project context

Run `npx -y alignfirst context` from the repository root once, as your first command in the session, whatever the task. It prints the project conventions (ticket IDs, branch names, commits), the documentation map, and the AlignFirst protocols.

### Essential Documentation

- `docs/architecture.md`: modules, data flow, internal vs public model.
- `docs/security-invariants.md`: rules every change must keep.

## Language

CLI messages and menu labels are in French. The README, code, comments and `docs/` are in English. The README quotes French menu strings verbatim.

This repository is public: examples, fixtures and tests use neutral names (`project`, `example.local`) and fake credentials, never real projects.

## Runtime

Node 24+ runs the TypeScript sources directly (type stripping): no build step, no runtime dependency. Keep it that way: only erasable syntax (no `enum`, no parameter properties, no namespaces), `.ts` extensions in imports, `import type` for types.
