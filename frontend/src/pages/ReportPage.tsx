import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, finalizeSession, generateReport } from "../api/client";
import { loadSessionData } from "../api/sessionStore";
import type { AnswerEvaluation, FinalReport, ScoreDimension } from "../api/types";
import { Header } from "../components/Header";
import {
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Lightbulb,
  Loader2,
} from "lucide-react";

export default function ReportPage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [report, setReport] = useState<FinalReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Interactive checklist state for the study plan
  const [completedStudyItems, setCompletedStudyItems] = useState<Set<number>>(
    new Set(),
  );

  // Expanded turns toggle state
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(
    new Set([1]), // first turn expanded by default
  );

  useEffect(() => {
    let isMounted = true;

    async function fetchReport() {
      if (!sessionId) {
        setError("Missing session ID.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const data = await finalizeSession(sessionId);
        if (isMounted) {
          setReport(data);
          setLoading(false);
        }
      } catch (err) {
        const sessionData = loadSessionData(sessionId);
        if (sessionData?.session && sessionData.skill_gap_report) {
          try {
            const fallbackData = await generateReport({
              session_id: sessionId,
              candidate_id: sessionData.session.candidate_id,
              job_id: sessionData.session.job_id,
              turns: sessionData.session.turns,
              skill_gap_report: sessionData.skill_gap_report,
              total_session_duration_seconds: 900,
            });
            if (isMounted) {
              setReport(fallbackData);
              setLoading(false);
            }
            return;
          } catch {
            // Keep original error below
          }
        }

        if (isMounted) {
          const message =
            err instanceof ApiError
              ? err.message
              : "Unable to generate interview report. Check that the backend is running.";
          setError(message);
          setLoading(false);
        }
      }
    }

    fetchReport();

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  function toggleTurn(turnNum: number) {
    setExpandedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(turnNum)) {
        next.delete(turnNum);
      } else {
        next.add(turnNum);
      }
      return next;
    });
  }

  function toggleStudyItem(index: number) {
    setCompletedStudyItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-gray-50">
        <Header subtitle="Generating report" />
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
            <h2 className="mt-4 text-base font-semibold text-gray-900">
              Generating your report
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              This usually takes a few moments. We are scoring your answers and
              putting together your study plan.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex min-h-screen flex-col bg-gray-50">
        <Header />
        <main className="mx-auto flex w-full max-w-md flex-1 items-center px-6 py-10">
          <div
            role="alert"
            className="w-full rounded-lg border border-gray-200 bg-white p-8 text-center"
          >
            <AlertTriangle className="mx-auto h-8 w-8 text-red-600" />
            <h2 className="mt-3 text-base font-semibold text-gray-900">
              Unable to generate report
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {error || "Could not retrieve the evaluation report for this interview session."}
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Try again
              </button>
              <Link
                to="/"
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back to start
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const readinessColor =
    report.readiness_level === "ready"
      ? "border-green-200 bg-green-50 text-green-700"
      : report.readiness_level === "needs_work"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-red-200 bg-red-50 text-red-700";

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <Header subtitle="Interview report" />

      <main className="mx-auto mt-8 max-w-5xl space-y-6 px-6">
        {/* Page title */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              Interview report
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Session {sessionId.slice(0, 8)}... · Completed on{" "}
              {new Date(report.generated_at).toLocaleDateString()}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="self-start rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Practice another role
          </button>
        </div>

        {/* ---------------- 1. Summary & overall score ---------------- */}
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="md:max-w-xl">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-md border px-2 py-0.5 text-xs font-medium capitalize ${readinessColor}`}
                >
                  {report.readiness_level.replace(/_/g, " ")}
                </span>
                {report.percentile_estimate !== null && (
                  <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700">
                    Top {100 - report.percentile_estimate}%
                  </span>
                )}
              </div>
              <h2 className="mt-3 text-base font-semibold text-gray-900">Summary</h2>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">
                {report.executive_summary}
              </p>
            </div>

            <div className="w-full rounded-md border border-gray-200 bg-gray-50 p-4 text-center md:w-56">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Overall score
              </p>
              <p className="mt-1 text-4xl font-semibold text-gray-900">
                {report.overall_score.toFixed(1)}
                <span className="text-lg font-normal text-gray-400">/10</span>
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Based on {report.total_turns} questions
              </p>
            </div>
          </div>

          {/* Dimension averages */}
          <div className="mt-6 border-t border-gray-200 pt-5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Score by dimension
            </h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {(
                Object.entries(report.dimension_averages) as [
                  ScoreDimension,
                  number,
                ][]
              ).map(([dim, score]) => (
                <div
                  key={dim}
                  className="rounded-md border border-gray-200 bg-white p-3"
                >
                  <p className="text-xs capitalize text-gray-500">{dim}</p>
                  <p className="mt-0.5 text-lg font-semibold text-gray-900">
                    {score.toFixed(1)}
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full bg-blue-600"
                      style={{ width: `${(score / 10) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------- 2. Strengths & areas to improve ---------------- */}
        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <h2 className="text-sm font-semibold text-gray-900">Strengths</h2>
            </div>
            <ul className="mt-4 space-y-2.5">
              {report.top_strengths.map((str, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 text-sm leading-relaxed text-gray-600"
                >
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                  <span>{str}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h2 className="text-sm font-semibold text-gray-900">Areas to improve</h2>
            </div>
            <ul className="mt-4 space-y-2.5">
              {report.priority_gaps.map((gap, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 text-sm leading-relaxed text-gray-600"
                >
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span>{gap}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------------- 3. Skill progression ---------------- */}
        {report.skill_progressions.length > 0 && (
          <section className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-sm font-semibold text-gray-900">Skill progression</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                Your resume claims compared with the level you demonstrated in the interview.
              </p>
            </div>

            <ul className="divide-y divide-gray-100">
              {report.skill_progressions.map((prog) => {
                const isImproved = prog.progression_delta > 0;
                return (
                  <li
                    key={prog.skill_name}
                    className="flex flex-col gap-2 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <span className="text-sm font-medium capitalize text-gray-900">
                        {prog.skill_name.replace(/_/g, " ")}
                      </span>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Probed in questions: {prog.evidence_turns.join(", ")}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 text-sm">
                      <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 capitalize text-gray-700">
                        Initial: {prog.initial_gap}
                      </span>
                      <span className="text-gray-400">→</span>
                      <span
                        className={`rounded-md border px-2 py-0.5 font-medium capitalize ${
                          isImproved
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-blue-200 bg-blue-50 text-blue-700"
                        }`}
                      >
                        Inferred: {prog.final_inferred_level}
                      </span>
                      {prog.progression_delta !== 0 && (
                        <span
                          className={`text-sm font-semibold ${
                            isImproved ? "text-green-600" : "text-amber-600"
                          }`}
                        >
                          {prog.progression_delta > 0
                            ? `+${prog.progression_delta}`
                            : prog.progression_delta}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* ---------------- 4. Per-question breakdown ---------------- */}
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Question-by-question review</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Scoring, feedback and an example answer for each question.
            </p>
          </div>

          <div className="divide-y divide-gray-200">
            {report.per_turn_evaluations.map((evalItem: AnswerEvaluation) => {
              const isExpanded = expandedTurns.has(evalItem.turn_number);

              return (
                <div key={evalItem.turn_number}>
                  <button
                    type="button"
                    onClick={() => toggleTurn(evalItem.turn_number)}
                    aria-expanded={isExpanded}
                    className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-gray-50"
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                        {evalItem.turn_number}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        Question {evalItem.turn_number}
                      </span>
                      <span className="text-sm text-gray-600">
                        Score:{" "}
                        <span className="font-semibold text-gray-900">
                          {evalItem.overall_score.toFixed(1)}/10
                        </span>
                      </span>
                      {evalItem.skill_level_inferred && (
                        <span className="hidden rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs capitalize text-gray-600 sm:inline-block">
                          {evalItem.skill_level_inferred}
                        </span>
                      )}
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isExpanded && (
                    <div className="space-y-4 border-t border-gray-100 bg-gray-50/50 px-6 py-5">
                      <div>
                        <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500">
                          Feedback
                        </h4>
                        <p className="mt-1 text-sm leading-relaxed text-gray-700">
                          {evalItem.summary_feedback}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                        {evalItem.dimension_scores.map((ds) => (
                          <div
                            key={ds.dimension}
                            className="rounded-md border border-gray-200 bg-white p-2.5 text-center"
                          >
                            <span className="block text-xs capitalize text-gray-500">
                              {ds.dimension}
                            </span>
                            <span className="text-sm font-semibold text-gray-900">
                              {ds.score.toFixed(1)}
                            </span>
                          </div>
                        ))}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        {evalItem.strengths.length > 0 && (
                          <div className="rounded-md border border-green-200 bg-green-50 p-3">
                            <span className="mb-1 block text-sm font-medium text-green-800">
                              What went well
                            </span>
                            <ul className="list-disc space-y-1 pl-4 text-sm text-gray-700">
                              {evalItem.strengths.map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {evalItem.improvements.length > 0 && (
                          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                            <span className="mb-1 block text-sm font-medium text-amber-800">
                              Suggestions
                            </span>
                            <ul className="list-disc space-y-1 pl-4 text-sm text-gray-700">
                              {evalItem.improvements.map((imp, i) => (
                                <li key={i}>{imp}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {evalItem.model_answer_snippet && (
                        <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
                          <div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-blue-800">
                            <Lightbulb className="h-4 w-4" />
                            <span>Example answer</span>
                          </div>
                          <p className="text-sm leading-relaxed text-gray-700">
                            {evalItem.model_answer_snippet}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ---------------- 5. Study plan ---------------- */}
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Preparation checklist</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                Work through these items to close the gaps before your live interviews.
              </p>
            </div>
            <span className="shrink-0 text-sm text-gray-500">
              {completedStudyItems.size} of {report.study_plan.length} completed
            </span>
          </div>

          <ul className="divide-y divide-gray-100">
            {report.study_plan.map((item, idx) => {
              const isChecked = completedStudyItems.has(idx);

              return (
                <li
                  key={idx}
                  onClick={() => toggleStudyItem(idx)}
                  className="flex cursor-pointer select-none items-start gap-3 px-6 py-3.5 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}}
                    className="mt-0.5 h-4 w-4 cursor-pointer rounded border-gray-300 accent-blue-600"
                  />
                  <span
                    className={`text-sm leading-relaxed ${
                      isChecked ? "text-gray-400 line-through" : "text-gray-700"
                    }`}
                  >
                    {item}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
          >
            Practice another interview
          </button>
        </div>
      </main>
    </div>
  );
}
