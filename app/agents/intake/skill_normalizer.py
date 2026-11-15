"""Canonical skill normalization and conservative alias matching."""

import re
import unicodedata


# Canonical skill name -> accepted aliases.
# Keep aliases conservative: related technologies are not interchangeable.
SKILL_ALIASES = {
    # Programming languages
    "javascript": {"js", "javascript"},
    "typescript": {"ts", "typescript"},
    "csharp": {"c#", "csharp", "c sharp"},
    "cplusplus": {"c++", "cplusplus", "cpp"},

    # Databases
    "postgresql": {"postgresql", "postgres"},
    "mongodb": {"mongodb", "mongo"},

    # Frontend
    "react": {"react", "react.js", "reactjs"},
    "vue": {"vue", "vue.js", "vuejs"},
    "angular": {"angular", "angular.js", "angularjs"},

    # Backend
    "node.js": {"node.js", "nodejs"},
    "express.js": {"express", "express.js", "expressjs"},

    # Cloud
    "aws": {"aws", "amazon web services"},
    "azure": {"azure", "microsoft azure"},
    "gcp": {"gcp", "google cloud platform"},

    # DevOps
    "kubernetes": {"kubernetes", "k8s"},
    "continuousintegrationcontinuousdelivery": {
        "ci/cd",
        "continuous integration",
        "continuous delivery",
        "continuous integration and continuous delivery",
        "continuous integration/continuous delivery",
    },

    # AI / ML
    "pytorch": {"pytorch", "torch"},
    "tensorflow": {"tensorflow", "tf"},
}


def normalize_skill_name(name: str) -> str:
    """Normalize a skill name without applying semantic assumptions."""

    normalized = unicodedata.normalize("NFKC", name).casefold()
    return re.sub(r"[^a-z0-9]+", "", normalized)


_ALIAS_LOOKUP = {
    normalize_skill_name(alias): canonical
    for canonical, aliases in SKILL_ALIASES.items()
    for alias in aliases
}


def canonical_skill_name(name: str) -> str:
    """Resolve known aliases; preserve unknown skills through normalization."""

    normalized = normalize_skill_name(name)
    return _ALIAS_LOOKUP.get(normalized, normalized)


def skill_names_match(first: str, second: str) -> bool:
    """Check exact or known-alias equivalence."""

    return canonical_skill_name(first) == canonical_skill_name(second)
