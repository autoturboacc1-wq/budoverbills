import { useEffect, useRef, useCallback } from "react";

// Create a simple notification sound using Web Audio API
const createNotificationSound = () => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  
  return () => {
    // Resume audio context if suspended (mobile browsers)
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    // Create oscillator for the beep sound
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Configure the sound - pleasant notification tone
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5 note
    oscillator.type = "sine";

    // Fade in and out for smooth sound
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.15);

    // Play a second higher note for a two-tone notification
    const oscillator2 = audioContext.createOscillator();
    const gainNode2 = audioContext.createGain();

    oscillator2.connect(gainNode2);
    gainNode2.connect(audioContext.destination);

    oscillator2.frequency.setValueAtTime(1100, audioContext.currentTime + 0.12); // C#6 note
    oscillator2.type = "sine";

    gainNode2.gain.setValueAtTime(0, audioContext.currentTime + 0.12);
    gainNode2.gain.linearRampToValueAtTime(0.25, audioContext.currentTime + 0.17);
    gainNode2.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.3);

    // Start and stop oscillators
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);

    oscillator2.start(audioContext.currentTime + 0.12);
    oscillator2.stop(audioContext.currentTime + 0.35);
  };
};

interface UseChatNotificationSoundOptions {
  enabled?: boolean;
  userId?: string;
}

export const useChatNotificationSound = (options: UseChatNotificationSoundOptions = {}) => {
  const { enabled = true, userId } = options;
  const playSoundRef = useRef<(() => void) | null>(null);
  const lastPlayedRef = useRef<number>(0);

  // Initialize sound function on mount
  useEffect(() => {
    if (typeof window !== "undefined" && enabled) {
      playSoundRef.current = createNotificationSound();
    }
  }, [enabled]);

  // Play notification sound with debounce
  const playNotificationSound = useCallback(() => {
    if (!enabled || !playSoundRef.current) return;

    const now = Date.now();
    // Debounce: don't play if last played within 500ms
    if (now - lastPlayedRef.current < 500) return;

    lastPlayedRef.current = now;
    
    try {
      playSoundRef.current();
    } catch (error) {
      console.log("Could not play notification sound:", error);
    }
  }, [enabled]);

  // Function to check if should play sound for a message
  const shouldPlaySound = useCallback(
    (senderId: string) => {
      // Only play sound for messages from others
      return enabled && userId && senderId !== userId;
    },
    [enabled, userId]
  );

  return {
    playNotificationSound,
    shouldPlaySound,
  };
};
