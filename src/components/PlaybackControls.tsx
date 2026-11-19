import { useI18n } from "@/lib/i18n";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatTime } from "@/lib/sources";

export type SyncStatus = "synced" | "syncing" | "off";

type Props = {
  isPlaying: boolean;
  position: number;
  duration: number;
  disabled?: boolean;
  fullscreen: boolean;
  syncStatus: SyncStatus;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onVolume: (volume: number) => void;
  onFullscreen: () => void;
  onSyncAll: () => void;
};

export function PlaybackControls({
  isPlaying,
  position,
  duration,
  disabled,
  fullscreen,
  syncStatus,
  onTogglePlay,
  onSeek,
  onVolume,
  onFullscreen,
  onSyncAll,
}: Props) {
  const { t } = useI18n();
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [savedVolume, setSavedVolume] = useState(1);
  const off = disabled ?? false;
  const seekable = Number.isFinite(duration) && duration > 0;

  const applyVolume = (value: number) => {
    if (value > 0) setSavedVolume(value);
    setVolume(value);
    setMuted(value === 0);
    onVolume(value);
  };

  const pill =
    syncStatus === "synced"
      ? { text: t("sync.synced"), cls: "bg-primary/15 text-primary", dot: "bg-primary" }
      : syncStatus === "syncing"
        ? {
            text: t("sync.syncing"),
            cls: "bg-accent text-accent-foreground",
            dot: "bg-accent-foreground animate-pulse",
          }
        : {
            text: t("sync.off"),
            cls: "bg-muted text-muted-foreground",
            dot: "bg-muted-foreground",
          };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/90 p-3 backdrop-blur">
      <div dir="ltr" className="flex items-center gap-3">
        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {formatTime(position)}
        </span>
        <Slider
          value={[seekable ? Math.min(position, duration) : 0]}
          max={seekable ? duration : 1}
          step={1}
          disabled={off || !seekable}
          onValueChange={(value) => onSeek(value[0] ?? 0)}
          aria-label={t("aria.seek")}
        />
        <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
          {duration === Infinity ? t("live") : seekable ? formatTime(duration) : "—"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <Button
          size="icon"
          variant="ghost"
          disabled={off}
          onClick={() => onSeek(Math.max(0, position - 10))}
          aria-label={t("aria.back10")}
        >
          <RotateCcw className="size-4" />
        </Button>
        <Button
          size="icon"
          className="size-11 rounded-full"
          disabled={off}
          onClick={onTogglePlay}
          aria-label={isPlaying ? t("aria.pause") : t("aria.play")}
        >
          {isPlaying ? <Pause className="size-5" /> : <Play className="size-5" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          disabled={off}
          onClick={() =>
            onSeek(
              Math.min(
                Number.isFinite(duration) && duration > 0 ? duration : position + 10,
                position + 10,
              ),
            )
          }
          aria-label={t("aria.forward10")}
        >
          <RotateCw className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          disabled={off}
          aria-label={muted ? t("aria.unmute") : t("aria.mute")}
          onClick={() => (muted ? applyVolume(savedVolume) : applyVolume(0))}
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </Button>
        <Slider
          className="hidden w-24 sm:flex"
          value={[muted ? 0 : volume]}
          max={1}
          step={0.05}
          disabled={off}
          onValueChange={(value) => applyVolume(value[0] ?? 0)}
          aria-label={t("aria.volume")}
        />
        <span
          className={`ms-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${pill.cls}`}
        >
          <span className={`size-1.5 rounded-full ${pill.dot}`} />
          {pill.text}
        </span>
        <Button
          size="icon"
          variant="ghost"
          disabled={off}
          onClick={onSyncAll}
          aria-label={t("aria.syncAll")}
          title={t("aria.syncAll")}
        >
          <RefreshCw className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onFullscreen}
          aria-label={fullscreen ? t("aria.exitFullscreen") : t("aria.fullscreen")}
        >
          {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
