import { useCallback, useEffect, useRef, useState } from "react";

export interface MicButtonProps {
  onRecordingComplete: (audioBlob: Blob) => void | Promise<void>;
  onRecordingStart?: () => void;
  disabled?: boolean;
  onError?: (errorMessage: string) => void;
  className?: string;
}

export function MicButton({
  onRecordingComplete,
  onRecordingStart,
  disabled = false,
  onError,
  className = "",
}: MicButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);

  const clearTimer = useCallback(() => {
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      clearTimer();
      cleanupStream();
    };
  }, [clearTimer, cleanupStream]);

  const startRecording = async () => {
    // 1. Check browser support
    if (
      typeof window === "undefined" ||
      !navigator?.mediaDevices?.getUserMedia ||
      typeof window.MediaRecorder === "undefined"
    ) {
      onError?.(
        "Voice recording is not supported in this browser. Please use the text input.",
      );
      return;
    }

    try {
      // 2. Request microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      // 3. Determine best supported mimeType
      let mimeType = "audio/webm";
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/webm";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
        mimeType = "audio/ogg;codecs=opus";
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        clearTimer();
        cleanupStream();
        setIsRecording(false);

        const durationSec = (Date.now() - startTimeRef.current) / 1000;
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || mimeType,
        });

        // 4. Validate non-empty recording
        if (audioBlob.size === 0 || durationSec < 0.6) {
          onError?.(
            "Recording was too short or empty. Please speak clearly and try again.",
          );
          return;
        }

        try {
          setIsProcessing(true);
          await onRecordingComplete(audioBlob);
        } catch (err) {
          onError?.(
            err instanceof Error
              ? err.message
              : "Failed to process audio recording.",
          );
        } finally {
          setIsProcessing(false);
        }
      };

      // 5. Start recording and elapsed timer
      onRecordingStart?.();
      startTimeRef.current = Date.now();
      audioChunksRef.current = [];
      recorder.start(250); // Slice data every 250ms
      setIsRecording(true);
      setElapsedSeconds(0);

      timerIntervalRef.current = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      clearTimer();
      cleanupStream();
      setIsRecording(false);

      if (err instanceof DOMException) {
        if (
          err.name === "NotAllowedError" ||
          err.name === "PermissionDeniedError"
        ) {
          onError?.(
            "Microphone permission was denied. Please allow microphone access in your browser or type your answer.",
          );
          return;
        }
        if (
          err.name === "NotFoundError" ||
          err.name === "DevicesNotFoundError"
        ) {
          onError?.(
            "No microphone detected on your device. Please connect a microphone or use the text input.",
          );
          return;
        }
      }

      onError?.(
        err instanceof Error
          ? `Microphone error: ${err.message}`
          : "Could not access microphone. Please type your answer.",
      );
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
  };

  const handleClick = () => {
    if (disabled || isProcessing) return;
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className={`relative inline-flex items-center gap-2 ${className}`}>
      {/* Live recording indicator and elapsed time */}
      {isRecording && (
        <div className="flex items-center gap-1.5 rounded-full border border-rose-400/25 bg-rose-400/10 px-2.5 py-1 text-xs font-medium text-rose-300">
          <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
          <span>Recording {formatTime(elapsedSeconds)}</span>
        </div>
      )}

      {/* Processing indicator */}
      {isProcessing && (
        <div className="flex items-center gap-1.5 rounded-full border border-violet-400/25 bg-violet-400/10 px-2.5 py-1 text-xs font-medium text-violet-200">
          <span className="h-2 w-2 animate-pulse rounded-full bg-violet-300" />
          <span>Transcribing…</span>
        </div>
      )}

      {/* Mic Action Button */}
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || isProcessing}
        title={
          isRecording
            ? "Click to stop recording"
            : disabled
            ? "Voice input disabled"
            : "Click to record voice answer"
        }
        aria-label={
          isRecording
            ? "Stop recording answer"
            : "Start recording voice answer"
        }
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors ${
          isRecording
            ? "border-rose-400 bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.5)] hover:bg-rose-600"
            : isProcessing
            ? "border-violet-400/40 bg-violet-400/10 text-violet-300 cursor-wait"
            : disabled
            ? "border-white/10 bg-white/[0.02] text-zinc-600 cursor-not-allowed"
            : "border-white/15 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
        }`}
      >
        {isRecording ? (
          // Stop recording icon (Square)
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 fill-current"
            viewBox="0 0 24 24"
          >
            <rect x="4" y="4" width="16" height="16" rx="2" />
          </svg>
        ) : isProcessing ? (
          // Processing spinner icon
          <svg
            className="h-5 w-5 animate-spin text-violet-300"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
        ) : (
          // Microphone icon
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3z"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
export default MicButton;

