import math

class TicTacToeEngine:
    def __init__(self, p1_uid, p2_uid):
        self.board = [["" for _ in range(3)] for _ in range(3)]
        self.players = {"X": p1_uid, "O": p2_uid}
        self.current_turn = "X"
        self.winner = None

    def make_move(self, player_uid, row, col):
        # only the active player can move
        if self.players[self.current_turn] != player_uid:
            return False, "Not your turn"

        # bounds + empty check
        if not (0 <= row < 3 and 0 <= col < 3) or self.board[row][col] != "":
            return False, "Invalid move"

        if self.winner:
            return False, "Game already finished"

        self.board[row][col] = self.current_turn
        
        if self._check_win():
            self.winner = self.current_turn
        elif self._is_full():
            self.winner = "DRAW"
        else:
            self.current_turn = "O" if self.current_turn == "X" else "X"
            
        return True, "Move accepted"

    def _check_win(self):
        b = self.board
        s = self.current_turn
        
        for i in range(3):
            if all(b[i][j] == s for j in range(3)) or all(b[j][i] == s for j in range(3)):
                return True
        
        if all(b[i][i] == s for i in range(3)) or all(b[i][2-i] == s for i in range(3)):
            return True
            
        return False

    def _is_full(self):
        return all(cell != "" for row in self.board for cell in row)

    @staticmethod
    def calculate_elo(r_p, r_opp, score, k=32):
        # expected win probability: E = 1 / (1 + 10^((R_opp - R_p) / 400))
        exp = (r_opp - r_p) / 400
        expected = 1 / (1 + math.pow(10, exp))
        
        # new rating: R_new = R_old + K * (S - E)
        new_r = r_p + k * (score - expected)
        return round(new_r)

    def get_match_results(self, r_x_start, r_o_start):
        if self.winner == "X":
            s_x, s_o = 1.0, 0.0
        elif self.winner == "O":
            s_x, s_o = 0.0, 1.0
        else:
            s_x, s_o = 0.5, 0.5
            
        new_r_x = self.calculate_elo(r_x_start, r_o_start, s_x)
        new_r_o = self.calculate_elo(r_o_start, r_x_start, s_o)
        
        return new_r_x, new_r_o

        