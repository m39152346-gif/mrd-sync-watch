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

export function aparatHash(url: URL): string | null {
  if (url.hostname !== "aparat.com" && !url.hostname.endsWith(".aparat.com")) return null;
  const hash = url.pathname.match(/(?:videohash|\/v|video\/video\/embed)\/([A-Za-z0-9]+)/)?.[1] ?? url.searchParams.get("videohash");
  return hash && /^[A-Za-z0-9]{3,64}$/.test(hash) ? hash : null;
}