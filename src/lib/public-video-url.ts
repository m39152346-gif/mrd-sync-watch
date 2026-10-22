export function publicVideoUrl(input: string): URL | null {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port))) return null;
    if (!host.includes(".") || host.startsWith("[") || /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a = 0, b = 0] = host.split(".").map(Number);
      if ([0, 10, 127].includes(a) || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19].includes(b))) return null;
    }
    return url;
  } catch { return null; }
}

export function isAparatHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "aparat.com" || host.endsWith(".aparat.com");
}

export function aparatHash(url: URL): string | null {
  if (!isAparatHost(url.hostname)) return null;
  const path = url.pathname;
  const hash =
    path.match(/\/videohash\/([A-Za-z0-9]+)/)?.[1] ??
    path.match(/\/v\/([A-Za-z0-9]+)/)?.[1] ??
    path.match(/\/embed\/(?!videohash(?:\/|$))([A-Za-z0-9]+)/)?.[1] ??
    url.searchParams.get("videohash");
  return hash && /^[A-Za-z0-9]{3,64}$/.test(hash) ? hash : null;
}

/** The official Aparat player page for a video (works for any pasted Aparat link or embed code). */
export function aparatEmbedUrl(hash: string) {
  return `https://www.aparat.com/video/video/embed/videohash/${hash}/vt/frame`;
}

/** Public Aparat API endpoints that list the real video files of a video. */
export function aparatApiEndpoints(hash: string) {
  return [
    `https://www.aparat.com/api/fa/v1/video/video/show/videohash/${hash}?pr=1&mf=1`,
    `https://www.aparat.com/etc/api/video/videohash/${hash}`,
  ];
}

const MEDIA_URL = /https?:\/\/[^\s"'<>\\]+?\.(?:mp4|webm|m3u8)(?:\?[^\s"'<>\\]*)?/gi;

/** Pulls video file addresses out of an API/page response. */
export function mediaUrlsIn(text: string): string[] {
  const clean = text.replace(/\\\//g, "/");
  return [...new Set([...clean.matchAll(MEDIA_URL)].map((m) => m[0]))];
}

/**
 * Picks the best file for watching together: an MP4 (plays everywhere without
 * extra permissions) closest to 720p, so phones don't stutter on 1080p.
 */
export function pickAparatVideo(urls: string[]): string | null {
  const quality = (url: string) => Number(url.match(/(\d{3,4})p/i)?.[1] ?? 0);
  const mp4 = urls.filter((u) => /\.mp4(\?|$)/i.test(u));
  if (mp4.length) {
    const ranked = [...mp4].sort((a, b) => {
      const qa = quality(a) || 480;
      const qb = quality(b) || 480;
      const score = (q: number) => (q <= 720 ? 720 - q : 1000 + q);
      return score(qa) - score(qb);
    });
    return ranked[0] ?? null;
  }
  return urls.find((u) => /\.m3u8/i.test(u)) ?? urls[0] ?? null;
}