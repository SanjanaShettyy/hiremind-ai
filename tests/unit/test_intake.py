"""Unit tests for Module 1's core logic, per ARCHITECTURE.md §8.7."""
import pytest
from app.agents.intake.prompts import GAP_ANALYSIS_SYSTEM
from app.agents.intake import gap_analyzer, parser, service
from app.agents.intake.jd_parser import ParsedJobDescription, parse_job_description
from app.agents.intake.parser import (
    ResumeParseError,
    extract_resume_text,
    parse_resume,
    ResumeProfile,
    ResumeSkill,
)
from app.core.schemas import ProficiencyLevel, SkillGap
@pytest.mark.parametrize(
    ("skill_name", "experience_text"),
    [
        (
            "PyTorch",
            "Designed and trained machine learning models using PyTorch.",
        ),
        (
            "FastAPI",
            "Developed and deployed REST APIs using FastAPI.",
        ),
        (
            "Docker",
            "Built and containerized backend services using Docker.",
        ),
        (
            "LangGraph",
            "Implemented multi-agent workflows using LangGraph.",
        ),
    ],
)
def test_professional_experience_gets_tier_3(
    skill_name, experience_text
):
    profile = ResumeProfile(
        experience=[experience_text],
    )

    tier, section, evidence = gap_analyzer._classify_evidence_tier(
        skill_name, profile
    )

    assert tier == 3
    assert section == "Professional experience"
    assert skill_name in evidence


@pytest.mark.parametrize(
    "skill_name",
    ["PyTorch", "FastAPI", "Docker", "LangGraph"],
)
def test_skills_list_only_gets_tier_1(skill_name):
    profile = ResumeProfile(
        skills=[
            ResumeSkill(
                skill_name=skill_name,
                category="technical",
                proficiency=ProficiencyLevel.PROFICIENT,
            )
        ]
    )

    tier, section, _ = gap_analyzer._classify_evidence_tier(
        skill_name, profile
    )

    assert tier == 1
    assert section == "Skills section"


def test_skill_without_evidence_gets_tier_0():
    profile = ResumeProfile()

    tier, section, evidence = gap_analyzer._classify_evidence_tier(
        "Unknown Technology", profile
    )

    assert tier == 0
    assert section is None
    assert evidence is None

# --- Text extraction (real PDF/DOCX bytes, no mocking) ---

def test_extract_resume_text_from_pdf(sample_resume_pdf_bytes):
    text = extract_resume_text("resume.pdf", sample_resume_pdf_bytes)
    assert "Jane Doe" in text
    assert "Python" in text


def test_extract_resume_text_from_docx(sample_resume_docx_bytes):
    text = extract_resume_text("resume.docx", sample_resume_docx_bytes)
    assert "Jane Doe" in text


def test_extract_resume_text_rejects_unsupported_type():
    with pytest.raises(ResumeParseError):
        extract_resume_text("resume.txt", b"whatever")


def test_extract_resume_text_rejects_empty_pdf():
    import fitz

    doc = fitz.open()
    doc.new_page()  # blank page, no text
    buf = __import__("io").BytesIO()
    doc.save(buf)
    doc.close()
    with pytest.raises(ResumeParseError):
        extract_resume_text("resume.pdf", buf.getvalue())

def test_gap_analysis_prompt_requires_evidence_based_proficiency():
    assert "PROFICIENCY LEVELS:" in GAP_ANALYSIS_SYSTEM
    assert "skills-list" in GAP_ANALYSIS_SYSTEM
    assert "Never infer proficiency from keywords alone" in GAP_ANALYSIS_SYSTEM
    assert "Repeated deep ownership" in GAP_ANALYSIS_SYSTEM
    assert "absent, novice, competent, proficient, expert" in GAP_ANALYSIS_SYSTEM
    assert '"assessments"' in GAP_ANALYSIS_SYSTEM
    assert "Include exactly one assessment for every JD requirement" in GAP_ANALYSIS_SYSTEM
    assert "Do not include overall_match_score" in GAP_ANALYSIS_SYSTEM
    assert "Do not include top_gaps or strengths" in GAP_ANALYSIS_SYSTEM


def test_grouped_jd_requirement_matches_demonstrated_alternative():
    from app.agents.intake.jd_parser import JDRequirement
    from app.agents.intake.gap_analyzer import (
        CompactSkillAssessment,
        CompactSkillGapAnalysis,
    )

    profile = ResumeProfile(
        experience=[
            "Developed and deployed REST APIs using FastAPI."
        ],
        skills=[
            ResumeSkill(
                skill_name="FastAPI",
                category="technical",
                proficiency=ProficiencyLevel.PROFICIENT,
            )
        ],
    )

    parsed_jd = ParsedJobDescription(
        raw_text="Backend developer",
        requirements=[
            JDRequirement(
                skill_name="Spring Boot, Django or FastAPI",
                category="technical",
                required_level=ProficiencyLevel.PROFICIENT,
                priority=5,
                evidence="Experience with Spring Boot, Django or FastAPI",
            )
        ],
    )

    raw = CompactSkillGapAnalysis(
        assessments=[
            CompactSkillAssessment(
                skill_name="Spring Boot, Django or FastAPI",
                resume_claimed_level=ProficiencyLevel.ABSENT,
            )
        ]
    )

    _, gaps, strengths = gap_analyzer._reconcile_with_jd(
        raw, parsed_jd, profile
    )

    assert len(strengths) == 1
    assert strengths[0].resume_claimed_level == ProficiencyLevel.PROFICIENT
    assert not gaps


def test_structured_profile_proficiency_overrides_lower_llm_level():
    from app.agents.intake.jd_parser import JDRequirement
    from app.agents.intake.gap_analyzer import (
        CompactSkillAssessment,
        CompactSkillGapAnalysis,
    )

    profile = ResumeProfile(
        skills=[
            ResumeSkill(
                skill_name="PyTorch",
                category="technical",
                proficiency=ProficiencyLevel.PROFICIENT,
            )
        ],
        experience=[
            "Designed and trained machine learning models using PyTorch."
        ],
    )

    parsed_jd = ParsedJobDescription(
        raw_text="Machine learning engineer",
        requirements=[
            JDRequirement(
                skill_name="PyTorch",
                category="technical",
                required_level=ProficiencyLevel.PROFICIENT,
                priority=5,
                evidence="Proficient PyTorch experience",
            )
        ],
    )

    raw = CompactSkillGapAnalysis(
        assessments=[
            CompactSkillAssessment(
                skill_name="PyTorch",
                resume_claimed_level=ProficiencyLevel.NOVICE,
                resume_evidence="Used PyTorch.",
            )
        ]
    )

    _, gaps, strengths = gap_analyzer._reconcile_with_jd(
        raw, parsed_jd, profile
    )

    assert len(strengths) == 1
    assert strengths[0].resume_claimed_level == ProficiencyLevel.PROFICIENT
    assert not gaps

@pytest.mark.parametrize(
    ("jd_skill", "resume_skill"),
    [
        ("PostgreSQL", "Postgres"),
        ("AWS", "Amazon Web Services"),
        ("React", "React.js"),
        ("JavaScript", "JS"),
    ],
)
def test_skill_aliases_match_resume_profile(jd_skill, resume_skill):
    profile = ResumeProfile(
        skills=[
            ResumeSkill(
                skill_name=resume_skill,
                category="technical",
                proficiency=ProficiencyLevel.PROFICIENT,
            )
        ]
    )

    tier, section, evidence = gap_analyzer._classify_evidence_tier(
        jd_skill, profile
    )

    assert tier == 1
    assert section == "Skills section"
    assert evidence == resume_skill
    
async def test_parse_resume_end_to_end(sample_resume_pdf_bytes, mock_generate_structured):
    text, profile = await parse_resume("resume.pdf", sample_resume_pdf_bytes, mock_generate_structured)
    assert "Jane Doe" in text
    assert profile.name == "Jane Doe"
    assert any(s.skill_name == "Python" for s in profile.skills)


async def test_parse_resume_without_llm_callable_raises(sample_resume_pdf_bytes):
    with pytest.raises(RuntimeError):
        await parse_resume("resume.pdf", sample_resume_pdf_bytes, generate_structured=None)


# --- JD structuring (mocked LLM) ---

async def test_parse_jd_end_to_end(sample_jd_text, mock_generate_structured):
    parsed = await parse_job_description(sample_jd_text, mock_generate_structured)
    assert parsed.title == "Senior Backend Engineer"
    assert parsed.raw_text == sample_jd_text  # raw_text must be the original input, not the LLM's echo
    assert all(
        isinstance(r.required_level, ProficiencyLevel) for r in parsed.requirements
    )


async def test_parse_jd_rejects_empty_text(mock_generate_structured):
    with pytest.raises(ValueError):
        await parse_job_description("   ", mock_generate_structured)


async def test_parse_jd_without_llm_callable_raises(sample_jd_text):
    with pytest.raises(RuntimeError):
        await parse_job_description(sample_jd_text, generate_structured=None)


# --- Gap analysis (mocked LLM) ---

async def test_build_skill_gap_report_normalizes_identity_fields(
    sample_resume_text, sample_jd_text, mock_generate_structured
):
    parsed_jd = ParsedJobDescription(
        title="Senior Backend Engineer", company="NovaTech",
        requirements=[], responsibilities=[], raw_text=sample_jd_text,
    )
    report = await gap_analyzer.build_skill_gap_report(
        candidate_id="cand-123",
        job_id="job-456",
        resume_text=sample_resume_text,
        parsed_jd=parsed_jd,
        generate_structured=mock_generate_structured,
    )
    # These must be overwritten by our own code, not trusted from the LLM —
    # the fixture deliberately returns "placeholder" for all three.
    assert report.candidate_id == "cand-123"
    assert report.job_id == "job-456"
    assert report.report_id != "placeholder"
    assert report.generated_at.year >= 2026


async def test_build_skill_gap_report_caps_and_sorts_top_gaps(
    sample_resume_text, sample_jd_text
):
    many_gaps = [
        SkillGap(
            skill_name=f"skill-{i}", category="technical",
            jd_required_level=ProficiencyLevel.EXPERT,
            resume_claimed_level=ProficiencyLevel.ABSENT,
            gap_level=ProficiencyLevel.EXPERT,
            gap_severity=(i % 5) + 1,
            jd_evidence="evidence", suggested_focus="focus",
        )
        for i in range(15)
    ]

    async def mock_llm(*, system_prompt, user_prompt, response_model, **kwargs):
        # Build via the actual response_model passed in (RawSkillGapAnalysis
        # — no max_length cap, no id/timestamp fields) rather than assuming
        # SkillGapReport's shape.
        return response_model(overall_match_score=0.3, top_gaps=many_gaps, strengths=[])

    parsed_jd = ParsedJobDescription(raw_text=sample_jd_text, requirements=[])
    report = await gap_analyzer.build_skill_gap_report(
        candidate_id="c", job_id="j", resume_text=sample_resume_text,
        parsed_jd=parsed_jd, generate_structured=mock_llm,
    )
    assert len(report.top_gaps) == 10  # capped per SkillGapReport's max_length
    severities = [g.gap_severity for g in report.top_gaps]
    assert severities == sorted(severities, reverse=True)


async def test_build_skill_gap_report_without_llm_callable_raises(
    sample_resume_text, sample_jd_text
):
    parsed_jd = ParsedJobDescription(raw_text=sample_jd_text, requirements=[])
    with pytest.raises(RuntimeError):
        await gap_analyzer.build_skill_gap_report(
            candidate_id="c", job_id="j", resume_text=sample_resume_text,
            parsed_jd=parsed_jd, generate_structured=None,
        )


# --- service.py orchestration: chunk/embed wiring ---

async def test_analyze_skill_gap_writes_document_chunks_when_wired(
    sample_resume_text, sample_jd_text, mock_generate_structured, mock_embed_fn, fake_db_session,
):
    parsed_jd = ParsedJobDescription(
        title="Senior Backend Engineer", requirements=[], raw_text=sample_jd_text,
    )
    await service.analyze_skill_gap(
        candidate_id="cand-123", job_id="job-456",
        resume_text=sample_resume_text, parsed_jd=parsed_jd,
        generate_structured=mock_generate_structured,
        db_session=fake_db_session, embed_fn=mock_embed_fn,
    )
    added_source_types = {chunk.source_type for chunk in fake_db_session.added if hasattr(chunk, "source_type")}
    assert added_source_types == {"resume", "jd"}


async def test_analyze_skill_gap_no_ops_chunking_when_unwired(
    sample_resume_text, sample_jd_text, mock_generate_structured,
):
    """Confirms the Phase-1 no-op path (no db_session/embed_fn) still works —
    this is what lets earlier tests run without a real database."""
    import uuid
    parsed_jd = ParsedJobDescription(
        title="Senior Backend Engineer", requirements=[], raw_text=sample_jd_text,
    )
    report = await service.analyze_skill_gap(
        candidate_id="cand-123", job_id="job-456",
        resume_text=sample_resume_text, parsed_jd=parsed_jd,
        generate_structured=mock_generate_structured,
    )
    assert uuid.UUID(report.candidate_id)
    assert uuid.UUID(report.job_id)


async def test_analyze_skill_gap_normalizes_non_uuid_ids(
    sample_resume_text, sample_jd_text, mock_generate_structured, fake_db_session,
):
    import uuid
    from app.core.models import Candidate

    parsed_jd = ParsedJobDescription(
        title="Senior Backend Engineer", requirements=[], raw_text=sample_jd_text,
    )
    report = await service.analyze_skill_gap(
        candidate_id="cand-123", job_id="job-456",
        resume_text=sample_resume_text, parsed_jd=parsed_jd,
        generate_structured=mock_generate_structured,
        db_session=fake_db_session,
    )
    cand_uuid = uuid.UUID(report.candidate_id)
    job_uuid = uuid.UUID(report.job_id)
    report_uuid = uuid.UUID(report.report_id)

    assert str(cand_uuid) == report.candidate_id
    assert str(job_uuid) == report.job_id
    assert str(report_uuid) == report.report_id

    cand_row = await fake_db_session.get(Candidate, cand_uuid)
    assert cand_row is not None
    assert cand_row.id == cand_uuid

async def test_parse_jd_uses_dedicated_completion_token_limit(sample_jd_text):
    captured = {}

    async def mock_llm(*, system_prompt, user_prompt, response_model, **kwargs):
        captured.update(kwargs)
        return response_model(
            title="Senior Backend Engineer",
            company="NovaTech",
            requirements=[],
            responsibilities=[],
            raw_text="",
        )

    parsed = await parse_job_description(sample_jd_text, mock_llm)

    assert parsed.title == "Senior Backend Engineer"
    assert captured["max_completion_tokens"] == 4096


async def test_skill_gap_report_validates_all_jd_requirements_and_score(
    sample_resume_text, sample_jd_text, mock_generate_structured
):
    from app.agents.intake.jd_parser import JDRequirement

    parsed_jd = ParsedJobDescription(
        title="Senior Backend Engineer",
        raw_text=sample_jd_text,
        requirements=[
            JDRequirement(
                skill_name="Python",
                category="technical",
                required_level=ProficiencyLevel.EXPERT,
                priority=5,
                evidence="5+ years of Python experience",
            ),
            JDRequirement(
                skill_name="Kubernetes",
                category="tool",
                required_level=ProficiencyLevel.EXPERT,
                priority=5,
                evidence="Expert-level Kubernetes experience",
            ),
            JDRequirement(
                skill_name="PostgreSQL",
                category="technical",
                required_level=ProficiencyLevel.PROFICIENT,
                priority=4,
                evidence="Strong PostgreSQL experience",
            ),
        ],
    )

    report = await gap_analyzer.build_skill_gap_report(
        candidate_id="candidate-test",
        job_id="job-test",
        resume_text=sample_resume_text,
        parsed_jd=parsed_jd,
        generate_structured=mock_generate_structured,
    )

    # All three JD requirements must be accounted for.
    reported_skills = {
        gap.skill_name.lower()
        for gap in report.top_gaps + report.strengths
    }
    assert reported_skills == {"python", "kubernetes", "postgresql"}

    # Python is below the required expert level, so it cannot be a strength.
    assert "python" not in {
        gap.skill_name.lower() for gap in report.strengths
    }

    # Expected weighted score (a requirement with no resume evidence earns no credit):
    # Python:      (4 / 5) * 5 = 4
    # Kubernetes:  absent -> 0
    # PostgreSQL:  absent -> 0
    # Total: 4 / 14
    assert report.overall_match_score == pytest.approx(4 / 14)


def test_grouped_requirement_matches_individual_llm_assessment():
    from app.agents.intake.jd_parser import JDRequirement
    from app.agents.intake.gap_analyzer import (
        CompactSkillAssessment,
        CompactSkillGapAnalysis,
    )

    parsed_jd = ParsedJobDescription(
        raw_text="Backend developer",
        requirements=[
            JDRequirement(
                skill_name="Spring Boot, Django or FastAPI",
                category="technical",
                required_level=ProficiencyLevel.PROFICIENT,
                priority=5,
                evidence="Experience with Spring Boot, Django or FastAPI",
            )
        ],
    )

    raw = CompactSkillGapAnalysis(
        assessments=[
            CompactSkillAssessment(
                skill_name="FastAPI",
                resume_claimed_level=ProficiencyLevel.PROFICIENT,
                resume_evidence="Developed REST APIs using FastAPI.",
            )
        ]
    )

    _, gaps, strengths = gap_analyzer._reconcile_with_jd(raw, parsed_jd)

    assert len(strengths) == 1
    assert strengths[0].resume_claimed_level == ProficiencyLevel.PROFICIENT
    assert not gaps


def test_grouped_requirement_uses_proficiency_of_strongest_alternative():
    from app.agents.intake.jd_parser import JDRequirement
    from app.agents.intake.gap_analyzer import (
        CompactSkillAssessment,
        CompactSkillGapAnalysis,
    )

    profile = ResumeProfile(
        skills=[
            ResumeSkill(
                skill_name="Spring Boot",
                category="technical",
                proficiency=ProficiencyLevel.NOVICE,
            ),
            ResumeSkill(
                skill_name="FastAPI",
                category="technical",
                proficiency=ProficiencyLevel.PROFICIENT,
            ),
        ],
        experience=[
            "Developed and deployed REST APIs using FastAPI."
        ],
    )

    parsed_jd = ParsedJobDescription(
        raw_text="Backend developer",
        requirements=[
            JDRequirement(
                skill_name="Spring Boot, Django or FastAPI",
                category="technical",
                required_level=ProficiencyLevel.PROFICIENT,
                priority=5,
                evidence="Experience with Spring Boot, Django or FastAPI",
            )
        ],
    )

    raw = CompactSkillGapAnalysis(
        assessments=[
            CompactSkillAssessment(
                skill_name="Spring Boot, Django or FastAPI",
                resume_claimed_level=ProficiencyLevel.ABSENT,
            )
        ]
    )

    _, gaps, strengths = gap_analyzer._reconcile_with_jd(
        raw, parsed_jd, profile
    )

    assert len(strengths) == 1
    assert strengths[0].resume_claimed_level == ProficiencyLevel.PROFICIENT
    assert not gaps
