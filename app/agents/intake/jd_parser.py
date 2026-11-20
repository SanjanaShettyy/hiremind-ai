"""Job-description parsing.

The LLM call is kept behind a small callable supplied by the service layer.
No app.utils dependency is required during Phase 1 (the callable is injected).
"""

import re

from pydantic import BaseModel, Field, field_validator

from app.core.schemas import ProficiencyLevel


_OR_SPLIT = re.compile(r"\s+or\s+", re.IGNORECASE)


def _split_or(text: str) -> list[str]:
    """Split alternatives, but only when the text explicitly contains a standalone 'or'.

    Without an 'or', the text is one skill (so 'CI/CD' and 'Skill A, Skill B'
    stay intact). With one, commas separate further options ('A, B or C').
    """
    if not _OR_SPLIT.search(text):
        stripped = text.strip()
        return [stripped] if stripped else []
    parts: list[str] = []
    for chunk in _OR_SPLIT.split(text):
        parts.extend(piece.strip() for piece in chunk.split(","))
    return [part for part in parts if part]

class JDRequirement(BaseModel):
    """One structured requirement extracted from a job description."""

    skill_name: str
    category: str
    required_level: ProficiencyLevel
    priority: int = Field(default=3, ge=1, le=5)
    evidence: str
    # Other interchangeable options for this requirement (empty if none).
    alternatives: list[str] = Field(default_factory=list)

    @field_validator("alternatives", mode="before")
    @classmethod
    def clean_alternatives(cls, v):
        if v is None:
            return []
        if isinstance(v, str):
            v = [v]
        return [str(item).strip() for item in v if str(item).strip()]

    @property
    def candidate_names(self) -> list[str]:
        """Every interchangeable option, de-duplicated, in order."""
        names: list[str] = []
        seen: set[str] = set()
        for part in [self.skill_name, *self.alternatives]:
            for name in _split_or(part):
                key = name.casefold()
                if key not in seen:
                    seen.add(key)
                    names.append(name)
        return names

    @property
    def display_name(self) -> str:
        names = self.candidate_names
        return " or ".join(names) if len(names) > 1 else self.skill_name


def _group_or_alternative_requirements(
    requirements: list[JDRequirement],
) -> list[JDRequirement]:
    """Group requirements only when their shared evidence clearly expresses OR.

    Ambiguous AND/OR combinations and requirements with different metadata
    are preserved independently.
    """
    groups = {}
    group_order = []

    for requirement in requirements:
        evidence = requirement.evidence or ""
        has_or = re.search(r"\bor\b", evidence, re.IGNORECASE)
        has_and = re.search(r"\band\b", evidence, re.IGNORECASE)

        names_are_present = bool(requirement.skill_name) and re.search(
            rf"(?<!\w){re.escape(requirement.skill_name)}(?!\w)",
            evidence,
            re.IGNORECASE,
        )

        if has_or and not has_and and names_are_present:
            key = (
                evidence,
                requirement.category,
                requirement.required_level,
                requirement.priority,
            )
        else:
            key = ("independent", len(group_order))

        if key not in groups:
            groups[key] = []
            group_order.append(key)

        groups[key].append(requirement)

    normalized = []

    for key in group_order:
        group = groups[key]

        if len(group) == 1:
            normalized.append(group[0])
            continue

        # Confirm every extracted skill is explicitly present in the evidence.
        evidence = group[0].evidence
        all_names_present = all(
            re.search(
                rf"(?<!\w){re.escape(item.skill_name)}(?!\w)",
                evidence,
                re.IGNORECASE,
            )
            for item in group
        )

        if not all_names_present:
            normalized.extend(group)
            continue

        names = list(dict.fromkeys(item.skill_name for item in group))
        normalized.append(
            group[0].model_copy(
                update={"skill_name": " or ".join(names)}
            )
        )

    return normalized


class ParsedJobDescription(BaseModel):
    """Structured job-description representation. Intake-internal (not shared)."""

    title: str | None = None
    company: str | None = None
    requirements: list[JDRequirement] = Field(default_factory=list)
    responsibilities: list[str] = Field(default_factory=list)
    raw_text: str = ""


async def parse_job_description(
    raw_text: str,
    generate_structured=None,
) -> ParsedJobDescription:
    """Parse a raw JD using the supplied structured-LLM callable."""
    if not raw_text.strip():
        raise ValueError("Job description text cannot be empty.")

    if generate_structured is None:
        raise RuntimeError(
            "No LLM callable supplied. Connect the project's shared LLM client "
            "when app/utils/llm_client.py is created."
        )

    from app.agents.intake.prompts import JD_EXTRACTION_SYSTEM

    result = await generate_structured(
        system_prompt=JD_EXTRACTION_SYSTEM,
        user_prompt=f"JOB DESCRIPTION:\n{raw_text}",
        response_model=ParsedJobDescription,
        max_completion_tokens=4096,
        reasoning_effort="low",
        timeout_seconds=90,
        temperature=0.0,
    )

    parsed = (
        result
        if isinstance(result, ParsedJobDescription)
        else ParsedJobDescription.model_validate(result)
    )
    parsed.requirements = _group_or_alternative_requirements(
        parsed.requirements
    )
    parsed.raw_text = raw_text
    return parsed