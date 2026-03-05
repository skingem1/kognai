name: video-generator
description: AI video production workflow using Remotion. Use when creating videos, short films, commercials, or motion graphics. Triggers on requests to make promotional videos, product demos, social media videos, animated explainers, or any programmatic video content. Produces polished motion graphics, not slideshows.

# Video Generator (Remotion)
Create professional motion graphics videos programmatically with React and Remotion.

## Default Workflow (ALWAYS follow this)
1. **Scrape brand data** (if featuring a product) using Firecrawl
2. **Create the project** in `output/<project-name>/`
3. **Build all scenes** with proper motion graphics
4. **Install dependencies** with `npm install`
5. **Fix package.json scripts** to use `npx remotion` (not `bun`):
   ```json
   "scripts": { "dev": "npx remotion studio", "build": "npx remotion bundle" }
   ```
6. **Start Remotion Studio** as a background process
7. **Expose via Cloudflare tunnel** so user can access it:
   ```bash
   bash skills/cloudflare-tunnel/scripts/tunnel.sh start 3000
   ```
8. **Send the user the public URL**. They preview, request changes, you edit. Hot-reloads automatically.
9. **Render** only when user explicitly asks to export:
   ```bash
   npx remotion render CompositionName out/video.mp4
   ```

## Quick Start
```bash
# Scaffold project
cd output && npx --yes create-video@latest my-video --template blank
cd my-video && npm install
npm install lucide-react

# Fix scripts in package.json (replace any "bun" references with "npx remotion")
# Start dev server
npm run dev

# Expose publicly
bash skills/cloudflare-tunnel/scripts/tunnel.sh start 3000
```

## Fetching Brand Data with Firecrawl
MANDATORY: When a video mentions or features any product/company, use Firecrawl first.
```bash
bash skills/video-generator/scripts/firecrawl.sh "https://invoica.ai"
```
Returns: brandName, tagline, headline, colors, logoUrl, faviconUrl, screenshot URL, OG image URL.

## Motion Graphics Principles
AVOID: fading to black, centered text on solid backgrounds, linear animations, emoji icons
PURSUE: overlapping transitions, layered compositions, spring physics, Lucide React icons

## Visual Style for Invoica
- Colors: scrape from invoica.ai via Firecrawl
- Typography: one display font + one body font, massive headlines
- Tone: fintech-forward, trustworthy, fast
- Content ideas: x402 payment flow demo, "Stripe for AI agents" narrative, agent economy explainer
