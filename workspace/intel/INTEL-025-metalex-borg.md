# INTEL-025 — MetaLeX BORG + cyberCORP
## Date: 2026-03-28
## Agent: Harvey

---

## Research Notes

Primary sources consulted: MetaLeX documentation site (metalex-docs.vercel.app, mirrored via GitHub at MetaLex-Tech/metalex-docs), all seven MetaLex-Tech GitHub repositories (borg-core, cybercorps-contracts, publicDocs, metalex-docs, LeXscroW, MetaVesT, RicardianTriplerBORGParticipation, RicardianTriplerDoubleTokenLeXscroW, svm-agreement-registry-poc), and contract source code. The main site (metalex.vip) was unreachable at time of writing — likely DNS/server issue. All documentation is publicly available and current as of March 2026.

---

## 1. What is MetaLeX?

MetaLeX is a legal-engineering firm and open-source protocol stack founded by "cypherpunk lawyers, engineers, and anons." Its stated mission is to build legal and technical infrastructure for **cyBernetic ORGanizations (BORGs)** and other onchain entities. It operates across three product lines:

- **BORGs OS** — open-source operating system for legally-wrapped, smart-contract-governed organizations (DAOs, foundations, special-purpose entities)
- **cyberCORPs** — closed-source beta platform for startup founders wanting onchain equity, governance, and fundraising built into a traditional legal entity
- **cyberDeals** — suite of onchain deal instruments (escrow, vesting, compliance, fundraising)

The platform replaces "wet contracts" (paper/PDF) with "dry code" (smart contracts) wherever legally sound, retaining traditional law only at the edges where code-only solutions would produce unfair or legally uncertain outcomes. MetaLeX calls this philosophy **Cybernetic Law**: designing legal agreements and software as cohesive systems rather than parallel artifacts.

**Revenue model:** Service fees ($100 USDC for LeXcheX accreditation certificates), consulting/legal engineering work. No native token. Revenue from protocol fees is early-stage and project-by-project.

**Audits:** Independent audits by MixBytes and Zellic. Core infrastructure built on battle-tested Gnosis Safe.

**Real-world deployments confirmed:** Neutron Grants BORG, Lido Alliance BORG, Everclear Grants BORG, Yearn ychad BORG (proposed), zkSync Security Council and Guardians.

---

## 2. BORG Framework (borgCORE)

### 2.1 Definition of a BORG

A BORG (cyBernetic ORGanization) is a **state-chartered legal entity** — a corporation, LLC, foundation, or other recognized structure — whose charter legally embeds autonomous software (smart contracts and/or AI agents) into its governance and operations. Key characteristics:

- Has formal legal personhood (not a DAO, which has no legal status)
- Digital assets held in public multisigs (typically Gnosis Safe)
- DAO or parent entity retains veto authority over material changes
- BORG bylaws hardwire accountability mechanisms that cannot be unilaterally amended
- Smart contract guards programmatically prevent unauthorized transactions
- "Trust-minimized" execution: smart contracts handle deterministic functions; traditional law handles edge cases and human conflict

BORGs exist in two primary categories:

**1. Business BORGs (bizBORG / cyberCORP):** Independent for-profit companies with tokenized equity, automated cap tables, and onchain governance. Founder-controlled. Described in Section 3.

**2. DAO-Adjacent BORGs:** Special-purpose entities funded by and accountable to a larger DAO community. Six subtypes:
- **grantsBORG** — manages grant funding with onchain-tracked approvals and payouts
- **ipBORG** — holds intellectual property (trademarks, patents, software); enables onchain licensing
- **devBORG** — protocol/product development with automated developer payments and milestone-based funding
- **allianceBORG** — jointly owned by multiple DAOs to coordinate shared initiatives (example: Lido Alliance BORG)
- **finBORG** — financial asset management, DeFi integrations, investment under governance control
- **securityBORG** — emergency controls, upgrade keys, veto councils (example: zkSync Security Council)

### 2.2 Legal Wrapper for DAO-Adjacent BORGs

For DAO-adjacent BORGs, MetaLeX uses **memberless, beneficiary-less Cayman Islands Foundation Companies** as the legal wrapper. This jurisdiction choice is deliberate:

- No shareholders or beneficiaries required — purely purpose-driven
- Tax neutral (no corporate income tax)
- Governance flexibility without shareholder voting requirements
- Crypto-friendly regulatory environment
- Supervisor appointment mechanism for emergency DAO oversight (the DAO can trigger supervisor intervention to remove rogue directors)
- Common-law precedent familiar to Web3 participants

BORG bylaws embed five accountability mechanisms that cannot be amended without DAO approval:
1. **Mission lock-in** — entity restricted to supporting specific protocol
2. **Onchain asset controls** — all crypto held in designated smart contracts; directors cannot move funds offchain
3. **Co-approval rights** — material changes (signers, dissolution, fundamental purpose) require both board AND DAO vote
4. **Emergency supervisor powers** — DAO can trigger director removal and legal action
5. **Amendment resistance** — charter changes require dual approval

### 2.3 borgCORE Architecture

**borgCORE** is the foundational smart contract system — "the heart of every BORG on BORGs OS." It wraps a Gnosis Safe multisig with a policy enforcement layer. Every transaction the Safe executes passes through borgCORE before execution.

**Core components:**

**borgCore.sol (Safe Guard)**
The primary policy engine. Implements the Gnosis Safe Guard interface (`checkTransaction()` pre-execution hook + `checkAfterExecution()` post-execution hook). Core behaviors:
- Three immutable operational modes set at deployment: **Whitelist** (only approved actions allowed), **Blacklist** (all actions allowed except explicitly blocked), **Unrestricted** (no restrictions)
- Parameter-level granularity: whitelist specific method signatures on specific contracts AND constrain the values of individual parameters (unsigned range, signed range, exact match by hash)
- Time-based cooldowns per method and per recipient to prevent rapid-fire execution
- On-chain storage of legal document URIs and document hashes via `addLegalAgreement()` — anchoring off-chain legal text to the on-chain contract
- EIP-4824 DAO registry interface (`daoURI()`) for standardized DAO discovery and identification
- Director signature requirements: configurable threshold of "directors" (addresses with role ≥ 97 in BorgAuth) that must countersign Safe transactions, independent of the standard Safe signer threshold

**BorgAuth / BorgAuthACL (auth.sol)**
Multi-tier access control inherited by all BORG contracts. Three numeric role tiers (higher number = higher authority):
- **Owner (99):** Highest authority. Controls policy configuration, recipient management, contract upgrades
- **Admin (98):** Controls DAO URI, legal agreements, identifier settings
- **Privileged (97):** Base operational level — "Directors" sit at this level for transaction countersigning

Key functions:
- `updateRole()` — owners assign/modify roles with self-demotion protection
- `initTransferOwnership()` + `acceptOwnership()` — two-step handoff to prevent accidental loss of control
- `zeroOwner()` — irreversible owner renunciation, permanently locking role configuration
- `setRoleAdapter()` — enables external contracts (e.g., a DAO governance contract) to serve as authorization adapters for specific roles, decoupling smart contract permissions from governance systems

BorgAuthACL is an abstract contract inherited by all BORG modules, ensuring consistent permission enforcement system-wide via `onlyOwner`, `onlyAdmin`, `onlyPriv` modifiers.

**Condition Manager (conditionManager.sol)**
Modular conditional logic engine. Each condition carries an AND or OR operator:
- AND: all conditions must return true
- OR: at least one must return true

Pre-built condition contracts:
- `TimeCondition` — timelock enforcement
- `BalanceCondition` — ERC-20 minimum balance threshold
- `ChainLinkOracleCondition` — Chainlink price feed with freshness validation
- `API3OracleCondition` — API3 oracle integration
- `SignatureCondition` — multi-signature approval independent of Safe mechanics
- `MultiUseSignatureCondition` — approval tied to exact calldata (specific transactions, not blanket approvals)
- `DeadManSwitchCondition` — triggers after Safe inactivity (monitors nonce changes) for emergency recovery

Conditions can be global (apply to all actions) or function-specific (mapped to specific method signatures).

**GovernanceAdapter (baseGovernanceAdapter.sol)**
Bridges borgCORE with external DAO governance systems. Standardized interface:
- `createProposal()` — initiates governance vote with targets, calldatas, quorum, threshold, duration
- `executeProposal()` — executes approved proposals
- `cancelProposal()` — cancels pending proposals
- `vote()` — casts vote with support parameter

Current implementation: `flexGovernanceAdapter.sol` for Flexa DAO's FlexGov system. Architecture is adapter-based — any governance system (Snapshot, Tally, Governor Bravo) can be integrated via a custom adapter without modifying borgCORE.

**Implant Modules (SAFE Modules)**
Gnosis Modules that extend SAFE functionality. Ten implants in current release:

- `optimisticGrantImplant.sol` — DAO pre-approved distributions within token/quantity/time limits; BORG members can execute without additional votes
- `daoVetoGrantImplant.sol` — time-delayed distributions with DAO veto window (up to 30 days) + 8-hour grace period + 60-day expiry; three grant types (direct, simple vesting, advanced milestone-based)
- `daoVoteGrantImplant.sol` — full DAO vote required before execution; same three grant types
- `ejectImplant.sol` — member removal (DAO-triggered or self-ejection); `ejectOwner()`, `swapOwner()`, `changeThreshold()`, `addOwner()`, `selfEject()`
- `failSafeImplant.sol` — treasury recovery and clawback; uses DeadManSwitchCondition + SignatureCondition to prevent premature execution
- `daoVetoImplant.sol` — general veto mechanism for DAO-controlled transaction blocking
- `daoVoteImplant.sol` — general DAO voting for arbitrary BORG actions
- `vetoImplant.sol` — veto authority for authorized addresses
- `VoteImplant.sol` — base voting implementation
- `baseImplant.sol` — abstract base for all implants

All implants inherit BorgAuthACL and integrate with ConditionManager. MetaVesT is the vesting backend for grant implants.

### 2.4 Ricardian Tripler — Legal-Code Binding

The **Ricardian Tripler** is MetaLeX's mechanism for binding legal text to smart contract execution. It combines three elements:
1. Legal document (URI + hash stored on-chain in borgCORE)
2. Smart contract code (execution logic)
3. On-chain signature (the blockchain transaction itself constitutes legally binding action)

For BORG membership: each BORG member must sign the **BORG Participation Agreement** via a Ricardian Tripler factory. The factory deploys a `RicardianTriplerBORGParticipation` contract containing the member's details, the BORG's bylaws reference, and IPFS-hosted legal agreement URI. The member's on-chain transaction adopting the agreement constitutes legally binding action. Verified via the `BORGParticipationRegistry` — if `signedAgreement[address]` returns true, the member is legally bound.

This creates "privity of contract" — legal grounds for accountability if a signer deviates from their role.

### 2.5 BORG Setup Process (Practical Steps)

For DAO-adjacent BORGs:
1. MetaLeX handles legal registration (Cayman counsel, Memorandum & Articles, bylaws)
2. Deploy SAFE multisig with initial signers
3. Deploy BorgAuth — assign founder/deployer Owner role
4. Deploy BorgCore (borgCORE) as a SAFE Guard — configure mode (whitelist/blacklist/unrestricted), policy methods, legal agreement URIs
5. Deploy required Implants as SAFE Modules — wire to BorgAuth and ConditionManager
6. Deploy any required Conditions and register them with ConditionManager
7. Deploy GovernanceAdapter if DAO governance bridge needed
8. Obtain BORG Participation Agreement signatures from all signers via Ricardian Tripler factory

For bizBORGs/cyberCORPs, see Section 3.

---

## 3. cyberCORP Legal Entity

### 3.1 Definition

A **cyberCORP** (also called **bizBORG**) is a traditional for-profit business entity — Delaware C-Corp, LLC, or equivalent — whose key operations (financing, cap table, governance, equity issuance) run on blockchain smart contracts. It is MetaLeX's offering for startup founders and mainstream businesses, not crypto DAOs.

Key positioning distinction:
- DAO-adjacent BORGs: accountable to a DAO community, Cayman Islands Foundation, no shareholders
- cyberCORP: traditional corporation with real shareholders/founders, Delaware/equivalent jurisdiction, operational software embedded in legal charter

### 3.2 What cyberCORP Provides

**Fundraising:**
- Onchain SAFE, SAFT, SAFTE, Token Warrant execution via cyberRaise
- Multi-investor rounds (RoundManager) and single-investor deals (DealManager)
- Automated deal closing in minutes versus weeks via LeXscroWLite escrow
- Cost reduction: traditional seed rounds ~$25K in legal fees; cyberCORP substantially reduces this via automation

**Cap Table:**
- Tokenized equity as ERC-721 NFT security certificates (**cyberCerts**) — non-fungible, represent full ownership units
- Fungible fractional claims (**cyberScrip**) — ERC-20 tokens mintable from cyberCerts, liquid but without voting rights until reconverted
- Real-time, tamper-proof cap table via NFT ownership
- SAFE conversion tracking automated on-chain
- MetaVesT integration for founder/employee vesting schedules

**Governance:**
- BorgAuth-based role system: Owner, Admin, Officers (role 200)
- Officer management via `addOfficer()` / `removeOfficer()` — immediate effect
- Round Manager governance controlled by BorgAuth roles
- Upgradeable contracts (UUPS or beacon proxy) — upgrade authority permissioned to designated governance role
- Corporate metadata stored on-chain: entity name, type, jurisdiction, contact, dispute resolution, companyPayable address (treasury/bank)

**Compliance:**
- WhitelistTransferHook: requires pre-approval for share transfers (both parties)
- ToggleTransferHook: company-controlled on/off switch for transferability
- LeXcheX integration: baked-in accredited investor verification for Reg D (Rule 506(b)/506(c)) and Reg S compliance
- CyberAgreementRegistry: immutable on-chain record of executed agreements and signatures
- Supports multi-jurisdictional raises via smart contract enforcement

### 3.3 Jurisdiction

Current confirmed jurisdiction for cyberCORP formation: **Delaware C-Corp and LLC** are the primary target structures (references in documentation to "Delaware" and traditional US startup entities). The framework supports any jurisdiction that allows legal embedding of smart contract governance in corporate charters. Cayman Islands is used for DAO-adjacent BORGs, not cyberCORPs.

The contract metadata stores `jurisdiction` field — suggesting multi-jurisdiction support is architecturally designed in, even if Delaware is the primary beta target.

Status: **closed-source beta** as of March 2026. Access via the MetaLeX app (`app.metalex.vip` — currently unreachable, suggesting limited/invite-only access).

### 3.4 cyberCORP Smart Contract Stack

Deployed via `CyberCorpFactory` in a single transaction:

1. **BorgAuth** — founder's wallet gets Owner role
2. **CyberCorp contract** — on-chain company proxy (minimal proxy or beacon architecture)
3. **IssuanceManager** — upgradeable proxy managing equity certificate deployment
4. **RoundManager** — upgradeable proxy coordinating multi-investor raises
5. **CyberCertPrinter** — ERC-721 NFT factory for security certificates
6. **URI builder** — metadata infrastructure for certificate tokens

Accelerated launch: `deployCyberCorpAndCreateOffer()` — combines formation + initial deal in single transaction.

### 3.5 Launching a cyberCORP (Practical Steps)

**Via Web App (app.metalex.vip):**
1. Connect wallet
2. Select "Start a Raise" — enter company name, entity type, jurisdiction
3. Select fundraising path: Round (multi-investor) or Deal (single investor)
4. Configure parameters: series type, cap, ticket sizes, round style, compliance settings
5. Confirm transaction → CyberCorpFactory deploys full stack automatically
6. Post-launch: mint founder certificates, record co-founder/investor equity, configure transfer restrictions, set up vesting

**Via Smart Contract (developers):**
Interact directly with MetaLex-Tech/cybercorps-contracts using Foundry deployment scripts. Tests require Base Sepolia RPC endpoint. Contract `forge build --via-ir` + `forge test --via-ir --fork-url <base-sepolia-rpc>`.

---

## 4. cyberDeals

cyberDeals is MetaLeX's unified suite of onchain deal instruments. The documentation organizes them under one umbrella: "MetaLeX's onchain deal tooling." There are more than four instruments — the full suite is:

### 4.1 cyberRaise (fundraising orchestration)

The core fundraising platform coordinating the deal stack. Manages:
- **RoundManager**: multi-investor raises with FCFS or founder-approved allocation
- **DealManager**: single-counterparty bespoke deals with EIP-712 signatures

**Instrument types supported:**
- **cyberSAFE** — tokenized SAFE; executes signing and funding atomically, issues NFT security certificate, automates deal logic onchain. Versions: Reg D, Reg S, jurisdiction-neutral
- **cyberSAFT** — Simple Agreement for Future Tokens (Reg D v1.0/1.1, Reg S v1.0/1.1)
- **cyberSAFTE** — hybrid equity + token rights (v1.0, v1.1, v1.2)
- **cyberTokenWarrant** — token warrant (a16z standard, jurisdiction-neutral variants)
- **cyberSPA (cySPA)** — cyberSecurities Purchase Agreement; modular master agreement with exhibits per security type; Reg D, Reg S, jurisdiction-neutral
- **cyTEA** — cybernetic token exchanger agreement (cyTEA 12.12.24)

**Production Combines:** MetaLeX assembles "production combines" — combinations of multiple templates into single deployable documents (20 variants spanning SAFE+SAFT, SAFTE, cySPA+warrant combinations, by jurisdiction and regulatory framework). When a user opens a deal in the MetaLeX app, the document shown is a production combine.

### 4.2 LeXscroW (escrow)

**LeXscroW** is an immutable, non-custodial, condition-based escrow system. Key properties:
- **Ownerless** — no admin after deployment
- **Immutable conditions** — release conditions permanently fixed at creation
- **Non-custodial** — funds held by contract until conditions resolve
- **Composable** — integrates with BORG implants, MetaVesT, cyberCORPs

Three primary contract variants:
- `DoubleTokenLeXscroW` — bilateral ERC-20 atomic swaps (two parties exchange tokens simultaneously)
- `TokenLeXscroW` — unilateral ERC-20 escrow (buyer deposits, seller receives on condition satisfaction)
- `EthLeXscroW` — native token (ETH/wei) escrow

**LexScroWLite** — streamlined variant used inside cyberCORPs; mediates between corp and counterparty, enforces terms from CyberAgreementRegistry, manages escrow state throughout deal lifecycle, supports ERC-20/ERC-721/ERC-1155.

Execution flow:
1. Deposit phase — parties transfer tokens into escrow
2. Execution phase — any party may trigger settlement once all conditions satisfied
3. Resolution phase — automatic refunds if conditions fail or escrow expires

Legal binding via **Ricardian Tripler for LeXscroW**: parties adopt the agreement through factory pattern; each party's blockchain transaction constitutes legally binding action; registry records mutual signing.

Use cases: trustless token exchanges, milestone-based funding, cross-organizational resource pooling, governance token M&A, oracle-resolved prediction markets.

### 4.3 MetaVesT (vesting and lockup)

Advanced ERC-20 token vesting and lockup protocol for BORG-compatible grant structures and cyberCORP equity.

Features:
- **Dual-curve mechanics**: independent vesting and unlocking schedules each with optional cliffs; grantee receives minimum of vested and unlocked amounts
- **Tax-aware design**: supports option exercise prices and restricted award repurchase terms in stablecoins; accommodates Section 83(b) elections and LTCG strategies
- **Governance safeguards**: vested tokens cannot be clawed back without amendment; cohort amendments require majority of grantees (by value) + grantor
- **DAO participation**: unvested/locked tokens can still be staked and voted in a DAO
- **Milestone-based releases**: arbitrary condition contracts (following MetaLeX condition spec from borgCORE)

Requires an `authority` (cyberCORP or BORG safe) to manage allocations. DAO governance contract can impose conditions on authority via MetaVesTController.

Three allocation types: VestingAllocation, TokenOptionAllocation, RestrictedTokenAllocation.

Limitation: ERC-20 only; no native gas tokens, fee-on-transfer tokens, or rebasing tokens.

### 4.4 LeXcheX (accredited investor verification)

Onchain accredited investor credentialing system for SEC compliance.

Process:
1. Investor connects wallet and answers questionnaire (investor type, qualification basis)
2. Oracle queries wallet balances via Zapper API to verify net worth threshold (>$1M) — no invasive KYC
3. Investor signs legal agreement via EIP-712 from wallet
4. Smart contract mints **soulbound NFT certificate** (ERC-721 with ERC-5484 non-transferable + ERC-5192 standards)

Certificate properties:
- Non-transferable (soulbound)
- 90-day validity (aligns with SEC 3-month verification refresh requirement)
- Revocable by attorney (Gabriel Shapiro, Esq., MetaLeX) if misrepresentation occurs
- Metadata: investor name, entity type, jurisdiction, agreement ID, SVG certificate image
- Service fee: $100 USDC
- Contract address (multichain): `0x123E895e0e1a4e39b2E0488DB904AD37C7A62EeD`
- Core function: `hasValidLexCheX(address owner)` returns bool

Legal compliance: implements the established "lawyer letter" method on-chain for Rule 506(c) (general solicitation with verified investor gating) and enhances Rule 506(b) (private fundraising). Attorney oversight provides evidence of reasonable verification steps.

Integration with cyberCORP: toggle "Require LeXcheX Accredited Investor Status" in raise setup → smart contracts gate participation at the contract level.

### 4.5 cyberSAFE (standalone)

The cyberSAFE is a tech-enhanced SAFE that:
- Executes signing and funding atomically in a single transaction
- Issues NFT security certificate to investor at closing
- Automates deal logic on-chain
- Available in multiple regulatory variants (Reg D, Reg S, jurisdiction-neutral)
- Versions: cyberSAFE v1.0, cyberSAFE jx neutral v1.0

---

## 5. ERC-7579 / EAS Integration

### 5.1 Current State — No Native ERC-7579 Integration

**Finding: borgCORE does NOT currently implement ERC-7579.**

ERC-7579 is the Modular Smart Account standard — a standardized interface for composable smart account modules (validators, executors, hooks, fallback handlers). borgCORE uses **Gnosis Safe Guard architecture** instead, which predates ERC-7579 and operates via `checkTransaction()` / `checkAfterExecution()` hooks on the SAFE multisig.

The architectures are philosophically aligned (both pursue modular, composable security for smart accounts) but technically distinct:
- ERC-7579: standardizes how modules plug into any compliant smart account (not just Safe)
- borgCORE Guard: specifically targets Gnosis Safe, with deeper parameter-level policy control than the ERC-7579 standard requires

The `future-integrations.mdx` documentation does not specifically mention ERC-7579 in the published roadmap. However, the adapter-based architecture of borgCORE (BorgAuth role adapters, GovernanceAdapter pattern, modular implants) is designed for composability and could accommodate ERC-7579 account integration as a future governance adapter.

**Assessment:** ERC-7579 integration is architecturally feasible but not yet implemented. If MetaLeX were to build an ERC-7579 module, it would likely wrap borgCORE logic into a compliant validator or hook module for use with non-Safe smart accounts.

### 5.2 Current State — No Native EAS Integration

**Finding: borgCORE does NOT currently use EAS (Ethereum Attestation Service) attestations.**

What borgCORE uses instead for identity and legal anchoring:
- **Legal agreement URIs and document hashes** stored directly in borgCore.sol via `addLegalAgreement()` — this is the on-chain legal anchoring mechanism
- **Ricardian Tripler contracts** — deployed per agreement, registered in BORGParticipationRegistry and DoubleTokenLexscrowRegistry — effectively serving the same function as an EAS attestation schema (immutable, queryable proof that a party has signed specific terms)
- **EIP-4824 DAO URI** (`daoURI()`) — standardized DAO identity/metadata registration
- **ERC-721 NFT certificates** (cyberCerts, LeXcheX soulbound NFTs) — identity and accreditation attestations anchored as token ownership

**LeXcheX is effectively a custom attestation system:** the soulbound NFT serves the same function as an EAS attestation — a verifiable, on-chain, timestamped credential issued by an authority (attorney) proving a claim about an address. It is not implemented via EAS but is functionally equivalent.

**Assessment:** MetaLeX built its own attestation primitives (Ricardian Tripler registry + soulbound NFTs) before EAS became the dominant standard. Integration with EAS would be architecturally straightforward — the Ricardian Tripler registry entries and LeXcheX certificates could be issued as EAS attestations on existing schemas. No current plans documented.

**Kognai context:** Kognai's own EAS attestations (AMD-19, Sprint 511 Genesis) on Base via EAS schemas in `workspace/shared-context/EAS_SCHEMAS.json` are more advanced in their EAS integration than MetaLeX currently is. Kognai is ahead on this specific dimension.

---

## 6. Kognai Relevance

### 6.1 Is Kognai a BORG by MetaLeX's Definition?

**Answer: Kognai is architecturally a BORG by design, but not a MetaLeX-registered BORG.**

MetaLeX's BORG definition: "a state-chartered legal entity whose charter legally embeds autonomous software (smart contracts and AI) to manage operations and governance."

Kognai against this definition:
- Kognai has an operational AI-governed system (500+ sprint autonomous execution) with constitutional constraints — this maps directly to "charter legally embeds autonomous software"
- Kognai has the Five Principles, Founding Charter v1.0, SOUL.md, and ACP — these are the constitutional governance layer
- Kognai has on-chain identity (AMD-19 EAS attestations, ERC-8004 AgentRegistry on Base, 3 EAS schemas)
- Kognai has a Founding Charter committed to Base at Genesis Ceremony — this is the on-chain charter anchor
- Kognai does NOT yet have a legal entity wrapper (no registered LLC/Corp/foundation)
- Kognai does NOT yet have a Gnosis Safe multisig or borgCORE deployed

**Verdict:** Kognai is a **proto-BORG** — the constitutional and on-chain infrastructure exists, the legal entity wrapper does not yet. The Genesis Ceremony (Month 10) is the planned moment to close this gap. A MetaLeX bizBORG/cyberCORP registration at Genesis would formalize what already exists architecturally.

The closest BORG type for Kognai: **bizBORG** (for-profit operating company running revenue-generating activities onchain with automated compliance) — the MetaLeX term for what cyberCORP delivers technically.

### 6.2 Should Genesis Ceremony Register Kognai as a MetaLeX BORG?

**Recommendation: YES — evaluate cyberCORP beta access for Genesis. Strong strategic alignment, not urgent pre-Genesis.**

Arguments for registration:
- Kognai's Founding Charter commits to Base at Genesis Ceremony — a MetaLeX bizBORG registration would be the legal entity layer matching the on-chain charter, creating the exact "legal entity whose charter embeds autonomous software" that MetaLeX defines
- MetaLeX's DAO-adjacent BORG legal approach (Cayman Islands Foundation) is the correct structure IF Kognai operates as a DAO-governed entity; the bizBORG/cyberCORP structure is correct if Godman retains founder control with board structure
- The Founding Charter (9 Articles, 5 Immutable Laws) maps precisely to BORG bylaws — the hardwired accountability mechanisms MetaLeX describes (mission lock-in, onchain asset controls, amendment resistance) are already in Kognai's constitution
- MetaLeX has a Gnosis Safe + borgCORE stack that would provide a formal governance execution layer on top of Kognai's existing ACP and OMEL systems
- The `addLegalAgreement()` function in borgCORE is a clean integration point for PACT session records, DRS receipts, and SOUL attestations

Arguments for caution:
- cyberCORP is closed-source beta — access is not publicly confirmed as open; may require direct outreach to MetaLeX
- The Five Laws are explicitly immutable by human-trigger-only design — a MetaLeX registration must not create a legal structure that enables courts or regulators to override Kognai's constitution; this requires legal engineering review
- borgCORE mode (whitelist/blacklist/unrestricted) must be chosen carefully — Kognai's autonomous swarm behavior requires thoughtful policy whitelisting, not blanket restriction
- The Founding Charter is committed to Base at Genesis Month 10 — registration timing should align with that ceremony, not precede it

**Recommendation:** Contact MetaLeX (Gabriel Shapiro) in Month 8-9 for a scoping conversation about bizBORG/cyberCORP beta access. Use Genesis Ceremony as the formation event. The MetaLeX stack (BorgAuth + borgCORE + Ricardian Tripler) would serve as the formal legal-technical execution layer above the existing SOUL/ACP/OMEL/PACT stack.

### 6.3 Should Invoica Get a cyberCORP Before PACT Week 1?

**Recommendation: NO — not before PACT Week 1. Evaluate for Quarter 2 2026 after revenue traction.**

Reasons:
- cyberCORP beta is closed-source and likely invite-only; timeline to access is uncertain
- cyberCORP formation requires deploying CyberCorpFactory on-chain, BorgAuth, IssuanceManager, RoundManager — non-trivial deployment overhead that should not block PACT Week 1 launch
- PACT Week 1 is an open-source protocol launch — it does not require a formal legal entity to launch. The PACT protocol can be launched under the existing Kognai operational structure
- The core value-add of cyberCORP for Invoica is **onchain fundraising and tokenized cap table** — Invoica is not currently raising a formal round that would benefit from cyberSAFE/cyberSAFT mechanics
- TICKET-017 (AgentTax x402) and TICKET-016 (ERC-8183/BOND) are higher-priority legal-technical items that are pre-PACT gate dependencies

**What Invoica SHOULD consider (Q2 2026):** If Invoica raises a seed round, cyberSAFE (via MetaLeX cyberRaise) would be a meaningful upgrade over a paper SAFE. At that point, MetaLeX beta access + cyberCORP formation would be the correct path.

**What Invoica SHOULD do now:** Register for MetaLeX beta waitlist. Confirm that the existing Invoica operational structure does not block PACT Week 1. The AMD-19 EAS Genesis attestation for Invoica (if applicable) is the immediate identity anchor, not a full cyberCORP.

### 6.4 Should BOND v0.2 Use cyberDeals for Legal Enforceability?

**Recommendation: YES — specific instruments from cyberDeals are directly applicable to BOND v0.2. Not full cyberCORP integration, but targeted instrument adoption.**

BOND Protocol v0.1 (BOND.md) defines: Bilateral On-chain Negotiated Delegation — recurring mandates, default enforcement, economic reputation, EIP-712 + EAS attestation, PayAI as executor, PACT Chamber 4 integration.

Applicable MetaLeX instruments for BOND v0.2:

**1. LeXscroW as enforcement layer:**
BOND's "default enforcement" mechanism maps directly to LeXscroW's condition-based escrow. When an agent mandate is created, the funding amount can be held in LeXscroW with conditions mapped to BOND's mandate terms (completion proof, delivery attestation). If the agent fails, automatic refund. If delivery confirmed, automatic release. This eliminates the need for a centralized arbitrator in BOND's dispute resolution path.

**2. Ricardian Tripler for BOND mandate legal enforceability:**
BOND mandates are currently EIP-712-signed on-chain data structures. Wrapping them in a Ricardian Tripler (legal text + BOND contract code + on-chain signature) would transform them from "technically binding" to "legally enforceable under applicable law." This is the specific gap BOND v0.1 leaves open. The MetaLeX Ricardian Tripler pattern would close it.

**3. cyberSPA exhibit structure for BOND mandates:**
The cyberSPA modular design (master agreement + exhibits per deal type) is directly applicable to BOND's mandate structure. A BOND master agreement with per-mandate exhibits, executed via EIP-712, would follow exactly the cyberSPA pattern.

**4. MetaVesT for streaming mandate payments:**
For recurring BOND mandates with payment streams, MetaVesT's vesting/unlock mechanics (not just cliff-based but rate-based) provide a more sophisticated escrow-and-release mechanism than a simple monthly transfer.

**What this means for BOND v0.2:**
- Add `LeXscroW` as the recommended funding escrow layer (import `LexScroWLite` or full LeXscroW)
- Add Ricardian Tripler wrapping of BOND mandate agreements
- Specify MetaVesT as optional streaming payment module for recurring mandates
- Note that MetaLeX cyberDeals instruments are MIT/AGPL licensed and composable

**Timeline:** These are BOND v0.2 architecture decisions, not pre-PACT-Week-1 blockers. Appropriate for BOND v0.2 spec work (Sprint 535+ range per current queue).

---

## 7. Recommended Actions (Numbered, Prioritised)

**P0 — Pre-PACT Week 1 (April 8-15 window)**

1. **INTEL-025 filed and reviewed by Godman.** No action items from this brief block the April 7 gate or PACT Week 1. Confirm this assessment explicitly. The MetaLeX integration is a Genesis Ceremony and Q2 2026 strategic initiative, not a near-term blocker.

**P1 — Month 7-8 (Post-April 7 Gate, Pre-Genesis)**

2. **Contact MetaLeX for beta access.** Reach out to Gabriel Shapiro (MetaLeX, attorney of record) via X (@metalex_hq or @lex_node per public profiles) or the MetaLeX website. State: Kognai is an AI-native constitutional swarm building on Base with EAS attestations, seeking bizBORG/cyberCORP beta access for Genesis Ceremony formation in Month 10. This is a partnership-level conversation, not just a user signup.

3. **Evaluate BOND v0.2 LeXscroW integration.** When MacGyver begins BOND v0.2 spec (Sprint 535+ range), include: (a) LeXscroW as recommended funding escrow for mandate enforcement; (b) Ricardian Tripler wrapping of BOND mandate agreements for legal enforceability; (c) MetaVesT as optional streaming payment module. Reference MetaLex-Tech/LeXscroW and MetaLex-Tech/RicardianTriplerDoubleTokenLeXscroW repos.

4. **Assess Five Laws vs. MetaLeX BORG bylaw compatibility.** Before Genesis Ceremony formation, legal-engineering review of: (a) Do MetaLeX's BORG bylaws require elements that conflict with Kognai's Five Immutable Laws? (b) Can Kognai's Founding Charter be submitted as the "BORG bylaws" referenced in the BORG Participation Agreement? (c) Which borgCORE operational mode is correct for Kognai's autonomous swarm? (Hypothesis: Whitelist mode, with ACP and OMEL-defined methods as the whitelist.) Assign to Harvey + MacGyver. Output: a 1-page compatibility memo before Month 9.

**P2 — Genesis Ceremony (Month 10)**

5. **Register Kognai as a bizBORG/cyberCORP at Genesis Ceremony.** Deploy CyberCorpFactory or BORG OS stack (depending on MetaLeX access and entity structure decision): (a) If Godman retains founder control: cyberCORP (Delaware or jurisdiction of choice) with BorgAuth Owner = Godman wallet; (b) If Kognai operates as DAO-governed: DAO-adjacent BORG with Cayman Foundation Company, DAO veto rights built into bylaws. The Genesis EAS attestation (AMD-19) becomes the legal-technical anchor at the same ceremony.

6. **Anchor Founding Charter in borgCORE via `addLegalAgreement()`.** At registration: store the Founding Charter IPFS hash and URI in borgCORE's on-chain legal agreement registry. This creates the dual-redundancy binding: EAS attestation (current AMD-19 path) + borgCORE legal anchor. Both point to the same charter document on IPFS. This is the exact "code + law" Ricardian principle MetaLeX operationalizes.

7. **Require SOUL BORG Participation Agreement from core agents.** When Kognai's agent registry grows to include human collaborators (e.g., SCS-001 co-founders, PACT partner agents), consider requiring BORG Participation Agreement signing via Ricardian Tripler factory. This provides legal enforceability for agent/operator relationships beyond the current PACT session attestation model. Sprint: post-AMD-23 Cerberus (Sprint 535+).

**P3 — Long-term / Invoica**

8. **Register Invoica for MetaLeX cyberCORP beta waitlist.** Invoica is the most natural near-term cyberCORP candidate: it is a revenue-generating SaaS company, not a DAO, and will eventually raise a formal seed round. MetaLeX's cyberSAFE/cyberRaise stack would be the exact instrument for that round. No action required before PACT Week 1; queue as P3 for Q2 2026.

9. **Evaluate LeXcheX for PACT identity/accreditation layer.** The current PACT × Helixa integration (Chamber 2, Helixa Cred Score, PROVISIONAL→STANDARD path) is the primary identity layer. LeXcheX provides a complementary accreditation credential for US-based accredited investors participating in PACT commercial sessions. Relevant only if PACT begins facilitating investment/commercial deals requiring SEC compliance (Phase 3+). Queue as EVAL-015 for Phase 3 planning.

10. **Monitor MetaLeX for ERC-7579 integration.** If MetaLeX ships ERC-7579 module support, this becomes directly relevant to AMD-19's smart account architecture on Base. Current gap: borgCORE targets Gnosis Safe only. If MetaLeX expands to ERC-7579 modular accounts, Kognai's AMD-19 identity stack gains a richer governance layer without re-engineering. Set Harvey calendar reminder: check MetaLeX GitHub quarterly.

---

## Appendix: Key Technical References

| Artifact | Source | Notes |
|---|---|---|
| borgCORE contracts | MetaLex-Tech/borg-core (Solidity, AGPL-3.0) | v1.0.0, Gnosis Safe Guard |
| cyberCORP contracts | MetaLex-Tech/cybercorps-contracts (Solidity, 477 commits) | Closed beta, Base Sepolia testnet |
| LeXscroW | MetaLex-Tech/LeXscroW (Solidity, AGPL-3.0) | Ownerless, immutable, non-custodial |
| MetaVesT | MetaLex-Tech/MetaVesT (Solidity) | ERC-20 vesting, dual-curve |
| Ricardian Tripler (BORG) | MetaLex-Tech/RicardianTriplerBORGParticipation | Legal binding via on-chain tx |
| Ricardian Tripler (LeXscroW) | MetaLex-Tech/RicardianTriplerDoubleTokenLeXscroW | Mutual signing via registry |
| Public Docs | MetaLex-Tech/publicDocs | BORG legal templates, cyberDeals |
| LeXcheX contract | `0x123E895e0e1a4e39b2E0488DB904AD37C7A62EeD` (multichain) | Soulbound NFT, 90-day validity |
| MetaLeX docs site | metalex-docs.vercel.app | Vocs framework, TypeScript |

---

*Harvey / CEO-Intel — INTEL-025 complete — 2026-03-28*
