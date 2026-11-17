import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { bootstrapSession } from "../api/client";
import { loadSessionData, saveSessionData, type SessionData } from "../api/sessionStore";
import SkillGroup from "../components/SkillGroup";
import { groupSkills } from "../utils/skillGroups";
import { Header } from "../components/Header";
import { ArrowRight, ArrowLeft, Loader2 } from "lucide-react";

export default function SkillGapPage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const data = useMemo(() => loadSessionData(sessionId), [sessionId]);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col bg-gray-50">
        <Header />
        <main className="mx-auto w-full max-w-md flex-1 px-6 py-20">
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <h1 className="text-lg font-semibold text-gray-900">Session not found</h1>
            <p className="mt-2 text-sm text-gray-600">
              We couldn't find the skill-gap report for this session in this browser tab.
            </p>
            <Link
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              to="/"
            >
              <ArrowLeft className="h-4 w-4" /> Back to upload
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const report = data.skill_gap_report;
  const groups = groupSkills(report);
  const matchPct = Math.round(report.overall_match_score * 100);

  async function handleStartInterview() {
    if (!data) return;
    setIsStarting(true);
    setStartError(null);
    try {
      const { session_id } = await bootstrapSession({
        skill_gap_report: data.skill_gap_report,
        resume_text: data.resume_text ?? "",
        job_description_text: data.job_description_text ?? "",
      });

      const sessionPayload: SessionData = {
        skill_gap_report: data.skill_gap_report,
        resume_text: data.resume_text,
        job_description_text: data.job_description_text,
      };
      saveSessionData(sessionPayload);
      try {
        sessionStorage.setItem(`hiremind:session:${session_id}`, JSON.stringify(sessionPayload));
      } catch { /* ignore */ }
      navigate(`/session/${session_id}/interview`);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Failed to start interview. Please try again.");
      setIsStarting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 pb-24">
      <Header subtitle="Skill gap analysis" />

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-6 py-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" /> Change resume / job description
          </Link>
          <span className="text-sm text-gray-500">
            Report ID: {report.report_id.slice(0, 8)}...
          </span>
        </div>

        {/* Summary */}
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <h1 className="text-xl font-semibold text-gray-900">Skill match analysis</h1>
              <p className="mt-2 text-sm leading-relaxed text-gray-600">
                We compared your resume against the requirements of the target
                position. Gaps are prioritized to shape your personalized
                5-question technical interview.
              </p>
            </div>

            <div className="w-full rounded-md border border-gray-200 bg-gray-50 p-4 md:w-64">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Overall role match
              </p>
              <p className="mt-1 text-3xl font-semibold text-gray-900">{matchPct}%</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full bg-blue-600 transition-all duration-700"
                  style={{ width: `${matchPct}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-gray-500">
                {groups.matched.length} matched · {groups.partial.length} partial · {groups.missing.length} gaps
              </p>
            </div>
          </div>
        </section>

        {/* Skill groups */}
        <div className="space-y-6">
          <SkillGroup
            title="Matched strengths"
            description="Skills where your resume meets or exceeds the role requirements."
            tone="matched"
            skills={groups.matched}
          />
          <SkillGroup
            title="Partial proficiencies"
            description="Skills on your resume at a lower level than requested. The interview will probe depth."
            tone="partial"
            skills={groups.partial}
          />
          <SkillGroup
            title="Skill gaps"
            description="Requirements with no direct evidence on your resume. Interview questions will focus on these."
            tone="missing"
            skills={groups.missing}
          />
        </div>
      </main>

      {/* Bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Ready to begin?</p>
            <p className="text-sm text-gray-500">
              The interview has 5 questions, targeting your {groups.partial.length + groups.missing.length} skill gaps.
            </p>
            {startError && (
              <p className="mt-1 text-sm font-medium text-red-600">{startError}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleStartInterview}
            disabled={isStarting}
            className="inline-flex shrink-0 items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isStarting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Preparing interview…</span>
              </>
            ) : (
              <>
                <span>Start interview</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
