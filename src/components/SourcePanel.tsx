import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { detectSource, parseYouTubeId, SOURCE_LABEL, type SourceType } from "@/lib/sources";
import { searchYouTube, type YouTubeResult } from "@/lib/youtube.functions";
import { findVideosInPage, type FoundVideo } from "@/lib/extract.functions";

type Props = {
  roomId: string;
  onPick: (type: SourceType, ref: string, title: string | null) => void;
};

export function SourcePanel({ roomId, onPick }: Props) {
  const runSearch = useServerFn(searchYouTube);
  const runFind = useServerFn(findVideosInPage);
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<FoundVideo[]>([]);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<YouTubeResult[]>([]);
  const [ytLink, setYtLink] = useState("");
  const [link, setLink] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const response = await runSearch({ data: { query: query.trim() } });
      setResults(response.results);
      if (response.error) toast.error(response.error);
      else if (response.results.length === 0) toast.message("No videos found.");
    } catch {
      toast.error("Search failed. Try pasting a link instead.");
    } finally {
      setSearching(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "mp4";
      const path = `${roomId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("room-videos").upload(path, file, {
        contentType: file.type || "video/mp4",
      });
      if (error) throw error;
      onPick("upload", path, file.name);
      toast.success("Upload ready — everyone streams from this file.");
    } catch {
      toast.error("Upload failed. Try a smaller file.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Tabs defaultValue="youtube" className="rounded-xl border border-border bg-card p-3">
      <TabsList className="w-full">
        <TabsTrigger value="youtube" className="flex-1">
          YouTube
        </TabsTrigger>
        <TabsTrigger value="link" className="flex-1">
          Paste link
        </TabsTrigger>
        <TabsTrigger value="upload" className="flex-1">
          Upload
        </TabsTrigger>
      </TabsList>

      <TabsContent value="youtube" className="mt-3 space-y-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search YouTube…"
          />
          <Button type="submit" disabled={searching}>
            {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          </Button>
        </form>
        {results.length > 0 && (
          <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {results.map((result) => (
              <button
                key={result.videoId}
                type="button"
                onClick={() => onPick("youtube", result.videoId, result.title)}
                className="group overflow-hidden rounded-lg border border-border bg-surface text-left transition-colors hover:border-primary"
              >
                {result.thumbnail && (
                  <img src={result.thumbnail} alt="" className="aspect-video w-full object-cover" />
                )}
                <span className="block p-2 text-xs leading-snug line-clamp-2">{result.title}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={ytLink}
            onChange={(event) => setYtLink(event.target.value)}
            placeholder="…or paste a YouTube link"
          />
          <Button
            variant="secondary"
            onClick={() => {
              const id = parseYouTubeId(ytLink);
              if (!id) {
                toast.error("That doesn't look like a YouTube link.");
                return;
              }
              onPick("youtube", id, null);
              setYtLink("");
            }}
          >
            Load
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="link" className="mt-3 space-y-2">
        <div className="flex gap-2">
          <Input
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="Any page with a video, Vimeo, .mp4/.m3u8 link…"
          />
          <Button
            disabled={finding}
            onClick={async () => {
              const detected = detectSource(link);
              if (!detected) {
                toast.error("Paste a full link starting with https://");
                return;
              }
              if (detected.type !== "other") {
                onPick(detected.type, detected.ref, null);
                toast.success(`Loaded as ${SOURCE_LABEL[detected.type]}`);
                setLink("");
                return;
              }
              setFinding(true);
              setFound([]);
              try {
                const r = await runFind({ data: { url: detected.ref } });
                setFound(r.videos);
                if (r.videos.length === 0) {
                  toast.message("No video found inside that page — embedding it directly.");
                  onPick("other", detected.ref, null);
                  setLink("");
                }
              } catch {
                onPick("other", detected.ref, null);
              } finally {
                setFinding(false);
              }
            }}
          >
            {finding ? <Loader2 className="size-4 animate-spin" /> : "Load"}
          </Button>
        </div>
        {found.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium">Videos found on this page — pick one:</p>
            {found.map((v) => (
              <button
                key={v.url}
                type="button"
                onClick={() => {
                  const d = detectSource(v.url);
                  const type: SourceType = v.kind === "hls" || v.kind === "file" ? "file" : (d?.type ?? "other");
                  onPick(type, d && type === d.type ? d.ref : v.url, null);
                  setFound([]);
                  setLink("");
                }}
                className="flex w-full items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-left text-xs hover:border-primary"
              >
                <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] uppercase text-accent-foreground">
                  {v.kind === "hls" || v.kind === "file" ? "synced" : v.kind}
                </span>
                <span className="truncate">{v.url}</span>
              </button>
            ))}
            <button
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => {
                onPick("other", link.trim(), null);
                setFound([]);
                setLink("");
              }}
            >
              None of these — embed the whole page instead
            </button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Paste the page where the movie plays — SyncWatch looks for the real video inside it so everyone stays in sync.
        </p>
      </TabsContent>

      <TabsContent value="upload" className="mt-3 space-y-2">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted-foreground hover:border-primary">
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          {uploading ? "Uploading…" : "Choose a video file"}
          <input
            type="file"
            accept="video/*"
            className="hidden"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleUpload(file);
              event.target.value = "";
            }}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Stored in the room's library so every participant streams the same file.
        </p>
      </TabsContent>
    </Tabs>
  );
}
