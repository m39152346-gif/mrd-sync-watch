import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

/** Aparat exposes the real stream behind its embed frame through its public API. */
async function resolveAparat(url: URL): Promise<FoundVideo[]> {
  const hash =
    url.pathname.match(/videohash\/([A-Za-z0-9]+)/)?.[1] ??
    url.pathname.match(/\/v\/([A-Za-z0-9]+)/)?.[1] ??
    url.searchParams.get("videohash");
  if (!hash) return [];
  const out: FoundVideo[] = [];
  const endpoints = [
    `https://www.aparat.com/api/fa/v1/video/video/show/videohash/${hash}?pr=1&mf=1`,
    `https://www.aparat.com/etc/api/video/videohash/${hash}`,
  ];
  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!res.ok) continue;
      const text = (await res.text()).replace(/\\\//g, "/");
      for (const m of text.matchAll(MEDIA)) {
        if (!out.some((v) => v.url === m[0])) out.push({ url: m[0], kind: classify(m[0]) });
      }
      if (out.length) break;
    } catch {
      /* try the next endpoint */
    }
  }
  return out;
}

/** Fetches a public web page and looks for playable video addresses inside it. */
export const findVideosInPage = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ url: z.string().url().max(2000) }).parse(d))
  .handler(async ({ data }): Promise<{ videos: FoundVideo[]; error: string | null }> => {
    const target = new URL(data.url);
    const host = target.hostname.toLowerCase();
    if (
      !/^https?:$/.test(target.protocol) ||
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
      host.startsWith("[")
    ) {
      return { videos: [], error: "That address can't be opened." };
    }
    if (host.endsWith("aparat.com")) {
      const aparat = await resolveAparat(target);
      if (aparat.length) return { videos: sortVideos(aparat), error: null };
    }
    try {
      const res = await fetch(data.url, {
        signal: AbortSignal.timeout(12000),
        headers: { "User-Agent": UA, Accept: "text/html,*/*" },
        redirect: "follow",
      });
      if (!res.ok) return { videos: [], error: "The page could not be opened." };
      const html = (await res.text()).slice(0, 3_000_000).replace(/\\\//g, "/").replace(/&amp;/g, "&");
      const base = res.url || data.url;
      const found = new Set<string>();
      const add = (raw: string | undefined) => {
        if (!raw) return;
        try {
          found.add(new URL(raw.trim(), base).toString());
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
