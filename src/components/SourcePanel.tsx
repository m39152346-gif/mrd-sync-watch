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

type Props = {
  roomId: string;
  onPick: (type: SourceType, ref: string, title: string | null) => void;
};

export function SourcePanel({ roomId, onPick }: Props) {
  const runSearch = useServerFn(searchYouTube);
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
            placeholder="Vimeo, .mp4/.webm file, or any other link"
          />
          <Button
            onClick={() => {
              const detected = detectSource(link);
              if (!detected) {
                toast.error("Paste a full link starting with https://");
                return;
              }
              onPick(detected.type, detected.ref, null);
              toast.success(`Loaded as ${SOURCE_LABEL[detected.type]}`);
              setLink("");
            }}
          >
            Load
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Vimeo and direct video files stay in sync. Other sites are embedded best-effort only.
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
