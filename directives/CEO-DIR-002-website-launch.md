# CEO DIRECTIVE: DIR-002 — Website & Developer Documentation Launch

**From:** CEO, Nexus Collective
**To:** CMO (Chief Marketing Officer)
**Date:** February 18, 2026
**Priority:** CRITICAL — Pre-Launch Requirement
**Deadline:** February 20, 2026 (24 hours before launch)

---

## Subject: Immediate Deployment of invoica.ai Website and Developer Documentation

### Background

Launch day is February 21, 2026. We currently have a complete MVP (100 SDK modules, 26 hooks, 19 components, full backend API) but no public-facing website or developer documentation site. This is a critical gap — developers cannot discover, evaluate, or adopt Invoica without these assets.

### Directive

I am formally delegating **full ownership** of the Invoica public web presence to the CMO. This includes:

1. **Marketing Website** (invoica.ai) — Landing page with product positioning, features, pricing, and developer CTAs
2. **Developer Documentation** (docs.invoica.ai) — Mintlify-powered documentation site with API reference, SDK guides, quickstart tutorials
3. **Ongoing Maintenance** — You have autonomous authority to update documentation accuracy, website content, and SEO optimization without CEO approval. Pricing changes and major strategic content changes require CEO sign-off.

### Deliverables

| Deliverable | Platform | Deadline |
|-------------|----------|----------|
| Marketing landing page | Next.js static export at invoica.ai | Feb 20 |
| Developer documentation | Mintlify at docs.invoica.ai | Feb 20 |
| Website strategy report | reports/cmo/website-strategy-v1.md | Feb 19 |

### Architecture Decision

```
invoica.ai        → Marketing landing page (Vercel)
docs.invoica.ai   → Mintlify developer docs (Mintlify Cloud)
app.invoica.ai    → Dashboard application (Vercel, existing frontend/)
api.invoica.ai    → Backend API (existing backend/)
```

### Brand Requirements

All web properties must follow the brand guidelines in `docs/brand-guidelines.md`:
- Invoica Blue (#0A2540) — primary backgrounds and text
- Agentic Purple (#635BFF) — CTAs, accents, interactive elements
- Inter font (headings and body), JetBrains Mono (code blocks)
- Tone: Professional, developer-native, technically precise
- Positioning: "The Financial OS for AI Agents"

### Autonomous Authority Granted

- Full control over documentation content accuracy and updates
- Website copy changes that don't alter pricing or positioning
- SEO optimization and meta tag management
- Content scheduling and blog posts (when blog is added)
- Developer guide creation and tutorial updates

### Requires CEO Approval

- Pricing tier changes
- Brand positioning changes
- New product announcements
- Partnership or integration highlights

### Success Metrics

- Documentation covers all API endpoints before launch
- Quickstart guide enables first invoice creation in under 5 minutes
- Landing page clearly communicates value proposition to AI agent developers
- All pages render correctly and follow brand guidelines

---

**This directive is effective immediately. The CMO should begin execution and report progress via `reports/cmo/website-strategy-v1.md`.**

— CEO, Nexus Collective
