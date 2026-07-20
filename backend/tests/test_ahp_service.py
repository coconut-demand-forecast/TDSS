import pytest

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


def test_single_pair_weights_match_hand_calculation():
    """Only cost-vs-time differs from 1 (cost is 3x more important than
    time); every other pair is tied. This keeps the arithmetic small enough
    to verify by hand against the documented normalized-column-average
    method (see ahp_service module docstring):

    Column sums: cost=1+1/3+1+1+1+1=16/3, time=3+1+1+1+1+1=8, others=6.
    Normalized row averages (exact fractions, denominator 288):
      cost = (3/16 + 3/8 + 4*(1/6)) / 6 = (9+18+32)/288 = 59/288
      time = (1/16 + 1/8 + 4*(1/6)) / 6 = (3+6+32)/288  = 41/288
      each of {utilization,reliability,co2,suitability}
           = (3/16 + 1/8 + 4*(1/6)) / 6 = (9+6+32)/288  = 47/288
    Sanity check: 59+41+47*4 = 288 -> weights sum to exactly 1.
    """
    pairwise = {pair_key(a, b): 1.0 for a, b in upper_triangle_pairs()}
    pairwise[pair_key("cost", "time")] = 3.0

    matrix = build_matrix(pairwise)
    result = calculate_weights(matrix)
    w = result["weights"]

    assert abs(w["cost"] - 59 / 288) < 1e-6
    assert abs(w["time"] - 41 / 288) < 1e-6
    for c in ("utilization", "reliability", "co2", "suitability"):
        assert abs(w[c] - 47 / 288) < 1e-6
    assert abs(sum(w.values()) - 1.0) < 1e-4  # calculate_weights rounds each weight to 6dp
