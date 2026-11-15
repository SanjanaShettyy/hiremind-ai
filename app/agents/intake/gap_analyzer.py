"""Skill-gap analysis: LLM semantic matching + deterministic, evidence-verified scoring.

Division of work:
- The LLM decides, for each JD requirement, whether the resume satisfies it, at what
  level, and quotes the resume text that supports its answer.
- Python verifies the quote really exists in the resume, decides how strong the
  evidence is from where it appears (experience > projects > skills list), limits
  the level accordingly, and computes the overall score with a fixed formula.
"""

import logging
import re
from datetime import datetime, timezone
from typing import Awaitable, Callable
from uuid import uuid4

from pydantic import BaseModel, Field

from app.agents.intake.jd_parser import JDRequirement, ParsedJobDescription, _split_or
from app.agents.intake.parser import ResumeProfile
from app.agents.intake.prompts import GAP_ANALYSIS_SYSTEM
from app.agents.intake.skill_normalizer import (
    normalize_skill_name,
    skill_names_match,
)
from app.core.schemas import (
    PROFICIENCY_ORDINAL,
    ProficiencyLevel,
    SkillGap,
    SkillGapReport,
)

logger = logging.getLogger(__name__)

# Evidence tier -> highest proficiency that evidence can support.
#   0 = no evidence, 1 = skills list only, 2 = project, 3 = experience / education
_TIER_CEILING = {
    0: ProficiencyLevel.ABSENT,
    1: ProficiencyLevel.NOVICE,
    2: ProficiencyLevel.COMPETENT,
    3: ProficiencyLevel.PROFICIENT,
}

# Share of a quote's words that must appear in one resume entry for the quote
# to be attributed to that entry's section.
_SECTION_OVERLAP_THRESHOLD = 0.6


class RawSkillGapAnalysis(BaseModel):
    """The semantic assessment returned by the LLM."""

    overall_match_score: float = Field(..., ge=0.0, le=1.0)
    top_gaps: list[SkillGap] = Field(default_factory=list)
    strengths: list[SkillGap] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


class CompactSkillAssessment(BaseModel):
    """Minimal LLM assessment for one JD requirement."""

    skill_name: str
    resume_claimed_level: ProficiencyLevel
    resume_evidence: str | None = None
    suggested_focus: str | None = None


class CompactSkillGapAnalysis(BaseModel):
    """Compact semantic assessment returned by the LLM."""

    assessments: list[CompactSkillAssessment] = Field(default_factory=list)


def _normalize_skill_name(name: str) -> str:
    return normalize_skill_name(name)


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------

def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.casefold())


def _normalized(text: str) -> str:
    return " ".join(_tokens(text))


def _profile_text(profile: ResumeProfile | None) -> str:
    """Fallback searchable text when the raw resume text is not available."""
    if profile is None:
        return ""
    parts = [profile.summary or ""]
    for skill in profile.skills:
        parts.extend([skill.skill_name, skill.evidence or ""])
    parts.extend(profile.experience)
    parts.extend(profile.projects)
    parts.extend(profile.education)
    return "\n".join(parts)


def _quote_in_resume(quote: str, resume_norm: str) -> bool:
    """True if the quote appears in the resume, ignoring case, spacing and punctuation.

    `resume_norm` must be the normalized resume wrapped in single spaces so that
    matches always fall on word boundaries. A quote joined with an ellipsis is
    verified fragment by fragment.
    """
    fragments = [
        fragment
        for fragment in re.split(r"\.{3}|…", quote)
        if _normalized(fragment)
    ]
    if not fragments:
        return False
    return all(f" {_normalized(fragment)} " in resume_norm for fragment in fragments)


def _section_tier(quote: str, profile: ResumeProfile | None) -> int:
    """Evidence strength of a verified quote, from where it appears in the resume."""
    if profile is None:
        # No section information available: trust the verified LLM judgement.
        return 3

    quote_tokens = set(_tokens(quote))
    if not quote_tokens:
        return 1

    def best_overlap(entries: list[str]) -> float:
        return max(
            (len(quote_tokens & set(_tokens(entry))) / len(quote_tokens) for entry in entries),
            default=0.0,
        )

    if (
        best_overlap(profile.experience) >= _SECTION_OVERLAP_THRESHOLD
        or best_overlap(profile.education) >= _SECTION_OVERLAP_THRESHOLD
    ):
        return 3
    if best_overlap(profile.projects) >= _SECTION_OVERLAP_THRESHOLD:
        return 2
    return 1


def _clamp_to_tier(level: ProficiencyLevel, tier: int) -> ProficiencyLevel:
    ceiling = _TIER_CEILING[tier]
    if PROFICIENCY_ORDINAL[level] > PROFICIENCY_ORDINAL[ceiling]:
        return ceiling
    return level


# ---------------------------------------------------------------------------
# Per-requirement evaluation and scoring
# ---------------------------------------------------------------------------

def _find_assessment(
    requirement: JDRequirement,
    assessments: list[CompactSkillAssessment],
) -> CompactSkillAssessment | None:
    """Join the LLM's assessment list back to a JD requirement by name."""
    names = [requirement.skill_name, requirement.display_name, *requirement.candidate_names]
    for name in names:
        for item in assessments:
            if skill_names_match(item.skill_name, name):
                return item
    return None


def _mentions(skill_name: str, text: str) -> bool:
    """True if the skill's words appear, in order and adjacent, in the text.

    Single-character names are skipped here (too ambiguous to find by name);
    they rely on the LLM's quoted evidence instead.
    """
    needle = _tokens(skill_name)
    if not needle or len("".join(needle)) < 2:
        return False
    haystack = _tokens(text)
    size = len(needle)
    return any(haystack[i : i + size] == needle for i in range(len(haystack) - size + 1))


def _classify_evidence_tier(
    skill_name: str,
    resume_profile: ResumeProfile,
) -> tuple[int, str | None, str | None]:
    """Strongest evidence for a skill found by name in the structured profile.

    Returns (tier, section, supporting text):
    3 = professional experience, 2 = projects, 1 = skills section, 0 = none.
    """
    best: tuple[int, str | None, str | None] = (0, None, None)

    for candidate in _split_or(skill_name) or [skill_name]:
        experience = next(
            (entry for entry in resume_profile.experience if _mentions(candidate, entry)),
            None,
        )
        project = next(
            (entry for entry in resume_profile.projects if _mentions(candidate, entry)),
            None,
        )
        listed = next(
            (
                skill
                for skill in resume_profile.skills
                if skill_names_match(skill.skill_name, candidate)
            ),
            None,
        )

        if experience:
            result = (3, "Professional experience", experience)
        elif project:
            result = (2, "Projects", project)
        elif listed:
            result = (1, "Skills section", listed.evidence or listed.skill_name)
        else:
            continue

        if result[0] > best[0]:
            best = result

    return best


def _profile_evidence(
    requirement: JDRequirement,
    profile: ResumeProfile,
) -> tuple[ProficiencyLevel, str | None]:
    """Level and evidence for a requirement from skills/projects/experience by name."""
    best_level = ProficiencyLevel.ABSENT
    best_evidence: str | None = None

    for name in requirement.candidate_names:
        tier, _, evidence = _classify_evidence_tier(name, profile)
        if tier == 0:
            continue

        listed = next(
            (skill for skill in profile.skills if skill_names_match(skill.skill_name, name)),
            None,
        )
        # Start from the structured proficiency when there is one, otherwise from
        # the most the evidence can support; never exceed what the evidence supports.
        level = _clamp_to_tier(listed.proficiency if listed else _TIER_CEILING[tier], tier)
        if PROFICIENCY_ORDINAL[level] < PROFICIENCY_ORDINAL[ProficiencyLevel.NOVICE]:
            level = ProficiencyLevel.NOVICE

        if PROFICIENCY_ORDINAL[level] > PROFICIENCY_ORDINAL[best_level]:
            best_level, best_evidence = level, evidence

    return best_level, best_evidence


def _evaluate_requirement(
    requirement: JDRequirement,
    assessment: CompactSkillAssessment | None,
    resume_norm: str | None,
    profile: ResumeProfile | None,
) -> tuple[ProficiencyLevel, str | None]:
    """Return the verified resume level and evidence for one requirement.

    Two independent signals are combined and the stronger one wins:
    1. The LLM's judgement, accepted only if its quoted evidence exists in the
       resume, and limited by where that evidence appears.
    2. A name lookup in the structured profile (experience / projects / skills).
    """
    llm_level = ProficiencyLevel.ABSENT
    llm_evidence: str | None = None

    if (
        assessment is not None
        and assessment.resume_claimed_level != ProficiencyLevel.ABSENT
        and assessment.resume_evidence
    ):
        quote = assessment.resume_evidence.strip()
        # resume_norm is None only when there is no resume text at all to check against.
        if resume_norm is None or _quote_in_resume(quote, resume_norm):
            tier = _section_tier(quote, profile)
            llm_level = _clamp_to_tier(assessment.resume_claimed_level, tier)
            llm_evidence = quote
        else:
            logger.debug(
                "Unverified resume evidence ignored for %r", requirement.skill_name
            )

    profile_level, profile_evidence = (
        _profile_evidence(requirement, profile)
        if profile is not None
        else (ProficiencyLevel.ABSENT, None)
    )

    if PROFICIENCY_ORDINAL[profile_level] > PROFICIENCY_ORDINAL[llm_level]:
        return profile_level, profile_evidence
    return llm_level, llm_evidence


def _credit(resume_level: ProficiencyLevel, jd_level: ProficiencyLevel) -> float:
    """Score credit for one requirement: 1.0 if met, 0.0 if no evidence, else partial."""
    resume_ordinal = PROFICIENCY_ORDINAL[resume_level]
    jd_ordinal = PROFICIENCY_ORDINAL[jd_level]
    if resume_ordinal >= jd_ordinal:
        return 1.0
    if resume_level == ProficiencyLevel.ABSENT:
        return 0.0
    return resume_ordinal / jd_ordinal


def _reconcile_with_jd(
    raw: CompactSkillGapAnalysis,
    parsed_jd: ParsedJobDescription,
    resume_profile: ResumeProfile | None = None,
    resume_text: str = "",
) -> tuple[float, list[SkillGap], list[SkillGap]]:
    """Verify LLM assessments against the resume and score every JD requirement."""

    source = resume_text or _profile_text(resume_profile)
    resume_norm = f" {_normalized(source)} " if source.strip() else None

    strengths: list[SkillGap] = []
    gaps: list[SkillGap] = []
    weighted_score = 0.0
    total_priority = 0

    for requirement in parsed_jd.requirements:
        priority = requirement.priority
        jd_level = requirement.required_level
        jd_ordinal = PROFICIENCY_ORDINAL[jd_level]

        assessment = _find_assessment(requirement, raw.assessments)
        resume_level, resume_evidence = _evaluate_requirement(
            requirement, assessment, resume_norm, resume_profile
        )
        resume_ordinal = PROFICIENCY_ORDINAL[resume_level]

        suggested_focus = (
            assessment.suggested_focus.strip()
            if assessment and assessment.suggested_focus
            else None
        )

        weighted_score += priority * _credit(resume_level, jd_level)
        total_priority += priority

        if resume_ordinal >= jd_ordinal:
            strengths.append(
                SkillGap(
                    skill_name=requirement.display_name,
                    category=requirement.category,
                    jd_required_level=jd_level,
                    resume_claimed_level=resume_level,
                    gap_level=None,
                    gap_severity=1,
                    jd_evidence=requirement.evidence,
                    resume_evidence=resume_evidence,
                    suggested_focus=None,
                )
            )
        else:
            severity = round((jd_ordinal - resume_ordinal) * (priority / 5))
            severity = max(1, min(5, severity))
            gaps.append(
                SkillGap(
                    skill_name=requirement.display_name,
                    category=requirement.category,
                    jd_required_level=jd_level,
                    resume_claimed_level=resume_level,
                    gap_level=jd_level,
                    gap_severity=severity,
                    jd_evidence=requirement.evidence,
                    resume_evidence=resume_evidence,
                    suggested_focus=suggested_focus,
                )
            )

    score = weighted_score / total_priority if total_priority else 0.0

    gaps.sort(key=lambda gap: gap.gap_severity, reverse=True)

    return score, gaps[:10], strengths


async def build_skill_gap_report(
    *,
    candidate_id: str,
    job_id: str,
    resume_text: str,
    parsed_jd: ParsedJobDescription,
    resume_profile: ResumeProfile | None = None,
    generate_structured: Callable[..., Awaitable] | None = None,
) -> SkillGapReport:
    """Use the LLM for semantic matching and Python for verification and scoring."""

    if generate_structured is None:
        raise RuntimeError(
            "No LLM callable supplied. Connect the project's shared LLM client."
        )

    user_prompt = f"""CANDIDATE ID: {candidate_id}
JOB ID: {job_id}

RESUME:
{resume_text}

STRUCTURED JD:
{parsed_jd.model_dump_json(indent=2)}
"""

    # Use a compact response for normal JD analysis.
    # Preserve the legacy response for empty JD requirements.
    response_model = (
        CompactSkillGapAnalysis
        if parsed_jd.requirements
        else RawSkillGapAnalysis
    )

    result = await generate_structured(
        system_prompt=GAP_ANALYSIS_SYSTEM,
        user_prompt=user_prompt,
        response_model=response_model,
        timeout_seconds=90,
        max_completion_tokens=4096,
        reasoning_effort="low",
        temperature=0.0,
    )

    raw = (
        result
        if isinstance(result, response_model)
        else response_model.model_validate(result)
    )

    if parsed_jd.requirements:
        score, top_gaps, strengths = _reconcile_with_jd(
            raw,
            parsed_jd,
            resume_profile,
            resume_text,
        )
        metadata = {}
    else:
        # Preserve the original behaviour for empty or unavailable JD data.
        score = raw.overall_match_score
        top_gaps = sorted(
            raw.top_gaps,
            key=lambda gap: gap.gap_severity,
            reverse=True,
        )[:10]
        strengths = raw.strengths
        metadata = raw.metadata

    return SkillGapReport(
        report_id=str(uuid4()),
        candidate_id=candidate_id,
        job_id=job_id,
        generated_at=datetime.now(timezone.utc),
        overall_match_score=score,
        top_gaps=top_gaps,
        strengths=strengths,
        metadata=metadata,
    )