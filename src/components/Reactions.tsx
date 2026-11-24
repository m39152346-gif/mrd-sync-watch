import { useEffect, useRef, useState } from "react";
import type { RoomClient } from "@/lib/room-access";
import { useI18n } from "@/lib/i18n";

export const REACTION_EMOJIS = ["❤️", "😂", "😮", "😢", "👏", "🔥"] as const;

type Floating = { id: string; emoji: string; name: string; left: number };

/** Live emoji reactions over the video, shared through a room broadcast channel (not stored). */
export function Reactions({
  client,
  topic,
  displayName,
}: {
  client: RoomClient;
  topic: string;
  displayName: string;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<Floating[]>([]);
  const channelRef = useRef<ReturnType<RoomClient["channel"]> | null>(null);
  const lastSent = useRef(0);

  const show = (emoji: string, name: string) => {
    const id = Math.random().toString(36).slice(2);
    setItems((list) => [...list.slice(-24), { id, emoji, name, left: 8 + Math.random() * 74 }]);
    setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 2600);
  };

  useEffect(() => {
    if (!topic) return;
    const channel = client
      .channel(`${topic}:reactions`)
      .on("broadcast", { event: "react" }, ({ payload }) => {
        const p = payload as { emoji?: string; name?: string };
        if (p.emoji && (REACTION_EMOJIS as readonly string[]).includes(p.emoji)) {
          show(p.emoji, String(p.name ?? "").slice(0, 40));
        }
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void client.removeChannel(channel);
    };
  }, [client, topic]);

  const send = (emoji: string) => {
    if (Date.now() - lastSent.current < 250) return;
    lastSent.current = Date.now();
    show(emoji, displayName);
    void channelRef.current?.send({ type: "broadcast", event: "react", payload: { emoji, name: displayName } });
  };

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden>
        {items.map((i) => (
          <div key={i.id} className="reaction-float absolute bottom-2 flex flex-col items-center" style={{ left: `${i.left}%` }}>
            <span className="text-3xl drop-shadow-lg sm:text-4xl">{i.emoji}</span>
            {i.name && (
              <span className="max-w-24 truncate rounded-full bg-background/70 px-1.5 text-[10px] text-foreground">{i.name}</span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 overflow-x-auto" role="group" aria-label={t("reactions")}>
        {REACTION_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => send(e)}
            aria-label={`${t("reactions")} ${e}`}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary/60 text-lg transition active:scale-90 hover:bg-secondary"
          >
            {e}
          </button>
        ))}
      </div>
    </>
  );
}
