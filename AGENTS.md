# Agent instructions

This repository is the Reader project. `docs/ROADMAP.md` is the continuity source and must be read before changing code; update it rather than creating parallel handoff files.

## Coordination

- `.agentctl.json` binds this working tree to AgentCtl project `reader` and canonical repo `Kiwinokoto/monkey`.
- Read-only inspection does not require a lease.
- Before mutating this repository, acquire `repo:Kiwinokoto/monkey` and do not bypass an active lease. Investigate stale leases before any administrative break.
- Cloud agents with access to the personal VPS can acquire/release the lease through `/usr/local/bin/agentctl-worker`; never copy its credential into prompts, logs or the repository.
- Before each write, re-check `main`, recent commits and any local/unpushed work when a clone is involved.

## Build and tests

Follow `docs/ROADMAP.md`: TypeScript sources under `src/` are canonical, generated userscript/extension artifacts must stay synchronized, and targeted tests/typecheck/build should pass before publication.
