import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Kognai',
  description: 'Sovereign AI Runtime — Architecture, API & Agent Catalog',
  base: '/',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'Agents', link: '/agents' },
      { text: 'API', link: '/api/clawrouter' },
    ],
    sidebar: [
      {
        text: 'Overview',
        items: [
          { text: 'Introduction', link: '/' },
          { text: 'Architecture', link: '/architecture' },
        ],
      },
      {
        text: 'Agents',
        items: [
          { text: 'Agent Catalog', link: '/agents' },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'ClawRouter', link: '/api/clawrouter' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/skingem1/kognai' },
    ],
    footer: {
      message: 'Sovereign AI Runtime',
      copyright: 'Copyright 2026 Kognai',
    },
  },
})
