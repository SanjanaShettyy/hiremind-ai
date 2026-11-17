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
    desc: "Compares your resume against the job requirements.",
  },
  {
    title: "Tailored interview",
    desc: "Five technical questions based on your gaps.",
  },
  {
    title: "Detailed report",
    desc: "Scores, feedback and a personalized study plan.",
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
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Header />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Skill gap analysis
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-600">
            Upload your resume and paste the job description you are targeting.
            We will compare the two, highlight where you fall short, and prepare
            a mock technical interview based on those gaps.
          </p>
        </div>

        <ol className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {OVERVIEW.map((item, index) => (
            <li
              key={item.title}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">
                {index + 1}
              </span>
              <p className="mt-3 text-sm font-medium text-gray-900">{item.title}</p>
              <p className="mt-1 text-sm text-gray-500">{item.desc}</p>
            </li>
          ))}
        </ol>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-gray-200 bg-white"
        >
          <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
            {/* Resume upload */}
            <div>
              <label
                htmlFor="resume"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Resume <span className="font-normal text-gray-500">(PDF or DOCX)</span>
              </label>

              <div
                className={`relative flex h-48 flex-col items-center justify-center rounded-md border border-dashed px-4 text-center transition-colors ${
                  resume
                    ? "border-green-500 bg-green-50/50"
                    : "border-gray-300 bg-gray-50 hover:border-blue-500 hover:bg-blue-50/40"
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
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                    <p className="mt-2 max-w-[220px] truncate text-sm font-medium text-gray-900">
                      {resume.name}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {(resume.size / 1024).toFixed(1)} KB · Click to replace
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <FileText className="h-8 w-8 text-gray-400" />
                    <p className="mt-2 text-sm font-medium text-gray-700">
                      Choose a file or drag and drop
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">PDF or DOCX up to 10MB</p>
                  </div>
                )}
              </div>
            </div>

            {/* Job description */}
            <div>
              <label
                htmlFor="jd"
                className="mb-1.5 block text-sm font-medium text-gray-700"
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
                className="h-48 w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
          </div>

          {error && (
            <div className="px-6 pb-6">
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {loading && (
            <div className="border-t border-gray-200 px-6 py-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-gray-900">
                  {STEP_LABELS[step].title}
                </span>
                <span className="text-gray-500">
                  Step {STEP_LABELS[step].stepNum} of 3
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full bg-blue-600 transition-all duration-500"
                  style={{ width: `${(STEP_LABELS[step].stepNum / 3) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">{STEP_LABELS[step].desc}</p>
            </div>
          )}

          <div className="flex items-center justify-end rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-4">
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
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
      </main>

      <footer className="border-t border-gray-200 bg-white py-5 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} HireMind AI
      </footer>
    </div>
  );
}
