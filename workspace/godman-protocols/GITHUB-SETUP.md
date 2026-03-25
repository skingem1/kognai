# Godman Protocols — GitHub Setup Guide

## Prerequisites

- GitHub account: `skingem1`
- SSH key configured for github.com (or `gh auth login` done)
- Node.js >= 20 installed

## Step 1: Create the GitHub Organization

1. Go to https://github.com/organizations/plan
2. Choose **Free** plan
3. Organization name: `godman-protocols`
4. Contact email: your skingem1 email
5. Complete setup

## Step 2: Create 8 Empty Repositories

For each protocol, create an **empty** repo (no README, no .gitignore, no license):

| Repo Name | Description |
|-----------|-------------|
| `amf` | Agent Message Format — signed typed envelope for inter-agent comms |
| `drs` | Dynamic Research System — structured multi-agent research protocol |
| `lax` | Layered Agent eXchange — hierarchical agent communication |
| `pact` | Protocol for Agent Coordination and Trust |
| `score` | Structured Capability & Outcome Rating Engine |
| `sdk` | Godman Protocols SDK — unified TypeScript client |
| `signal` | Agent signal/event broadcasting protocol |
| `soul` | Structured Objective Understanding Layer — agent personality |

You can create them via CLI:

```bash
for repo in amf drs lax pact score sdk signal soul; do
  gh repo create godman-protocols/$repo --public --description "Godman Protocol: $repo" --confirm
done
```

Or create them manually at: `https://github.com/organizations/godman-protocols/repositories/new`

## Step 3: Push All Protocols

From the kognai project root:

```bash
# Dry run first (no actual pushes):
./scripts/godman-push-to-github.sh --dry-run

# If everything looks good:
./scripts/godman-push-to-github.sh
```

This will:
- Initialize git in each protocol directory
- Create `.gitignore` (excludes node_modules, dist)
- Commit all source files
- Tag with the current version (v0.2.0)
- Add remote origin → `git@github.com:godman-protocols/<name>.git`
- Push main branch + tags

## Step 4: Verify CI

After pushing, each repo will have `.github/workflows/ci.yml`. GitHub Actions will automatically:
- Run on every push to `main` and on PRs
- Install dependencies (`npm ci`)
- Type-check (`npm run typecheck`)
- Run smoke tests (`npm test`)

Check the Actions tab on each repo to verify green builds.

## Step 5: Publish to npm (after CI is green)

```bash
# Login to npm (one time):
npm login

# Publish each protocol:
for proto in amf drs lax pact score sdk signal soul; do
  cd workspace/godman-protocols/$proto
  npm publish --access public
  cd -
done
```

## Troubleshooting

- **Push fails**: Ensure the repo exists and is empty. Check SSH key: `ssh -T git@github.com`
- **CI fails**: Check that `smoke.test.ts` passes locally: `cd workspace/godman-protocols/<name> && npm test`
- **npm publish fails**: Ensure you're logged in (`npm whoami`) and the scope `@godman-protocols` is available
