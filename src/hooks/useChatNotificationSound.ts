import { useEffect, useRef, useCallback } from "react";

type WebAudioContext = AudioContext | (AudioContext & { close?: () => Promise<void> });

function createAudioContext(): WebAudioContext | null {
  const audioContextCtor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!audioContextCtor) {
    return null;
  }

  return new audioContextCtor();
}

function disconnectNode(node: AudioNode | null | undefined) {
  if (!node) return;

  try {
    node.disconnect();
  } catch {
    // Ignore cleanup errors from already-disconnected nodes.
  }
}

function scheduleNotificationTone(audioContext: WebAudioContext) {
  const now = audioContext.currentTime;

  const firstOscillator = audioContext.createOscillator();
  const firstGain = audioContext.createGain();
  const secondOscillator = audioContext.createOscillator();
  const secondGain = audioContext.createGain();

  firstOscillator.connect(firstGain);
  firstGain.connect(audioContext.destination);
  secondOscillator.connect(secondGain);
  secondGain.connect(audioContext.destination);

  firstOscillator.frequency.setValueAtTime(880, now);
  firstOscillator.type = "sine";
  firstGain.gain.setValueAtTime(0, now);
  firstGain.gain.linearRampToValueAtTime(0.3, now + 0.05);
  firstGain.gain.linearRampToValueAtTime(0, now + 0.15);

  secondOscillator.frequency.setValueAtTime(1100, now + 0.12);
  secondOscillator.type = "sine";
  secondGain.gain.setValueAtTime(0, now + 0.12);
  secondGain.gain.linearRampToValueAtTime(0.25, now + 0.17);
  secondGain.gain.linearRampToValueAtTime(0, now + 0.3);

  const cleanupFirstTone = () => {
    disconnectNode(firstOscillator);
    disconnectNode(firstGain);
  };

  const cleanupSecondTone = () => {
    disconnectNode(secondOscillator);
    disconnectNode(secondGain);
  };

  firstOscillator.addEventListener("ended", cleanupFirstTone, { once: true });
  secondOscillator.addEventListener("ended", cleanupSecondTone, { once: true });

  firstOscillator.start(now);
  firstOscillator.stop(now + 0.2);
  secondOscillator.start(now + 0.12);
  secondOscillator.stop(now + 0.35);
}

interface UseChatNotificationSoundOptions {
  enabled?: boolean;
  userId?: string;
}

export const useChatNotificationSound = (options: UseChatNotificationSoundOptions = {}) => {
  const { enabled = true, userId } = options;
  const audioContextRef = useRef<WebAudioContext | null>(null);
  const lastPlayedRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = createAudioContext();
    }

    return () => {
      const audioContext = audioContextRef.current;
      audioContextRef.current = null;

      if (audioContext && "state" in audioContext && audioContext.state !== "closed") {
        const closeResult = audioContext.close?.();
        if (closeResult) {
          void closeResult.catch(() => {
            // Ignore close failures during unmount.
          });
        }
      }
    };
  }, [enabled]);

  const playNotificationSound = useCallback(() => {
    if (!enabled) return;

    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    const now = Date.now();
    if (now - lastPlayedRef.current < 500) return;

    lastPlayedRef.current = now;

    try {
      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }

      scheduleNotificationTone(audioContext);
    } catch (error) {
      console.log("Could not play notification sound:", error);
    }
  }, [enabled]);

  const shouldPlaySound = useCallback(
    (senderId: string) => {
      return enabled && userId && senderId !== userId;
    },
    [enabled, userId]
  );

  return {
    playNotificationSound,
    shouldPlaySound,
  };
};
