// SCS-001 — Video Hosting Service (Sprint 099)
// Uploads local video files to Supabase Storage and returns publicly accessible URLs.
// Required for TikTok PULL_FROM_URL API — TikTok cannot fetch local filesystem paths.
//
// Usage: const svc = new VideoHostingService(); const hosted = await svc.upload(localPath, runId);
// Config: SUPABASE_URL + SUPABASE_SERVICE_KEY in .env

import { readFileSync } from 'fs';
import { basename } from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface HostedVideo {
  local_path:   string;
  public_url:   string;
  bucket:       string;
  storage_path: string;
  uploaded_at:  string;
  size_bytes:   number;
}

export class VideoHostingService {
  private supabase: SupabaseClient;
  private bucket: string;

  constructor(opts?: { supabaseUrl?: string; supabaseKey?: string; bucket?: string }) {
    const url = opts?.supabaseUrl ?? process.env.SUPABASE_URL ?? '';
    const key = opts?.supabaseKey ?? process.env.SUPABASE_SERVICE_KEY ?? '';
    this.bucket = opts?.bucket ?? 'scs001-videos';
    this.supabase = createClient(url, key);
  }

  async upload(localPath: string, runId: string): Promise<HostedVideo> {
    const fileBuffer = readFileSync(localPath);
    const storagePath = runId + '/' + basename(localPath);

    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(storagePath, fileBuffer, { contentType: 'video/mp4', upsert: true });

    if (error) {
      throw new Error('[VideoHostingService] Upload failed: ' + error.message);
    }

    const { data } = this.supabase.storage.from(this.bucket).getPublicUrl(storagePath);

    console.log('[VideoHostingService] Uploaded ' + basename(localPath) + ' → ' + data.publicUrl);

    return {
      local_path:   localPath,
      public_url:   data.publicUrl,
      bucket:       this.bucket,
      storage_path: storagePath,
      uploaded_at:  new Date().toISOString(),
      size_bytes:   fileBuffer.length,
    };
  }

  async ensureBucket(): Promise<void> {
    const { data: buckets } = await this.supabase.storage.listBuckets();
    const exists = (buckets ?? []).some(b => b.name === this.bucket);
    if (!exists) {
      const { error } = await this.supabase.storage.createBucket(this.bucket, { public: true });
      if (error) throw new Error('[VideoHostingService] Bucket creation failed: ' + error.message);
      console.log('[VideoHostingService] Created public bucket: ' + this.bucket);
    } else {
      console.log('[VideoHostingService] Bucket ' + this.bucket + ' ready');
    }
  }

  // Returns true if Supabase env vars are set — used by PublishingAgent to decide
  // whether to attempt hosting. Avoids crashing when not configured.
  static isConfigured(): boolean {
    return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
  }
}
