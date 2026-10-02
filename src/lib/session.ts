/**
 * Guest/participant session identity. Guests never need an account: we mint a
 * random session token in localStorage and use it as their identity inside a
 * room. Logged-in users reuse the same token but also carry a user_id.
 */

const TOKEN_KEY = "syncwatch.session_token";
const NAME_KEY = "syncwatch.display_name";

export const AVATAR_COLORS = [
  "#22d3ee",
  "#a78bfa",
  "#f472b6",
  "#fbbf24",
  "#34d399",
  "#60a5fa",
  "#fb923c",
  "#f87171",
];

export function getSessionToken(): string {
  if (typeof window === "undefined") return "";
  let token = window.localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    window.localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

export function getStoredName(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(NAME_KEY) ?? "";
}

export function setStoredName(name: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NAME_KEY, name);
}

export function colorForToken(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i++) hash = (hash * 31 + token.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]!;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const RECENT_KEY = "syncwatch.recent_rooms";
export type RecentRoom = { code: string; at: number };

export function getRecentRooms(): RecentRoom[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as RecentRoom[];
    return Array.isArray(list) ? list.slice(0, 5) : [];
  } catch {
    return [];
  }
}

export function addRecentRoom(code: string) {
  try {
    const list = getRecentRooms().filter((r) => r.code !== code);
    localStorage.setItem(RECENT_KEY, JSON.stringify([{ code, at: Date.now() }, ...list].slice(0, 5)));
  } catch {
    /* storage unavailable */
  }
}

/** Remembers the last local playback spot per room so a rejoin resumes there. */
export function savePlaybackSpot(roomId: string, ref: string, seconds: number) {
  try {
    localStorage.setItem(`syncwatch.spot.${roomId}`, JSON.stringify({ ref, seconds }));
  } catch {
    /* ignore */
  }
}

export function getPlaybackSpot(roomId: string): { ref: string; seconds: number } | null {
  try {
    return JSON.parse(localStorage.getItem(`syncwatch.spot.${roomId}`) ?? "null");
  } catch {
    return null;
  }
}
