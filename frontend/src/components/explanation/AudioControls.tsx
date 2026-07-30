import { Pause, Play, RotateCcw, Square } from "lucide-react";
export function AudioControls({
  isLoading,
  isPlaying,
  isPaused,
  isReady,
  canLoad = false,
  usingFallback,
  autoRead,
  playbackRate,
  onPause,
  onResume,
  onReplay,
  onStop,
  onAutoReadChange,
  onPlaybackRateChange,
}: {
  isLoading: boolean;
  isPlaying: boolean;
  isPaused: boolean;
  isReady: boolean;
  canLoad?: boolean;
  usingFallback: boolean;
  autoRead: boolean;
  playbackRate: number;
  onPause: () => void;
  onResume: () => void;
  onReplay: () => void;
  onStop: () => void;
  onAutoReadChange: (v: boolean) => void;
  onPlaybackRateChange: (value: number) => void;
}) {
  return (
    <div className="scholar-audio-controls sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border p-2 shadow-sm backdrop-blur">
      <button
        type="button"
        aria-label={isPlaying ? "Pause" : "Play"}
        title={isPlaying ? "Pause audio" : "Play audio"}
        onClick={isPlaying ? onPause : onResume}
        disabled={!isReady && !canLoad}
        className="scholar-audio-button grid h-9 w-9 place-items-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-35"
      >
        {isPlaying ? <Pause size={17} /> : <Play size={17} />}
      </button>
      <button
        type="button"
        aria-label="Replay"
        title="Replay from the beginning"
        onClick={onReplay}
        disabled={!isReady}
        className="scholar-audio-button grid h-9 w-9 place-items-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-35"
      >
        <RotateCcw size={17} />
      </button>
      <button
        type="button"
        aria-label="Stop"
        title="Stop audio"
        onClick={onStop}
        disabled={!isReady && !isLoading}
        className="scholar-audio-button grid h-9 w-9 place-items-center rounded-lg border disabled:cursor-not-allowed disabled:opacity-35"
      >
        <Square size={17} />
      </button>
      <label className="ml-auto flex items-center gap-2 text-xs">
        <span className="sr-only">Playback speed</span>
        <select
          value={playbackRate}
          onChange={(event) =>
            onPlaybackRateChange(Number(event.target.value))
          }
          aria-label="Playback speed"
          className="scholar-speed-select rounded-md border px-2 py-1 text-xs"
        >
          {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
            <option key={rate} value={rate}>
              {rate}×
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs">
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
        <span className="w-full text-xs text-[var(--scholar-muted)]">
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
