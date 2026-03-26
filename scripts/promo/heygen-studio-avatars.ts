/**
 * heygen-studio-avatars.ts — Sprint TICKET-008-PROMO-04
 *
 * HeyGen Studio avatar constants for promotional video generation.
 * Studio avatars = photorealistic highest quality (3-5x credits vs standard).
 * API is identical to standard avatars — different avatar_id only.
 *
 * Usage:
 *   import { HEYGEN_STUDIO_AVATARS, pickStudioAvatar } from './heygen-studio-avatars';
 */

export interface StudioAvatar {
  name: string;
  avatarId: string;
  voiceId: string;
  gender: 'male' | 'female';
  style: string;
}

/**
 * HeyGen Studio avatar pool — photorealistic, suitable for promotional content.
 * Rotated per-job to avoid repetition.
 */
export const HEYGEN_STUDIO_AVATARS: StudioAvatar[] = [
  {
    name: 'Monica Studio',
    avatarId: 'Monica_public_Casual_20240819', // expressive studio-quality
    voiceId: 'M2WosQ2Ju3f2b7jdddsj',
    gender: 'female',
    style: 'casual-studio',
  },
  {
    name: 'Eric Studio',
    avatarId: 'Eric_public_3_20240219',
    voiceId: 'a50b2b18a4bf49109caf46a3a6c6a08a',
    gender: 'male',
    style: 'professional-studio',
  },
  {
    name: 'Abigail Expressive',
    avatarId: 'Abigail_expressive_2024112501',
    voiceId: 'M2WosQ2Ju3f2b7jdddsj',
    gender: 'female',
    style: 'expressive-studio',
  },
  {
    name: 'Aditya Studio',
    avatarId: 'Aditya_public_4',
    voiceId: 'a50b2b18a4bf49109caf46a3a6c6a08a',
    gender: 'male',
    style: 'casual-studio',
  },
  {
    name: 'Ann Business Studio',
    avatarId: 'Ann_Business_Sitting_public',
    voiceId: 'M2WosQ2Ju3f2b7jdddsj',
    gender: 'female',
    style: 'business-studio',
  },
];

/**
 * Pick a Studio avatar deterministically by jobId (consistent per job).
 */
export function pickStudioAvatar(jobId: string): StudioAvatar {
  let hash = 0;
  for (const ch of jobId) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return HEYGEN_STUDIO_AVATARS[Math.abs(hash) % HEYGEN_STUDIO_AVATARS.length];
}
