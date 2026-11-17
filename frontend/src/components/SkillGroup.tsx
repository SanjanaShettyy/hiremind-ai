import type { SkillGap } from "../api/types";
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown } from "lucide-react";

export type SkillTone = "matched" | "partial" | "missing";

const TONES: Record<SkillTone, { badge: string; icon: string; severity: string }> = {
  matched: {
    badge: "border-green-200 bg-green-50 text-green-700",
    icon: "text-green-600",
    severity: "",
  },
  partial: {
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    icon: "text-amber-600",
    severity: "border-amber-200 bg-amber-50 text-amber-700",
  },
  missing: {
    badge: "border-red-200 bg-red-50 text-red-700",
    icon: "text-red-600",
    severity: "border-red-200 bg-red-50 text-red-700",
  },
};

interface SkillGroupProps {
  title: string;
  description: string;
  tone: SkillTone;
  skills: SkillGap[];
}

function SkillRow({ skill, tone }: { skill: SkillGap; tone: SkillTone }) {
  const isGap = tone !== "matched";

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{skill.skill_name}</span>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
            {skill.category}
          </span>
        </div>
        {isGap && (
          <span
            className={`rounded-md border px-2 py-0.5 text-xs font-medium ${TONES[tone].severity}`}
          >
            Severity {skill.gap_severity}/5
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-gray-600">
        <span className="text-gray-500">Required:</span>{" "}
        <span className="capitalize">{skill.jd_required_level}</span>
        <span className="mx-2 text-gray-300">|</span>
        <span className="text-gray-500">Resume:</span>{" "}
        <span className="capitalize">{skill.resume_claimed_level}</span>
      </p>

      {isGap && skill.suggested_focus && (
        <p className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">
          <span className="font-medium text-gray-900">Interview focus: </span>
          {skill.suggested_focus}
        </p>
      )}

      <details className="group mt-3">
        <summary className="flex cursor-pointer list-none select-none items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 [&::-webkit-details-marker]:hidden">
          <span>View evidence</span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-2 space-y-1.5 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
          <p>
            <span className="font-medium text-gray-700">Job description:</span>{" "}
            <span className="text-gray-600">{skill.jd_evidence}</span>
          </p>
          <p>
            <span className="font-medium text-gray-700">Resume:</span>{" "}
            <span className="text-gray-600">
              {skill.resume_evidence ?? "No direct keyword match found."}
            </span>
          </p>
        </div>
      </details>
    </li>
  );
}

export default function SkillGroup({
  title,
  description,
  tone,
  skills,
}: SkillGroupProps) {
  const Icon =
    tone === "matched" ? CheckCircle2 : tone === "partial" ? AlertTriangle : XCircle;

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${TONES[tone].icon}`} />
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
        <span
          className={`rounded-md border px-2 py-0.5 text-xs font-medium ${TONES[tone].badge}`}
        >
          {skills.length}
        </span>
      </div>

      {skills.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-500">No skills in this category.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {skills.map((skill) => (
            <SkillRow key={skill.skill_name} skill={skill} tone={tone} />
          ))}
        </ul>
      )}
    </section>
  );
}
