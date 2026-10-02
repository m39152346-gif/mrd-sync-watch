import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

type Message = {
  id: string;
  display_name: string;
  color: string;
  body: string;
  created_at: string;
};

type Props = {
  roomId: string;
  displayName: string;
  color: string;
};

export function ChatPanel({ roomId, displayName, color }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSent = useRef(0);

  useEffect(() => {
    const channel = supabase
      .channel(`typing:${roomId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const who = String((payload as { name?: string }).name ?? "");
        if (!who || who === displayName) return;
        setTyping((t) => ({ ...t, [who]: Date.now() }));
      })
      .subscribe();
    typingChannel.current = channel;
    const sweep = setInterval(() => {
      setTyping((t) => {
        const next = Object.fromEntries(Object.entries(t).filter(([, at]) => Date.now() - at < 3500));
        return Object.keys(next).length === Object.keys(t).length ? t : next;
      });
    }, 1000);
    return () => {
      clearInterval(sweep);
      supabase.removeChannel(channel);
    };
  }, [roomId, displayName]);

  const notifyTyping = () => {
    if (Date.now() - lastTypingSent.current < 2000) return;
    lastTypingSent.current = Date.now();
    void typingChannel.current?.send({ type: "broadcast", event: "typing", payload: { name: displayName } });
  };
  const typers = Object.keys(typing);

  useEffect(() => {
    let active = true;
    supabase
      .from("messages")
      .select("id, display_name, color, body, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .limit(200)
      .then(({ data }) => {
        if (active && data) setMessages(data as Message[]);
      });

    const channel = supabase
      .channel(`chat:${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        (payload) => {
          const message = payload.new as Message;
          setMessages((current) =>
            current.some((item) => item.id === message.id) ? current : [...current, message],
          );
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    const { error } = await supabase
      .from("messages")
      .insert({ room_id: roomId, display_name: displayName, color, body: body.slice(0, 2000) });
    if (error) {
      setDraft(body);
      toast.error("Message not sent. Check your connection and try again.");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card">
      <div className="border-b border-border px-3 py-2 text-sm font-semibold">Chat</div>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground">Say hi to the room 👋</p>
        )}
        {messages.map((message) => (
          <div key={message.id} className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold" style={{ color: message.color }}>
                {message.display_name}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {new Date(message.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p className="break-words text-foreground/90">{message.body}</p>
          </div>
        ))}
      </div>
      <div className="h-5 px-3 text-[11px] italic text-muted-foreground" aria-live="polite">
        {typers.length > 0 && `${typers.slice(0, 2).join(", ")}${typers.length > 2 ? " and others" : ""} typing…`}
      </div>
      <form onSubmit={send} className="flex gap-2 border-t border-border p-3 pt-2">
        <Input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            notifyTyping();
          }}
          placeholder="Message the room…"
          maxLength={2000}
        />
        <Button type="submit" size="icon" aria-label="Send message">
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
