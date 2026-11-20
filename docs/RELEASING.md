# Releasing to npm

Three packages are published: `@canopi-sdk/manifest`, `@canopi-sdk/tab-bridge` and
`@canopi-sdk/studio-kit`. They share one version number. The other packages stay `private`.

Publishing runs in GitHub Actions (`.github/workflows/publish.yml`) when a `v<version>` tag is
pushed. It uses npm **trusted publishing**: npm trusts this repository's workflow directly, so no
npm token is stored anywhere, and every version gets a provenance attestation that links it to the
commit and workflow run that built it.

## One-time setup (a maintainer of the `@canopi-sdk` npm scope)

1. **GitHub environment.** In this repository: Settings → Environments → New environment `npm`.
   Add yourself under "Required reviewers", so every publish waits for a person to approve it.
2. **Trusted publisher on npm, for each of the three packages.** On npmjs.com, open the package →
   Settings → Trusted publishing → GitHub Actions, and enter:
   - Organization or user: `Bridgit-DAO`
   - Repository: `canopi-sdk`
   - Workflow filename: `publish.yml`
   - Environment name: `npm`

   npm doesn't check these when you save them; a mistake shows up as a failed publish.

   If npm doesn't let you add a trusted publisher to a package name that has never been published,
   publish that first version by hand from a clean checkout of the tagged commit, then add the
   trusted publisher:

   ```bash
   npm ci && npm run build && npm test
   npm login
   npm publish -w packages/manifest
   npm publish -w packages/tab-bridge
   npm publish -w packages/studio-kit
   ```

   A hand-published version has no provenance attestation; every version after it does.
3. After the first successful run, consider turning on "Require two-factor authentication and
   disallow tokens" in each package's publishing access settings, so only this workflow can publish.

## Each release

1. On a branch, set the same `version` in `packages/manifest`, `packages/tab-bridge` and
   `packages/studio-kit` (and studio-kit's exact dependency on the other two), then run
   `npm install --package-lock-only` with npm 10.9.9 and open a PR. Merge it once CI is green.
2. Tag the merge commit and push the tag:

   ```bash
   git tag v0.3.0 <merge commit>
   git push origin v0.3.0
   ```

3. Approve the run in the `npm` environment. The workflow builds, runs every check, refuses a tag
   that doesn't match the package versions, and publishes manifest, then tab-bridge, then
   studio-kit. Versions already on npm are skipped, so a failed run can be re-run.

Rollback: npm versions can't be overwritten. Deprecate a bad version
(`npm deprecate @canopi-sdk/<name>@<version> "<reason>"`) and release a fixed one.
