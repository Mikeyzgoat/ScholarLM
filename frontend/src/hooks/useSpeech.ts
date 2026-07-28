import { useCallback, useEffect, useRef, useState } from "react";
import { streamSpeech } from "../services/speech";

const key = "scholarlm-auto-read";
const silentWav =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export function useSpeech() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const urls = useRef<string[]>([]);
  const activeIndex = useRef(0);
  const streamComplete = useRef(false);
  const continuePlayback = useRef(false);
  const playing = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const latestText = useRef("");
  const fallbackActive = useRef(false);
  const [isLoading, setLoading] = useState(false);
  const [isPlaying, setPlaying] = useState(false);
  const [isPaused, setPaused] = useState(false);
  const [isReady, setReady] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [autoRead, setAutoReadState] = useState(
    () => localStorage.getItem(key) !== "false",
  );

  const setPlaybackState = (value: boolean) => {
    playing.current = value;
    setPlaying(value);
  };

  const playFallback = useCallback((text: string) => {
    if (!globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance)
      throw new Error("No local browser speech engine is available");
    globalThis.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.96;
    utterance.onstart = () => {
      playing.current = true;
      setPlaying(true);
      setPaused(false);
    };
    utterance.onpause = () => {
      playing.current = false;
      setPlaying(false);
      setPaused(true);
    };
    utterance.onresume = () => {
      playing.current = true;
      setPlaying(true);
      setPaused(false);
    };
    utterance.onend = () => {
      playing.current = false;
      setPlaying(false);
      setPaused(false);
    };
    utterance.onerror = (event) => {
      playing.current = false;
      setPlaying(false);
      setPaused(false);
      if (event.error !== "canceled" && event.error !== "interrupted")
        setError(new Error(`Browser speech failed: ${event.error}`));
    };
    globalThis.speechSynthesis.speak(utterance);
  }, []);

  const playChunk = useCallback((index: number) => {
    const source = urls.current[index];
    if (!source) return;
    const player = audio.current ?? new Audio();
    audio.current = player;
    activeIndex.current = index;
    if (player.src !== source) {
      player.src = source;
      player.load();
    }
    player.onplay = () => {
      setPlaybackState(true);
      setPaused(false);
    };
    player.onpause = () => {
      setPlaybackState(false);
      if (player.currentTime > 0 && !player.ended) setPaused(true);
    };
    player.onended = () => {
      setPlaybackState(false);
      setPaused(false);
      const nextIndex = activeIndex.current + 1;
      if (continuePlayback.current && urls.current[nextIndex])
        playChunk(nextIndex);
    };
    player.onerror = () =>
      setError(new Error("The browser could not decode Kokoro audio"));
    void player.play().catch(() => setPaused(true));
  }, []);

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    continuePlayback.current = false;
    audio.current?.pause();
    if (audio.current) audio.current.currentTime = 0;
    globalThis.speechSynthesis?.cancel();
    setPlaybackState(false);
    setPaused(false);
    setLoading(false);
  }, []);

  const clearQueue = useCallback(() => {
    for (const source of urls.current) URL.revokeObjectURL(source);
    urls.current = [];
    activeIndex.current = 0;
    streamComplete.current = false;
  }, []);

  useEffect(() => {
    const unlockAudio = () => {
      if (!audio.current) audio.current = new Audio(silentWav);
      void audio.current.play().then(() => {
        audio.current?.pause();
        if (audio.current) audio.current.currentTime = 0;
      });
    };
    window.addEventListener("pointerdown", unlockAudio, {
      once: true,
      passive: true,
    });
    return () => window.removeEventListener("pointerdown", unlockAudio);
  }, []);

  useEffect(
    () => () => {
      stop();
      clearQueue();
    },
    [clearQueue, stop],
  );

  const speak = async (text: string) => {
    stop();
    clearQueue();
    latestText.current = text;
    fallbackActive.current = false;
    setReady(false);
    setUsingFallback(false);
    setLoading(true);
    setError(null);
    const next = new AbortController();
    controller.current = next;
    try {
      await streamSpeech(
        text,
        (blob) => {
          if (next.signal.aborted || !blob.size) return;
          urls.current.push(URL.createObjectURL(blob));
          setReady(true);
          const nextIndex = audio.current?.ended
            ? activeIndex.current + 1
            : activeIndex.current;
          if (autoRead && urls.current.length === 1) {
            continuePlayback.current = true;
            playChunk(0);
          } else if (
            continuePlayback.current &&
            !playing.current &&
            urls.current[nextIndex]
          ) {
            playChunk(nextIndex);
          }
        },
        next.signal,
      );
      streamComplete.current = true;
      if (!urls.current.length)
        throw new Error("Kokoro returned no audio chunks");
    } catch (kokoroError) {
      if (next.signal.aborted) return;
      if (urls.current.length) {
        setError(new Error("Kokoro’s audio stream ended early"));
      } else {
        try {
          fallbackActive.current = true;
          setUsingFallback(true);
          setReady(true);
          if (autoRead) playFallback(text);
        } catch {
          setError(
            kokoroError instanceof Error
              ? kokoroError
              : new Error("Speech generation failed"),
          );
        }
      }
    } finally {
      if (controller.current === next) setLoading(false);
    }
  };

  return {
    speak,
    pause: () => {
      continuePlayback.current = false;
      if (fallbackActive.current) globalThis.speechSynthesis?.pause();
      else audio.current?.pause();
    },
    resume: () => {
      continuePlayback.current = true;
      if (fallbackActive.current) {
        if (globalThis.speechSynthesis?.paused)
          globalThis.speechSynthesis.resume();
        else playFallback(latestText.current);
      } else {
        const player = audio.current;
        const index =
          player?.ended && urls.current[activeIndex.current + 1]
            ? activeIndex.current + 1
            : activeIndex.current;
        playChunk(index);
      }
    },
    replay: () => {
      continuePlayback.current = true;
      if (fallbackActive.current) playFallback(latestText.current);
      else playChunk(0);
    },
    stop,
    isLoading,
    isPlaying,
    isPaused,
    isReady,
    usingFallback,
    autoRead,
    setAutoRead: (value: boolean) => {
      setAutoReadState(value);
      localStorage.setItem(key, String(value));
      if (!value) stop();
    },
    error,
  };
}
