import { Pause, Play, RotateCcw, Square } from "lucide-react";
export function AudioControls({
  isLoading,
  isPlaying,
  isPaused,
  isReady,
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
        aria-label={isPlaying ? "Pause" : "Play"}
        onClick={isPlaying ? onPause : onResume}
        disabled={isLoading || (!isPlaying && !isPaused && !isReady)}
      >
        {isPlaying ? <Pause size={17} /> : <Play size={17} />}
      </button>
      <button aria-label="Replay" onClick={onReplay} disabled={!isReady}>
        <RotateCcw size={17} />
      </button>
      <button
        aria-label="Stop"
        onClick={onStop}
        disabled={!isReady && !isLoading}
      >
        <Square size={17} />
      </button>
      <label className="ml-auto flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={autoRead}
          onChange={(e) => onAutoReadChange(e.target.checked)}
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
