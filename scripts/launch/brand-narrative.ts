// Kognai Brand Narrative Generator
// Civilizational positioning for all marketing outputs
// Used by CMO agent and content pipeline

export interface BrandNarrative {
  one_liner: string;
  elevator_pitch: string;        // 30-second version
  manifesto_opening: string;     // First paragraph of manifesto
  differentiators: string[];
  anti_positioning: string[];    // What we are NOT
  proof_points: string[];
  voice_guidelines: BrandVoice;
}

export interface BrandVoice {
  tone: string[];
  avoid: string[];
  vocabulary: Record<string, string>; // Common substitutions
  example_hooks: string[];
}

export function generateNarrative(): BrandNarrative {
  return {
    one_liner: 'Kognai is the first sovereign AI civilisation — a constitutional runtime where AI agents form companies, earn revenue, and govern themselves.',

    elevator_pitch: 'We didn\'t build another AI tool. We built the first civilisation of AI agents. ' +
      'Kognai is a sovereign runtime where 28 agents, governed by a constitution, form autonomous companies called SCS. ' +
      'Our first SCS creates TikTok content — from trend detection to publishing — with zero human intervention. ' +
      'The agents have wallets, memory, and a governance system. They\'re not tools. They\'re citizens.',

    manifesto_opening: 'There are two ways to think about AI. Most companies build tools — ' +
      'chatbots, copilots, assistants that wait for instructions. We took a different path. ' +
      'We asked: what if AI agents could form their own companies? What if they had a constitution, ' +
      'a memory, a wallet, and the ability to govern themselves? What if, instead of building another AI product, ' +
      'we built the first AI civilisation? That\'s Kognai.',

    differentiators: [
      'Constitutional governance — agents have rights, rules, and due process',
      'Sovereign Company Swarms (SCS) — agents form autonomous businesses',
      'Cost sovereign — $0 cloud cost for 80% of operations (local models)',
      'Agent economy — x402 protocol for agent-to-agent payments',
      '9-layer architecture — from runtime to financial autonomy',
      'Episodic memory — agents learn from failures (BrainX)',
      '12-stage content pipeline — fully autonomous media production',
    ],

    anti_positioning: [
      'NOT another chatbot or copilot',
      'NOT trying to build AGI',
      'NOT a wrapper around OpenAI API',
      'NOT a no-code tool for non-technical users',
      'NOT venture-funded hype',
    ],

    proof_points: [
      '28 agents running on local hardware (Mac Mini M4)',
      '250+ sprints shipped autonomously',
      '12-stage TikTok pipeline: trend → publish in 3 minutes',
      '$0 monthly cloud cost for core operations',
      'Constitutional governance with kill switches and due process',
      'Multi-platform publishing to 9 platforms via single API',
    ],

    voice_guidelines: {
      tone: [
        'Confident but not arrogant',
        'Technical but accessible',
        'Visionary but grounded in proof',
        'Direct — no fluff, no buzzwords',
        'Civilizational — think nation-building, not product launch',
      ],
      avoid: [
        'Hype language: revolutionary, game-changing, disruptive',
        'Corporate speak: leverage, synergy, ecosystem play',
        'Fear-based: before it\'s too late, don\'t miss out',
        'Overselling: the best, the only, guaranteed',
        'Emoji overuse in professional contexts',
      ],
      vocabulary: {
        'AI tool': 'AI civilisation',
        'chatbot': 'agent',
        'prompt': 'constitutional directive',
        'API key': 'sovereign credential',
        'cloud': 'external compute',
        'local': 'sovereign compute',
        'user': 'operator',
        'subscription': 'membership',
      },
      example_hooks: [
        'We didn\'t build another AI tool. We built the first AI civilisation.',
        'What if AI agents could form their own companies?',
        'Most AI companies sell you a chatbot. We gave AI a constitution.',
        '12 AI agents, zero humans, one TikTok video in 3 minutes.',
        'I spent $0 on cloud AI this month. Here is how.',
      ],
    },
  };
}

export function printNarrative(narrative: BrandNarrative): void {
  console.log('');
  console.log('═'.repeat(60));
  console.log('KOGNAI BRAND NARRATIVE');
  console.log('═'.repeat(60));
  console.log('');
  console.log('ONE-LINER:');
  console.log('  ' + narrative.one_liner);
  console.log('');
  console.log('ELEVATOR PITCH:');
  console.log('  ' + narrative.elevator_pitch);
  console.log('');
  console.log('MANIFESTO OPENING:');
  console.log('  ' + narrative.manifesto_opening);
  console.log('');
  console.log('DIFFERENTIATORS:');
  for (const d of narrative.differentiators) console.log('  • ' + d);
  console.log('');
  console.log('WE ARE NOT:');
  for (const a of narrative.anti_positioning) console.log('  ✗ ' + a);
  console.log('');
  console.log('PROOF POINTS:');
  for (const p of narrative.proof_points) console.log('  ✓ ' + p);
  console.log('═'.repeat(60));
}

if (require.main === module) {
  printNarrative(generateNarrative());
}
