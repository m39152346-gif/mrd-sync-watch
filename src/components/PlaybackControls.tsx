import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatTime } from "@/lib/sources";

type Props = {
  isPlaying: boolean;
  position: number;
  duration: number;
  disabled?: boolean;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onVolume: (volume: number) => void;
};

export function PlaybackControls({
  isPlaying,
  position,
  duration,
  disabled,
  onTogglePlay,
  onSeek,
  onVolume,
}: Props) {
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  const applyVolume = (value: number) => {
    setVolume(value);
    setMuted(value === 0);
    onVolume(value);
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {formatTime(position)}
        </span>
        <Slider
          value={[Math.min(position, duration || position)]}
          max={duration || Math.max(position, 1)}
          step={1}
          disabled={disabled ?? false}
          onValueChange={(value) => onSeek(value[0] ?? 0)}
          aria-label="Seek"
        />
        <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
          {formatTime(duration)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Button size="icon" disabled={disabled} onClick={onTogglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Button
          size="icon"
          variant="secondary"
          disabled={disabled}
          aria-label={muted ? "Unmute" : "Mute"}
          onClick={() => (muted ? applyVolume(1) : applyVolume(0))}
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </Button>
        <Slider
          className="max-w-36"
          value={[muted ? 0 : volume]}
          max={1}
          step={0.05}
          disabled={disabled ?? false}
          onValueChange={(value) => applyVolume(value[0] ?? 0)}
          aria-label="Volume"
        />
        <span className="ml-auto text-xs text-muted-foreground">
          {disabled ? "Playback sync unavailable" : "Everyone stays in sync"}
        </span>
      </div>
    </div>
  );
}
