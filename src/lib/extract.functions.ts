import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { aparatApiEndpoints, aparatHash, mediaUrlsIn, pickAparatVideo, publicVideoUrl } from "./public-video-url";

export type FoundVideo = { url: string; kind: "file" | "hls" | "youtube" | "vimeo" | "embed" };

const MEDIA = /https?:\/\/[^\s"'<>\\]+?\.(?:mp4|webm|ogv|ogg|mov|m4v|m3u8)(?:\?[^\s"'<>\\]*)?/gi;

const ORDER = ["hls", "file", "youtube", "vimeo", "embed"];
function sortVideos(list: FoundVideo[]) {
  return list.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)).slice(0, 12);
}

function classify(url: string): FoundVideo["kind"] {
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/vimeo\.com/i.test(url)) return "vimeo";
  if (/\.m3u8/i.test(url)) return "hls";
  if (/\.(mp4|webm|ogv|ogg|mov|m4v)/i.test(url)) return "file";
  return "embed";
}

const UA = "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Mobile Safari/537.36";

async function boundedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    while (bytes < 3_000_000) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 3_000_000) throw new Error("Page too large");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { await reader.cancel(); }
}

/** Aparat exposes the real stream behind its embed frame through its public API. */
async function resolveAparat(url: URL): Promise<FoundVideo[]> {
  const hash = aparatHash(url);
  if (!hash) return [];
  for (const endpoint of aparatApiEndpoints(hash)) {
    try {
      const res = await fetch(endpoint, { redirect: "error", signal: AbortSignal.timeout(8000), headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!res.ok) continue;
      const urls = mediaUrlsIn(await boundedText(res));
      const best = pickAparatVideo(urls);
      if (best) return [best, ...urls.filter((u) => u !== best)].map((u) => ({ url: u, kind: classify(u) }));
    } catch {
      /* try the next endpoint */
    }
  }
  return [];
}

/** Fetches a public web page and looks for playable video addresses inside it. */
export const findVideosInPage = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ url: z.string().url().max(2000) }).parse(d))
  .handler(async ({ data }): Promise<{ videos: FoundVideo[]; error: string | null }> => {
    const target = publicVideoUrl(data.url);
    if (!target) {
      return { videos: [], error: "That address can't be opened." };
    }
    // Resolve through a fixed public DNS endpoint before fetching an arbitrary
    // page. Reject private/IPv6 answers; redirects are disabled below.
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(target.hostname)) {
      try {
        const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(target.hostname)}&type=A`, {
          headers: { Accept: "application/dns-json" }, signal: AbortSignal.timeout(4000), redirect: "error",
        });
        const dns = await response.json() as { Answer?: { type: number; data: string }[] };
        const ips = dns.Answer?.filter((answer) => answer.type === 1) ?? [];
        if (!ips.length || ips.some((answer) => !publicVideoUrl(`https://${answer.data}`))) return { videos: [], error: "That address can't be opened." };
      } catch { return { videos: [], error: "The page address could not be verified. Try again later." }; }
    }
    if (aparatHash(target)) {
      const aparat = await resolveAparat(target);
      if (aparat.length) return { videos: aparat.slice(0, 12), error: null };
    }
    try {
      const res = await fetch(data.url, {
        signal: AbortSignal.timeout(12000),
        headers: { "User-Agent": UA, Accept: "text/html,*/*" },
        redirect: "error",
      });
      if (!res.ok) return { videos: [], error: "The page could not be opened." };
      const contentType = res.headers.get("content-type") ?? "";
      if (!/html|json|text/i.test(contentType)) return { videos: [], error: "This address is not a video page." };
      const html = (await boundedText(res)).replace(/\\\//g, "/").replace(/&amp;/g, "&");
      const base = res.url || data.url;
      const found = new Set<string>();
      const add = (raw: string | undefined) => {
        if (!raw) return;
        try {
          const url = publicVideoUrl(new URL(raw.trim(), base).toString());
          if (url) found.add(url.toString());
        } catch {
          /* ignore */
        }
      };
      for (const m of html.matchAll(MEDIA)) add(m[0]);
      for (const m of html.matchAll(/<(?:video|source)[^>]+src=["']([^"']+)["']/gi)) add(m[1]);
      for (const m of html.matchAll(/property=["']og:video(?::secure_url|:url)?["'][^>]*content=["']([^"']+)["']/gi)) add(m[1]);
      for (const m of html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)) {
        if (/youtube|youtu\.be|vimeo|player|embed|video/i.test(m[1] ?? "")) add(m[1]);
      }
      return { videos: sortVideos([...found].map((url) => ({ url, kind: classify(url) }))), error: null };
    } catch {
      return { videos: [], error: "The page could not be opened." };
    }
  });
