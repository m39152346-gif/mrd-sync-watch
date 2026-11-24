import { useI18n } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import * as tus from "tus-js-client";
import { useServerFn } from "@tanstack/react-start";
import { Film, Loader2, Pause, Play, Search, Upload, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getRoomKey, type RoomClient } from "@/lib/room-access";
import { unwrapEmbedCode, detectSource, parseYouTubeId, type SourceType } from "@/lib/sources";
import { searchYouTube, type YouTubeResult } from "@/lib/youtube.functions";
import { findVideosInPage, type FoundVideo } from "@/lib/extract.functions";
import { uploadPath, videoUploadError } from "@/lib/uploads";
import {
  aparatApiEndpoints,
  aparatEmbedUrl,
  aparatHash,
  mediaUrlsIn,
  pickAparatVideo,
} from "@/lib/public-video-url";

/**
 * Asks Aparat directly from the viewer's own browser first: Aparat often
 * refuses requests from servers outside Iran but answers its own visitors.
 */
async function findAparatInBrowser(hash: string): Promise<string | null> {
  for (const endpoint of aparatApiEndpoints(hash)) {
    try {
      const res = await fetch(endpoint, { signal: AbortSignal.timeout(7000), credentials: "omit" });
      if (!res.ok) continue;
      const best = pickAparatVideo(mediaUrlsIn(await res.text()));
      if (best) return best;
    } catch {
      /* blocked or offline — try the next way */
    }
  }
  return null;
}

type Props = {
  roomId: string;
  /** Approved viewer id: uploads go into this viewer's own room subfolder. */
  memberId: string;
  client: RoomClient;
  onPick: (type: SourceType, ref: string, title: string | null) => void;
};

export function SourcePanel({ roomId, memberId, client, onPick }: Props) {
  const { t, lang } = useI18n();
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
      if (response.error)
        toast.error(lang === "fa" ? t("error.searchUnavailable") : response.error);
      else if (response.results.length === 0) toast.message(t("noVideosFound"));
    } catch {
      toast.error(t("error.searchFailed"));
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
    const bucket = client.storage.from("room-videos");
    const { data: folders } = await bucket.list(roomId, { limit: 100 });
    const lists = await Promise.all(
      (folders ?? [])
        .filter((f) => f.id === null && f.name)
        .map(async (folder) => {
          const prefix = `${roomId}/${folder.name}`;
          const { data } = await bucket.list(prefix, {
            limit: 50,
            sortBy: { column: "created_at", order: "desc" },
          });
          return (data ?? [])
            .filter((f) => f.id && f.name && !f.name.startsWith("."))
            .map((f) => ({
              path: `${prefix}/${f.name}`,
              label: f.name.split("__").slice(1).join("__") || f.name,
              at: f.created_at ?? "",
            }));
        }),
    );
    setLibrary(
      lists
        .flat()
        .sort((x, y) => y.at.localeCompare(x.at))
        .map(({ path, label }) => ({ path, label })),
    );
  };
  useEffect(() => {
    void loadLibrary();
    const timer = setInterval(() => void loadLibrary(), 15000);
    return () => {
      clearInterval(timer);
      void uploadRef.current?.abort();
      uploadRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const handleUpload = async (file: File) => {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    const validationError = videoUploadError(file);
    if (validationError) {
      toast.error(t(validationError));
      return;
    }
    const probe = document.createElement("video");
    const mime = file.type || `video/${ext === "mov" ? "quicktime" : ext}`;
    if (!probe.canPlayType(mime) && ["avi", "wmv", "flv", "mkv"].includes(ext)) {
      toast.warning(t("formatWarning"));
    }
    // Same file → same name, so a re-pick after leaving resumes instead of restarting.
    const path = uploadPath(`${roomId}/${memberId}`, file);
    const existing = library.find((item) => item.path === path);
    if (existing) {
      onPick("upload", path, file.name);
      toast.success(t("alreadyUploaded"));
      return;
    }
    const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;
    // The room key proves approved membership; storage rules limit writes to our own folder.
    const headers: Record<string, string> = {
      apikey: key,
      "x-upsert": "true",
      "x-room-key": getRoomKey(),
    };
    setUploading(true);
    setPaused(false);
    setProgress(0);
    const started = Date.now();
    const upload = new tus.Upload(file, {
      endpoint: `${import.meta.env["VITE_SUPABASE_URL"] as string}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers,
      fingerprint: async () => `syncwatch:${path}`,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: "room-videos",
        objectName: path,
        contentType: mime,
        cacheControl: "3600",
      },
      onProgress: (sent, total) => {
        setProgress(Math.round((sent / total) * 100));
        const secs = (Date.now() - started) / 1000;
        if (secs > 1) setSpeed(`${(sent / secs / 1024 / 1024).toFixed(1)} MB/s`);
      },
      onError: () => {
        setUploading(false);
        uploadRef.current = null;
        toast.error(t("uploadStopped"));
      },
      onSuccess: () => {
        setUploading(false);
        uploadRef.current = null;
        onPick("upload", path, file.name);
        void loadLibrary();
        toast.success(t("uploadReady"));
      },
    });
    uploadRef.current = upload;
    try {
      const previous = await upload.findPreviousUploads();
      if (previous[0]) {
        upload.resumeFromPreviousUpload(previous[0]);
        toast.message(t("continuingUpload"));
      }
      upload.start();
    } catch {
      setUploading(false);
      uploadRef.current = null;
      toast.error(t("uploadStartFailed"));
    }
  };

  return (
    <Tabs
      dir={lang === "fa" ? "rtl" : "ltr"}
      defaultValue="youtube"
      className="rounded-xl border border-border bg-card p-3"
    >
      <TabsList className="w-full">
        <TabsTrigger value="youtube" className="flex-1">
          {" "}
          {t("source.youtube")}
        </TabsTrigger>
        <TabsTrigger value="link" className="flex-1">
          {" "}
          {t("tab.link")}
        </TabsTrigger>
        <TabsTrigger value="upload" className="flex-1">
          {" "}
          {t("tab.upload")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="youtube" className="mt-3 space-y-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search.placeholder")}
          />
          <Button type="submit" disabled={searching} aria-label={t("search.aria")}>
            {searching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
          </Button>
        </form>
        {results.length > 0 && (
          <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {results.map((result) => (
              <Button
                variant="ghost"
                key={result.videoId}
                type="button"
                onClick={() => onPick("youtube", result.videoId, result.title)}
                className="group h-auto flex-col items-stretch gap-0 overflow-hidden whitespace-normal rounded-lg border border-border bg-surface p-0 text-start transition-colors hover:border-primary"
              >
                {result.thumbnail && (
                  <img src={result.thumbnail} alt="" className="aspect-video w-full object-cover" />
                )}
                <span className="block p-2 text-xs leading-snug line-clamp-2">{result.title}</span>
              </Button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            dir="ltr"
            value={ytLink}
            onChange={(event) => setYtLink(event.target.value)}
            placeholder={t("ytLink.placeholder")}
          />
          <Button
            variant="secondary"
            onClick={() => {
              const id = parseYouTubeId(ytLink);
              if (!id) {
                toast.error(t("error.notYoutube"));
                return;
              }
              onPick("youtube", id, null);
              setYtLink("");
            }}
          >
            {" "}
            {t("load")}
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="link" className="mt-3 space-y-2">
        <div className="flex gap-2">
          <Input
            dir="ltr"
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder={t("link.placeholder")}
          />
          <Button
            disabled={finding}
            onClick={async () => {
              const detected = detectSource(unwrapEmbedCode(link));
              if (!detected) {
                toast.error(t("error.needHttps"));
                return;
              }
              if (detected.type !== "other") {
                onPick(detected.type, detected.ref, null);
                toast.success(t("loadedAs", { label: t(`source.${detected.type}`) }));
                setLink("");
                return;
              }
              setFinding(true);
              setFound([]);
              try {
                const aparat = aparatHash(new URL(detected.ref));
                if (aparat) {
                  const best =
                    (await findAparatInBrowser(aparat)) ??
                    pickAparatVideo(
                      (
                        await runFind({ data: { url: detected.ref } }).catch(() => ({
                          videos: [] as FoundVideo[],
                        }))
                      ).videos.map((v) => v.url),
                    );
                  setLink("");
                  if (best) {
                    onPick("file", best, t("aparat.title"));
                    toast.success(t("aparatFound"));
                  } else {
                    onPick("other", aparatEmbedUrl(aparat), t("aparat.title"));
                    toast.message(t("aparatFallback"));
                  }
                  return;
                }
                const r = await runFind({ data: { url: detected.ref } });
                setFound(r.videos);
                if (r.videos.length === 0) {
                  toast.message(
                    lang === "fa" ? t("noControllable") : (r.error ?? t("noControllable")),
                  );
                  onPick("other", detected.ref, null);
                  setLink("");
                }
              } catch {
                toast.message(t("pageNotChecked"));
                onPick("other", detected.ref, null);
              } finally {
                setFinding(false);
              }
            }}
          >
            {finding ? <Loader2 className="size-4 animate-spin" /> : t("load")}
          </Button>
        </div>
        {found.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium"> {t("videosFound")} </p>
            {found.map((v) => (
              <Button
                variant="ghost"
                key={v.url}
                type="button"
                onClick={() => {
                  const d = detectSource(v.url);
                  const type: SourceType =
                    v.kind === "hls" || v.kind === "file" ? "file" : (d?.type ?? "other");
                  onPick(type, d && type === d.type ? d.ref : v.url, null);
                  setFound([]);
                  setLink("");
                }}
                className="flex h-auto w-full min-w-0 items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-start text-xs hover:border-primary"
              >
                <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] uppercase text-accent-foreground">
                  {v.kind === "hls" || v.kind === "file"
                    ? t("syncedChip")
                    : t(`source.${v.kind === "embed" ? "other" : v.kind}`)}
                </span>
                <span dir="ltr" className="truncate">
                  {v.url}
                </span>
              </Button>
            ))}
            <Button
              variant="ghost"
              type="button"
              className="text-xs text-muted-foreground underline"
              onClick={() => {
                onPick("other", unwrapEmbedCode(link), null);
                setFound([]);
                setLink("");
              }}
            >
              {" "}
              {t("embedPageInstead")}
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground"> {t("linkHint")}</p>
      </TabsContent>

      <TabsContent value="upload" className="mt-3 space-y-3">
        {uploading ? (
          <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">
                {paused ? t("paused") : t("uploading")} {progress}%
              </span>
              <span dir="ltr" className="text-muted-foreground">
                {speed}
              </span>
            </div>
            <Progress value={progress} />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  if (paused) uploadRef.current?.start();
                  else await uploadRef.current?.abort();
                  setPaused((value) => !value);
                }}
              >
                {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                {paused ? t("resume") : t("aria.pause")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await uploadRef.current?.abort(true).catch(() => {});
                  uploadRef.current = null;
                  setUploading(false);
                }}
              >
                <X className="size-3.5" /> {t("cancel")}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground"> {t("uploadResumeHint")}</p>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted-foreground hover:border-primary">
            <span className="flex items-center gap-2 text-foreground">
              <Upload className="size-4" /> {t("chooseVideo")}
            </span>
            <span className="text-[11px]"> {t("uploadFormats")} </span>
            <input
              type="file"
              accept="video/*,.mp4,.mkv,.mov,.m4v,.3gp,.webm,.avi,.ts,.ogg,.ogv,.wmv,.flv,.mpeg,.mpg"
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
            <p className="text-xs font-medium"> {t("roomLibrary")} </p>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {library.map((item) => (
                <Button
                  variant="ghost"
                  key={item.path}
                  type="button"
                  onClick={() => onPick("upload", item.path, item.label)}
                  className="flex w-full items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5 text-start text-xs hover:border-primary"
                >
                  <Film className="size-3.5 shrink-0 text-primary" />
                  <span className="truncate">{item.label}</span>
                </Button>
              ))}
            </div>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
