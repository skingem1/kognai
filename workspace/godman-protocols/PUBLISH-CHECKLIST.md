# Godman Protocols — npm Publish Checklist (April 14, 2026)

All 7 protocols + SDK at v0.2.0. Run in this order:

## Pre-publish: Login to npm
```bash
npm login  # or: npm login --auth-type=web
npm whoami # should show: skingem1
```

## Step 1: Publish each protocol (order matters — SDK depends on all)
```bash
cd workspace/godman-protocols/pact    && npm publish --access public
cd workspace/godman-protocols/lax     && npm publish --access public
cd workspace/godman-protocols/score   && npm publish --access public
cd workspace/godman-protocols/signal  && npm publish --access public
cd workspace/godman-protocols/soul    && npm publish --access public
cd workspace/godman-protocols/amf     && npm publish --access public
cd workspace/godman-protocols/drs     && npm publish --access public
```

## Step 2: Update SDK deps to published versions, then publish SDK
```bash
# SDK package.json deps are already ^0.2.0 (Sprint 983)
# After publishing all protocols, install from registry:
cd workspace/godman-protocols/sdk
npm install  # will pull from npm now (not file:../)
npm publish --access public
```

## Step 3: Verify
```bash
npm view @godman-protocols/pact version    # should print: 0.2.0
npm view @godman-protocols/sdk version     # should print: 0.2.0
npx tsx examples/agent-workflow.ts         # should print all 7 steps clean
```

## Smoke test (run before publishing)
```bash
for p in pact lax score signal soul amf drs; do
  cd workspace/godman-protocols/$p
  npm run test  # runs smoke.test.ts
  cd ../../../
done
```

## Status
- [ ] `npm login` done
- [ ] 7 protocols published
- [ ] SDK published
- [ ] X announcement thread posted (@invoica_ai)
- [ ] ClaWHub listings live

**Target: April 14, 2026**
