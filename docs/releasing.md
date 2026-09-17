# Release setup and operation

## npm trusted publisher

On npm, open the `vitest-command-line` package → Settings → Trusted publishing.
Choose GitHub Actions and enter:

| Field                | Value                 |
| -------------------- | --------------------- |
| Organization or user | `bhouston`            |
| Repository           | `vitest-command-line` |
| Workflow filename    | `release.yml`         |
| Environment          | Leave blank           |

The workflow runs on GitHub-hosted Ubuntu with `id-token: write` and uses the
Node version in `.nvmrc` (Node 26 includes a sufficiently recent npm).
Trusted publishing requires npm 11.5.1+ and Node 22.14.0+.
Do not add `NPM_TOKEN`, `NODE_AUTH_TOKEN`, or `registry-url` to setup-node.
The built-in `GITHUB_TOKEN` creates tags and GitHub Releases; no PAT is needed.
Provenance is generated automatically for this public package and repository.

References: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
and [semantic-release GitHub Actions](https://semantic-release.org/recipes/ci-configurations/github-actions/).

Configure npm before the first release dispatch that includes releasable
changes. No npm publishing is performed during the initial implementation PR.

## GitHub configuration

Keep `main` as the default and sole active integration branch. Enable squash
merges and set the squash commit default title to the PR title. Disable merge
commits and rebase merges to keep history linear and predictable for
semantic-release's commit analysis.

Protect `main` with required PRs and required checks `Quality` and
`PR policy`; disallow force pushes and deletion. For a solo maintainer,
requiring an additional approving reviewer prevents self-merging, so that is
optional. `release.config.js` has no `@semantic-release/git` step, so the
release job never commits back to `main`; it only creates tags and a GitHub
Release, which the built-in `GITHUB_TOKEN` can do without a branch-protection
bypass. Repository rules must allow the Actions token to create `v*` tags.

The `Release` workflow (`.github/workflows/release.yml`) runs only through
`workflow_dispatch` on `main`: `gh workflow run release.yml --ref main`. It is
never triggered by a push or a tag, so ordinary PR merges cannot publish.

The Codecov badge uses the existing Codecov integration. If uploads are not
already authorized, add the repository's Codecov upload token as `CODECOV_TOKEN`.
Coverage thresholds are enforced locally in CI even if Codecov is unavailable.
The size report appears in the job summary and quality-reports artifact.

## Initial version baseline

npm reports the last manual release as `0.9.0`, with gitHead
`4a37a85f9e7a08b620e704d1d8405547f0afd525`. Semantic-release uses Git tags, not
package.json, to identify previous releases. The one-time baseline is a `v0.9.0`
tag at that verified commit. Never move an existing release tag or tag the new
setup commit as the old release. Without the baseline, semantic-release would
consider the next release the first release (1.0.0).

For another repository, first run `npm view <package> version gitHead --json`,
confirm that the commit belongs to its history, and tag that published commit.
Never assume that its source package version identifies the last published commit.

## Release review and recovery

1. Squash-merge reviewed implementation PRs into `main` with their Conventional
   Commit titles.
2. When ready to publish, dispatch the `Release` workflow on `main`:
   `gh workflow run release.yml --ref main`. It reruns quality checks and
   publishes only if semantic-release identifies a feature, fix, performance
   improvement, or breaking change since the last release tag. Pass
   `-f dry_run=true` to validate without publishing.
3. Check the GitHub Release, npm version, provenance, and attached CHANGELOG.md.

Release jobs are serialized and never cancelled by a newer release. If a run
fails, inspect the logs and npm before retrying: npm publication is irreversible.
If npm succeeded but GitHub release creation failed, recover the missing GitHub
release from the existing tag; do not attempt to republish the same npm version.

## Reusing the standard

After the pilot's first successful CI release, extract the shared files into a
`dev-workflow-template` repository and mark it as a GitHub template. Copy
CONTRIBUTING.md, AGENTS.md, CLAUDE.md, commitlint.config.js, release.config.js,
.husky/commit-msg, the issue/PR templates, workflows, and scripts/check-pr-policy.mjs.
Merge the tool dependencies and scripts from package.json into each target;
regenerate its own lockfile rather than copying this repository's lockfile.

Adapt Node/pnpm versions, build/typecheck commands, coverage thresholds, size
budget, SECURITY.md contact, license/copyright, README badge URLs, repository
metadata, npm package identity, and the published tag baseline. Keep each target's
existing hooks when adding commitlint. Configure trusted publishing separately
for every npm package. Do not copy this repository's release tags or identity.

Template extraction and a rollout installer follow a successful pilot release;
this change sets up and exercises the issue/branch/PR portion in the pilot repo.
