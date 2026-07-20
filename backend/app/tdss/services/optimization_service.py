"""Selects the best feasible alternative from a scored candidate set.

Current implementation: rank feasible alternatives by total_score
descending (ties broken by lower cost, then lower time) and take rank 1 as
the recommended alternative. This is intentionally a thin, swappable layer
— a future round can replace `rank_alternatives` with a real vehicle-routing
/ combinatorial optimizer without touching the rule engine, scoring, or the
API contract (callers only depend on `rank`, `total_score`, and `feasible`
being present on each alternative dict).
"""


def rank_alternatives(scored: list[dict]) -> list[dict]:
    """scored: list of dicts each containing at least
    {feasible, total_score, raw_values: {cost, time, ...}}.
    Mutates and returns the list with `rank` set (None for infeasible)."""
    feasible = [a for a in scored if a["feasible"]]
    infeasible = [a for a in scored if not a["feasible"]]

    feasible.sort(key=lambda a: (-a["total_score"], a["raw_values"]["cost"], a["raw_values"]["time"]))
    for i, alt in enumerate(feasible):
        alt["rank"] = i + 1
    for alt in infeasible:
        alt["rank"] = None

    return feasible + infeasible


def best_alternative(ranked: list[dict]) -> dict | None:
    for alt in ranked:
        if alt["rank"] == 1:
            return alt
    return None
