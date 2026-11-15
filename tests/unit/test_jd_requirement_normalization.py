"""Tests for generic JD requirement normalization."""

from app.agents.intake.jd_parser import JDRequirement
from app.core.schemas import ProficiencyLevel


def make_requirement(name, evidence):
    return JDRequirement(
        skill_name=name,
        category="technical",
        required_level=ProficiencyLevel.PROFICIENT,
        priority=5,
        evidence=evidence,
    )


def test_explicit_or_alternatives_can_be_grouped():
    requirements = [
        make_requirement("Requirement A", "Experience with Requirement A or Requirement B"),
        make_requirement("Requirement B", "Experience with Requirement A or Requirement B"),
    ]

    from app.agents.intake.jd_parser import _group_or_alternative_requirements

    result = _group_or_alternative_requirements(requirements)

    assert len(result) == 1
    assert result[0].skill_name == "Requirement A or Requirement B"
    assert result[0].evidence == requirements[0].evidence


def test_and_requirements_must_remain_independent():
    requirements = [
        make_requirement("Requirement A", "Experience with Requirement A and Requirement B"),
        make_requirement("Requirement B", "Experience with Requirement A and Requirement B"),
    ]

    from app.agents.intake.jd_parser import _group_or_alternative_requirements

    result = _group_or_alternative_requirements(requirements)

    assert len(result) == 2
    assert {item.skill_name for item in result} == {
        "Requirement A",
        "Requirement B",
    }


def test_mixed_and_or_relationship_must_not_be_guessed():
    requirements = [
        make_requirement("Requirement A", "Experience with Requirement A or Requirement B and Requirement C"),
        make_requirement("Requirement B", "Experience with Requirement A or Requirement B and Requirement C"),
        make_requirement("Requirement C", "Experience with Requirement A or Requirement B and Requirement C"),
    ]

    from app.agents.intake.jd_parser import _group_or_alternative_requirements

    result = _group_or_alternative_requirements(requirements)

    assert len(result) == 3
    assert {item.skill_name for item in result} == {
        "Requirement A",
        "Requirement B",
        "Requirement C",
    }
def test_alternatives_field_expands_candidate_names():
    req = make_requirement("Requirement A", "x")
    req = req.model_copy(update={"alternatives": ["Requirement B"]})
    assert req.candidate_names == ["Requirement A", "Requirement B"]
    assert req.display_name == "Requirement A or Requirement B"


def test_legacy_or_name_without_alternatives_is_still_split():
    req = make_requirement("Requirement A or Requirement B", "x")
    assert req.candidate_names == ["Requirement A", "Requirement B"]


def test_slashes_and_commas_are_not_split():
    for name in ["CI/CD", "TCP/IP", "Skill A, Skill B"]:
        assert make_requirement(name, "x").candidate_names == [name]


def test_comma_list_with_or_is_split_into_all_options():
    req = make_requirement("Skill A, Skill B or Skill C", "x")
    assert req.candidate_names == ["Skill A", "Skill B", "Skill C"]