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
    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex h-screen flex-col bg-gray-50 text-gray-900">
      {/* ---------------- Header: navigation, voice controls, status ---------------- */}
      <header className="z-10 border-b border-gray-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              to={`/session/${sessionId}/skill-gap`}
              className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" /> Skill gap
            </Link>
            <span className="h-5 w-px bg-gray-200" />
            <h1 className="text-sm font-semibold text-gray-900">Technical interview</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={replayQuestion}
              disabled={turnNumber === 0}
              title="Replay audio"
              className={`${controlButton} border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">Replay</span>
            </button>

            <button
              type="button"
              onClick={toggleMute}
              className={`${controlButton} ${
                isMuted
                  ? "border-gray-300 bg-gray-50 text-gray-500 hover:bg-gray-100"
                  : isSpeaking
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              <span className="hidden sm:inline">
                {isMuted ? "Muted" : isSpeaking ? "Speaking…" : "Voice on"}
              </span>
            </button>

            <span className="mx-1 h-5 w-px bg-gray-200" />

            <div className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionStatus === "connected"
                    ? "bg-green-500"
                    : connectionStatus === "reconnecting" || connectionStatus === "connecting"
                    ? "animate-pulse bg-amber-500"
                    : "bg-red-500"
                }`}
              />
              <span className="text-sm capitalize text-gray-600">{connectionStatus}</span>
              {connectionStatus === "disconnected" && !isEvaluationFailed && (
                <button
                  type="button"
                  onClick={reconnect}
                  className="ml-1 rounded-md border border-blue-600 px-2 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
                >
                  Reconnect
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="mx-auto mt-3 max-w-5xl">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {turnNumber > 0
                ? `Question ${turnNumber} of ${totalQuestions || 5}`
                : "Preparing questions…"}
            </span>
            <span>{progressPercent}% complete</span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full bg-blue-600 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className={`border-b px-6 py-3 text-center text-sm ${
            isEvaluationFailed
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-red-200 bg-red-50 text-red-700"
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
                  <span className="inline-block rounded-md bg-gray-200/70 px-3 py-1 text-xs text-gray-600">
                    {msg.text}
                  </span>
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
                  <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-blue-600 text-white">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-lg px-4 py-3 sm:max-w-[75%] ${
                    isInterviewer
                      ? "border border-gray-200 bg-white text-gray-900"
                      : "bg-blue-600 text-white"
                  }`}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span
                      className={`text-xs font-semibold ${
                        isInterviewer ? "text-gray-500" : "text-blue-100"
                      }`}
                    >
                      {isInterviewer ? "Interviewer" : "You"}
                    </span>
                    {msg.turnNumber && (
                      <span
                        className={`text-xs ${
                          isInterviewer ? "text-gray-400" : "text-blue-200"
                        }`}
                      >
                        Turn {msg.turnNumber} of 5
                      </span>
                    )}
                  </div>

                  {isInterviewer && msg.question?.target_skill && (
                    <div className="mb-2">
                      <span className="inline-block rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Skill: {msg.question.target_skill}
                      </span>
                    </div>
                  )}

                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {msg.text}
                  </div>

                  {isInterviewer && msg.question && (
                    <div className="mt-3 flex items-center justify-end border-t border-gray-100 pt-2">
                      <button
                        type="button"
                        onClick={() => speak(msg.question!.question_text)}
                        title="Replay this question"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                        <span>Replay audio</span>
                      </button>
                    </div>
                  )}

                  {!isInterviewer && msg.evaluation && (
                    <div className="mt-3 space-y-1.5 rounded-md border border-white/20 bg-white/10 p-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-white">
                        <span>Score: {msg.evaluation.overall_score}/10</span>
                        {msg.routingHint && (
                          <span className="font-normal capitalize text-blue-100">
                            Next: {msg.routingHint.replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                      {msg.evaluation.summary_feedback && (
                        <p className="text-xs leading-relaxed text-blue-50">
                          {msg.evaluation.summary_feedback}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {!isInterviewer && (
                  <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-gray-200 text-gray-600">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Waiting indicator */}
          {isWaitingForQuestion && connectionStatus === "connected" && (
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full bg-blue-600 text-white">
                <Bot className="h-4 w-4" />
              </div>
              <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
                  <span className="ml-2 text-sm text-gray-500">
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
        <div className="border-t border-green-200 bg-green-50 px-6 py-4 text-center">
          <p className="text-sm font-semibold text-green-800">Interview complete</p>
          <p className="mt-0.5 text-sm text-gray-600">
            All five answers have been evaluated. Review your evaluations before generating your report.
          </p>
          <button
            type="button"
            onClick={() => navigate(`/session/${sessionId}/report`)}
            className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
          >
            Generate report
          </button>
        </div>
      )}

      {/* ---------------- Answer input ---------------- */}
      {!isInterviewComplete && (
        <footer className="border-t border-gray-200 bg-white p-4">
          <div className="mx-auto max-w-3xl">
            {voiceError && (
              <div
                role="alert"
                className="mb-3 flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {voiceError}
                </span>
                <button
                  type="button"
                  onClick={() => setVoiceError(null)}
                  className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-900"
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
                  className="block w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:bg-gray-50 disabled:text-gray-400"
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
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>Send</span>
                <Send className="h-4 w-4" />
              </button>
            </form>

            <p className="mt-2 text-center text-xs text-gray-500">
              Use the microphone or type your answer. Press Enter to send, Shift+Enter for a new line.
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}
