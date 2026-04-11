import math

class TicTacToeEngine:
    def __init__(self, p1_uid, p2_uid):
        # Authoritative server-side board
        self.board = [["" for _ in range(3)] for _ in range(3)]
        # Map symbols to UIDs for verification
        self.players = {"X": p1_uid, "O": p2_uid}
        self.current_turn = "X"
        self.winner = None  # None, "X", "O", or "DRAW"

    def make_move(self, player_uid, row, col):
        """
        Validates and executes a move. 
        Returns (success_boolean, message)
        """
        # 1. Anti-cheat: Check if it's the player's turn
        if self.players[self.current_turn] != player_uid:
            return False, "Not your turn"

        # 2. Anti-cheat: Check if target cell is empty
        if not (0 <= row < 3 and 0 <= col < 3) or self.board[row][col] != "":
            return False, "Invalid move"

        if self.winner:
            return False, "Game already finished"

        # 3. Update authoritative state
        self.board[row][col] = self.current_turn
        
        # 4. Check resolution
        if self._check_win():
            self.winner = self.current_turn
        elif self._is_full():
            self.winner = "DRAW"
        else:
            # 5. Switch turn
            self.current_turn = "O" if self.current_turn == "X" else "X"
            
        return True, "Move accepted"

    def _check_win(self):
        """Scans rows, columns, and diagonals for a win"""
        b = self.board
        s = self.current_turn
        
        # Rows and Columns
        for i in range(3):
            if all(b[i][j] == s for j in range(3)) or all(b[j][i] == s for j in range(3)):
                return True
        
        # Diagonals
        if all(b[i][i] == s for i in range(3)) or all(b[i][2-i] == s for i in range(3)):
            return True
            
        return False

    def _is_full(self):
        return all(cell != "" for row in self.board for cell in row)

    @staticmethod
    def calculate_elo(r_player, r_opponent, score, k=32):
        """
        Phase 4: Elo Rating calculation
        r_player: Current player's rating
        r_opponent: Opponent's rating
        score: 1.0 (win), 0.5 (draw), 0.0 (loss)
        """
        # Step 1: Expected win probability
        # Formula: E = 1 / (1 + 10^((R_opp - R_p) / 400))
        exponent = (r_opponent - r_player) / 400
        expected = 1 / (1 + math.pow(10, exponent))
        
        # Step 2: Update rating
        # Formula: R_new = R_old + K * (S - E)
        new_rating = r_player + k * (score - expected)
        return round(new_rating)

    def get_match_results(self, r_x_start, r_o_start):
        """
        Returns updated ratings for both players based on current winner.
        Uses ratings from the START of the match.
        """
        if self.winner == "X":
            s_x, s_o = 1.0, 0.0
        elif self.winner == "O":
            s_x, s_o = 0.0, 1.0
        else:
            s_x, s_o = 0.5, 0.5
            
        new_r_x = self.calculate_elo(r_x_start, r_o_start, s_x)
        new_r_o = self.calculate_elo(r_o_start, r_x_start, s_o)
        
        return new_r_x, new_r_o