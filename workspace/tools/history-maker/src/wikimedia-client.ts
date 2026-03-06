/**
 * wikimedia-client.ts
 * Sprint-062: Fetch public domain historical paintings and maps from Wikimedia Commons.
 *
 * Uses the MediaWiki Action API — no API key required.
 * Primary strategy: category-based lookup (reliable, curated results).
 * Fallback: full-text search in File namespace.
 *
 * Returns only high-resolution JPEG/PNG images (≥600px wide).
 */

const API = 'https://commons.wikimedia.org/w/api.php';
const UA  = 'Kognai/1.0 (history-maker; kognai-bot)';

export interface WikimediaImage {
  pageId: number;
  title: string;       // e.g. "File:Map_of_London_1700.jpg"
  imageUrl: string;    // Full-resolution direct URL
  thumbUrl: string;    // 800px thumbnail for Claude Vision
  width: number;
  height: number;
  mime: string;        // "image/jpeg" | "image/png"
  description: string; // cleaned snippet
  sourceUrl: string;   // https://commons.wikimedia.org/wiki/File:…
}

/**
 * Fetch images from a Wikimedia Commons category.
 * Categories reliably contain curated, high-quality images.
 * Example: "Historical maps of London" → Category:Historical_maps_of_London
 */
export async function fetchCategoryImages(
  category: string,
  limit = 10,
): Promise<WikimediaImage[]> {
  const catTitle = category.startsWith('Category:') ? category : `Category:${category}`;

  const params = new URLSearchParams({
    action:        'query',
    generator:     'categorymembers',
    gcmtitle:      catTitle,
    gcmtype:       'file',
    gcmlimit:      String(Math.min(limit * 4, 50)), // over-fetch to allow filtering
    prop:          'imageinfo',
    iiprop:        'url|size|mime',
    iiurlwidth:    '800',
    iilimit:       '1',
    format:        'json',
    origin:        '*',
  });

  return _queryAndFilter(`${API}?${params}`, limit);
}

/**
 * Full-text search in Wikimedia Commons File namespace.
 * Less reliable than category lookup — use as fallback.
 */
export async function searchWikimediaImages(
  query: string,
  limit = 10,
): Promise<WikimediaImage[]> {
  const params = new URLSearchParams({
    action:        'query',
    generator:     'search',
    gsrnamespace:  '6',
    gsrsearch:     query,
    gsrlimit:      String(Math.min(limit * 4, 50)),
    prop:          'imageinfo',
    iiprop:        'url|size|mime',
    iiurlwidth:    '800',
    iilimit:       '1',
    format:        'json',
    origin:        '*',
  });

  return _queryAndFilter(`${API}?${params}`, limit);
}

/** Shared fetch + filter logic for both strategies. */
async function _queryAndFilter(url: string, limit: number): Promise<WikimediaImage[]> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Wikimedia API error: ${res.status} ${url}`);

  const data = await res.json() as WikimediaApiResponse;
  const pages = Object.values(data.query?.pages ?? {});
  const results: WikimediaImage[] = [];

  for (const page of pages) {
    if (results.length >= limit) break;
    const info = page.imageinfo?.[0];
    if (!info) continue;

    // Skip non-raster formats (SVG, PDF, OGG, TIFF — Kling/Claude need JPEG/PNG)
    const mime = info.mime ?? '';
    if (!mime.startsWith('image/jpeg') && !mime.startsWith('image/png')) continue;
    if ((info.width ?? 0) < 600) continue;

    // thumburl: Wikimedia 800px resized version, always JPEG regardless of source
    const thumbUrl = info.thumburl ?? info.url;

    results.push({
      pageId:      page.pageid,
      title:       page.title,
      imageUrl:    info.url,
      thumbUrl,
      width:       info.width ?? 0,
      height:      info.height ?? 0,
      mime,
      description: page.title.replace(/^File:/, '').replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '),
      sourceUrl:   `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
    });
  }

  return results;
}

// ── Wikimedia API types ──────────────────────────────────────────────────────

interface WikimediaApiResponse {
  query?: { pages?: Record<string, WikimediaPage> };
}

interface WikimediaPage {
  pageid: number;
  title: string;
  imageinfo?: WikimediaImageInfo[];
}

interface WikimediaImageInfo {
  url: string;
  thumburl?: string;
  width?: number;
  height?: number;
  mime?: string;
}
