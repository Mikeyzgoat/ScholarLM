import { useCallback, useEffect, useRef, useState } from "react";
import { generateSpeech } from "../services/speech";
const key = "scholarlm-auto-read";
export function useSpeech() {
  const audio = useRef<HTMLAudioElement | null>(null),
    url = useRef<string | null>(null),
    controller = useRef<AbortController | null>(null);
  const [isLoading, setLoading] = useState(false),
    [isPlaying, setPlaying] = useState(false),
    [isPaused, setPaused] = useState(false),
    [error, setError] = useState<Error | null>(null),
    [autoRead, setAutoReadState] = useState(
      () => localStorage.getItem(key) !== "false",
    );
  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    if (audio.current) {
      audio.current.pause();
      audio.current.currentTime = 0;
    }
    setPlaying(false);
    setPaused(false);
    setLoading(false);
  }, []);
  useEffect(
    () => () => {
      stop();
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [stop],
  );
  const speak = async (text: string) => {
    if (!autoRead) return;
    stop();
    setLoading(true);
    setError(null);
    const next = new AbortController();
    controller.current = next;
    try {
      const blob = await generateSpeech(text, next.signal);
      if (next.signal.aborted) return;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(blob);
      const player = new Audio(url.current);
      audio.current = player;
      player.onplay = () => {
        setPlaying(true);
        setPaused(false);
      };
      player.onpause = () => {
        if (player.currentTime > 0 && !player.ended) setPaused(true);
        setPlaying(false);
      };
      player.onended = () => {
        setPlaying(false);
        setPaused(false);
      };
      await player.play();
    } catch (e) {
      if (!next.signal.aborted)
        setError(e instanceof Error ? e : new Error("Speech failed"));
    } finally {
      if (controller.current === next) setLoading(false);
    }
  };
  return {
    speak,
    pause: () => audio.current?.pause(),
    resume: () => {
      if (audio.current) void audio.current.play();
    },
    replay: () => {
      if (audio.current) {
        audio.current.currentTime = 0;
        void audio.current.play();
      }
    },
    stop,
    isLoading,
    isPlaying,
    isPaused,
    autoRead,
    setAutoRead: (value: boolean) => {
      setAutoReadState(value);
      localStorage.setItem(key, String(value));
      if (!value) stop();
    },
    error,
  };
}
