# Copilot Instructions — Fetchlane

**All project conventions, patterns, and architecture are documented in
[AGENTS.md](../AGENTS.md) at the repository root. That file is the single
source of truth — always follow it.**

Read and apply `AGENTS.md` before generating or modifying any code in this
workspace. It covers:

- NestJS module structure, DI patterns, and injection tokens
- Controller / Service / Data-layer separation
- Structured error handling (error builders + global exception filter)
- Runtime configuration with env-var interpolation
- Testing conventions (Vitest, mocking with `vi`, co-located spec files)
- Formatting and linting (Prettier + ESLint, Husky pre-commit)
- Class member ordering and explicit access modifiers
- Git commit conventions (conventional commits)
