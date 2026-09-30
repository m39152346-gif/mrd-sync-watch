import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type FoundVideo = { url: string; kind: "file" | "hls" | "youtube" | "vimeo" | "embed" };

const MEDIA = /https?:\/\/[^\s"'<>\\]+?\.(?:mp4|webm|ogv|ogg|mov|m4v|m3u8)(?:\?[^\s"'<>\\]*)?/gi;

function classify(url: string): FoundVideo["kind"] {
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/vimeo\.com/i.test(url)) return "vimeo";
  if (/\.m3u8/i.test(url)) return "hls";
  if (/\.(mp4|webm|ogv|ogg|mov|m4v)/i.test(url)) return "file";
  return "embed";
}

/** Fetches a public web page and looks for playable video addresses inside it. */
export const findVideosInPage = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ url: z.string().url().max(2000) }).parse(d))
  .handler(async ({ data }): Promise<{ videos: FoundVideo[]; error: string | null }> => {
    try {
      const res = await fetch(data.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SyncWatch/1.0)", Accept: "text/html,*/*" },
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
      const videos = [...found]
        .map((url) => ({ url, kind: classify(url) }))
        .sort((a, b) => ["hls", "file", "youtube", "vimeo", "embed"].indexOf(a.kind) - ["hls", "file", "youtube", "vimeo", "embed"].indexOf(b.kind))
        .slice(0, 12);
      return { videos, error: null };
    } catch {
      return { videos: [], error: "The page could not be opened." };
    }
  });
