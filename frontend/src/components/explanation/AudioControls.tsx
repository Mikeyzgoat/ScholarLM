import { Pause, Play, RotateCcw, Square } from "lucide-react";
export function AudioControls({
  isLoading,
  isPlaying,
  isPaused,
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
        aria-label={isPaused ? "Resume" : "Pause"}
        onClick={isPaused ? onResume : onPause}
        disabled={isLoading || (!isPlaying && !isPaused)}
      >
        {isPaused ? <Play size={17} /> : <Pause size={17} />}
      </button>
      <button aria-label="Replay" onClick={onReplay}>
        <RotateCcw size={17} />
      </button>
      <button aria-label="Stop" onClick={onStop}>
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
    </div>
  );
}
