import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type YouTubeResult = {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
};

/**
 * YouTube Data API v3 search.
 *
 * SETUP: the API key is read from the server-side env var `YOUTUBE_API_KEY`.
 * Add it in Project Settings → Secrets with the name `YOUTUBE_API_KEY`
 * (create the key at https://console.cloud.google.com → enable "YouTube Data
 * API v3" → Credentials → API key). Until it is set, in-app search returns a
 * friendly message and the "paste a YouTube link" path keeps working.
 */
export const searchYouTube = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ query: z.string().min(1).max(120) }).parse(data))
  .handler(async ({ data }): Promise<{ results: YouTubeResult[]; error?: string }> => {
    const apiKey = process.env["YOUTUBE_API_KEY"];
    if (!apiKey) {
      return {
        results: [],
        error:
          "YouTube search isn't configured yet. Add a YOUTUBE_API_KEY secret, or paste a YouTube link instead.",
      };
    }

    const url = new URL("https://www.googleapis.com/youtube/v3/search");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("type", "video");
    url.searchParams.set("maxResults", "12");
    url.searchParams.set("q", data.query);
    url.searchParams.set("key", apiKey);

    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text();
      console.error(`YouTube search failed [${response.status}]: ${body}`);
      return { results: [], error: "YouTube search is unavailable right now." };
    }

    const payload = (await response.json()) as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: {
          title?: string;
          channelTitle?: string;
          thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
        };
      }>;
    };

    const results: YouTubeResult[] = (payload.items ?? [])
      .filter((item) => item.id?.videoId)
      .map((item) => ({
        videoId: item.id!.videoId!,
        title: item.snippet?.title ?? "Untitled",
        channel: item.snippet?.channelTitle ?? "",
        thumbnail:
          item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? "",
      }));

    return { results };
  });
