import math

def get_expected_score(rating_player, rating_opponent):
    """
    Step 1: Compute the expected win probability for each player.
    Formula: E = 1 / (1 + 10^((R_opponent - R_player) / 400))
    """
    exponent = (rating_opponent - rating_player) / 400
    expected_score = 1 / (1 + math.pow(10, exponent))
    return expected_score

def get_new_rating(old_rating, expected_score, actual_score, k=32):
    """
    Step 2: Update each player's rating.
    Formula: R_new = R_old + K * (S - E)
    S: 1.0 for win, 0.5 for draw, 0.0 for loss
    """
    new_rating = old_rating + k * (actual_score - expected_score)
    return round(new_rating)

def calculate_match_results(rating_a_start, rating_b_start, result):
    """
    Calculates updated ratings for both players after match resolution.
    Result options: 'WIN_A', 'WIN_B', 'DRAW'.
    Requirement: Use each player's rating from the start of the match.
    """
    # Mapping outcome to S (actual score)
    if result == 'WIN_A':
        score_a, score_b = 1.0, 0.0
    elif result == 'WIN_B':
        score_a, score_b = 0.0, 1.0
    else:  # DRAW
        score_a, score_b = 0.5, 0.5

    # Compute expected probabilities using starting ratings
    expected_a = get_expected_score(rating_a_start, rating_b_start)
    expected_b = get_expected_score(rating_b_start, rating_a_start)

    # Calculate new ratings independently to avoid sequential bias
    new_rating_a = get_new_rating(rating_a_start, expected_a, score_a)
    new_rating_b = get_new_rating(rating_b_start, expected_b, score_b)

    return new_rating_a, new_rating_b