import { Pause, Play, RotateCcw, Square } from "lucide-react";
export function AudioControls({
  isLoading,
  isPlaying,
  isPaused,
  isReady,
  canLoad = false,
  usingFallback,
  autoRead,
  onPause,
  onResume,
  onReplay,
  onStop,
  onAutoReadChange,
}: {
  isLoading: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  isReady: boolean;
  canLoad?: boolean;
  usingFallback: boolean;
  autoRead: boolean;
  onPause: () => void;
  onResume: () => void;
  onReplay: () => void;
  onStop: () => void;
  onAutoReadChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      <button
        type="button"
        aria-label={isPlaying ? "Pause" : "Play"}
        title={isPlaying ? "Pause audio" : "Play audio"}
        onClick={isPlaying ? onPause : onResume}
        disabled={!isReady && !canLoad}
        className="grid h-9 w-9 place-items-center rounded-lg border bg-white/5 hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:opacity-35"
      >
        {isPlaying ? <Pause size={17} /> : <Play size={17} />}
      </button>
      <button
        type="button"
        aria-label="Replay"
        title="Replay from the beginning"
        onClick={onReplay}
        disabled={!isReady}
        className="grid h-9 w-9 place-items-center rounded-lg border bg-white/5 hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:opacity-35"
      >
        <RotateCcw size={17} />
      </button>
      <button
        type="button"
        aria-label="Stop"
        title="Stop audio"
        onClick={onStop}
        disabled={!isReady && !isLoading}
        className="grid h-9 w-9 place-items-center rounded-lg border bg-white/5 hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:opacity-35"
      >
        <Square size={17} />
      </button>
      <label className="ml-auto flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={autoRead}
          onChange={(e) => onAutoReadChange(e.target.checked)}
          aria-label="Automatically read new explanations"
        />
        Auto-read
      </label>
      {isLoading && <span className="w-full text-xs">Generating speech…</span>}
      {!isLoading && isReady && !isPlaying && !isPaused && (
        <span className="w-full text-xs text-stone-500">
          Audio ready—press play if your browser blocked auto-play.
        </span>
      )}
      {usingFallback && (
        <span className="w-full text-xs text-orange-300">
          Using the browser voice because Kokoro is unavailable.
        </span>
      )}
    </div>
  );
}
