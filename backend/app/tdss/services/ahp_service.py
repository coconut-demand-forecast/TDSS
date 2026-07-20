"""Analytic Hierarchy Process (Saaty) for TDSS Decision Profiles.

Six fixed criteria (app.tdss.models.CRITERIA): cost, time, utilization,
reliability, co2, suitability. The pairwise comparison matrix is built from
the upper-triangle comparisons only (15 pairs for 6 criteria); the lower
triangle is always the reciprocal, and the diagonal is always 1 — this is
what makes the matrix a valid Saaty reciprocal matrix by construction.

Weight calculation uses the normalized-column-average method (a standard,
easily-documented approximation to the principal eigenvector — exact for
consistent matrices, and simple enough to unit-test deterministically):

  1. Normalize each column of the matrix (divide by its column sum).
  2. The weight for each criterion is the average of its row in the
     normalized matrix. Weights sum to 1 by construction.
  3. lambda_max = mean_i( (matrix @ weights)_i / weights_i )
  4. CI = (lambda_max - n) / (n - 1)
  5. CR = CI / RI[n]   (RI = Saaty's Random Index table)
  6. Consistent when CR <= 0.10 (Saaty's standard threshold).
"""

import numpy as np

from app.tdss.models import CRITERIA, RANDOM_INDEX

N = len(CRITERIA)


def pair_key(a: str, b: str) -> str:
    return f"{a}__{b}"


def upper_triangle_pairs() -> list[tuple[str, str]]:
    return [(CRITERIA[i], CRITERIA[j]) for i in range(N) for j in range(i + 1, N)]


def build_matrix(pairwise: dict[str, float]) -> list[list[float]]:
    """pairwise maps "a__b" (a before b in CRITERIA order) -> Saaty value
    in [1/9, 9] meaning how many times more important `a` is than `b`
    (a value < 1 means `b` is more important)."""
    matrix = [[1.0] * N for _ in range(N)]
    for a, b in upper_triangle_pairs():
        key = pair_key(a, b)
        if key not in pairwise:
            raise ValueError(f"Missing pairwise comparison for {key}")
        value = float(pairwise[key])
        if not (1 / 9 - 1e-9 <= value <= 9 + 1e-9):
            raise ValueError(f"Pairwise value for {key} must be between 1/9 and 9 (Saaty scale)")
        i, j = CRITERIA.index(a), CRITERIA.index(b)
        matrix[i][j] = value
        matrix[j][i] = 1.0 / value
    return matrix


def calculate_weights(matrix: list[list[float]]) -> dict:
    m = np.array(matrix, dtype=float)
    col_sums = m.sum(axis=0)
    normalized = m / col_sums
    weights = normalized.mean(axis=1)

    weighted_sum = m @ weights
    lambda_max = float(np.mean(weighted_sum / weights))

    ci = (lambda_max - N) / (N - 1) if N > 1 else 0.0
    ri = RANDOM_INDEX.get(N, 1.49)
    cr = (ci / ri) if ri > 0 else 0.0
    is_consistent = cr <= 0.10

    return {
        "weights": {CRITERIA[i]: round(float(weights[i]), 6) for i in range(N)},
        "lambda_max": round(lambda_max, 6),
        "ci": round(ci, 6),
        "cr": round(cr, 6),
        "is_consistent": bool(is_consistent),
    }


def default_consistent_pairwise() -> dict[str, float]:
    """A seeded, guaranteed-consistent pairwise set (cost > time > co2 >
    suitability > reliability > utilization, moderate spread) — used for the
    seeded demo Decision Profile so the system has at least one valid,
    usable profile out of the box."""
    order = ["cost", "time", "co2", "suitability", "reliability", "utilization"]
    rank = {c: i for i, c in enumerate(order)}
    # Perfectly consistent matrix: value(a,b) = intensity(rank[b]-rank[a])
    # using a fixed geometric step, which is transitive by construction (CR=0).
    step = 1.5
    pairwise = {}
    for a, b in upper_triangle_pairs():
        diff = rank[b] - rank[a]
        value = step**diff
        value = max(1 / 9, min(9, value))
        pairwise[pair_key(a, b)] = round(value, 4)
    return pairwise
