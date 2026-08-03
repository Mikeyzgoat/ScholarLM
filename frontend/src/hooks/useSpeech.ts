import { useCallback, useEffect, useRef, useState } from "react";
import { combineWavChunks, getAudioDuration } from "../lib/audio";
import { generateSpeech, streamSpeech } from "../services/speech";

const key = "scholarlm-auto-read";
const playbackRateKey = "scholarlm-speech-rate";
const silentWav =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
const transitionAudioPath = "/audio/moving-to-next-question.wav";

function wordIndexAtProgress(text: string, progress: number): number {
  const words = text.match(/\S+/g) ?? [];
  if (!words.length) return -1;
  const weights = words.map((word) => {
    const punctuationPause = /[.!?]$/.test(word)
      ? 6
      : /[,;:]$/.test(word)
        ? 3
        : 0;
    return Math.max(2, Math.sqrt(word.length) + punctuationPause);
  });
  const target =
    Math.max(0, Math.min(1, progress)) *
    weights.reduce((sum, weight) => sum + weight, 0);
  let elapsed = 0;
  for (let index = 0; index < weights.length; index += 1) {
    elapsed += weights[index];
    if (elapsed >= target) return index;
  }
  return words.length - 1;
}

type SpeechChunk = {
  audio: Blob;
  text: string;
  duration: number;
};

function wordWeight(word: string, followingWhitespace: string): number {
  const spokenCharacters = word.replace(/[^\p{L}\p{N}]/gu, "").length;
  const punctuationPause = /[.!?…]["')\]}]*$/u.test(word)
    ? 4.5
    : /[;:]["')\]}]*$/u.test(word)
      ? 2.6
      : /[,—–]["')\]}]*$/u.test(word)
        ? 1.7
        : 0;
  const paragraphPause = /\n\s*\n/.test(followingWhitespace)
    ? 5
    : /\n/.test(followingWhitespace)
      ? 2.5
      : 0;
  return Math.max(1.5, spokenCharacters / 3.6) +
    punctuationPause +
    paragraphPause;
}

function buildWordCueEnds(chunks: SpeechChunk[]): number[] {
  const cueEnds: number[] = [];
  let elapsed = 0;
  for (const chunk of chunks) {
    const matches = [...chunk.text.matchAll(/\S+/g)];
    if (!matches.length || chunk.duration <= 0) {
      elapsed += Math.max(0, chunk.duration);
      continue;
    }
    const weights = matches.map((match, index) => {
      const end = (match.index ?? 0) + match[0].length;
      const nextStart = matches[index + 1]?.index ?? chunk.text.length;
      return wordWeight(match[0], chunk.text.slice(end, nextStart));
    });
    const totalWeight = weights.reduce((total, weight) => total + weight, 0);
    let chunkElapsed = 0;
    for (const weight of weights) {
      chunkElapsed += (chunk.duration * weight) / totalWeight;
      cueEnds.push(elapsed + chunkElapsed);
    }
    elapsed += chunk.duration;
  }
  return cueEnds;
}

function wordIndexAtTime(cueEnds: number[], currentTime: number): number {
  let low = 0;
  let high = cueEnds.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (currentTime <= cueEnds[middle]) high = middle;
    else low = middle + 1;
  }
  return low;
}

export function useSpeech() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const audioUrl = useRef("");
  const controller = useRef<AbortController | null>(null);
  const latestText = useRef("");
  const wordCueEnds = useRef<number[]>([]);
  const fallbackActive = useRef(false);
  const progressFrame = useRef(0);
  const playbackDone = useRef<(() => void) | null>(null);
  const audioGenerationQueue = useRef<Promise<void>>(Promise.resolve());
  const automaticPlaybackQueue = useRef<Promise<void>>(Promise.resolve());
  const automaticPlaybackGeneration = useRef(0);
  const hasPlayedAutomaticAudio = useRef(false);
  const transitionAudio = useRef<Blob | null>(null);
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
  const [playbackRate, setPlaybackRateState] = useState(() => {
    const saved = Number(localStorage.getItem(playbackRateKey));
    return [0.75, 1, 1.25, 1.5, 2].includes(saved) ? saved : 1;
  });

  const stopProgress = useCallback(() => {
    cancelAnimationFrame(progressFrame.current);
    progressFrame.current = 0;
  }, []);

  const trackProgress = useCallback(() => {
    const player = audio.current;
    if (
      player &&
      Number.isFinite(player.duration) &&
      player.duration > 0
    ) {
      setActiveWordIndex(
        wordCueEnds.current.length
          ? wordIndexAtTime(wordCueEnds.current, player.currentTime)
          : wordIndexAtProgress(
              latestText.current,
              player.currentTime / player.duration,
            ),
      );
    }
    if (player && !player.paused && !player.ended)
      progressFrame.current = requestAnimationFrame(trackProgress);
  }, []);

  const playAudio = useCallback(async () => {
    if (!audioUrl.current) return;
    const player = audio.current ?? new Audio();
    audio.current = player;
    if (player.src !== audioUrl.current) {
      player.src = audioUrl.current;
      player.load();
    }
    player.playbackRate = playbackRate;
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
    await new Promise<void>((resolve) => {
      playbackDone.current = resolve;
      player.onended = () => {
        setPlaying(false);
        setPaused(false);
        setActiveWordIndex(-1);
        stopProgress();
        playbackDone.current = null;
        resolve();
      };
      player.onerror = () => {
        setError(new Error("The browser could not decode the generated audio"));
        playbackDone.current = null;
        resolve();
      };
      void player.play().catch((cause: unknown) => {
        setPaused(true);
        if (!(cause instanceof DOMException && cause.name === "AbortError"))
          setError(cause instanceof Error ? cause : new Error("Audio playback failed"));
        playbackDone.current = null;
        resolve();
      });
    });
  }, [playbackRate, stopProgress, trackProgress]);

  const playFallback = useCallback((text: string): Promise<void> => {
    if (!globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance)
      throw new Error("No local browser speech engine is available");
    return new Promise((resolve) => {
      globalThis.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      playbackDone.current = resolve;
      utterance.rate = playbackRate;
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
        playbackDone.current = null;
        resolve();
      };
      utterance.onerror = (event) => {
        setPlaying(false);
        setPaused(false);
        if (event.error !== "canceled" && event.error !== "interrupted")
          setError(new Error("Voice playback is unavailable on this device. The written explanation is unaffected."));
        playbackDone.current = null;
        resolve();
      };
      globalThis.speechSynthesis.speak(utterance);
    });
  }, [playbackRate]);

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
    wordCueEnds.current = [];
    playbackDone.current?.();
    playbackDone.current = null;
  }, [stopProgress]);

  const clearAudio = useCallback(() => {
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = "";
  }, []);

  const reset = useCallback(() => {
    automaticPlaybackGeneration.current += 1;
    stop();
    clearAudio();
    latestText.current = "";
    fallbackActive.current = false;
    setReady(false);
    setUsingFallback(false);
    setError(null);
  }, [clearAudio, stop]);

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

  useEffect(() => {
    const controller = new AbortController();
    void fetch(transitionAudioPath, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Transition audio asset was not found");
        transitionAudio.current = await response.blob();
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(
    () => () => {
      stop();
      clearAudio();
    },
    [clearAudio, stop],
  );

  const loadSpeech = async (
    text: string,
    sourceText?: string,
    explanationId?: string,
    playWhenReady = autoRead,
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
    try {
      const chunks: Array<Omit<SpeechChunk, "duration">> = [];
      await streamSpeech(
        text,
        (audioChunk, chunkText) => {
          chunks.push({ audio: audioChunk, text: chunkText });
        },
        next.signal,
        sourceText,
        explanationId,
      );
      if (!chunks.length) throw new Error("Fish Audio and Kokoro returned no audio");
      const timedChunks = await Promise.all(
        chunks.map(async (chunk) => ({
          ...chunk,
          duration: await getAudioDuration(chunk.audio),
        })),
      );
      const allWav = timedChunks.every(
        (chunk) => chunk.audio.type === "audio/wav",
      );
      const generatedAudio = allWav
        ? await combineWavChunks(timedChunks.map((chunk) => chunk.audio))
        : new Blob(
            timedChunks.map((chunk) => chunk.audio),
            { type: "audio/mpeg" },
          );
      if (!generatedAudio.size)
        throw new Error("Fish Audio and Kokoro returned no audio");
      if (next.signal.aborted) return;
      wordCueEnds.current = buildWordCueEnds(timedChunks);
      audioUrl.current = URL.createObjectURL(generatedAudio);
      setReady(true);
      if (playWhenReady) await playAudio();
    } catch {
      if (next.signal.aborted) return;
      try {
        fallbackActive.current = true;
        setUsingFallback(true);
        setReady(true);
        if (playWhenReady) await playFallback(text);
      } catch {
        fallbackActive.current = false;
        setUsingFallback(false);
        setReady(false);
        setError(
          new Error(
            "Voice playback is unavailable on this device. The written explanation is unaffected.",
          ),
        );
      }
    } finally {
      if (controller.current === next) {
        controller.current = null;
        setLoading(false);
      }
    }
  };

  const playStoredAudio = async (blob: Blob) => {
    stop();
    clearAudio();
    audioUrl.current = URL.createObjectURL(blob);
    setReady(true);
    setUsingFallback(false);
    setError(null);
    await playAudio();
  };

  const prepareStoredAudio = async (blob: Blob) => {
    stop();
    clearAudio();
    audioUrl.current = URL.createObjectURL(blob);
    setReady(true);
    setUsingFallback(false);
    setError(null);
  };

  return {
    speak: (
      text: string,
      sourceText?: string,
      explanationId?: string,
    ) => loadSpeech(text, sourceText, explanationId, autoRead),
    generateQueued: (
      text: string,
      sourceText?: string,
      explanationId?: string,
      signal?: AbortSignal,
    ) => {
      const operation = audioGenerationQueue.current.then(() =>
        generateSpeech(text, signal, sourceText, explanationId),
      );
      audioGenerationQueue.current = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    enqueueStored: (blob: Blob, onStart?: () => void) => {
      const generation = automaticPlaybackGeneration.current;
      const operation = automaticPlaybackQueue.current.then(async () => {
        if (generation !== automaticPlaybackGeneration.current) return;
        if (hasPlayedAutomaticAudio.current && transitionAudio.current) {
          await playStoredAudio(transitionAudio.current);
          if (generation !== automaticPlaybackGeneration.current) return;
        }
        onStart?.();
        await playStoredAudio(blob);
        hasPlayedAutomaticAudio.current = true;
      });
      automaticPlaybackQueue.current = operation.catch(() => undefined);
      return operation;
    },
    playStored: playStoredAudio,
    prepare: (
      text: string,
      sourceText?: string,
      explanationId?: string,
    ) => loadSpeech(text, sourceText, explanationId, false),
    prepareStored: prepareStoredAudio,
    play: (
      text: string,
      sourceText?: string,
      explanationId?: string,
    ) => loadSpeech(text, sourceText, explanationId, true),
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
    reset,
    isLoading,
    isPlaying,
    isPaused,
    isReady,
    usingFallback,
    activeWordIndex,
    autoRead,
    playbackRate,
    setPlaybackRate: (value: number) => {
      const next = [0.75, 1, 1.25, 1.5, 2].includes(value) ? value : 1;
      setPlaybackRateState(next);
      localStorage.setItem(playbackRateKey, String(next));
      if (audio.current) audio.current.playbackRate = next;
    },
    setAutoRead: (value: boolean) => {
      setAutoReadState(value);
      localStorage.setItem(key, String(value));
      if (!value) stop();
    },
    error,
  };
}
