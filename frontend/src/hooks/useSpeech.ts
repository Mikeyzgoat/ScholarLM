import { useCallback, useEffect, useRef, useState } from "react";
import { streamSpeech } from "../services/speech";
import { combineWavChunks } from "../lib/audio";

const key = "scholarlm-auto-read";
const silentWav =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export function useSpeech() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef("");
  const controller = useRef<AbortController | null>(null);
  const latestText = useRef("");
  const fallbackActive = useRef(false);
  const progressFrame = useRef(0);
  const [isLoading, setLoading] = useState(false);
  const [isPlaying, setPlaying] = useState(false);
  const [isPaused, setPaused] = useState(false);
  const [isReady, setReady] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [activeWordIndex, setActiveWordIndex] = useState(-1);
  const [error, setError] = useState<Error | null>(null);
  const [autoRead, setAutoReadState] = useState(
    () => localStorage.getItem(key) !== "false",
  );

  const stopProgress = useCallback(() => {
    cancelAnimationFrame(progressFrame.current);
    progressFrame.current = 0;
  }, []);

  const trackProgress = useCallback(() => {
    const player = audio.current;
    const wordCount = latestText.current.match(/\S+/g)?.length ?? 0;
    if (
      player &&
      wordCount &&
      Number.isFinite(player.duration) &&
      player.duration > 0
    ) {
      setActiveWordIndex(
        Math.min(
          wordCount - 1,
          Math.floor((player.currentTime / player.duration) * wordCount),
        ),
      );
    }
    if (player && !player.paused && !player.ended)
      progressFrame.current = requestAnimationFrame(trackProgress);
  }, []);

  const playAudio = useCallback(() => {
    if (!audioUrl.current) return;
    const player = audio.current ?? new Audio();
    audio.current = player;
    if (player.src !== audioUrl.current) {
      player.src = audioUrl.current;
      player.load();
    }
    player.onplay = () => {
      setPlaying(true);
      setPaused(false);
      stopProgress();
      progressFrame.current = requestAnimationFrame(trackProgress);
    };
    player.onpause = () => {
      setPlaying(false);
      stopProgress();
      if (player.currentTime > 0 && !player.ended) setPaused(true);
    };
    player.onended = () => {
      setPlaying(false);
      setPaused(false);
      setActiveWordIndex(-1);
      stopProgress();
    };
    player.onerror = () =>
      setError(new Error("The browser could not decode Kokoro audio"));
    void player.play().catch(() => setPaused(true));
  }, [stopProgress, trackProgress]);

  const playFallback = useCallback((text: string) => {
    if (!globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance)
      throw new Error("No local browser speech engine is available");
    globalThis.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.96;
    utterance.onstart = () => {
      setPlaying(true);
      setPaused(false);
      setActiveWordIndex(0);
    };
    utterance.onboundary = (event) => {
      if (event.name !== "word") return;
      const prefix = text.slice(0, event.charIndex);
      setActiveWordIndex(prefix.match(/\S+/g)?.length ?? 0);
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
      setActiveWordIndex(-1);
    };
    utterance.onerror = (event) => {
      setPlaying(false);
      setPaused(false);
      setActiveWordIndex(-1);
      if (event.error !== "canceled" && event.error !== "interrupted")
        setError(new Error(`Browser speech failed: ${event.error}`));
    };
    globalThis.speechSynthesis.speak(utterance);
  }, []);

  const stop = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    audio.current?.pause();
    if (audio.current) audio.current.currentTime = 0;
    globalThis.speechSynthesis?.cancel();
    stopProgress();
    setPlaying(false);
    setPaused(false);
    setLoading(false);
    setActiveWordIndex(-1);
  }, [stopProgress]);

  const clearAudio = useCallback(() => {
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = "";
  }, []);

  useEffect(() => {
    const unlockAudio = () => {
      if (!audio.current) audio.current = new Audio(silentWav);
      void audio.current
        .play()
        .then(() => {
          audio.current?.pause();
          if (audio.current) audio.current.currentTime = 0;
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError"))
            console.debug("Audio unlock was deferred", error);
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
      clearAudio();
    },
    [clearAudio, stop],
  );

  const speak = async (
    text: string,
    sourceText?: string,
    explanationId?: string,
  ) => {
    stop();
    clearAudio();
    latestText.current = text;
    fallbackActive.current = false;
    setReady(false);
    setUsingFallback(false);
    setLoading(true);
    setError(null);
    const next = new AbortController();
    controller.current = next;
    const chunks: Blob[] = [];
    try {
      await streamSpeech(
        text,
        (blob) => {
          if (!next.signal.aborted && blob.size) chunks.push(blob);
        },
        next.signal,
        sourceText,
        explanationId,
      );
      if (!chunks.length) throw new Error("Kokoro returned no audio chunks");
      const combined = await combineWavChunks(chunks);
      if (next.signal.aborted) return;
      audioUrl.current = URL.createObjectURL(combined);
      setReady(true);
      if (autoRead) playAudio();
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
      if (controller.current === next) {
        controller.current = null;
        setLoading(false);
      }
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
      } else {
        playAudio();
      }
    },
    replay: () => {
      setActiveWordIndex(0);
      if (fallbackActive.current) {
        playFallback(latestText.current);
      } else {
        if (audio.current) audio.current.currentTime = 0;
        playAudio();
      }
    },
    stop,
    isLoading,
    isPlaying,
    isPaused,
    isReady,
    usingFallback,
    activeWordIndex,
    autoRead,
    setAutoRead: (value: boolean) => {
      setAutoReadState(value);
      localStorage.setItem(key, String(value));
      if (!value) stop();
    },
    error,
  };
}
