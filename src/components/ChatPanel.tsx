import { useI18n } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RoomClient } from "@/lib/room-access";

type Message = {
  id: string;
  display_name: string;
  color: string;
  body: string;
  created_at: string;
};

type Props = {
  roomId: string;
  client: RoomClient;
  /** Private room topic; typing broadcasts stay inside it. */
  topic: string;
  /** Increments on each room doorbell, triggering a re-read. */
  bell: number;
  displayName: string;
};

export function ChatPanel({ roomId, client, topic, bell, displayName }: Props) {
  const { t, lang } = useI18n();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const typingChannel = useRef<ReturnType<RoomClient["channel"]> | null>(null);
  const lastTypingSent = useRef(0);

  useEffect(() => {
    if (!topic) return;
    const channel = client
      .channel(`${topic}:typing`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const who = String((payload as { name?: string }).name ?? "");
        if (!who || who === displayName) return;
        setTyping((t) => ({ ...t, [who]: Date.now() }));
      })
      .subscribe();
    typingChannel.current = channel;
    const sweep = setInterval(() => {
      setTyping((t) => {
        const next = Object.fromEntries(
          Object.entries(t).filter(([, at]) => Date.now() - at < 3500),
        );
        return Object.keys(next).length === Object.keys(t).length ? t : next;
      });
    }, 1000);
    return () => {
      clearInterval(sweep);
      void client.removeChannel(channel);
    };
  }, [client, topic, displayName]);

  const notifyTyping = () => {
    if (Date.now() - lastTypingSent.current < 2000) return;
    lastTypingSent.current = Date.now();
    void typingChannel.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { name: displayName },
    });
  };
  const typers = Object.keys(typing);

  useEffect(() => {
    let active = true;
    void client
      .from("messages")
      .select("id, display_name, color, body, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (active && data) setMessages(data.reverse() as Message[]);
      });
    return () => {
      active = false;
    };
  }, [client, roomId, bell]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    const { error } = await client.rpc("sw_message", { _room: roomId, _body: body.slice(0, 2000) });
    if (error) {
      setDraft(body);
      toast.error(t("chat.sendFailed"));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card">
      <div className="border-b border-border px-3 py-2 text-sm font-semibold"> {t("chat")} </div>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground"> {t("chat.sayHi")} </p>
        )}
        {messages.map((message) => (
          <div key={message.id} className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold" style={{ color: message.color }}>
                {message.display_name}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {new Date(message.created_at).toLocaleTimeString(
                  lang === "fa" ? "fa-IR" : "en-US",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                )}
              </span>
            </div>
            <p dir="auto" className="break-words text-foreground/90">
              {message.body}
            </p>
          </div>
        ))}
      </div>
      <div className="h-5 px-3 text-[11px] italic text-muted-foreground" aria-live="polite">
        {typers.length > 0 &&
          `${typers.slice(0, 2).join(", ")}${typers.length > 2 ? ` ${t("chat.andOthers")}` : ""} ${t("chat.typing")}`}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-border p-3 pt-2">
        <Input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            notifyTyping();
          }}
          placeholder={t("chat.placeholder")}
          maxLength={2000}
        />
        <Button type="submit" size="icon" aria-label={t("chat.send")}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
