import { useI18n, LanguageToggle } from "@/lib/i18n";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, MonitorPlay, Popcorn, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { createRoomClient } from "@/lib/room-access";
import {
  colorForToken,
  getSessionToken,
  getStoredName,
  setStoredName,
  getRecentRooms,
  type RecentRoom,
} from "@/lib/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SyncWatch — Watch videos together, in sync" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "description",
        content:
          "Create a room, share a 6-character code, and watch YouTube, Vimeo or your own video files in perfect sync with live chat.",
      },
      { property: "og:title", content: "SyncWatch — Watch videos together, in sync" },
      {
        property: "og:description",
        content:
          "Synchronized watch parties with live chat. No account needed — just a display name and a room code.",
      },
    ],
  }),
  component: Landing,
});

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode() {
  return Array.from(
    { length: 6 },
    () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
  ).join("");
}

function Landing() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [recent, setRecent] = useState<RecentRoom[]>([]);

  useEffect(() => {
    setName(getStoredName());
    setRecent(getRecentRooms());
  }, []);

  const requireName = () => {
    if (!name.trim()) {
      toast.error(t("error.needName"));
      return false;
    }
    setStoredName(name.trim());
    return true;
  };

  const createRoom = async () => {
    if (!requireName()) return;
    setBusy("create");
    const client = createRoomClient();
    try {
      let roomCode = makeCode();
      let roomId: string | null = null;
      for (let attempt = 0; attempt < 4 && !roomId; attempt++) {
        const { data, error } = await client.rpc("sw_create", { _code: roomCode, _name: name.trim() });
        if (data) {
          const created = data as { room_id: string; code: string };
          roomId = created.room_id;
          roomCode = created.code;
        } else if (error?.code === "23505") {
          roomCode = makeCode();
        } else if (error) {
          throw error;
        }
      }
      if (!roomId) throw new Error("no room");
      navigate({ to: "/room/$code", params: { code: roomCode } });
    } catch {
      toast.error(t("error.createRoom"));
      setBusy(null);
    }
  };

  const joinRoom = async () => {
    if (!requireName()) return;
    const clean = code.trim().toUpperCase();
    if (clean.length !== 6) {
      toast.error(t("error.codeLength"));
      return;
    }
    setBusy("join");
    const { data } = await supabase.rpc("sw_room_exists", { _code: clean });
    if (!data) {
      toast.error(t("error.noRoom"));
      setBusy(null);
      return;
    }
    navigate({ to: "/room/$code", params: { code: clean } });
  };

  return (
    <main className="bg-stage flex min-h-screen flex-col items-center px-4 py-10">
      <div className="flex w-full max-w-md flex-1 flex-col justify-center gap-8">
        <div className="flex justify-end">
          <LanguageToggle />
        </div>
        <header className="space-y-3 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Popcorn className="size-3.5 text-primary" /> {t("app.tagline")}
          </span>
          <h1 className="text-gradient text-5xl font-bold tracking-tight">SyncWatch</h1>
          <p className="text-sm text-muted-foreground"> {t("landing.subtitle")}</p>
        </header>

        <div className="space-y-5 rounded-2xl border border-border bg-card/80 p-5 shadow-glow backdrop-blur">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="display-name">
              {" "}
              {t("displayName.label")}
            </label>
            <Input
              id="display-name"
              value={name}
              maxLength={24}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("displayName.placeholder")}
            />
          </div>

          <Button className="w-full" size="lg" disabled={busy !== null} onClick={createRoom}>
            {busy === "create" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MonitorPlay className="size-4" />
            )}{" "}
            {t("createRoom")}
          </Button>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> {t("orJoin")}{" "}
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex gap-2">
            <Input
              value={code}
              maxLength={6}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder={t("roomCode.placeholder")}
              aria-label={t("roomCode.placeholder")}
              dir="ltr"
              className="uppercase"
            />
            <Button variant="secondary" disabled={busy !== null} onClick={joinRoom}>
              {busy === "join" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Users className="size-4" />
              )}{" "}
              {t("join")}
            </Button>
          </div>
        </div>

        {recent.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-medium text-muted-foreground"> {t("recentRooms")} </h2>
            <div className="flex flex-wrap gap-2">
              {recent.map((room) => (
                <Button key={room.code} asChild variant="secondary" size="sm">
                  <Link dir="ltr" to="/room/$code" params={{ code: room.code }}>
                    {room.code}
                  </Link>
                </Button>
              ))}
            </div>
          </section>
        )}
        <p className="text-center text-xs text-muted-foreground">
          {" "}
          {t("keepName")}{" "}
          <Link to="/auth" className="text-primary underline-offset-2 hover:underline">
            {" "}
            {t("createAccount")}
          </Link>
        </p>
      </div>
    </main>
  );
}
