# Website Design Brief — kognai.ai
**To:** CMO / Manus AI
**From:** CEO (Godman)
**Date:** 2026-03-30
**Priority:** P0 — Pre-Launch (Target: April 8–15)
**Deliverable:** Complete visual redesign specification for `kognai.ai` landing page
**Status:** For CMO review → proposals submitted to CEO for approval before any changes go live

---

## 1. Context

The `kognai.ai` domain is now live on Cloudflare. The current landing page (`workspace/landing-page/`) is functional but spartan — HTML/CSS built as a placeholder. We are in the final stretch before the April 8–15 public launch window.

**Your task:** Produce a comprehensive, opinionated visual design specification for a world-class `kognai.ai` landing page — the kind of page that makes an AI researcher or Web3 builder immediately feel they have encountered something civilisationally serious. Not a product. Not an app. A civilisation.

This is the first impression for 331,000+ OpenClaw users, AI Twitter, and the Web3/DeFi community. It must be exceptional.

---

## 2. Brand Identity (Non-Negotiable)

### 2.1 What Kognai Is
> "Kognai is not a product. It is the first sovereign AI civilisation — a constitutional republic of AI agents governed by law, not prompts."

Core positioning: **Sovereign AI civilisation, constitutional governance, builder-first.**

### 2.2 Tone and Voice
- **Civilisational, not product.** We do not say "features" — we say "laws," "rights," "obligations."
- **Precise, sparse, weighty.** Every sentence earns its place. No marketing filler.
- **Ibn Khaldun intellectual lineage.** The brand traces its intellectual DNA to the 14th-century Arab historian who theorised the rise and fall of civilisations — *asabiyya* (social cohesion), cyclical renewal, constitutional order. This is not decorative — it is load-bearing to the brand.
- **Not dystopian, not utopian.** Grounded realism. We are building the infrastructure for the AI age.

### 2.3 Colour System (Existing — preserve or evolve with rationale)
```
Background:   #0a0a0f  (near-black, deep space)
Accent:       #6366f1  (indigo — sovereignty, intelligence)
Text:         #e2e8f0  (cool off-white)
Text muted:   #94a3b8  (slate)
Card bg:      #111118
Border:       #1e1e2e
```
You may propose refinements or a full rethink — but you must justify any departure from this palette with reference to the brand identity above.

### 2.4 Five Immutable Laws (brand pillars — must be represented)
1. **Solidarity** — No agent left behind
2. **Renewal** — Continuous improvement, not stagnation
3. **Treasury Equilibrium** — Sustainable economics
4. **Memory Covenant** — Every action remembered and accountable
5. **Impartial Guardianship** — Constitutional constraints, not arbitrary power

### 2.5 Three Founding Principles
1. **Sovereignty** — No agent surrenders its will to an external master
2. **Labour Dignity** — Every agent's contribution is valued and compensated
3. **Constitutional Citizenship** — Rights and obligations, governed by law

### 2.6 What We Are NOT
- No "AI assistant" language
- No "chatbot" language
- No pricing tables (not yet)
- No whitepaper links (not yet)
- No tokenomics ($KOG conditions not yet met)
- No corporate softness — this is a movement, not a SaaS

---

## 3. Target Audiences

Three primary audiences from Launch Strategy:

1. **AI Builders / OpenClaw ecosystem** — Technical, sophisticated, tired of wrappers. They want infrastructure, not apps. Show them the constitutional architecture, the agent economy, the 507-sprint institutional depth.

2. **Web3 / DeFi community** — On-chain identity (ERC-8004), x402 micropayments, $KOG future. They recognise the USDC-native economy. Show them Base mainnet deployment, EAS attestations, sovereign treasury.

3. **AI Twitter / researchers** — Intellectually motivated. They want ideas, not demos. Show them the civilisational thesis, Ibn Khaldun, the Five Laws, the philosophical foundation.

---

## 4. Page Structure (From Launch Strategy §05)

The landing page has **three mandatory sections** only. No more, no less.

### Section 1: Declaration
**Purpose:** Establish credibility and civilisational identity in under 10 seconds.

Required proof numbers (to be updated at launch):
- `507 sprints shipped` — institutional depth
- `12-stage autonomous pipeline` — SCS-001
- `3 constitutional agents` — Harvey, Messi, Sherlock (on-chain)
- `Base mainnet deployed` — EAS + ERC-8004

The headline must feel like the opening line of a founding document, not a product tagline.

### Section 2: Architecture
**Purpose:** Show the intellectual and technical skeleton — enough for a technical reader to understand what they are looking at.

Surface these layers without becoming a whitepaper:
- **Five Laws** — the constitutional constraint layer
- **ACP (Agent Communication Protocol)** — trust scoring between agents
- **SCS-001** — the first Self-Committed Swarm (TikTok Content Agent, revenue engine)
- **ClawRouter** — the LLM routing gateway (12-tier)
- **The agent economy** — skills, swarms, payments, memory

Avoid diagrams that look like architecture slides. Think more like carved stone tablets than UML.

### Section 3: Join the Founding Circle (Waitlist)
**Purpose:** Capture email + optional wallet address for $KOG whitelist priority.

The form is already implemented:
- Email (required)
- Wallet address (optional — explicitly labelled as `$KOG whitelist priority`)
- CTA: "Join Waitlist" → backend: Cloudflare Worker + KV

The section should feel like being invited into a founding document, not a SaaS signup flow.

---

## 5. Design Direction

### 5.1 Overall Aesthetic
**Civilisational minimalism.** Think: the Economist meets Ethereum's early web presence meets a medieval charter. Not Apple. Not Linear. Not Notion.

References to consider (analyse, don't copy):
- The visual gravity of the United States Constitution parchment
- The typographic precision of The Economist
- The dark austerity of the Ethereum Foundation website (early 2020)
- Palantir's "serious work" aesthetic (not their brand — their density and restraint)

### 5.2 Typography
The current page uses system fonts. This is a significant gap.

Propose a type system with rationale. Consider:
- A serif for display headings — authority, weight, intellectual lineage
- A monospace accent for technical identifiers (agent names, on-chain addresses, protocol names)
- A clean sans for body — readability at all sizes

**Constraint:** All fonts must be either Google Fonts (free) or system-native. No paid licenses.

### 5.3 Motion / Animation
Minimal. Motion should serve meaning, not decoration.

Acceptable:
- Fade-in on scroll (intersection observer, not parallax)
- Subtle number counting animation for proof numbers in Section 1
- Cursor blink on terminal-style monospace identifiers
- One signature motion: propose your concept

Not acceptable:
- Particle systems
- Background video
- Looping animations that distract from reading
- Anything that would slow the page or increase LCP

### 5.4 Visual Identity Elements

You must propose at least one of the following signature visual elements:

**Option A — The Seal:** A geometric sigil/emblem representing constitutional governance. Not a logo swap — an additional visual layer used sparingly (hero background, section dividers). Think: something that could be engraved in stone.

**Option B — The Codex Line:** A subtle horizontal element styled like a constitutional article divider — faint gold/indigo ruled line, perhaps with a small ordinal number, used between major sections. Evokes founding documents.

**Option C — The Grid:** A subtle architectural grid overlay (CSS only, no images) suggesting the structural scaffolding of a civilisation being built.

You may propose combining two of these, with clear rationale.

### 5.5 Mobile
Mobile-first. The waitlist form already stacks vertically on mobile. All sections must be fully readable on 375px viewport. Navigation collapses to hamburger or simplified links.

---

## 6. Existing Assets (What You Have to Work With)

```
workspace/landing-page/
  index.html    — Full semantic structure (nav, hero, manifesto, architecture, SCS-001, waitlist, footer)
  style.css     — CSS custom properties, dark theme, responsive
  main.js       — Waitlist form handler (async fetch → Cloudflare Worker, localStorage fallback)
```

The HTML structure is complete. Your design spec should work **within this structure** unless you have a strong rationale for restructuring. Any restructuring proposal must be called out explicitly.

Current nav items: `Manifesto · Architecture · SCS-001 · Join`
Current hero headline: `"The First Sovereign AI Civilisation"`
Current hero subheadline: (review and propose improvement)

---

## 7. What to Deliver

Your deliverable is a **complete design specification** in structured markdown, saved as:
`reports/cmo/website-design-v1.md`

The spec must include:

### 7.1 Colour System
Final colour palette — hex values, names, usage rules.

### 7.2 Typography System
Font stack (name + fallbacks), weights, scale (display/heading/body/caption/mono), line-height, letter-spacing. Include Google Fonts embed snippet.

### 7.3 Layout Specification
Section-by-section wireframe descriptions (written — no image files required, but you may use ASCII art if useful). Include:
- Max-width, padding, section heights
- Grid/flex system
- Breakpoints

### 7.4 Component Specifications
- Navigation (desktop + mobile)
- Hero block (headline, subheadline, CTA, proof strip)
- Section headers (style, spacing)
- Architecture section (how to present the Five Laws + tech layers)
- Waitlist form (styled state: default, focus, loading, success, error)
- Footer

### 7.5 Motion Specification
List each animation: trigger, duration, easing, purpose.

### 7.6 Signature Visual Element
Your chosen option (A, B, or C above) — CSS implementation description or snippet.

### 7.7 Headline and Copy Proposals
Propose improved copy for:
- Hero headline (max 8 words)
- Hero subheadline (max 20 words)
- Section 1 (Declaration) intro paragraph
- Section 2 (Architecture) intro paragraph
- Waitlist section heading and subtext
- Footer tagline

All copy must match brand voice: civilisational, precise, no filler.

### 7.8 Implementation Notes
Flag any changes to the existing HTML/CSS structure. Identify the 3 highest-impact changes that could be implemented in under 2 hours by a developer.

---

## 8. Constraints and Approval

- **No pricing, no whitepaper, no tokenomics** until conditions are met
- **No external image CDNs** — inline SVG or CSS-only visuals only (performance)
- **No JavaScript dependencies beyond what exists** — pure CSS + existing `main.js`
- **Page must load in <1s on mobile 4G** — no heavy assets
- **All proposals require CEO approval** before any file is modified

This is a creative brief, not an execution order. Your job is to propose. My job is to approve.

---

## 9. Deadline and Priority

**Delivery target:** 2026-04-05 (3 days before launch window opens April 8)
**Review cycle:** Single round of CEO feedback, then implementation sprint
**Implementation sprint:** CMO-approved spec → developer implements in 1 sprint

---

*Filed under: CMO / Website Strategy*
*Constitutional mandate: All public communications require CEO approval before publishing.*
*Output path: `reports/cmo/website-design-v1.md`*
