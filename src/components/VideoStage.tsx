import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { AlertTriangle, ExternalLink, Film } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { SourceType } from "@/lib/sources";

export type PlayerHandle = {
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  getTime: () => number;
  getDuration: () => number;
  setVolume: (volume: number) => void;
  controllable: boolean;
};

type Props = {
  handleRef: Ref<PlayerHandle>;
  sourceType: SourceType;
  sourceRef: string | null;
  /** Fired when the viewer drives the embedded player directly. */
  onLocalPlayPause?: (playing: boolean, position: number) => void;
  onReady?: () => void;
};

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
    Vimeo?: any;
  }
}

function loadScript(src: string, marker: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-marker="${marker}"]`);
    if (existing) {
      if (existing.dataset['loaded'] === "true") resolve();
      else {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("script failed")));
      }
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset['marker'] = marker;
    script.addEventListener("load", () => {
      script.dataset['loaded'] = "true";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error("script failed")));
    document.body.appendChild(script);
  });
}

async function waitForYouTubeApi() {
  await loadScript("https://www.youtube.com/iframe_api", "yt-iframe-api");
  if (window.YT?.Player) return;
  await new Promise<void>((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const poll = setInterval(() => {
      if (window.YT?.Player) {
        clearInterval(poll);
        resolve();
      }
    }, 100);
  });
}

export function VideoStage({ handleRef, sourceType, sourceRef, onLocalPlayPause, onReady }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytRef = useRef<any>(null);
  const vimeoRef = useRef<any>(null);
  const vimeoTimeRef = useRef(0);
  const vimeoDurationRef = useRef(0);
  const volumeRef = useRef(1);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // Resolve the playable URL for direct links and Storage uploads.
  useEffect(() => {
    let active = true;
    setFileError(null);
    if (sourceType === "file") {
      setFileUrl(sourceRef);
      return;
    }
    if (sourceType === "upload" && sourceRef) {
      setFileUrl(null);
      supabase.storage
        .from("room-videos")
        .createSignedUrl(sourceRef, 60 * 60 * 12)
        .then(({ data, error }) => {
          if (!active) return;
          if (error || !data?.signedUrl) {
            setFileError("This uploaded video could not be loaded.");
            return;
          }
          setFileUrl(data.signedUrl);
        });
      return () => {
        active = false;
      };
    }
    setFileUrl(null);
    return () => {
      active = false;
    };
  }, [sourceType, sourceRef]);

  // HLS (.m3u8) streams: native on Safari, hls.js elsewhere (loaded client-side only).
  useEffect(() => {
    const video = videoRef.current;
    if (!fileUrl || !video || !/\.m3u8(\?|#|$)/i.test(fileUrl)) return;
    if (video.canPlayType("application/vnd.apple.mpegurl")) return;
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;
    void import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !Hls.isSupported()) return;
      const instance = new Hls();
      instance.loadSource(fileUrl);
      instance.attachMedia(video);
      hls = instance;
    });
    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [fileUrl]);

  // YouTube IFrame player
  useEffect(() => {
    if (sourceType !== "youtube" || !sourceRef) return;
    let destroyed = false;
    let player: any;
    (async () => {
      await waitForYouTubeApi();
      if (destroyed || !mountRef.current) return;
      player = new window.YT.Player(mountRef.current, {
        videoId: sourceRef,
        playerVars: { enablejsapi: 1, controls: 0, modestbranding: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: () => {
            ytRef.current = player;
            player.setVolume(volumeRef.current * 100);
            onReady?.();
          },
          onStateChange: (event: any) => {
            const YT = window.YT;
            if (event.data === YT.PlayerState.PLAYING)
              onLocalPlayPause?.(true, player.getCurrentTime() ?? 0);
            if (event.data === YT.PlayerState.PAUSED)
              onLocalPlayPause?.(false, player.getCurrentTime() ?? 0);
          },
        },
      });
    })();
    return () => {
      destroyed = true;
      try {
        ytRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      ytRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceType, sourceRef]);

  // Vimeo player (postMessage API via the official player SDK)
  useEffect(() => {
    if (sourceType !== "vimeo" || !sourceRef) return;
    let destroyed = false;
    (async () => {
      await loadScript("https://player.vimeo.com/api/player.js", "vimeo-player-api");
      if (destroyed || !mountRef.current || !window.Vimeo) return;
      const player = new window.Vimeo.Player(mountRef.current, {
        id: Number(sourceRef),
        controls: false,
        responsive: false,
        width: 1280,
      });
      vimeoRef.current = player;
      player.on("timeupdate", (data: { seconds: number; duration: number }) => {
        vimeoTimeRef.current = data.seconds;
        vimeoDurationRef.current = data.duration;
      });
      player.on("play", () => onLocalPlayPause?.(true, vimeoTimeRef.current));
      player.on("pause", () => onLocalPlayPause?.(false, vimeoTimeRef.current));
      player.ready().then(() => {
        player.setVolume(volumeRef.current);
        onReady?.();
      });
    })();
    return () => {
      destroyed = true;
      try {
        vimeoRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      vimeoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceType, sourceRef]);

  const mutedNoticeRef = useRef(false);
  function notifyMuted() {
    if (mutedNoticeRef.current) return;
    mutedNoticeRef.current = true;
    toast("Playing muted — raise the volume to hear it", { id: "autoplay-muted" });
  }

  useImperativeHandle(
    handleRef,
    (): PlayerHandle => ({
      controllable: sourceType !== "other" && sourceType !== "none",
      play: () => {
        ytRef.current?.playVideo?.();
        // Browsers block unmuted autoplay until the viewer interacts, so fall
        // back to muted playback and let them unmute from the controls.
        vimeoRef.current?.play?.().catch(() => {
          vimeoRef.current?.setMuted?.(true);
          vimeoRef.current?.play?.().catch(() => {});
          notifyMuted();
        });
        videoRef.current?.play().catch(() => {
          if (!videoRef.current) return;
          videoRef.current.muted = true;
          void videoRef.current.play().catch(() => {});
          notifyMuted();
        });
      },
      pause: () => {
        ytRef.current?.pauseVideo?.();
        vimeoRef.current?.pause?.().catch(() => {});
        videoRef.current?.pause();
      },
      seek: (seconds: number) => {
        ytRef.current?.seekTo?.(seconds, true);
        vimeoRef.current?.setCurrentTime?.(seconds).catch(() => {});
        if (videoRef.current) videoRef.current.currentTime = seconds;
      },
      getTime: () => {
        if (sourceType === "youtube") return ytRef.current?.getCurrentTime?.() ?? 0;
        if (sourceType === "vimeo") return vimeoTimeRef.current;
        return videoRef.current?.currentTime ?? 0;
      },
      getDuration: () => {
        if (sourceType === "youtube") return ytRef.current?.getDuration?.() ?? 0;
        if (sourceType === "vimeo") return vimeoDurationRef.current;
        return videoRef.current?.duration ?? 0;
      },
      setVolume: (volume: number) => {
        volumeRef.current = volume;
        ytRef.current?.setVolume?.(volume * 100);
        if (volume > 0) ytRef.current?.unMute?.();
        vimeoRef.current?.setVolume?.(volume).catch(() => {});
        if (volume > 0) vimeoRef.current?.setMuted?.(false)?.catch?.(() => {});
        if (videoRef.current) {
          videoRef.current.volume = volume;
          if (volume > 0) videoRef.current.muted = false;
        }
      },
    }),
    [sourceType],
  );

  if (sourceType === "none" || !sourceRef) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card text-muted-foreground">
        <Film className="size-10 opacity-60" />
        <p className="text-sm">Pick something to watch to get started.</p>
      </div>
    );
  }

  if (sourceType === "other") {
    return (
      <div className="space-y-2">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
          <iframe
            key={sourceRef}
            src={sourceRef}
            title="Embedded video"
            className="size-full"
            allow="autoplay; fullscreen; encrypted-media"
            allowFullScreen
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 font-medium text-accent-foreground">
            <AlertTriangle className="size-3.5" /> Sync not guaranteed for this source
          </span>
          <span>If the site blocks embedding, open it directly:</span>
          <a
            href={sourceRef}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
          >
            {sourceRef.slice(0, 48)}
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>
    );
  }

  if (sourceType === "file" || sourceType === "upload") {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
        {fileError ? (
          <div className="flex size-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
            {fileError}
          </div>
        ) : fileUrl ? (
          <video
            key={fileUrl}
            ref={videoRef}
            src={fileUrl}
            className="size-full"
            playsInline
            onLoadedMetadata={() => {
              if (videoRef.current) videoRef.current.volume = volumeRef.current;
              onReady?.();
            }}
            onPlay={() => onLocalPlayPause?.(true, videoRef.current?.currentTime ?? 0)}
            onPause={() => onLocalPlayPause?.(false, videoRef.current?.currentTime ?? 0)}
            onError={() => setFileError("This video link could not be played.")}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
            Loading video…
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border border-border bg-black">
      <div key={`${sourceType}-${sourceRef}`} className="size-full [&>iframe]:size-full">
        <div ref={mountRef} className="size-full" />
      </div>
    </div>
  );
}
