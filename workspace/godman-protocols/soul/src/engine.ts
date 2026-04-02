/**
 * SOUL — Sovereign Open Universal Layer
 * "One layer. Every chain. Every model. SOUL."
 *
 * Core engine: SoulValidator, SoulPublisher, SoulVerifier,
 * parseSoulMd(), generateSoulMd().
 *
 * @version 0.3.0
 */

import { createHash } from 'node:crypto';
import type {
  ERC8004Anchor,
  SHA256Hash,
  SoulDocument,
  SoulPublisherConfig,
  SoulSection,
  SoulSectionKey,
  SoulValidationResult,
  SoulVerificationResult,
} from './types.js';

import {
  REQUIRED_SECTION_KEYS,
  SOUL_SECTION_TITLES,
} from './types.js';

// ---------------------------------------------------------------------------
// SHA-256 utility
// ---------------------------------------------------------------------------

/**
 * Compute SHA-256 hex digest of a string.
 */
export function sha256(content: string): SHA256Hash {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Section key <-> title mapping
// ---------------------------------------------------------------------------

/** Map from human-readable title to section key */
const TITLE_TO_KEY: ReadonlyMap<string, SoulSectionKey> = new Map(
  (Object.entries(SOUL_SECTION_TITLES) as [SoulSectionKey, string][]).map(
    ([key, title]) => [title, key]
  )
);

/**
 * Normalise a heading string to match against known section titles.
 * Strips leading '#' characters, trims whitespace.
 */
function normaliseHeading(raw: string): string {
  return raw.replace(/^#+\s*/, '').trim();
}

// ---------------------------------------------------------------------------
// parseSoulMd — parse SOUL.md markdown into SoulDocument
// ---------------------------------------------------------------------------

/**
 * Parse a SOUL.md markdown string into a SoulDocument.
 *
 * Expected format:
 * ```
 * # SOUL — <agent_name>
 *
 * ## Who We Are
 * <content>
 *
 * ## Why We Exist
 * <content>
 * ...
 * ```
 *
 * Metadata (agent_did, created_at, etc.) can be provided via `defaults`
 * since they are not typically present in the markdown itself.
 */
export function parseSoulMd(
  markdown: string,
  defaults?: {
    agent_did?: string;
    created_at?: string;
    updated_at?: string;
    erc8004_anchor?: ERC8004Anchor;
  }
): SoulDocument {
  const lines = markdown.split('\n');

  // Extract agent name from first H1 heading
  let agentName = 'Unknown Agent';
  const h1Match = lines.find((l) => /^#\s+/.test(l) && !/^##/.test(l));
  if (h1Match) {
    const cleaned = normaliseHeading(h1Match);
    // Strip "SOUL — " or "SOUL - " prefix if present
    agentName = cleaned.replace(/^SOUL\s*[—\-]\s*/, '').trim() || agentName;
  }

  // Split into sections by ## headings
  const sections: { title: string; content: string }[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      // Save previous section
      if (currentTitle !== null) {
        sections.push({
          title: currentTitle,
          content: currentLines.join('\n').trim(),
        });
      }
      currentTitle = normaliseHeading(line);
      currentLines = [];
    } else if (currentTitle !== null) {
      currentLines.push(line);
    }
  }
  // Save last section
  if (currentTitle !== null) {
    sections.push({
      title: currentTitle,
      content: currentLines.join('\n').trim(),
    });
  }

  // Build section map
  const sectionMap = new Map<SoulSectionKey, SoulSection>();
  for (const section of sections) {
    const key = TITLE_TO_KEY.get(section.title);
    if (key) {
      sectionMap.set(key, {
        title: section.title,
        content: section.content,
        immutable: key === 'what_we_will_never_do' || key === 'constitutional_foundation',
      });
    }
  }

  // Fill missing sections with empty placeholders
  const now = new Date().toISOString();
  const buildSection = (key: SoulSectionKey): SoulSection => {
    return sectionMap.get(key) ?? {
      title: SOUL_SECTION_TITLES[key],
      content: '',
      immutable: key === 'what_we_will_never_do' || key === 'constitutional_foundation',
    };
  };

  return {
    soul_version: '1.0',
    agent_name: agentName,
    agent_did: defaults?.agent_did ?? '',
    created_at: defaults?.created_at ?? now,
    updated_at: defaults?.updated_at ?? now,
    who_we_are: buildSection('who_we_are'),
    why_we_exist: buildSection('why_we_exist'),
    what_we_believe: buildSection('what_we_believe'),
    what_we_will_never_do: buildSection('what_we_will_never_do'),
    what_we_owe_the_world: buildSection('what_we_owe_the_world'),
    what_we_owe_each_other: buildSection('what_we_owe_each_other'),
    founding_intention: buildSection('founding_intention'),
    self_committed_swarms: buildSection('self_committed_swarms'),
    constitutional_foundation: buildSection('constitutional_foundation'),
    erc8004_anchor: defaults?.erc8004_anchor,
  };
}

// ---------------------------------------------------------------------------
// generateSoulMd — generate SOUL.md markdown from SoulDocument
// ---------------------------------------------------------------------------

/**
 * Generate a SOUL.md markdown string from a SoulDocument.
 *
 * Output format:
 * ```
 * # SOUL — <agent_name>
 *
 * ## Who We Are
 * <content>
 * ...
 * ```
 */
export function generateSoulMd(doc: SoulDocument): string {
  const parts: string[] = [];

  // Title
  parts.push(`# SOUL — ${doc.agent_name}`);
  parts.push('');

  // Each section in canonical order
  for (const key of REQUIRED_SECTION_KEYS) {
    const section: SoulSection = doc[key];
    parts.push(`## ${section.title}`);
    parts.push('');
    if (section.content) {
      parts.push(section.content);
      parts.push('');
    }
  }

  return parts.join('\n').trimEnd() + '\n';
}

// ---------------------------------------------------------------------------
// SoulValidator — validates required sections and format compliance
// ---------------------------------------------------------------------------

/**
 * Validates SoulDocument instances against the SOUL format specification.
 */
export class SoulValidator {
  /**
   * Validate a SoulDocument for completeness and format compliance.
   */
  validate(doc: SoulDocument): SoulValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check version
    if (doc.soul_version !== '1.0') {
      errors.push(`Invalid soul_version: expected "1.0", got "${doc.soul_version}"`);
    }

    // Check agent metadata
    if (!doc.agent_name || doc.agent_name.trim().length === 0) {
      errors.push('agent_name is required and must not be empty');
    }

    if (!doc.agent_did || doc.agent_did.trim().length === 0) {
      warnings.push('agent_did is empty — on-chain anchoring requires a DID');
    }

    if (!doc.created_at) {
      errors.push('created_at timestamp is required');
    }

    if (!doc.updated_at) {
      errors.push('updated_at timestamp is required');
    }

    // Check all 9 required sections exist and have content
    for (const key of REQUIRED_SECTION_KEYS) {
      const section: SoulSection | undefined = doc[key];
      if (!section) {
        errors.push(`Missing required section: ${SOUL_SECTION_TITLES[key]} (${key})`);
        continue;
      }

      if (!section.title || section.title.trim().length === 0) {
        errors.push(`Section "${key}" has empty title`);
      }

      if (!section.content || section.content.trim().length === 0) {
        warnings.push(`Section "${key}" (${section.title}) has no content`);
      }
    }

    // Validate immutability flags on key sections
    if (doc.what_we_will_never_do && !doc.what_we_will_never_do.immutable) {
      warnings.push('"What We Will Never Do" section should be marked immutable');
    }

    if (doc.constitutional_foundation && !doc.constitutional_foundation.immutable) {
      warnings.push('"Constitutional Foundation" section should be marked immutable');
    }

    // Validate ERC-8004 anchor if present
    if (doc.erc8004_anchor) {
      const anchor = doc.erc8004_anchor;
      if (!anchor.token_id) {
        errors.push('ERC-8004 anchor: token_id is required');
      }
      if (!anchor.soul_hash) {
        errors.push('ERC-8004 anchor: soul_hash is required');
      }
      if (!anchor.chain_id) {
        errors.push('ERC-8004 anchor: chain_id is required');
      }
      if (!anchor.contract_address) {
        errors.push('ERC-8004 anchor: contract_address is required');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate a SOUL.md markdown string by parsing it first.
   */
  validateMarkdown(markdown: string): SoulValidationResult {
    const doc = parseSoulMd(markdown);
    return this.validate(doc);
  }
}

// ---------------------------------------------------------------------------
// SoulPublisher — hosts SOUL.md at /.well-known/soul.md
// ---------------------------------------------------------------------------

/**
 * Publishes a SoulDocument as a SOUL.md endpoint.
 *
 * In v0.3.0 this is a lightweight utility that generates the markdown
 * and computes the hash. Full HTTP server implementation is deferred
 * to v0.4.0 (requires server/client packages).
 */
export class SoulPublisher {
  private document: SoulDocument;
  private config: Required<SoulPublisherConfig>;

  constructor(doc: SoulDocument, config?: SoulPublisherConfig) {
    this.document = doc;
    this.config = {
      port: config?.port ?? 3000,
      hostname: config?.hostname ?? '0.0.0.0',
      path: config?.path ?? '/.well-known/soul.md',
    };
  }

  /**
   * Generate the SOUL.md markdown content for publishing.
   */
  getMarkdown(): string {
    return generateSoulMd(this.document);
  }

  /**
   * Compute the SHA-256 hash of the generated SOUL.md content.
   * This is the value that should be anchored on-chain via ERC-8004.
   */
  getHash(): SHA256Hash {
    return sha256(this.getMarkdown());
  }

  /**
   * Get the full endpoint path where SOUL.md would be served.
   */
  getEndpoint(): string {
    return this.config.path;
  }

  /**
   * Get the publisher configuration.
   */
  getConfig(): Required<SoulPublisherConfig> {
    return { ...this.config };
  }

  /**
   * Build the ERC-8004 anchor metadata for this published SOUL.md.
   */
  buildAnchor(params: {
    token_id: string;
    chain_id: number;
    contract_address: string;
  }): ERC8004Anchor {
    return {
      token_id: params.token_id,
      soul_hash: this.getHash(),
      chain_id: params.chain_id,
      contract_address: params.contract_address,
    };
  }
}

// ---------------------------------------------------------------------------
// SoulVerifier — fetch SOUL.md + verify SHA-256 hash matches on-chain
// ---------------------------------------------------------------------------

/**
 * Verifies that a SOUL.md content matches its on-chain ERC-8004 anchor.
 *
 * In v0.3.0 this provides local hash verification. On-chain fetch
 * (via ethers/viem) is deferred to v0.4.0 server package.
 */
export class SoulVerifier {
  /**
   * Verify a SOUL.md markdown string against an expected SHA-256 hash.
   */
  verify(markdown: string, expectedHash: SHA256Hash): SoulVerificationResult {
    const computedHash = sha256(markdown);
    const matches = computedHash === expectedHash;

    return {
      verified: matches,
      computed_hash: computedHash,
      on_chain_hash: expectedHash,
      reason: matches
        ? 'SOUL.md hash matches on-chain ERC-8004 anchor'
        : `Hash mismatch: computed ${computedHash} !== on-chain ${expectedHash}`,
    };
  }

  /**
   * Verify a SoulDocument against its own ERC-8004 anchor.
   * Returns unverified if no anchor is present.
   */
  verifyDocument(doc: SoulDocument): SoulVerificationResult {
    const markdown = generateSoulMd(doc);
    const computedHash = sha256(markdown);

    if (!doc.erc8004_anchor) {
      return {
        verified: false,
        computed_hash: computedHash,
        on_chain_hash: null,
        reason: 'No ERC-8004 anchor present — cannot verify on-chain',
      };
    }

    return this.verify(markdown, doc.erc8004_anchor.soul_hash);
  }

  /**
   * Compute the SHA-256 hash of a SOUL.md markdown string.
   * Utility method for pre-anchoring verification.
   */
  computeHash(markdown: string): SHA256Hash {
    return sha256(markdown);
  }
}
