import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { PlayerState } from "./sources";

// Separate from legacy guest tokens, which used to be publicly readable.
const KEY = "syncwatch.room_permission.v1";
export function getRoomKey(): string {
  const existing = localStorage.getItem(KEY);
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  localStorage.setItem(KEY, key);
  return key;
}

export type RoomClient = SupabaseClient<Database>;
/** Call only from browser effects/handlers; never shares account auth storage. */
export function createRoomClient(): RoomClient {
  const roomKey = getRoomKey();
  const apiKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;
  return createClient<Database>(import.meta.env["VITE_SUPABASE_URL"] as string, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { "x-room-key": roomKey },
      fetch: (input, init) => {
        const headers = new Headers(input instanceof Request ? input.headers : undefined);
        new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
        if (headers.get("authorization") === `Bearer ${apiKey}` && apiKey.startsWith("sb_")) headers.delete("authorization");
        headers.set("apikey", apiKey);
        headers.set("x-room-key", roomKey);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export type RoomParticipant = {
  id: string; display_name: string; color: string; is_host: boolean; last_seen_at: string;
};
export type AdmissionRequest = { id: string; display_name: string };
export type RoomSnapshot = {
  status: "unknown" | "missing" | "legacy" | "pending" | "approved" | "rejected";
  room_id?: string; member_id?: string; topic?: string;
  state?: PlayerState; participants?: RoomParticipant[]; requests?: AdmissionRequest[];
  server_time?: string;
};
export async function roomSnapshot(client: RoomClient, code: string): Promise<RoomSnapshot> {
  const { data, error } = await client.rpc("sw_snapshot", { _code: code });
  if (error) throw error;
  return data as unknown as RoomSnapshot;
}