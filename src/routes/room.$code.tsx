import { Reactions } from "@/components/Reactions";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Film, Link2, Loader2, MessageSquare, Share2, Users } from "lucide-react";
import { copyText } from "@/lib/clipboard";
import { toast } from "sonner";

import { ChatPanel } from "@/components/ChatPanel";
import { PlaybackControls } from "@/components/PlaybackControls";
import { SourcePanel } from "@/components/SourcePanel";
import { VideoStage, type PlayerHandle } from "@/components/VideoStage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createRoomClient,
  roomSnapshot,
  type AdmissionRequest,
  type RoomClient,
  type RoomParticipant,
  type RoomSnapshot,
} from "@/lib/room-access";
import {
  getStoredName,
  initials,
  setStoredName,
  addRecentRoom,
} from "@/lib/session";
import {
  expectedPosition,
  learnClockOffset,
  type PlayerState,
  type SourceType,
} from "@/lib/sources";

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

type Participant = RoomParticipant;

const SYNC_TOLERANCE = 0.6;

function RoomPage() {
  const { t } = useI18n();
  const { code } = Route.useParams();
  const navigate = useNavigate();

  const [client, setClient] = useState<RoomClient | null>(null);
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [entering, setEntering] = useState(false);
  const [bell, setBell] = useState(0);
  const roomId = snap?.status === "approved" ? (snap.room_id ?? null) : null;
  const memberId = snap?.member_id ?? "";
  const topic = snap?.topic ?? "";
  const [name, setName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [requests, setRequests] = useState<AdmissionRequest[]>([]);
  const [state, setState] = useState<PlayerState | null>(null);
  const [position, setPosition] = useState(0);
  const [playerReady, setPlayerReady] = useState(0);
  const [duration, setDuration] = useState(0);
  const [copied, setCopied] = useState(false);
  const [mobileTab, setMobileTab] = useState<"chat" | "people" | "source">("chat");
  const [isDesktop, setIsDesktop] = useState(true);
  const [pseudoFs, setPseudoFs] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsShown, setControlsShown] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Like pro players: in fullscreen, controls fade after 3s without touch/mouse activity.
  const wakeControls = useCallback(() => {
    setControlsShown(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsShown(false), 3000);
  }, []);
  useEffect(() => {
    if (fullscreen || pseudoFs) wakeControls();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [fullscreen, pseudoFs, state?.is_playing, wakeControls]);
  const [codeCopied, setCodeCopied] = useState(false);
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<PlayerState | null>(null);
  stateRef.current = state;

  const playerRef = useRef<PlayerHandle>(null);
  const applyingRef = useRef(false);
  const lastSeekRef = useRef(0);
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const me = participants.find((p) => p.id === memberId);
  const color = me?.color ?? "#22d3ee";

  // One scoped client per room; identity lives in browser storage (read after mount).
  useEffect(() => {
    setClient(createRoomClient());
    setName(getStoredName());
    addRecentRoom(code.toUpperCase());
  }, [code]);

  /** Reads the room through the membership-checked snapshot; only approved viewers get data. */
  const refresh = useCallback(async () => {
    if (!client) return;
    try {
      const next = await roomSnapshot(client, code.toUpperCase());
      setSnap(next);
      if (next.status !== "approved") return;
      setParticipants(next.participants ?? []);
      setRequests(next.requests ?? []);
      const incoming = next.state;
      if (incoming) {
        setState((current) =>
          current &&
          current.updated_at === incoming.updated_at &&
          current.updated_by === incoming.updated_by
            ? current
            : incoming,
        );
      }
    } catch {
      setSnap((current) => current ?? { status: "missing" });
    }
  }, [client, code]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Unknown visitor with a name: ask to enter (approved re-entry is recognised by the database).
  useEffect(() => {
    if (!client || snap?.status !== "unknown" || !name || entering) return;
    setEntering(true);
    void (async () => {
      await client.rpc("sw_enter", { _code: code.toUpperCase(), _name: name });
      await refresh();
      setEntering(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, snap?.status, name]);

  // Periodic reads recover missed doorbells; waiting guests poll faster.
  useEffect(() => {
    if (snap?.status !== "approved" && snap?.status !== "pending") return;
    const timer = setInterval(() => void refresh(), snap.status === "pending" ? 3000 : 10000);
    const visible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [snap?.status, refresh]);

  // Data-free doorbell on the room's private topic.
  useEffect(() => {
    if (!client || !topic) return;
    let pending: ReturnType<typeof setTimeout> | null = null;
    let seen = false;
    const channel = client
      .channel(topic)
      .on("broadcast", { event: "changed" }, () => {
        if (pending) return;
        pending = setTimeout(() => {
          pending = null;
          setBell((n) => n + 1);
          void refresh();
        }, 120);
      })
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") {
          if (seen) {
            setBell((n) => n + 1);
            void refresh();
          }
          seen = true;
        }
      });
    return () => {
      if (pending) clearTimeout(pending);
      void client.removeChannel(channel);
    };
  }, [client, topic, refresh]);

  // Presence heartbeat; leaving pauses playback only when the room becomes empty.
  useEffect(() => {
    if (!client || !roomId) return;
    void client.rpc("sw_heartbeat", { _room: roomId, _leaving: false });
    const heartbeat = setInterval(() => {
      void client.rpc("sw_heartbeat", { _room: roomId, _leaving: false });
    }, 25000);
    const leave = () => {
      const pos = playerRef.current?.getTime() ?? stateRef.current?.position_seconds ?? 0;
      void client.rpc("sw_heartbeat", { _room: roomId, _leaving: true, _position: pos });
    };
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [client, roomId]);

  const review = async (participant: string, approve: boolean) => {
    if (!client || !roomId) return;
    setRequests((list) => list.filter((r) => r.id !== participant));
    const { error } = await client.rpc("sw_review", {
      _room: roomId,
      _participant: participant,
      _approve: approve,
    });
    if (error) toast.error(t("error.sync"));
    void refresh();
  };

  /** Writes the shared state; every approved participant may control playback. */
  const publish = useCallback(
    async (patch: Partial<PlayerState>) => {
      if (!roomId || !client) return;
      setSyncing(true);
      const sent = Date.now();
      const { data, error } = await client.rpc("sw_playback", {
        _room: roomId,
        _patch: patch as never,
      });
      setSyncing(false);
      if (error || !data) {
        toast.error(t("error.sync"));
        return;
      }
      const row = data as unknown as PlayerState;
      learnClockOffset(row.updated_at, sent, Date.now());
      setState(row);
    },
    [roomId, client, t],
  );

  // Reconcile the local player whenever the shared state changes, and again
  // once a freshly mounted player is ready (a late joiner's player mounts after
  // the shared state has already arrived).
  useEffect(() => {
    const player = playerRef.current;
    if (!state || !player?.controllable) return;

    const target = expectedPosition(state);
    const own = state.updated_by === memberId;
    applyingRef.current = true;
    // Never re-seek our own update (avoids rebuffer loops); others: only on a real jump.
    if (!own && Math.abs(player.getTime() - target) > 1.5) {
      player.seek(target);
      lastSeekRef.current = Date.now();
    }
    player.setRate(1);
    if (state.is_playing) player.play();
    else player.pause();
    const timer = setTimeout(() => {
      applyingRef.current = false;
    }, 350);
    return () => clearTimeout(timer);
  }, [state, memberId, playerReady]);

  // Drift correction while playing + UI ticker.
  useEffect(() => {
    const tick = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      setPosition(player.getTime());
      setDuration(player.getDuration());
      if (!state?.is_playing || !player.controllable || applyingRef.current) {
        player.setRate(1);
        return;
      }
      // While the video is still loading, correcting would only cause more stalls.
      if (player.isBuffering()) {
        player.setRate(1);
        return;
      }
      const target = expectedPosition(state);
      const drift = target - player.getTime();
      if (Math.abs(drift) > 3 && Date.now() - lastSeekRef.current > 5000) {
        lastSeekRef.current = Date.now();
        applyingRef.current = true;
        player.seek(target);
        setTimeout(() => {
          applyingRef.current = false;
        }, 350);
      } else player.setRate(Math.abs(drift) > SYNC_TOLERANCE ? (drift > 0 ? 1.05 : 0.95) : 1);
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
    if (state?.is_playing) player?.pause();
    else player?.play();
    setTimeout(() => {
      applyingRef.current = false;
    }, 350);
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

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    if (pseudoFs) {
      setPseudoFs(false);
      return;
    }
    const lockLandscape = () => {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      void orientation?.lock?.("landscape").catch(() => {});
    };
    const el = stageRef.current;
    if (el?.requestFullscreen) {
      el.requestFullscreen()
        .then(lockLandscape)
        .catch(() => setPseudoFs(true));
    } else {
      // iPhone Safari cannot fullscreen arbitrary elements: fill the screen instead.
      setPseudoFs(true);
    }
  };
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!pseudoFs) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPseudoFs(false);
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [pseudoFs]);
  useEffect(() => {
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", changed);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      if (seekTimerRef.current) clearTimeout(seekTimerRef.current);
    };
  }, []);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        target.closest("input, textarea, button, [role=slider], [contenteditable=true]") ||
        !state?.source_ref ||
        state.source_type === "other"
      )
        return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      }
      if (event.code === "ArrowLeft") {
        event.preventDefault();
        handleSeek(Math.max(0, position - 10));
      }
      if (event.code === "ArrowRight") {
        event.preventDefault();
        handleSeek(Math.min(duration || position + 10, position + 10));
      }
      if (event.key.toLowerCase() === "f") toggleFullscreen();
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [state, position, duration]);

  const inviteUrl = () => `${window.location.origin}/room/${code.toUpperCase()}`;
  const copyInvite = async () => {
    const url = inviteUrl();
    if (await copyText(url)) {
      setCopied(true);
      toast.success(t("inviteCopied"));
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    if (navigator.share) {
      void navigator.share({ title: "SyncWatch", url }).catch(() => {});
      return;
    }
    toast.message(`${t("shareLink")} ${url}`, { duration: 10000 });
  };
  const copyCode = async () => {
    if (await copyText(code.toUpperCase())) {
      setCodeCopied(true);
      toast.success(t("codeCopied"));
      setTimeout(() => setCodeCopied(false), 2000);
    } else toast.message(code.toUpperCase());
  };
  const shareInvite = () => {
    if (navigator.share)
      void navigator.share({ title: "SyncWatch", url: inviteUrl() }).catch(() => {});
    else void copyInvite();
  };

  const status = snap?.status;
  if (!snap || (status === "unknown" && name) || entering) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  if (status === "missing" || status === "legacy" || status === "rejected" || status === "pending") {
    const title =
      status === "missing"
        ? t("roomNotFound", { code: code.toUpperCase() })
        : status === "legacy"
          ? t("legacyRoom")
          : status === "rejected"
            ? t("entryRejected")
            : t("waitingApproval");
    const hint =
      status === "missing"
        ? t("roomNotFoundHint")
        : status === "legacy"
          ? t("legacyRoomHint")
          : status === "rejected"
            ? t("entryRejectedHint")
            : t("waitingApprovalHint");
    return (
      <main className="bg-stage flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <LanguageToggle />
        {status === "pending" && <Loader2 className="size-6 animate-spin text-primary" />}
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>
        <Button asChild variant={status === "pending" ? "secondary" : "default"}>
          <Link to="/"> {t("backToApp")} </Link>
        </Button>
      </main>
    );
  }

  if (status === "unknown" || !roomId) {
    return (
      <main className="bg-stage flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-5 shadow-glow">
          <div>
            <LanguageToggle />
            <h1 className="text-xl font-semibold">
              {t("joinRoomTitle", { code: code.toUpperCase() })}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground"> {t("joinRoomHint")}</p>
          </div>
          <Input
            value={nameDraft}
            maxLength={24}
            onChange={(event) => setNameDraft(event.target.value)}
            placeholder={t("yourName")}
          />
          <Button
            className="w-full"
            onClick={() => {
              if (!nameDraft.trim()) {
                toast.error(t("error.addName"));
                return;
              }
              setStoredName(nameDraft.trim());
              setName(nameDraft.trim());
            }}
          >
            {" "}
            {t("enterRoom")}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate({ to: "/" })}>
            {" "}
            {t("cancel")}
          </Button>
        </div>
      </main>
    );
  }

  const sourceType = (state?.source_type ?? "none") as SourceType;
  const active = participants.filter(
    (participant) => Date.now() - new Date(participant.last_seen_at).getTime() < 90000,
  );

  const people = (
    <div className="rounded-xl border border-border bg-card p-3">
      <h2 className="mb-2 text-sm font-semibold">
        {t("watching")} · {active.length || 1}
      </h2>
      <ul className="space-y-2">
        {active.map((participant) => (
          <li key={participant.id} className="flex min-w-0 items-center gap-2 text-sm">
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-background"
              style={{ backgroundColor: participant.color }}
            >
              {initials(participant.display_name) || "?"}
            </span>
            <span className="truncate">{participant.display_name}</span>
            {participant.is_host && (
              <span className="ms-auto shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] text-accent-foreground">
                {t("host")}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
  const sourcePanel = (
    <SourcePanel roomId={roomId} memberId={memberId} client={client!} onPick={pickSource} />
  );
  const chat = (
    <ChatPanel
      roomId={roomId}
      client={client!}
      topic={topic}
      bell={bell}
      displayName={me?.display_name ?? name}
    />
  );
  const requestCard = requests.length > 0 && (
    <div className="shrink-0 space-y-2 rounded-xl border border-primary/50 bg-card p-3">
      <h2 className="text-sm font-semibold">{t("joinRequests")}</h2>
      {requests.map((r) => (
        <div key={r.id} className="flex items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate">{r.display_name}</span>
          <Button size="sm" onClick={() => void review(r.id, true)}>
            {t("approve")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void review(r.id, false)}>
            {t("reject")}
          </Button>
        </div>
      ))}
    </div>
  );
  const isFs = fullscreen || pseudoFs;
  const hideControls = isFs && !controlsShown && (state?.is_playing ?? false);

  const tabs = [
    { id: "chat" as const, icon: MessageSquare, label: t("chat") },
    { id: "people" as const, icon: Users, label: `${t("watching")} · ${active.length || 1}` },
    { id: "source" as const, icon: Film, label: t("tab.source") },
  ];

  return (
    <main className="bg-stage flex h-[100dvh] flex-col overflow-hidden lg:block lg:h-auto lg:min-h-screen lg:overflow-visible lg:px-6 lg:py-4">
      <header className="mx-auto flex w-full max-w-7xl shrink-0 items-center gap-2 px-3 py-2 lg:mb-4 lg:px-0 lg:py-0">
        <Link to="/" className="text-gradient shrink-0 text-lg font-bold lg:text-xl">
          SyncWatch
        </Link>
        <button
          type="button"
          dir="ltr"
          onClick={copyCode}
          aria-label={t("copyCode")}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 font-mono text-sm transition-colors hover:border-primary"
        >
          {code.toUpperCase()}
          {codeCopied ? (
            <Check className="size-3.5 text-primary" />
          ) : (
            <Copy className="size-3.5 text-muted-foreground" />
          )}
        </button>
        <Button variant="secondary" size="sm" className="hidden sm:inline-flex" onClick={copyInvite}>
          {copied ? <Check className="size-4" /> : <Link2 className="size-4" />} {t("copyInvite")}
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="size-8 sm:hidden"
          aria-label={t("copyInvite")}
          onClick={shareInvite}
        >
          <Share2 className="size-4" />
        </Button>
        <div className="ms-auto shrink-0">
          <LanguageToggle />
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-4">
        <section className="shrink-0 lg:min-w-0 lg:space-y-3">
          <div
            ref={stageRef}
            className={
              isFs
                ? `fixed inset-0 z-50 flex flex-col justify-center bg-media ${hideControls ? "cursor-none" : ""}`
                : "relative space-y-2 bg-background px-0 lg:space-y-3 lg:bg-transparent"
            }
            onPointerMove={isFs ? wakeControls : undefined}
            onPointerDown={isFs ? wakeControls : undefined}
            onKeyDown={isFs ? wakeControls : undefined}
          >
            {hideControls && (
              <button
                type="button"
                aria-label={t("showControls")}
                className="absolute inset-0 z-20 cursor-none"
                onClick={wakeControls}
              />
            )}
            <div className={isFs ? "flex min-h-0 flex-1 items-center [&>*]:w-full" : ""}>
              <VideoStage
                client={client!}
                handleRef={playerRef}
                sourceType={sourceType}
                sourceRef={state?.source_ref ?? null}
                onLocalPlayPause={onLocalPlayPause}
                onReady={() => setPlayerReady((n) => n + 1)}
              />
            </div>
            <div
              className={
                isFs
                  ? `absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-media via-media/80 to-transparent px-3 pb-3 pt-10 transition-opacity duration-300 ${hideControls ? "pointer-events-none opacity-0" : "opacity-100"}`
                  : "px-3 lg:px-0"
              }
            >
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Link2 className="size-3.5 shrink-0" />
                <span className="truncate">
                  {state?.source_title ?? t(`source.${sourceType}`)}
                  {state?.source_title ? ` · ${t(`source.${sourceType}`)}` : ""}
                </span>
              </div>
              <div className="mb-2"><Reactions client={client!} topic={topic} displayName={me?.display_name ?? name} /></div>
              <PlaybackControls
                isPlaying={state?.is_playing ?? false}
                position={position}
                duration={duration}
                disabled={sourceType === "none" || sourceType === "other"}
                onTogglePlay={togglePlay}
                onSeek={handleSeek}
                onVolume={(volume) => playerRef.current?.setVolume(volume)}
                fullscreen={isFs}
                syncStatus={
                  sourceType === "none" || sourceType === "other"
                    ? "off"
                    : connected && !syncing
                      ? "synced"
                      : "syncing"
                }
                onFullscreen={toggleFullscreen}
                onSyncAll={() =>
                  void publish({
                    position_seconds: playerRef.current?.getTime() ?? 0,
                    is_playing: state?.is_playing ?? false,
                  })
                }
              />
            </div>
          </div>
          {isDesktop && sourcePanel}
        </section>

        {!isDesktop && (
          <nav className="mx-3 mt-2 grid shrink-0 grid-cols-3 gap-1 rounded-xl border border-border bg-card p-1">
            {tabs.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMobileTab(id)}
                aria-pressed={mobileTab === id}
                className={`flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors ${
                  mobileTab === id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </nav>
        )}

        <aside className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:h-[calc(100vh-7rem)] lg:p-0">
          {requestCard}
          {isDesktop ? (
            <>
              {people}
              <div className="flex min-h-0 flex-1 flex-col">{chat}</div>
            </>
          ) : (
            <>
              <div className={mobileTab === "chat" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
                {chat}
              </div>
              {mobileTab === "people" && <div className="overflow-y-auto">{people}</div>}
              {mobileTab === "source" && <div className="min-h-0 overflow-y-auto">{sourcePanel}</div>}
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
