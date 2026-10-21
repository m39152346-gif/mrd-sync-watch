import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, Loader2, MessageSquare, X } from "lucide-react";
import { toast } from "sonner";

import { ChatPanel } from "@/components/ChatPanel";
import { PlaybackControls } from "@/components/PlaybackControls";
import { SourcePanel } from "@/components/SourcePanel";
import { VideoStage, type PlayerHandle } from "@/components/VideoStage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  colorForToken,
  getSessionToken,
  getStoredName,
  initials,
  setStoredName,
  addRecentRoom,
} from "@/lib/session";
import { expectedPosition, learnClockOffset, SOURCE_LABEL, type PlayerState, type SourceType } from "@/lib/sources";

export const Route = createFileRoute("/room/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Room ${params.code} — SyncWatch` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "description",
        content: `Join SyncWatch room ${params.code} to watch videos in sync with live chat.`,
      },
      { property: "og:title", content: `Join SyncWatch room ${params.code}` },
      {
        property: "og:description",
        content: "One shared player, synchronized playback and live chat. No account needed.",
      },
    ],
  }),
  component: RoomPage,
});

type Participant = {
  id: string;
  session_token: string;
  display_name: string;
  color: string;
  is_host: boolean;
  last_seen_at: string;
};

const SYNC_TOLERANCE = 0.6;

function RoomPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();

  const [roomId, setRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [state, setState] = useState<PlayerState | null>(null);
  const [position, setPosition] = useState(0);
  const [playerReady, setPlayerReady] = useState(0);
  const [duration, setDuration] = useState(0);
  const [copied, setCopied] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [token, setToken] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<PlayerState | null>(null);
  stateRef.current = state;

  const playerRef = useRef<PlayerHandle>(null);
  const applyingRef = useRef(false);
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const color = token ? colorForToken(token) : "#22d3ee";

  // Resolve the room from its code.
  useEffect(() => {
    let active = true;
    supabase
      .from("rooms")
      .select("id, code")
      .eq("code", code.toUpperCase())
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setRoomId(data?.id ?? null);
        setLoading(false);
      });
    setName(getStoredName());
    setToken(getSessionToken());
    addRecentRoom(code.toUpperCase());
    return () => {
      active = false;
    };
  }, [code]);

  // Join the room as a participant, keep a heartbeat, and leave on unload.
  useEffect(() => {
    if (!roomId || !name || !token) return;
    let active = true;

    const join = async () => {
      const { data: others } = await supabase.from("participants").select("session_token")
        .eq("room_id", roomId).neq("session_token", token)
        .gt("last_seen_at", new Date(Date.now() - 90000).toISOString());
      if (others?.length === 0) {
        await supabase.from("player_state").update({ is_playing: false }).eq("room_id", roomId);
      }
      const { error } = await supabase.from("participants").upsert(
        {
          room_id: roomId,
          session_token: token,
          display_name: name,
          color,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "room_id,session_token" },
      );
      if (error) toast.error("Could not join the viewer list. Check your connection.");
    };
    void join();

    const heartbeat = setInterval(() => {
      void supabase
        .from("participants")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("room_id", roomId)
        .eq("session_token", token);
    }, 25000);

    const leave = () => {
      const current = stateRef.current;
      const otherActive = participantsRef.current.some((p) => p.session_token !== token && Date.now() - new Date(p.last_seen_at).getTime() < 90000);
      if (!otherActive && current) {
        void supabase.from("player_state").update({ is_playing: false, position_seconds: playerRef.current?.getTime() ?? current.position_seconds }).eq("room_id", roomId);
      }
      void supabase
        .from("participants")
        .delete()
        .eq("room_id", roomId)
        .eq("session_token", token);
    };
    window.addEventListener("beforeunload", leave);

    const loadParticipants = async () => {
      const { data } = await supabase
        .from("participants")
        .select("id, session_token, display_name, color, is_host, last_seen_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true });
      if (active && data) setParticipants(data as Participant[]);
    };
    void loadParticipants();

    const channel = supabase
      .channel(`participants:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "participants", filter: `room_id=eq.${roomId}` },
        () => void loadParticipants(),
      )
      .subscribe();

    return () => {
      active = false;
      clearInterval(heartbeat);
      window.removeEventListener("beforeunload", leave);
      supabase.removeChannel(channel);
      leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, name, token]);

  // Shared playback state + realtime subscription.
  useEffect(() => {
    if (!roomId) return;
    let active = true;
    const loadState = () => supabase
      .from("player_state")
      .select("*")
      .eq("room_id", roomId)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setState(data as PlayerState);
      });

    const channel = supabase
      .channel(`player:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_state", filter: `room_id=eq.${roomId}` },
        (payload) => setState(payload.new as PlayerState),
      )
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void loadState();
      });
    void loadState();
    const refresh = () => { if (document.visibilityState === "visible") void loadState(); };
    document.addEventListener("visibilitychange", refresh);

    return () => {
      active = false;
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [roomId]);

  /** Writes the shared state; every participant may control playback in this MVP. */
  const publish = useCallback(
    async (patch: Partial<PlayerState>) => {
      if (!roomId) return;
      const next = {
        ...patch,
        updated_at: new Date().toISOString(),
        updated_by: token,
      };
      setSyncing(true);
      const sent = Date.now();
      const { data, error } = await supabase.from("player_state").update(next).eq("room_id", roomId).select("*").single();
      setSyncing(false);
      if (error) toast.error("Could not sync that change.");
      else if (data) {
        learnClockOffset(data.updated_at, sent, Date.now());
        setState(data as PlayerState);
      }
    },
    [roomId, token],
  );

  // Reconcile the local player whenever the shared state changes, and again
  // once a freshly mounted player is ready (a late joiner's player mounts after
  // the shared state has already arrived).
  useEffect(() => {
    const player = playerRef.current;
    if (!state || !player?.controllable) return;

    const target = expectedPosition(state);
    applyingRef.current = true;
    if (Math.abs(player.getTime() - target) > SYNC_TOLERANCE) player.seek(target);
    player.setRate(1);
    if (state.is_playing) player.play();
    else player.pause();
    const timer = setTimeout(() => {
      applyingRef.current = false;
    }, 350);
    return () => clearTimeout(timer);
  }, [state, token, playerReady]);

  // Drift correction while playing + UI ticker.
  useEffect(() => {
    const tick = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      setPosition(player.getTime());
      setDuration(player.getDuration());
      if (!state?.is_playing || !player.controllable || applyingRef.current) { player.setRate(1); return; }
      const target = expectedPosition(state);
      const drift = target - player.getTime();
      if (Math.abs(drift) > 2) {
        applyingRef.current = true;
        player.seek(target);
        setTimeout(() => {
          applyingRef.current = false;
        }, 350);
      } else player.setRate(Math.abs(drift) > SYNC_TOLERANCE ? (drift > 0 ? 1.04 : 0.96) : 1);
    }, 500);
    return () => clearInterval(tick);
  }, [state]);

  const pickSource = (type: SourceType, ref: string, title: string | null) => {
    void publish({
      source_type: type,
      source_ref: ref,
      source_title: title,
      is_playing: false,
      position_seconds: 0,
    });
  };

  const togglePlay = () => {
    const player = playerRef.current;
    applyingRef.current = true;
    if (state?.is_playing) player?.pause(); else player?.play();
    setTimeout(() => { applyingRef.current = false; }, 350);
    void publish({
      is_playing: !state?.is_playing,
      position_seconds: player?.getTime() ?? state?.position_seconds ?? 0,
    });
  };

  /** Seeks locally right away and throttles the shared write. */
  const handleSeek = (seconds: number) => {
    setPosition(seconds);
    applyingRef.current = true;
    playerRef.current?.seek(seconds);
    if (seekTimerRef.current) clearTimeout(seekTimerRef.current);
    seekTimerRef.current = setTimeout(() => {
      applyingRef.current = false;
      void publish({ position_seconds: seconds, is_playing: state?.is_playing ?? false });
    }, 250);
  };

  const onLocalPlayPause = (playing: boolean, pos: number) => {
    if (applyingRef.current) return;
    if (state && state.is_playing === playing) return;
    void publish({ is_playing: playing, position_seconds: pos });
  };

  const participantsRef = useRef<Participant[]>([]);
  participantsRef.current = participants;
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else if (stageRef.current?.requestFullscreen) void stageRef.current.requestFullscreen().catch(() => toast.message("Full screen is unavailable in this browser."));
    else toast.message("Full screen is unavailable in this browser.");
  };
  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", changed);
    return () => { document.removeEventListener("fullscreenchange", changed); if (seekTimerRef.current) clearTimeout(seekTimerRef.current); };
  }, []);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, button, [role=slider], [contenteditable=true]") || !state?.source_ref || state.source_type === "other") return;
      if (event.code === "Space") { event.preventDefault(); togglePlay(); }
      if (event.code === "ArrowLeft") { event.preventDefault(); handleSeek(Math.max(0, position - 10)); }
      if (event.code === "ArrowRight") { event.preventDefault(); handleSeek(Math.min(duration || position + 10, position + 10)); }
      if (event.key.toLowerCase() === "f") toggleFullscreen();
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [state, position, duration]);

  const copyInvite = async () => {
    const url = `${window.location.origin}/room/${code.toUpperCase()}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const area = document.createElement("textarea");
      area.value = url;
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      if (!ok) {
        toast.message(`Share this link: ${url}`);
        return;
      }
    }
    setCopied(true);
    toast.success("Invite link copied");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  if (!roomId) {
    return (
      <main className="bg-stage flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-semibold">Room {code.toUpperCase()} not found</h1>
        <p className="text-sm text-muted-foreground">The code may have expired or been mistyped.</p>
        <Button asChild>
          <Link to="/">Back to SyncWatch</Link>
        </Button>
      </main>
    );
  }

  if (!name) {
    return (
      <main className="bg-stage flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-5 shadow-glow">
          <div>
            <h1 className="text-xl font-semibold">Join room {code.toUpperCase()}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick a display name — no account needed.
            </p>
          </div>
          <Input
            value={nameDraft}
            maxLength={24}
            onChange={(event) => setNameDraft(event.target.value)}
            placeholder="Your name"
          />
          <Button
            className="w-full"
            onClick={() => {
              if (!nameDraft.trim()) {
                toast.error("Add a display name.");
                return;
              }
              setStoredName(nameDraft.trim());
              setName(nameDraft.trim());
            }}
          >
            Enter room
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate({ to: "/" })}>
            Cancel
          </Button>
        </div>
      </main>
    );
  }

  const sourceType = (state?.source_type ?? "none") as SourceType;
  const active = participants.filter(
    (participant) => Date.now() - new Date(participant.last_seen_at).getTime() < 90000,
  );

  return (
    <main className="bg-stage min-h-screen px-3 py-4 lg:px-6">
      <header className="mx-auto mb-4 flex max-w-7xl flex-wrap items-center gap-3">
        <Link to="/" className="text-gradient text-xl font-bold">
          SyncWatch
        </Link>
        <span className="rounded-lg border border-border bg-card px-3 py-1.5 font-mono text-sm tracking-[0.25em]">
          {code.toUpperCase()}
        </span>
        <Button variant="secondary" size="sm" onClick={copyInvite}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} Copy invite link
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto lg:hidden"
          onClick={() => {
            setChatOpen((open) => {
              if (!open) setTimeout(() => document.getElementById("room-sidebar")?.scrollIntoView({ behavior: "smooth" }), 50);
              return !open;
            });
          }}
        >
          {chatOpen ? <X className="size-4" /> : <MessageSquare className="size-4" />}
          {chatOpen ? "Hide chat" : "Chat"}
        </Button>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[1fr_320px]">
        <section className="min-w-0 space-y-3">
          <div ref={stageRef} className="space-y-3 bg-background [&:fullscreen]:flex [&:fullscreen]:flex-col [&:fullscreen]:justify-center [&:fullscreen]:p-3">
          <VideoStage
            handleRef={playerRef}
            sourceType={sourceType}
            sourceRef={state?.source_ref ?? null}
            onLocalPlayPause={onLocalPlayPause}
            onReady={() => setPlayerReady((n) => n + 1)}
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link2 className="size-3.5" />
            <span className="truncate">
              {state?.source_title ?? SOURCE_LABEL[sourceType]}
              {state?.source_title ? ` · ${SOURCE_LABEL[sourceType]}` : ""}
            </span>
          </div>
          <PlaybackControls
            isPlaying={state?.is_playing ?? false}
            position={position}
            duration={duration}
            disabled={sourceType === "none" || sourceType === "other"}
            onTogglePlay={togglePlay}
            onSeek={handleSeek}
            onVolume={(volume) => playerRef.current?.setVolume(volume)}
            fullscreen={fullscreen}
            syncStatus={sourceType === "none" || sourceType === "other" ? "off" : connected && !syncing ? "synced" : "syncing"}
            onFullscreen={toggleFullscreen}
            onSyncAll={() =>
              void publish({
                position_seconds: playerRef.current?.getTime() ?? 0,
                is_playing: state?.is_playing ?? false,
              })
            }
          />
          </div>
          <SourcePanel roomId={roomId} onPick={pickSource} />
        </section>

        <aside
          id="room-sidebar"
          className={`flex flex-col gap-3 lg:h-[calc(100vh-7rem)] ${chatOpen ? "" : "hidden lg:flex"}`}
        >
          <div className="rounded-xl border border-border bg-card p-3">
            <h2 className="mb-2 text-sm font-semibold">
              Watching · {active.length || 1}
            </h2>
            <ul className="space-y-2">
              {active.map((participant) => (
                <li key={participant.id} className="flex items-center gap-2 text-sm">
                  <span
                    className="flex size-7 items-center justify-center rounded-full text-[11px] font-bold text-background"
                    style={{ backgroundColor: participant.color }}
                  >
                    {initials(participant.display_name) || "?"}
                  </span>
                  <span className="truncate">{participant.display_name}</span>
                  {participant.is_host && (
                    <span className="ml-auto rounded bg-accent px-1.5 py-0.5 text-[10px] text-accent-foreground">
                      host
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex min-h-80 flex-1 flex-col lg:min-h-0">
            <ChatPanel roomId={roomId} displayName={name} color={color} />
          </div>
        </aside>
      </div>
    </main>
  );
}
