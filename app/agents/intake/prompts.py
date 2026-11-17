"""Prompts for the Intake & Analysis Agent."""

_PROFICIENCY_SCALE = """
Proficiency scale (use exactly these five values):
expert = can teach it / clear advanced evidence (deep ownership, 5+ years, led/architected)
proficient = can perform independently / strong practical evidence (2-5 years, production use)
competent = can perform with some help / moderate evidence (<2 years or one project)
novice = basic exposure (mentioned only in passing, no supporting depth)
absent = not mentioned / no evidence at all
"""
RESUME_EXTRACTION_SYSTEM = f"""
Extract structured candidate information from the supplied resume.

RULES:
- Use only information explicitly supported by the resume.
- Do not invent skills, experience, projects, dates, or achievements.
- Normalize synonymous skill names to canonical names.
- Prefer evidence from professional experience and projects over skill-list mentions.
- Keep skill evidence concise and directly supported by the resume.
- Do not automatically assign expert proficiency based on keyword mentions.

{_PROFICIENCY_SCALE}

EXPERIENCE:
- Include each professional role.
- Include the job title, company, and dates.
- Preserve important responsibilities and achievements as separate entries.
- Retain relevant technologies, implementation details, and measurable results.
- Do not return only job titles.

PROJECTS:
- Include each project separately.
- Preserve its purpose, technical implementation, technologies, and outcomes.
- Do not reduce projects to titles or vague summaries.

EDUCATION:
- Include degrees, institutions, dates, and relevant certifications where available.

Return ONLY a valid JSON object with exactly these fields:
{{
  "name": "candidate full name or null",
  "summary": "one-paragraph professional summary or null",
  "skills": [
    {{
      "skill_name": "canonical skill name",
      "category": "one of: technical, soft, domain, tool",
      "proficiency": "one of the five proficiency values above",
      "evidence": "brief supporting evidence or null"
    }}
  ],
  "experience": [
    "one responsibility or achievement per entry, including role context"
  ],
  "projects": [
    "one complete project description per entry"
  ],
  "education": [
    "one plain string per degree or certification"
  ]
}}
"""
JD_EXTRACTION_SYSTEM = f"""
Extract structured hiring requirements from the supplied job description.

Use only information present in the JD. Normalize synonymous skill names.

IMPORTANT EXTRACTION RULES:
- Extract genuine skills, qualifications, experience requirements and domain knowledge.
- Do not turn technologies that only appear as examples (e.g. "such as ...", "e.g. ...",
  or a parenthetical list of illustrations) into separate mandatory requirements.
- Create one requirement per independent need. If two things are both required
  ("A and B"), they are two separate requirements.
- If options are interchangeable ("A or B", "A or B or C", "one of ..."), create ONE
  requirement: put the first option in skill_name and the remaining options in
  "alternatives". Never create a separate requirement for each alternative.
- For mixed wording such as "A and (B or C)", create one requirement for A and one
  requirement for B with alternatives ["C"].
- Use an empty "alternatives" list when there are no interchangeable options.
- Do not omit independently required skills.
- Keep evidence short and directly supported by the JD.
- Extract responsibilities as concise, separate statements.
- Do not invent requirements, responsibilities, company names or experience levels.

{_PROFICIENCY_SCALE}

required_level MUST be one of the five proficiency values above.

Return one complete, syntactically valid JSON object with EXACTLY these fields:
{{
  "title": "job title or null",
  "company": "company name or null",
  "requirements": [
    {{
      "skill_name": "canonical skill name",
      "category": "one of: technical, soft, domain, tool",
      "required_level": "one of the five proficiency values above",
      "priority": 1,
      "evidence": "short quoted snippet from the JD",
      "alternatives": ["other interchangeable options, or an empty list"]
    }}
  ],
  "responsibilities": ["one plain string per responsibility"],
  "raw_text": ""
}}

priority is an integer 1-5 (5 = explicitly mandatory / must have, 1 = nice-to-have).
Leave raw_text as an empty string — it is filled by the caller.

Ensure every requirement is a complete JSON object.
Close all arrays and objects correctly.
Do not include markdown fences or explanatory text outside the JSON.
"""
GAP_ANALYSIS_SYSTEM = """
Compare the candidate's resume with every requirement in the job description.

SEMANTIC MATCHING:
- Match equivalent skill names and synonyms (e.g. "Postgres" and "PostgreSQL", "React.js" and "React").
- A requirement may list interchangeable options: its skill_name plus its "alternatives".
  Assess ALL of its options and report the single best-evidenced one. The candidate does
  not need every option.
- Return skill_name exactly as written in the requirement's skill_name field.
- Treat each requirement independently; evidence for one requirement does not satisfy another.
- Assess the complete resume, not just its skills section. A requirement can be met by
  practical work that clearly applies it, even when its exact name is not written.

PROFICIENCY LEVELS:
- expert: Repeated deep ownership, architecture, or advanced technical responsibility.
- proficient: Independent practical implementation with concrete evidence.
- competent: Demonstrated practical work in a project.
- novice: Only a skills-list, coursework, or certification mention.
- absent: No supporting resume evidence.

EVIDENCE RULES:
- resume_evidence MUST be copied word for word from the resume: one contiguous excerpt
  of at most 30 words. Do not paraphrase, do not combine separate lines.
  Choose the strongest excerpt (professional experience over projects over a skills list).
- If no excerpt supports the requirement, use resume_claimed_level absent and resume_evidence null.
- Never infer proficiency from keywords alone. Never invent evidence.
- Degree, qualification and certification requirements are either met or not met: use
  proficient when the resume clearly shows it (excerpt the education line), otherwise absent.
- Assess every JD requirement, including requirements with no matching resume evidence.
- Do not omit requirements.
- Provide a concise, actionable suggested_focus only when the candidate's level is below the JD requirement.
- Use null for suggested_focus when the candidate meets or exceeds the requirement.

OUTPUT FORMAT:
Return ONLY valid JSON matching this structure:

{
  "assessments": [
    {
      "skill_name": "canonical skill name from the JD",
      "resume_claimed_level": "absent",
      "resume_evidence": null,
      "suggested_focus": "One concise coaching sentence or null"
    }
  ]
}

STRICT OUTPUT RULES:
- Include exactly one assessment for every JD requirement.
- Use only these proficiency values:
  absent, novice, competent, proficient, expert.
- Do not include overall_match_score.
- Do not include top_gaps or strengths.
- Do not include gap_severity, gap_level, category, or jd_evidence.
- Do not include metadata.
- Do not include markdown fences or explanatory text.
- Ensure all JSON objects and arrays are properly closed.
"""