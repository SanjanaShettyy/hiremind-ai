import { useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ApiError,
  analyzeSkillGap,
  parseJd,
  parseResume,
} from "../api/client";
import { saveSessionData } from "../api/sessionStore";
import { Header } from "../components/Header";
import {
  FileText,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

const ACCEPTED_FILE = /\.(pdf|docx)$/i;

type LoadingStep =
  | "idle"
  | "parsing_resume"
  | "parsing_jd"
  | "analyzing_gaps";

const STEP_LABELS: Record<LoadingStep, { title: string; desc: string; stepNum: number }> = {
  idle: { title: "", desc: "", stepNum: 0 },
  parsing_resume: {
    title: "Parsing resume",
    desc: "Extracting work history, skills and experience from your resume.",
    stepNum: 1,
  },
  parsing_jd: {
    title: "Analyzing job description",
    desc: "Identifying the role's responsibilities and required skills.",
    stepNum: 2,
  },
  analyzing_gaps: {
    title: "Comparing skills",
    desc: "Matching your resume against the requirements and preparing interview questions.",
    stepNum: 3,
  },
};

const OVERVIEW = [
  {
    title: "Skill gap analysis",
    desc: "Your resume is compared against the job requirements to show exactly where you fall short.",
  },
  {
    title: "Tailored interview",
    desc: "Five technical questions are generated around your gaps. Answer by voice or text.",
  },
  {
    title: "Detailed report",
    desc: "Get scores, feedback on every answer and a personalized study plan.",
  },
];

function toMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof TypeError) {
    return "Couldn't reach the server. Check that the backend is running, that VITE_API_URL is correct, and that CORS allows this origin.";
  }
  return "Something went wrong. Please try again.";
}

export default function UploadPage() {
  const navigate = useNavigate();
  const [resume, setResume] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [step, setStep] = useState<LoadingStep>("idle");
  const [error, setError] = useState<string | null>(null);

  const loading = step !== "idle";
  const canSubmit =
    resume !== null && jobDescription.trim().length > 0 && !loading;

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;

    if (file && !ACCEPTED_FILE.test(file.name)) {
      e.target.value = "";
      setResume(null);
      setError("Only PDF and DOCX resumes are supported.");
      return;
    }

    setError(null);
    setResume(file);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!resume || !canSubmit) return;

    setError(null);

    try {
      // 1. Parse resume
      setStep("parsing_resume");
      const { resume_text, profile } = await parseResume(resume);

      // 2. Parse job description
      setStep("parsing_jd");
      const parsed_jd = await parseJd(jobDescription.trim());

      // 3. Analyze skill gap
      setStep("analyzing_gaps");
      const candidateId = crypto.randomUUID();
      const jobId = crypto.randomUUID();

      const report = await analyzeSkillGap({
        candidate_id: candidateId,
        job_id: jobId,
        resume_text,
        parsed_jd,
        resume_profile: profile,
        candidate_name: profile.name ?? undefined,
      });

      saveSessionData({
        skill_gap_report: report,
        resume_text,
        job_description_text: jobDescription.trim(),
      });

      navigate(`/session/${report.report_id}/skill-gap`);
    } catch (err) {
      setError(toMessage(err));
      setStep("idle");
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-20 pt-14 sm:pt-20">
        {/* Hero */}
        <div className="mx-auto max-w-3xl text-center">
          <span className="chip gap-2 text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
            AI interview preparation
          </span>
          <h1 className="font-display text-gradient mt-6 text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Close your skill gaps before the interview
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-zinc-400">
            Upload your resume, paste the job description, and practice a mock
            technical interview built around the skills you are missing.
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="glass mx-auto mt-12 max-w-4xl overflow-hidden"
        >
          <div className="grid grid-cols-1 gap-6 p-6 sm:p-8 md:grid-cols-2">
            <div>
              <label
                htmlFor="resume"
                className="mb-2 block text-sm font-medium text-zinc-200"
              >
                Resume <span className="font-normal text-zinc-500">(PDF or DOCX)</span>
              </label>

              <div
                className={`relative flex h-48 flex-col items-center justify-center rounded-xl border border-dashed px-4 text-center transition-colors ${
                  resume
                    ? "border-emerald-400/50 bg-emerald-400/5"
                    : "border-white/15 bg-white/[0.02] hover:border-violet-400/60 hover:bg-violet-400/5"
                }`}
              >
                <input
                  id="resume"
                  type="file"
                  accept=".pdf,.docx"
                  disabled={loading}
                  onChange={handleFileChange}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                />

                {resume ? (
                  <div className="flex flex-col items-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                    <p className="mt-2 max-w-[220px] truncate text-sm font-medium text-white">
                      {resume.name}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {(resume.size / 1024).toFixed(1)} KB · Click to replace
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <FileText className="h-8 w-8 text-zinc-500" />
                    <p className="mt-2 text-sm font-medium text-zinc-200">
                      Choose a file or drag and drop
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">PDF or DOCX up to 10MB</p>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="jd"
                className="mb-2 block text-sm font-medium text-zinc-200"
              >
                Job description
              </label>
              <textarea
                id="jd"
                rows={7}
                value={jobDescription}
                disabled={loading}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the role title, responsibilities, tech stack and qualifications here"
                className="field h-48 resize-none"
              />
            </div>
          </div>

          {error && (
            <div className="px-6 pb-6 sm:px-8">
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-200"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {loading && (
            <div className="border-t border-white/10 px-6 py-4 sm:px-8">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-white">{STEP_LABELS[step].title}</span>
                <span className="text-zinc-400">
                  Step {STEP_LABELS[step].stepNum} of 3
                </span>
              </div>
              <div className="bar-track h-1.5 w-full">
                <div
                  className="bar-fill transition-all duration-500"
                  style={{ width: `${(STEP_LABELS[step].stepNum / 3) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-zinc-400">{STEP_LABELS[step].desc}</p>
            </div>
          )}

          <div className="flex items-center justify-end border-t border-white/10 bg-white/[0.02] px-6 py-4 sm:px-8">
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn btn-primary w-full sm:w-auto"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Analyzing…</span>
                </>
              ) : (
                <>
                  <span>Analyze and continue</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </form>

        {/* How it works */}
        <section className="mx-auto mt-20 max-w-4xl">
          <h2 className="font-display text-center text-2xl font-semibold tracking-tight text-white">
            How it works
          </h2>
          <ol className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {OVERVIEW.map((item, index) => (
              <li key={item.title} className="glass p-5">
                <span className="font-display text-sm font-semibold text-violet-300">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="font-display mt-3 text-base font-semibold text-white">
                  {item.title}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">{item.desc}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-white/10 py-6 text-center text-sm text-zinc-500">
        © {new Date().getFullYear()} HireMind AI
      </footer>
    </div>
  );
}
