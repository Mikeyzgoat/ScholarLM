import { useCallback, useEffect, useRef, useState } from "react";
import { generateSpeech } from "../services/speech";

const key = "scholarlm-auto-read";
const silentWav =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export function useSpeech() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const latestText = useRef("");
  const fallbackUtterance = useRef<SpeechSynthesisUtterance | null>(null);
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

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    audio.current?.pause();
    if (audio.current) audio.current.currentTime = 0;
    globalThis.speechSynthesis?.cancel();
    fallbackUtterance.current = null;
    setPlaying(false);
    setPaused(false);
    setLoading(false);
  }, []);

  const playFallback = useCallback((text: string) => {
    if (!globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance)
      throw new Error("No local browser speech engine is available");
    globalThis.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.96;
    utterance.onstart = () => {
      setPlaying(true);
      setPaused(false);
    };
    utterance.onpause = () => {
      setPlaying(false);
      setPaused(true);
    };
    utterance.onresume = () => {
      setPlaying(true);
      setPaused(false);
    };
    utterance.onend = () => {
      setPlaying(false);
      setPaused(false);
    };
    utterance.onerror = (event) => {
      setPlaying(false);
      setPaused(false);
      if (event.error !== "canceled" && event.error !== "interrupted")
        setError(new Error(`Browser speech failed: ${event.error}`));
    };
    fallbackUtterance.current = utterance;
    globalThis.speechSynthesis.speak(utterance);
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
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [stop],
  );

  const speak = async (text: string) => {
    stop();
    latestText.current = text;
    setReady(false);
    setUsingFallback(false);
    fallbackActive.current = false;
    setLoading(true);
    setError(null);
    const next = new AbortController();
    controller.current = next;
    try {
      const blob = await generateSpeech(text, next.signal);
      if (next.signal.aborted) return;
      if (!blob.size) throw new Error("Kokoro returned an empty audio file");
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(blob);
      const player = audio.current ?? new Audio();
      player.src = url.current;
      player.load();
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
      player.onerror = () =>
        setError(new Error("The browser could not decode Kokoro audio"));
      setReady(true);
      if (autoRead) {
        try {
          await player.play();
        } catch {
          setPaused(true);
        }
      }
    } catch (kokoroError) {
      if (next.signal.aborted) return;
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
    } finally {
      if (controller.current === next) setLoading(false);
    }
  };

  return {
    speak,
    pause: () => {
      if (fallbackActive.current) globalThis.speechSynthesis?.pause();
      else audio.current?.pause();
    },
    resume: () => {
      if (fallbackActive.current) {
        if (globalThis.speechSynthesis?.paused)
          globalThis.speechSynthesis.resume();
        else playFallback(latestText.current);
      } else if (audio.current) {
        void audio.current.play();
      }
    },
    replay: () => {
      if (fallbackActive.current) {
        playFallback(latestText.current);
      } else if (audio.current) {
        audio.current.currentTime = 0;
        void audio.current.play();
      }
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
