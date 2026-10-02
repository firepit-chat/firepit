# AGENTS.md

Guidance for AI agents working in this repository.

## Changelog & Release Notes

User-facing changes (features, bug fixes, notable improvements) must be
documented as part of the change — never left for later. Changelog enforcement
for PRs is planned; treat it as required already.

- **Web** (`apps/web`): add an entry under the current version in
  `apps/web/CHANGELOG.md`, following the Keep a Changelog format used there.
  Bump the `"version"` in `apps/web/package.json` when cutting a release.
- **Mobile** (`apps/mobile`): release notes live in the GitHub release body
  for each version (the in-app updater reads it via
  `apps/mobile/src/lib/update/github.ts`). Note user-facing changes for the
  next release and bump the `"version"` in `apps/mobile/package.json` when
  cutting one.

Keep entries concise and user-facing. Infrastructure-only work (refactors,
dependency bumps, build config) can be skipped or listed under an
"Improvements" heading.

- **Packages** (`packages/*`): published to npm, not to an app store. Add an
  entry under the current version in the package's own `CHANGELOG.md`, keeping
  the Keep a Changelog format, and bump its `"version"` in `package.json`.
  Publishing is never automatic — see below.

## Publishing packages

`packages/*` are the only artifacts in this repo that publish to npm. They are
tracked from the monorepo but consumed by external projects, so:

- **Releasing is a manual decision.** Never wire a publish step to a plain merge.
  The publish workflow only fires when a commit to `main` is tagged `[release]`,
  or when it is dispatched by hand. Its `dry_run` input defaults to `true`.
- **Versioning is manual** and lives in each package's `CHANGELOG.md` plus the
  `"version"` field. There is no changesets or semantic-release setup, matching
  the apps.
- **The registry refuses a version that already exists.** Bump the version in the
  same change that adds the changelog entry, or the publish job fails.
- **Licensing follows the repo.** These packages carry the repository's GPL-3.0
  license unless a package ships its own `LICENSE` file and says so. Publishing
  copyleft code is a deliberate choice, not an accident — do not add a
  permissive license to a package without an explicit decision.
- **A package is not an app.** Do not add `validate-env`, OpenAPI or Appwrite
  steps to a package workflow, and do not expect `apps/*` CI to cover
  `packages/*` automatically — the test workflow has a separate step for it.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
