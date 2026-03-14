// Phase 1 — TikTok Content Agent | TikTok Client Config

export const TIKTOK_CONFIG = {
  baseUrl: 'https://open.tiktokapis.com/v2',
  defaultPrivacyLevel: 'SELF_ONLY' as 'SELF_ONLY' | 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS',
  accessToken: process.env.TIKTOK_ACCESS_TOKEN || '',
};
