/**
 * Phase 1 video sources: youtube, vimeo, file (direct link), upload
 * (Supabase Storage), other (best-effort iframe, sync not guaranteed).
 */
export type SourceType = "none" | "youtube" | "vimeo" | "file" | "upload" | "other";

export type PlayerState = {
  room_id: string;
  source_type: SourceType;
  source_ref: string | null;
  source_title: string | null;
  is_playing: boolean;
  position_seconds: number;
  updated_at: string;
  updated_by: string | null;
};

const FILE_EXT = /\.(mp4|webm|ogg|ogv|mov|m4v|mkv|m3u8)(\?|#|$)/i;

export function parseYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) return url.pathname.slice(1).split("/")[0] ?? null;
    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v) return v;
      const parts = url.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p === "embed" || p === "shorts" || p === "live");
      const next = idx >= 0 ? parts[idx + 1] : undefined;
      if (next) return next;
    }
  } catch {
    return null;
  }
  return null;
}

export function parseVimeoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{6,}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (!url.hostname.includes("vimeo.com")) return null;
    const id = url.pathname.split("/").filter(Boolean)[0];
    return /^\d+$/.test(id ?? "") ? (id ?? null) : null;
  } catch {
    return null;
  }
}

/** Classifies a pasted link into one of the Phase 1 source types. */
export function detectSource(input: string): { type: SourceType; ref: string } | null {
  const value = input.trim();
  if (!value) return null;
  const yt = parseYouTubeId(value);
  if (yt) return { type: "youtube", ref: yt };
  const vimeo = parseVimeoId(value);
  if (vimeo) return { type: "vimeo", ref: vimeo };
  if (FILE_EXT.test(value)) return { type: "file", ref: value };
  if (/^https?:\/\//i.test(value)) return { type: "other", ref: value };
  return null;
}

export const SOURCE_LABEL: Record<SourceType, string> = {
  none: "No video selected",
  youtube: "YouTube",
  vimeo: "Vimeo",
  file: "Direct video link",
  upload: "Uploaded file",
  other: "Embedded link",
};

/** Computes where a client should be right now, given the shared state. */
export function expectedPosition(state: Pick<PlayerState, "is_playing" | "position_seconds" | "updated_at">) {
  if (!state.is_playing) return state.position_seconds;
  const elapsed = (Date.now() - new Date(state.updated_at).getTime()) / 1000;
  return state.position_seconds + Math.max(0, elapsed);
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
