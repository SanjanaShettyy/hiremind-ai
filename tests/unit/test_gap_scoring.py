"""Tests for evidence-verified, deterministic skill-gap scoring."""

import pytest

from app.agents.intake.gap_analyzer import (
    CompactSkillAssessment,
    CompactSkillGapAnalysis,
    _reconcile_with_jd,
    build_skill_gap_report,
)
from app.agents.intake.jd_parser import JDRequirement, ParsedJobDescription
from app.agents.intake.parser import ResumeProfile, ResumeSkill
from app.core.schemas import ProficiencyLevel as L, SkillGapReport

# Neutral placeholder resume: nothing here is tied to a real skill or person.
EXPERIENCE_LINE = "Built and deployed the Alpha service handling production traffic daily"
PROJECT_LINE = "Created a Beta classifier project using the Gamma library on sample data"
SKILLS_LINE = "Technical skills: Delta, Epsilon, Zeta"
EDUCATION_LINE = "Bachelor of Engineering in Computing"

RESUME_TEXT = "\n".join(
    [EDUCATION_LINE, SKILLS_LINE, "EXPERIENCE", EXPERIENCE_LINE, "PROJECTS", PROJECT_LINE]
)

PROFILE = ResumeProfile(
    skills=[ResumeSkill(skill_name="Delta", category="technical", proficiency=L.PROFICIENT)],
    experience=[EXPERIENCE_LINE],
    projects=[PROJECT_LINE],
    education=[EDUCATION_LINE],
)


def req(name, level=L.PROFICIENT, priority=5, alternatives=None):
    return JDRequirement(
        skill_name=name,
        category="technical",
        required_level=level,
        priority=priority,
        evidence="jd text",
        alternatives=alternatives or [],
    )


def assess(name, level, quote):
    return CompactSkillAssessment(
        skill_name=name, resume_claimed_level=level, resume_evidence=quote
    )


def run(requirements, assessments, profile=PROFILE):
    raw = CompactSkillGapAnalysis(assessments=assessments)
    jd = ParsedJobDescription(requirements=list(requirements), raw_text="jd")
    return _reconcile_with_jd(raw, jd, profile, RESUME_TEXT)


def test_absent_skill_scores_zero_and_is_a_gap():
    score, gaps, strengths = run(
        [req("Missing Skill")], [assess("Missing Skill", L.ABSENT, None)]
    )
    assert score == 0.0
    assert len(gaps) == 1 and gaps[0].resume_claimed_level == L.ABSENT
    assert strengths == []


def test_skills_list_only_is_capped_at_novice():
    score, gaps, _ = run(
        [req("Epsilon", level=L.COMPETENT)],
        [assess("Epsilon", L.EXPERT, "Technical skills: Delta, Epsilon, Zeta")],
    )
    assert gaps[0].resume_claimed_level == L.NOVICE
    assert score == pytest.approx(2 / 3)


def test_project_evidence_is_capped_at_competent():
    score, gaps, _ = run(
        [req("Beta", level=L.PROFICIENT)],
        [assess("Beta", L.EXPERT, "Created a Beta classifier project using the Gamma library")],
    )
    assert gaps[0].resume_claimed_level == L.COMPETENT
    assert score == pytest.approx(3 / 4)


def test_experience_evidence_can_reach_proficient_and_meet_requirement():
    score, gaps, strengths = run(
        [req("Alpha", level=L.PROFICIENT)],
        [assess("Alpha", L.PROFICIENT, "Built and deployed the Alpha service")],
    )
    assert gaps == []
    assert strengths[0].resume_claimed_level == L.PROFICIENT
    assert score == 1.0


def test_fabricated_evidence_is_rejected():
    score, gaps, _ = run(
        [req("Unrelated Skill")],
        [assess("Unrelated Skill", L.PROFICIENT, "Led a team of fifty engineers")],
    )
    assert gaps[0].resume_claimed_level == L.ABSENT
    assert score == 0.0


def test_profile_skill_list_is_a_novice_floor_when_quote_is_unverified():
    score, gaps, strengths = run(
        [req("Delta", level=L.NOVICE)],
        [assess("Delta", L.PROFICIENT, "Led a team of fifty engineers")],
    )
    assert gaps == []
    assert strengths[0].resume_claimed_level == L.NOVICE
    assert score == 1.0


def test_alternatives_need_only_one_option():
    _, gaps, strengths = run(
        [req("Beta", level=L.COMPETENT, alternatives=["Other Option"])],
        [assess("Beta", L.COMPETENT, "Created a Beta classifier project using the Gamma library")],
    )
    assert gaps == []
    assert strengths[0].skill_name == "Beta or Other Option"


def test_mixed_and_or_requirements():
    # Requirement A is independent and missing; B-or-C is satisfied through B.
    score, gaps, strengths = run(
        [
            req("Skill A", level=L.COMPETENT),
            req("Skill B", level=L.COMPETENT, alternatives=["Skill C"]),
        ],
        [
            assess("Skill A", L.ABSENT, None),
            assess("Skill B", L.COMPETENT, "Created a Beta classifier project using the Gamma library"),
        ],
    )
    assert [g.skill_name for g in gaps] == ["Skill A"]
    assert [s.skill_name for s in strengths] == ["Skill B or Skill C"]
    assert score == pytest.approx(0.5)


def test_education_requirement_is_met_by_education_entry():
    _, gaps, strengths = run(
        [req("Bachelor degree in Engineering", level=L.COMPETENT)],
        [assess("Bachelor degree in Engineering", L.PROFICIENT, "Bachelor of Engineering in Computing")],
    )
    assert gaps == []
    assert strengths[0].resume_claimed_level == L.PROFICIENT


def test_priority_weights_required_above_preferred():
    score, _, _ = run(
        [
            req("Missing Skill", level=L.COMPETENT, priority=5),
            req("Alpha", level=L.COMPETENT, priority=1),
        ],
        [
            assess("Missing Skill", L.ABSENT, None),
            assess("Alpha", L.PROFICIENT, "Built and deployed the Alpha service"),
        ],
    )
    assert score == pytest.approx(1 / 6)


def test_identical_inputs_give_identical_results():
    requirements = [req("Alpha"), req("Beta", level=L.COMPETENT), req("Missing Skill")]
    assessments = [
        assess("Alpha", L.PROFICIENT, "Built and deployed the Alpha service"),
        assess("Beta", L.COMPETENT, "Created a Beta classifier project using the Gamma library"),
        assess("Missing Skill", L.ABSENT, None),
    ]
    first = run(requirements, assessments)
    second = run(requirements, assessments)
    assert first[0] == second[0]
    assert [g.model_dump() for g in first[1]] == [g.model_dump() for g in second[1]]
    assert [s.model_dump() for s in first[2]] == [s.model_dump() for s in second[2]]


async def test_build_report_has_valid_shape_and_uses_temperature_zero():
    captured = {}

    async def fake_generate(**kwargs):
        captured.update(kwargs)
        return CompactSkillGapAnalysis(
            assessments=[assess("Alpha", L.PROFICIENT, "Built and deployed the Alpha service")]
        )

    jd = ParsedJobDescription(requirements=[req("Alpha"), req("Missing Skill")], raw_text="jd")
    report = await build_skill_gap_report(
        candidate_id="c1",
        job_id="j1",
        resume_text=RESUME_TEXT,
        parsed_jd=jd,
        resume_profile=PROFILE,
        generate_structured=fake_generate,
    )
    assert isinstance(report, SkillGapReport)
    assert 0.0 <= report.overall_match_score <= 1.0
    assert len(report.top_gaps) <= 10
    assert captured["temperature"] == 0.0
    assert report.overall_match_score == pytest.approx(0.5)