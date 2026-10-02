import { useEffect, useRef, useState } from "react";
import * as tus from "tus-js-client";
import { useServerFn } from "@tanstack/react-start";
import { Film, Loader2, Pause, Play, Search, Upload, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { unwrapEmbedCode, detectSource, parseYouTubeId, SOURCE_LABEL, type SourceType } from "@/lib/sources";
import { searchYouTube, type YouTubeResult } from "@/lib/youtube.functions";
import { findVideosInPage, type FoundVideo } from "@/lib/extract.functions";

type Props = {
  roomId: string;
  onPick: (type: SourceType, ref: string, title: string | null) => void;
};

const VIDEO_EXT = ["mp4", "webm", "mov", "m4v", "mkv", "3gp", "ogv", "ogg", "avi", "wmv", "flv", "ts", "mpeg", "mpg"];

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

  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState("");
  const [paused, setPaused] = useState(false);
  const [library, setLibrary] = useState<{ path: string; label: string }[]>([]);
  const uploadRef = useRef<tus.Upload | null>(null);

  const loadLibrary = async () => {
    const { data } = await supabase.storage.from("room-videos").list(roomId, {
      limit: 50,
      sortBy: { column: "created_at", order: "desc" },
    });
    setLibrary(
      (data ?? [])
        .filter((f) => f.name && !f.name.startsWith("."))
        .map((f) => ({ path: `${roomId}/${f.name}`, label: f.name.split("__").slice(1).join("__") || f.name })),
    );
  };
  useEffect(() => {
    void loadLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const handleUpload = async (file: File) => {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!file.type.startsWith("video/") && !VIDEO_EXT.includes(ext)) {
      toast.error("Please choose a video file (MP4, WebM, MOV, MKV, M4V, 3GP…).");
      return;
    }
    if (file.size > 2 * 1024 * 1024 * 1024) {
      toast.error("That file is larger than 2 GB.");
      return;
    }
    const probe = document.createElement("video");
    const mime = file.type || `video/${ext === "mov" ? "quicktime" : ext}`;
    if (!probe.canPlayType(mime) && ["avi", "wmv", "flv", "mkv"].includes(ext)) {
      toast.warning("This format may not play in every browser. MP4 (H.264) works everywhere.");
    }
    // Same file → same name, so a re-pick after leaving resumes instead of restarting.
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `${roomId}/${file.size.toString(36)}${file.lastModified.toString(36)}__${safe}`;
    const existing = library.find((item) => item.path === path);
    if (existing) {
      onPick("upload", path, file.name);
      toast.success("Already uploaded — playing it right away.");
      return;
    }
    const { data: session } = await supabase.auth.getSession();
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    const headers: Record<string, string> = { apikey: key, "x-upsert": "true" };
    if (session.session) headers["authorization"] = `Bearer ${session.session.access_token}`;
    setUploading(true);
    setPaused(false);
    setProgress(0);
    const started = Date.now();
    const upload = new tus.Upload(file, {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL as string}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: { bucketName: "room-videos", objectName: path, contentType: mime, cacheControl: "3600" },
      onProgress: (sent, total) => {
        setProgress(Math.round((sent / total) * 100));
        const secs = (Date.now() - started) / 1000;
        if (secs > 1) setSpeed(`${(sent / secs / 1024 / 1024).toFixed(1)} MB/s`);
      },
      onError: () => {
        setUploading(false);
        uploadRef.current = null;
        toast.error("Upload stopped. Pick the same file again to continue where it left off.");
      },
      onSuccess: () => {
        setUploading(false);
        uploadRef.current = null;
        onPick("upload", path, file.name);
        void loadLibrary();
        toast.success("Upload ready — everyone streams from this file.");
      },
    });
    uploadRef.current = upload;
    const previous = await upload.findPreviousUploads();
    if (previous[0]) {
      upload.resumeFromPreviousUpload(previous[0]);
      toast.message("Continuing your earlier upload…");
    }
    upload.start();
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
            placeholder="Page link, iframe embed code, Aparat, Vimeo, .mp4/.m3u8…"
          />
          <Button
            disabled={finding}
            onClick={async () => {
              const detected = detectSource(unwrapEmbedCode(link));
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
                const synced = r.videos.find((v) => v.kind === "hls" || v.kind === "file");
                if (synced && /aparat\.com/i.test(detected.ref)) {
                  onPick("file", synced.url, null);
                  toast.success("Found the real video — everyone stays in sync.");
                  setLink("");
                  return;
                }
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
                onPick("other", unwrapEmbedCode(link), null);
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

      <TabsContent value="upload" className="mt-3 space-y-3">
        {uploading ? (
          <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{paused ? "Paused" : "Uploading…"} {progress}%</span>
              <span className="text-muted-foreground">{speed}</span>
            </div>
            <Progress value={progress} />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (paused) uploadRef.current?.start();
                  else void uploadRef.current?.abort();
                  setPaused(!paused);
                }}
              >
                {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                {paused ? "Resume" : "Pause"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void uploadRef.current?.abort(true);
                  uploadRef.current = null;
                  setUploading(false);
                }}
              >
                <X className="size-3.5" /> Cancel
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              If you leave, pick the same file again later — the upload continues where it stopped.
            </p>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted-foreground hover:border-primary">
            <span className="flex items-center gap-2 text-foreground">
              <Upload className="size-4" /> Choose a video from your phone or computer
            </span>
            <span className="text-[11px]">MP4, MOV, WebM, MKV, M4V, 3GP · up to 2 GB · resumable</span>
            <input
              type="file"
              accept="video/*,.mkv,.mov,.m4v,.3gp,.webm,.avi,.ts"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleUpload(file);
                event.target.value = "";
              }}
            />
          </label>
        )}
        {library.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium">Room library — no need to upload again</p>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {library.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => onPick("upload", item.path, item.label)}
                  className="flex w-full items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-left text-xs hover:border-primary"
                >
                  <Film className="size-3.5 shrink-0 text-primary" />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
