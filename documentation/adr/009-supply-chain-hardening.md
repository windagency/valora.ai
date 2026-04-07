# ADR-009: Supply Chain Hardening

> **Decision**: Valora hardens its supply chain via four measures: a frozen lockfile, blocking dependency install scripts, patching known transitive vulnerabilities via `pnpm.overrides`, and automated Dependabot updates.

## Status

Accepted

## Context

The project has basic supply chain hygiene — a lockfile with SHA-512 hashes, pinned Node/pnpm versions via Volta, and pre-commit hooks via Husky. However, it lacks active defences against dependency-based attacks:

1. **No lockfile protection** — `pnpm install` can silently mutate `pnpm-lock.yaml`, introducing unreviewed dependency changes
2. **No install script blocking** — dependency lifecycle scripts (`postinstall`, `install`, `preinstall`) run freely, which is the primary vector for supply chain attacks (e.g., event-stream, ua-parser-js, colors.js)
3. **No vulnerability auditing** — no scripts or CI steps to check for known vulnerabilities
4. **No automated dependency updates** — dependencies drift silently until a developer manually updates them
5. **Known transitive vulnerabilities** — multiple high-severity `minimatch` ReDoS vulnerabilities via `archiver`, plus moderate/low issues in `ajv`, `tmp`, and `qs`

These gaps are standard in early-stage projects but become increasingly risky as the dependency tree grows. Supply chain attacks are now the most common vector for compromising Node.js projects.

## Decision

Implement four complementary supply chain hardening measures:

### 1. Freeze the Lockfile

Add `frozen-lockfile=true` to `.npmrc`. This prevents `pnpm install` from modifying `pnpm-lock.yaml`. To update dependencies, developers must explicitly run `pnpm update` or override the flag with `--config.frozen-lockfile=false`. This catches accidental lockfile drift and ensures CI builds are reproducible.

### 2. Block Dependency Install Scripts

Add `ignore-scripts=true` to `.npmrc` and `pnpm.onlyBuiltDependencies: []` to `package.json`.

- `ignore-scripts=true` blocks all dependency lifecycle scripts globally
- `onlyBuiltDependencies: []` provides a belt-and-suspenders allowlist — an empty array means no dependency is allowed to run build scripts
- Root project scripts (`prepare`, `prebuild`, `postbuild`) are unaffected in pnpm 10

If a future dependency legitimately requires native compilation (e.g., `sharp`, `esbuild`), it must be explicitly added to the `onlyBuiltDependencies` array.

### 3. Add Audit Scripts and Patch Vulnerabilities

Add `audit`, `audit:prod`, and `audit:fix` scripts to `package.json` for easy vulnerability checking.

Patch existing transitive vulnerabilities via `pnpm.overrides`:

| Package   | Vulnerability                        | Override     |
| --------- | ------------------------------------ | ------------ |
| minimatch | ReDoS (multiple CVEs, high severity) | 5.1.8, 9.0.7 |
| ajv       | ReDoS with `$data` option (moderate) | 8.18.0       |
| tmp       | Symlink directory write (low)        | 0.2.4        |
| qs        | arrayLimit bypass DoS (low)          | 6.14.2       |

### 4. Configure Dependabot

Add `.github/dependabot.yml` with weekly grouped updates:

- **Production dependencies**: minor/patch grouped into one PR
- **Dev dependencies**: minor/patch grouped into one PR
- **Major version bumps**: individual PRs for careful review

This reduces PR noise (2 grouped PRs vs 30+ individual ones) while ensuring dependencies stay current.

## Consequences

### Positive

- **Reproducible installs** — frozen lockfile prevents "works on my machine" issues from dependency drift
- **Attack surface reduction** — blocking install scripts eliminates the most common supply chain attack vector
- **Zero known high/critical vulnerabilities** — `pnpm audit --prod --audit-level=high` returns clean
- **Proactive dependency updates** — Dependabot ensures vulnerabilities are patched promptly
- **Developer workflow preserved** — root scripts still work, `pnpm build` and `pnpm test` unaffected

### Negative

- **Extra step for dependency updates** — developers must use `--config.frozen-lockfile=false` or `pnpm update` instead of just `pnpm install`
- **Override maintenance** — `pnpm.overrides` must be reviewed periodically and removed when upstream fixes are released
- **Native dependency friction** — packages requiring build scripts need explicit allowlisting

### Neutral

- **Dependabot PR volume** — 2 grouped PRs per week is manageable but adds review overhead
- **No CI enforcement yet** — these measures lay groundwork for CI audit checks (separate task)

## Alternatives Considered

### Alternative 1: Audit in Pre-Commit Hook

Run `pnpm audit` as part of the pre-commit hook.

**Rejected because:**

- Requires network access, adding 2-5 seconds to every commit
- Blocks commits on unfixable transitive vulnerabilities
- Developers will bypass with `--no-verify`, undermining the hook system

### Alternative 2: SBOM Generation

Generate a Software Bill of Materials for dependency tracking.

**Rejected because:**

- Compliance artefact, not an active defence
- Adds complexity without blocking attacks
- Can be added later when regulatory requirements demand it

### Alternative 3: npm Package Provenance

Use npm provenance to verify package authenticity.

**Rejected because:**

- pnpm has limited provenance support
- npm ecosystem adoption is ~30%
- Worth revisiting when ecosystem support matures

### Alternative 4: Commit Signing (GPG)

Require GPG-signed commits to prevent tampering.

**Rejected because:**

- High setup burden for a small team
- Low threat relevance for this project's risk profile
- GitHub provides built-in secret scanning as an alternative

## References

- [pnpm `.npmrc` documentation](https://pnpm.io/npmrc)
- [pnpm `onlyBuiltDependencies`](https://pnpm.io/package_json#pnpmonlybuiltdependencies)
- [GitHub Dependabot documentation](https://docs.github.com/en/code-security/dependabot)
- [OpenSSF Supply Chain Security Guide](https://openssf.org/)
- [Development Setup — Supply Chain Security](../developer-guide/setup.md#supply-chain-security)
