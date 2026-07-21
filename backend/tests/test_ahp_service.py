import pytest

from app.tdss.models import CRITERIA
from app.tdss.services.ahp_service import (
    build_matrix,
    calculate_weights,
    default_consistent_pairwise,
    pair_key,
    upper_triangle_pairs,
)


def test_equal_importance_gives_equal_weights():
    pairwise = {pair_key(a, b): 1.0 for a, b in upper_triangle_pairs()}

    matrix = build_matrix(pairwise)
    result = calculate_weights(matrix)

    for w in result["weights"].values():
        assert abs(w - 1 / 6) < 1e-6
    assert result["cr"] < 1e-6
    assert result["is_consistent"] is True


def test_seeded_default_profile_is_consistent():
    pairwise = default_consistent_pairwise()
    matrix = build_matrix(pairwise)
    result = calculate_weights(matrix)

    assert result["is_consistent"] is True
    assert result["cr"] <= 0.10
    assert abs(sum(result["weights"].values()) - 1.0) < 1e-6
    # cost was rank 0 (most important) in default_consistent_pairwise
    assert result["weights"]["cost"] == max(result["weights"].values())


def test_inconsistent_matrix_detected():
    # Deliberately intransitive: cost >> time, time >> co2, but co2 >> cost
    pairwise = {pair_key(a, b): 1.0 for a, b in upper_triangle_pairs()}
    pairwise[pair_key("cost", "time")] = 9.0
    pairwise[pair_key("time", "co2")] = 9.0
    pairwise[pair_key("cost", "co2")] = 1 / 9

    matrix = build_matrix(pairwise)
    result = calculate_weights(matrix)

    assert result["cr"] > 0.10
    assert result["is_consistent"] is False


def test_missing_pair_raises():
    with pytest.raises(ValueError):
        build_matrix({})


def test_eigenvector_recovers_exact_consistent_weights():
    """Hand-verifiable ground truth for the Principal Eigenvector method:
    build a matrix directly from a chosen target weight vector
    w = [3, 2, 1, 1, 1, 1] (unnormalized) via pairwise[a,b] = w[a]/w[b].
    For any such matrix, A @ w == n * w exactly (by construction:
    (A w)_i = sum_j (w_i/w_j) * w_j = sum_j w_i = n * w_i), so w/sum(w) IS
    the principal eigenvector with eigenvalue n — provable by hand,
    independent of numpy's internal algorithm. This also makes the matrix
    perfectly consistent: lambda_max = n exactly, so CI = CR = 0.
    """
    target = {"cost": 3.0, "time": 2.0, "utilization": 1.0, "reliability": 1.0, "co2": 1.0, "suitability": 1.0}
    pairwise = {pair_key(a, b): target[a] / target[b] for a, b in upper_triangle_pairs()}

    matrix = build_matrix(pairwise)
    result = calculate_weights(matrix)
    w = result["weights"]

    total = sum(target.values())  # 9
    for criterion, value in target.items():
        assert abs(w[criterion] - value / total) < 1e-6
    assert abs(result["lambda_max"] - 6.0) < 1e-6
    assert result["ci"] < 1e-6
    assert result["cr"] < 1e-6
    assert result["is_consistent"] is True


def _normalized_column_average_weights(matrix: list[list[float]]) -> dict[str, float]:
    """Reference implementation of the method calculate_weights() used
    *before* switching to the exact Principal Eigenvector method — kept
    only here, as an independent point of comparison for the test below,
    not used anywhere in production code."""
    import numpy as np

    m = np.array(matrix, dtype=float)
    col_sums = m.sum(axis=0)
    normalized = m / col_sums
    weights = normalized.mean(axis=1)
    return {CRITERIA[i]: float(weights[i]) for i in range(len(CRITERIA))}


def test_eigenvector_close_to_previous_column_average_method_for_near_consistent_matrix():
    """Documents the expected before/after relationship when switching
    calculate_weights() from normalized-column-average to the exact
    Principal Eigenvector method: for a matrix that is only slightly
    inconsistent (one pair perturbed from 1), the two methods should
    produce nearly identical weights — they provably coincide exactly for
    perfectly consistent matrices, and this case is close to that limit.
    """
    pairwise = {pair_key(a, b): 1.0 for a, b in upper_triangle_pairs()}
    pairwise[pair_key("cost", "time")] = 3.0
    matrix = build_matrix(pairwise)

    new_weights = calculate_weights(matrix)["weights"]
    old_weights = _normalized_column_average_weights(matrix)

    for criterion in new_weights:
        assert abs(new_weights[criterion] - old_weights[criterion]) < 0.01
    # But not literally the same computation - the two methods are free to
    # differ at higher precision even though they agree closely here.
    assert new_weights != old_weights
