import type { SkillGap } from "../api/types";
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown } from "lucide-react";

export type SkillTone = "matched" | "partial" | "missing";

const TONES: Record<SkillTone, { badge: string; icon: string; severity: string }> = {
  matched: {
    badge: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
    icon: "text-emerald-400",
    severity: "",
  },
  partial: {
    badge: "border-amber-400/25 bg-amber-400/10 text-amber-300",
    icon: "text-amber-400",
    severity: "border-amber-400/25 bg-amber-400/10 text-amber-300",
  },
  missing: {
    badge: "border-rose-400/25 bg-rose-400/10 text-rose-300",
    icon: "text-rose-400",
    severity: "border-rose-400/25 bg-rose-400/10 text-rose-300",
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
          <span className="text-sm font-medium text-white">{skill.skill_name}</span>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-zinc-400">
            {skill.category}
          </span>
        </div>
        {isGap && (
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone].severity}`}
          >
            Severity {skill.gap_severity}/5
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-zinc-400">
        <span className="text-zinc-500">Required:</span>{" "}
        <span className="capitalize text-zinc-300">{skill.jd_required_level}</span>
        <span className="mx-2 text-zinc-700">|</span>
        <span className="text-zinc-500">Resume:</span>{" "}
        <span className="capitalize text-zinc-300">{skill.resume_claimed_level}</span>
      </p>

      {isGap && skill.suggested_focus && (
        <p className="mt-3 rounded-lg border border-white/5 bg-white/[0.04] px-3 py-2 text-sm text-zinc-300">
          <span className="font-medium text-white">Interview focus: </span>
          {skill.suggested_focus}
        </p>
      )}

      <details className="group mt-3">
        <summary className="flex cursor-pointer list-none select-none items-center gap-1 text-sm font-medium text-violet-300 hover:text-violet-200 [&::-webkit-details-marker]:hidden">
          <span>View evidence</span>
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-2 space-y-1.5 rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
          <p>
            <span className="font-medium text-zinc-200">Job description:</span>{" "}
            <span className="text-zinc-400">{skill.jd_evidence}</span>
          </p>
          <p>
            <span className="font-medium text-zinc-200">Resume:</span>{" "}
            <span className="text-zinc-400">
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
    <section className="glass overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${TONES[tone].icon}`} />
            <h2 className="font-display text-sm font-semibold text-white">{title}</h2>
          </div>
          <p className="mt-1 text-sm text-zinc-400">{description}</p>
        </div>
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone].badge}`}
        >
          {skills.length}
        </span>
      </div>

      {skills.length === 0 ? (
        <p className="px-5 py-4 text-sm text-zinc-500">No skills in this category.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {skills.map((skill) => (
            <SkillRow key={skill.skill_name} skill={skill} tone={tone} />
          ))}
        </ul>
      )}
    </section>
  );
}
