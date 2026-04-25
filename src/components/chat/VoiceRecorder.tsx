import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Send, Square, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { uploadToPrivateBucket } from "@/hooks/useSignedUrl";
import { toast } from "sonner";

interface VoiceRecorderProps {
  ownerId: string;
  chatId: string;
  onVoiceReady: (voicePath: string, duration: number) => Promise<void> | void;
  onCancel: () => void;
}

const MAX_DURATION_SECONDS = 120;

export function VoiceRecorder({
  ownerId,
  chatId,
  onVoiceReady,
  onCancel,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const stopRecordingRef = useRef<() => void>(() => {});
  const mountedRef = useRef(true);
  const previewUrlRef = useRef<string | null>(null);
  const discardRecordingRef = useRef(false);

  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;

      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }

      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.ondataavailable = null;
          recorder.onstop = null;
          recorder.stop();
        } catch {
          // Ignore recorder stop failures during teardown.
        }
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;

      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, []);

  const resetDraft = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    discardRecordingRef.current = true;

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Ignore if the recorder is already stopping.
      }
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    if (mountedRef.current) {
      setIsRecording(false);
      setDuration(0);
      setAudioBlob(null);
    }

    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      if (mountedRef.current) {
        setPreviewUrl(null);
      }
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (!isRecording) return;

    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    mediaRecorderRef.current?.stop();
  }, [isRecording]);

  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  const startRecording = async () => {
    if (isRecording || audioBlob) return;

    try {
      discardRecordingRef.current = false;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });

      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      setDuration(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);

        if (discardRecordingRef.current || !mountedRef.current) {
          discardRecordingRef.current = false;
          chunksRef.current = [];
          return;
        }

        if (chunksRef.current.length === 0) {
          return;
        }

        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);

        setAudioBlob(blob);
        setPreviewUrl(url);
        previewUrlRef.current = url;
      };

      recorder.start(250);
      setIsRecording(true);

      timerRef.current = window.setInterval(() => {
        setDuration((currentDuration) => {
          if (currentDuration >= MAX_DURATION_SECONDS) {
            stopRecordingRef.current();
            return currentDuration;
          }

          return currentDuration + 1;
        });
      }, 1000);
    } catch (error) {
      console.error("Error starting voice recording:", error);
      toast.error("ไม่สามารถเข้าถึงไมโครโฟนได้");
    }
  };

  const handleCancel = () => {
    resetDraft();
    onCancel();
  };

  const handleUpload = async () => {
    if (!audioBlob || isUploading) return;

    setIsUploading(true);

    try {
      const extension = audioBlob.type.includes("ogg") ? "ogg" : "webm";
      const filePath = `${ownerId}/voice/${chatId}-${Date.now()}.${extension}`;
      const file = new File([audioBlob], filePath.split("/").pop() ?? `voice-note.${extension}`, {
        type: audioBlob.type || `audio/${extension}`,
      });

      const result = await uploadToPrivateBucket("chat-attachments", filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if ("error" in result) {
        throw result.error;
      }

      await onVoiceReady(result.path, duration);
      resetDraft();
      onCancel();
    } catch (error) {
      console.error("Error uploading voice note:", error);
      toast.error("อัปโหลดเสียงไม่สำเร็จ");
    } finally {
      setIsUploading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex w-full items-center gap-2 rounded-2xl border border-border bg-muted/40 p-2">
      {audioBlob && previewUrl ? (
        <>
          <audio controls className="h-9 flex-1" src={previewUrl} />
          <span className="min-w-10 text-xs font-medium text-muted-foreground">
            {formatDuration(duration)}
          </span>
          <Button
            disabled={isUploading}
            onClick={handleUpload}
            size="icon"
            type="button"
          >
            <Send className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <>
          <Button
            onClick={isRecording ? stopRecording : startRecording}
            size="icon"
            type="button"
            variant={isRecording ? "destructive" : "outline"}
          >
            {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              {isRecording ? "กำลังบันทึกเสียง..." : "บันทึก voice note"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isRecording
                ? `● ${formatDuration(duration)} / ${formatDuration(MAX_DURATION_SECONDS)}`
                : "กดไมค์เพื่อเริ่ม และกดหยุดเมื่อพร้อมส่ง"}
            </p>
          </div>
          {isRecording ? (
            <MicOff className="h-4 w-4 animate-pulse text-destructive" />
          ) : null}
        </>
      )}
      <Button onClick={handleCancel} size="icon" type="button" variant="ghost">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
