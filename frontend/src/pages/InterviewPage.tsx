import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { loadSessionData } from "../api/sessionStore";
import { MicButton } from "../components/MicButton";
import { useInterviewSocket } from "../hooks/useInterviewSocket";
import { useSpeech } from "../hooks/useSpeech";
import {
  Volume2,
  VolumeX,
  RotateCcw,
  Send,
  Bot,
  User,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";

export default function InterviewPage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const sessionData = loadSessionData(sessionId);
  const totalQuestionsConfig =
    sessionData?.session?.question_set?.questions?.length ?? 5;

  const [inputAnswer, setInputAnswer] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const {
    speak,
    stop: stopSpeech,
    replay: replayQuestion,
    isSpeaking,
    isMuted,
    toggleMute,
  } = useSpeech();

  const {
    messages,
    connectionStatus,
    isInterviewComplete,
    isEvaluationFailed,
    turnNumber,
    totalQuestions,
    isWaitingForQuestion,
    error,
    sendAnswer,
    sendAudioAnswer,
    reconnect,
  } = useInterviewSocket(sessionId, {
    initialTotalQuestions: totalQuestionsConfig,
    onQuestion: (question) => {
      speak(question.question_text);
    },
    onComplete: () => {
      stopSpeech();
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isWaitingForQuestion]);

  useEffect(() => {
    if (!isWaitingForQuestion && connectionStatus === "connected") {
      textareaRef.current?.focus();
    }
  }, [isWaitingForQuestion, connectionStatus]);

  function handleSend(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!inputAnswer.trim() || isWaitingForQuestion || isEvaluationFailed) return;
    stopSpeech();
    sendAnswer(inputAnswer);
    setInputAnswer("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const progressPercent = Math.min(
    100,
    Math.round(((turnNumber > 0 ? turnNumber : 1) / (totalQuestions || 5)) * 100),
  );

  const controlButton =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex h-screen flex-col text-zinc-100">
      {/* ---------------- Header: navigation, voice controls, status ---------------- */}
      <header className="z-10 border-b border-white/10 bg-[#05060b]/60 px-6 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              to={`/session/${sessionId}/skill-gap`}
              className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" /> Skill gap
            </Link>
            <span className="h-5 w-px bg-white/10" />
            <h1 className="font-display text-sm font-semibold text-white">
              Technical interview
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={replayQuestion}
              disabled={turnNumber === 0}
              title="Replay audio"
              className={`${controlButton} border-white/15 bg-white/5 text-zinc-300 hover:bg-white/10`}
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Replay</span>
            </button>

            <button
              type="button"
              onClick={toggleMute}
              className={`${controlButton} ${
                isMuted
                  ? "border-white/10 bg-transparent text-zinc-500 hover:bg-white/5"
                  : isSpeaking
                  ? "border-violet-400/40 bg-violet-400/10 text-violet-200"
                  : "border-white/15 bg-white/5 text-zinc-300 hover:bg-white/10"
              }`}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              <span className="hidden sm:inline">
                {isMuted ? "Muted" : isSpeaking ? "Speaking…" : "Voice on"}
              </span>
            </button>

            <span className="mx-1 h-5 w-px bg-white/10" />

            <div className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionStatus === "connected"
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                    : connectionStatus === "reconnecting" || connectionStatus === "connecting"
                    ? "animate-pulse bg-amber-400"
                    : "bg-rose-500"
                }`}
              />
              <span className="text-sm capitalize text-zinc-400">{connectionStatus}</span>
              {connectionStatus === "disconnected" && !isEvaluationFailed && (
                <button
                  type="button"
                  onClick={reconnect}
                  className="ml-1 rounded-full border border-violet-400/50 px-2.5 py-0.5 text-xs font-medium text-violet-200 hover:bg-violet-400/10"
                >
                  Reconnect
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="mx-auto mt-3 max-w-5xl">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>
              {turnNumber > 0
                ? `Question ${turnNumber} of ${totalQuestions || 5}`
                : "Preparing questions…"}
            </span>
            <span>{progressPercent}% complete</span>
          </div>
          <div className="bar-track mt-1.5 h-1 w-full">
            <div
              className="bar-fill transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className={`border-b px-6 py-3 text-center text-sm backdrop-blur-md ${
            isEvaluationFailed
              ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
              : "border-rose-400/25 bg-rose-400/10 text-rose-200"
          }`}
        >
          {isEvaluationFailed && (
            <p className="mb-0.5 font-semibold">Interview paused — technical issue</p>
          )}
          <p>{error}</p>
        </div>
      )}

      {/* ---------------- Conversation ---------------- */}
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {messages.map((msg) => {
            if (msg.sender === "system") {
              return (
                <div key={msg.id} className="text-center">
                  <span className="chip text-zinc-400">{msg.text}</span>
                </div>
              );
            }

            const isInterviewer = msg.sender === "interviewer";

            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isInterviewer ? "justify-start" : "justify-end"}`}
              >
                {isInterviewer && (
                  <div className="orb flex h-8 w-8 shrink-0 select-none items-center justify-center text-white">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 sm:max-w-[75%] ${
                    isInterviewer
                      ? "glass rounded-tl-md text-zinc-100"
                      : "bubble-user rounded-tr-md"
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span
                      className={`text-xs font-semibold ${
                        isInterviewer ? "text-zinc-400" : "text-white/80"
                      }`}
                    >
                      {isInterviewer ? "Interviewer" : "You"}
                    </span>
                    {msg.turnNumber && (
                      <span
                        className={`text-xs ${
                          isInterviewer ? "text-zinc-500" : "text-white/60"
                        }`}
                      >
                        Turn {msg.turnNumber} of 5
                      </span>
                    )}
                  </div>

                  {isInterviewer && msg.question?.target_skill && (
                    <div className="mb-2">
                      <span className="inline-block rounded-full border border-violet-400/25 bg-violet-400/10 px-2.5 py-0.5 text-xs font-medium text-violet-200">
                        Skill: {msg.question.target_skill}
                      </span>
                    </div>
                  )}

                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {msg.text}
                  </div>

                  {isInterviewer && msg.question && (
                    <div className="mt-3 flex items-center justify-end border-t border-white/10 pt-2">
                      <button
                        type="button"
                        onClick={() => speak(msg.question!.question_text)}
                        title="Replay this question"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-300 hover:text-violet-200"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                        <span>Replay audio</span>
                      </button>
                    </div>
                  )}

                  {!isInterviewer && msg.evaluation && (
                    <div className="mt-3 space-y-1.5 rounded-xl border border-white/20 bg-black/20 p-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-white">
                        <span>Score: {msg.evaluation.overall_score}/10</span>
                        {msg.routingHint && (
                          <span className="font-normal capitalize text-white/70">
                            Next: {msg.routingHint.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                      {msg.evaluation.summary_feedback && (
                        <p className="text-xs leading-relaxed text-white/85">
                          {msg.evaluation.summary_feedback}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {!isInterviewer && (
                  <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full border border-white/15 bg-white/10 text-zinc-300">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Waiting indicator */}
          {isWaitingForQuestion && connectionStatus === "connected" && (
            <div className="flex items-center gap-3">
              <div className="orb flex h-8 w-8 shrink-0 select-none items-center justify-center text-white">
                <Bot className="h-4 w-4" />
              </div>
              <div className="glass rounded-tl-md px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-300 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-300 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-300" />
                  <span className="ml-2 text-sm text-zinc-400">
                    {turnNumber === 0
                      ? "Generating interview questions…"
                      : "Evaluating your answer…"}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* ---------------- Completion banner ---------------- */}
      {isInterviewComplete && (
        <div className="border-t border-emerald-400/25 bg-emerald-400/10 px-6 py-4 text-center backdrop-blur-xl">
          <p className="font-display text-sm font-semibold text-emerald-300">
            Interview complete
          </p>
          <p className="mt-0.5 text-sm text-zinc-300">
            All five answers have been evaluated. Review your evaluations before generating your report.
          </p>
          <button
            type="button"
            onClick={() => navigate(`/session/${sessionId}/report`)}
            className="btn btn-primary mt-3"
          >
            Generate report
          </button>
        </div>
      )}

      {/* ---------------- Answer input ---------------- */}
      {!isInterviewComplete && (
        <footer className="border-t border-white/10 bg-[#05060b]/70 p-4 backdrop-blur-xl">
          <div className="mx-auto max-w-3xl">
            {voiceError && (
              <div
                role="alert"
                className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-sm text-amber-200"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {voiceError}
                </span>
                <button
                  type="button"
                  onClick={() => setVoiceError(null)}
                  className="shrink-0 text-xs font-medium text-amber-300 hover:text-amber-100"
                >
                  Dismiss
                </button>
              </div>
            )}

            <form onSubmit={handleSend} className="flex items-end gap-2.5">
              <MicButton
                disabled={
                  isWaitingForQuestion ||
                  connectionStatus !== "connected" ||
                  isEvaluationFailed
                }
                onRecordingStart={stopSpeech}
                onRecordingComplete={async (audioBlob) => {
                  setVoiceError(null);
                  await sendAudioAnswer(audioBlob);
                }}
                onError={(msg) => setVoiceError(msg)}
              />

              <div className="relative flex-1">
                <textarea
                  ref={textareaRef}
                  rows={2}
                  value={inputAnswer}
                  onChange={(e) => setInputAnswer(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={
                    isWaitingForQuestion ||
                    connectionStatus !== "connected" ||
                    isEvaluationFailed
                  }
                  placeholder={
                    connectionStatus !== "connected"
                      ? "Connecting to interview session…"
                      : isWaitingForQuestion
                      ? "Please wait…"
                      : "Type your answer here"
                  }
                  className="field block resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={
                  !inputAnswer.trim() ||
                  isWaitingForQuestion ||
                  connectionStatus !== "connected" ||
                  isEvaluationFailed
                }
                className="btn btn-primary h-11"
              >
                <span>Send</span>
                <Send className="h-4 w-4" />
              </button>
            </form>

            <p className="mt-2 text-center text-xs text-zinc-500">
              Use the microphone or type your answer. Press Enter to send, Shift+Enter for a new line.
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}
