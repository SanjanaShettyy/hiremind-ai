"""Run the intake pipeline repeatedly on one resume + JD and report what varies.

Usage (from the repo root, with your venv active and .env configured):
    python scripts/skill_gap_stability.py path/to/resume.pdf path/to/jd.txt [runs]
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.agents.intake import service  # noqa: E402
from app.utils.llm_client import generate_structured  # noqa: E402


async def run_once(resume_path: Path, jd_text: str):
    resume_text, profile = await service.parse_resume(
        resume_path.name, resume_path.read_bytes(), generate_structured
    )
    parsed_jd = await service.parse_jd(jd_text, generate_structured)
    report = await service.analyze_skill_gap(
        candidate_id="stability-test",
        job_id="stability-test",
        resume_text=resume_text,
        parsed_jd=parsed_jd,
        resume_profile=profile,
        generate_structured=generate_structured,
    )
    return profile, parsed_jd, report


def signatures(profile, parsed_jd, report):
    jd_sig = sorted(
        (r.display_name, r.required_level.value, r.priority)
        for r in parsed_jd.requirements
    )
    profile_sig = sorted(
        (s.skill_name, s.proficiency.value) for s in profile.skills
    )
    strengths = sorted(
        (s.skill_name, s.resume_claimed_level.value) for s in report.strengths
    )
    gaps = sorted(
        (g.skill_name, g.resume_claimed_level.value) for g in report.top_gaps
    )
    return jd_sig, profile_sig, (strengths, gaps)


def report_diff(label, base, other, run_number):
    if base == other:
        return
    print(f"  {label} differs in run {run_number}:")
    base_set, other_set = set(map(str, base)), set(map(str, other))
    for item in sorted(base_set - other_set):
        print(f"    only in run 1: {item}")
    for item in sorted(other_set - base_set):
        print(f"    only in run {run_number}: {item}")


async def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return
    resume_path = Path(sys.argv[1])
    jd_text = Path(sys.argv[2]).read_text(encoding="utf-8")
    runs = int(sys.argv[3]) if len(sys.argv) > 3 else 5

    results = []
    for number in range(1, runs + 1):
        profile, parsed_jd, report = await run_once(resume_path, jd_text)
        results.append(signatures(profile, parsed_jd, report))
        print(
            f"run {number}: score={report.overall_match_score:.4f} "
            f"strengths={len(report.strengths)} gaps={len(report.top_gaps)} "
            f"jd_requirements={len(parsed_jd.requirements)}"
        )

    print("\nWhat changed between runs (compared with run 1):")
    labels = ("JD requirements", "Resume skills", "Final report")
    any_difference = False
    for index, label in enumerate(labels):
        for number, result in enumerate(results[1:], start=2):
            if result[index] != results[0][index]:
                any_difference = True
                report_diff(label, results[0][index], result[index], number)
    if not any_difference:
        print("  Nothing. All runs were identical at every stage.")


if __name__ == "__main__":
    asyncio.run(main())