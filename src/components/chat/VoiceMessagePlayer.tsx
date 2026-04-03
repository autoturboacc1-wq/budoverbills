import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSignedUrl } from "@/hooks/useSignedUrl";

interface VoiceMessagePlayerProps {
  voicePath: string;
  duration: number;
  isSender: boolean;
}

export function VoiceMessagePlayer({
  voicePath,
  duration,
  isSender,
}: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const { signedUrl, isLoading, error } = useSignedUrl("chat-attachments", voicePath, 3600);

  useEffect(() => {
    const audioElement = audioRef.current;

    return () => {
      if (!audioElement) return;

      audioElement.pause();
      audioElement.removeAttribute("src");
      audioElement.load();
    };
  }, []);

  const progress = useMemo(() => {
    if (duration <= 0) return 0;
    return Math.min((currentTime / duration) * 100, 100);
  }, [currentTime, duration]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const togglePlay = async () => {
    if (!audioRef.current || !signedUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    try {
      await audioRef.current.play();
      setIsPlaying(true);
    } catch (playError) {
      setIsPlaying(false);
      console.error("Error playing voice message:", playError);
    }
  };

  if (error) {
    return (
      <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        ไม่สามารถโหลด voice note ได้
      </div>
    );
  }

  return (
    <div
      className={`min-w-[180px] max-w-[260px] rounded-2xl px-3 py-2 ${
        isSender
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-foreground"
      }`}
    >
      {signedUrl ? (
        <audio
          ref={audioRef}
          src={signedUrl}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        />
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          className={isSender ? "hover:bg-primary-foreground/10" : undefined}
          disabled={isLoading || !signedUrl}
          onClick={() => {
            void togglePlay();
          }}
          size="icon"
          type="button"
          variant="ghost"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <div className="flex-1">
          <div className="h-1 rounded-full bg-current/15">
            <div
              className="h-full rounded-full bg-current/60 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] opacity-80">
            <span>{isPlaying ? formatTime(currentTime) : formatTime(duration)}</span>
            <span>voice</span>
          </div>
        </div>
      </div>
    </div>
  );
}
