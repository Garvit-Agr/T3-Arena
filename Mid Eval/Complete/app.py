import os
import base64
import uuid
import asyncio
import urllib.parse
import pymongo
import uvicorn
from datetime import datetime

from fastapi import FastAPI, Request, Depends, WebSocket
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from dotenv import load_dotenv

# SQLAlchemy components
from sqlalchemy import create_engine, Column, Integer, String, Boolean, ForeignKey, DateTime, or_
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# Local project modules
import facial_recognition_module
from engine import TicTacToeEngine

load_dotenv()

# --- STANDALONE DATABASE CONFIGURATION ---
# We use the same encoding logic to handle your @ password
raw_password = os.getenv('DB_PASSWORD', '')
encoded_password = urllib.parse.quote(raw_password)

DB_URL = f"mysql+mysqlconnector://{os.getenv('DB_USER')}:{encoded_password}@{os.getenv('DB_HOST', 'localhost')}/{os.getenv('DB_NAME', 'arena_db')}"

# Configuration matching the project statement requirements
engine = create_engine(DB_URL, pool_size=5, max_overflow=10)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- STANDALONE MODELS (Independent Copy) ---
class User(Base):
    __tablename__ = "users"
    uid = Column(String(50), primary_key=True)
    name = Column(String(100))
    elo_rating = Column(Integer, default=1200)
    is_online = Column(Boolean, default=False)
    is_fighting = Column(Boolean, default=False)

class MatchHistory(Base):
    __tablename__ = "match_history"
    id = Column(Integer, primary_key=True, autoincrement=True)
    player1_uid = Column(String(50), ForeignKey("users.uid"))
    player2_uid = Column(String(50), ForeignKey("users.uid"))
    winner_uid = Column(String(50), ForeignKey("users.uid"), nullable=True)
    player1_elo_before = Column(Integer)
    player2_elo_before = Column(Integer)
    player1_elo_after = Column(Integer)
    player2_elo_after = Column(Integer)
    forfeit = Column(Boolean, default=False)
    played_at = Column(DateTime, default=datetime.now)

# Safety check: SQLAlchemy creates only missing tables
Base.metadata.create_all(bind=engine)

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- APP INITIALIZATION ---
app = FastAPI()
app.mount("/Frontend", StaticFiles(directory="Frontend"), name="frontend")
app.add_middleware(SessionMiddleware, secret_key=os.getenv("SESSION_SECRET", "super-secret-key"))
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Tighten this for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- UTILITY FUNCTIONS ---
def get_mg_imgs():
    """Fetches profile images from MongoDB for facial recognition."""
    db_dt = {}
    try:
        cn = pymongo.MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017"))
        col = cn[os.getenv("DB_NAME", "arena_db")]["profile_images"]
        for doc in col.find({}):
            uid, b64_img = doc.get("uid"), doc.get("image_data")
            if uid and b64_img:
                db_dt[uid] = base64.b64decode(b64_img)
        cn.close()
    except Exception as e:
        print(f"Mongo load error: {e}")
    return db_dt

def get_player_data(db: Session, include_rank: bool = False):
    """Refactored logic to fetch leaderboard data via SQLAlchemy."""
    users = db.query(User).order_by(User.elo_rating.desc()).all()
    results = []
    
    for i, u in enumerate(users):
        # Query match counts using the relationship logic
        total = db.query(MatchHistory).filter(or_(MatchHistory.player1_uid == u.uid, MatchHistory.player2_uid == u.uid)).count()
        wins = db.query(MatchHistory).filter(MatchHistory.winner_uid == u.uid).count()
        
        win_rate = round(wins / total * 100, 1) if total > 0 else 0.0
        status = "fighting" if u.is_fighting else "online" if u.is_online else "offline"

        entry = {"uid": u.uid, "name": u.name, "elo_rating": u.elo_rating, "winrate": win_rate, "status": status}
        if include_rank:
            entry['rank'] = i + 1
        results.append(entry)
    return results

# --- API ROUTES ---

@app.post('/login')
async def handle_login(req: Request, db: Session = Depends(get_db)):
    data = await req.json()
    b64_img = data.get('image')
    if not b64_img:
        return JSONResponse(status_code=400, content={"success": False, "message": "No image"})

    cln_img = b64_img.split(',')[1] if ',' in b64_img else b64_img
    mg_db = await asyncio.to_thread(get_mg_imgs)
    m_uid = await asyncio.to_thread(facial_recognition_module.find_closest_match, cln_img, mg_db)
    
    if not m_uid:
        return JSONResponse(status_code=401, content={"success": False, "message": "Face not recognized"})

    user = db.query(User).filter(User.uid == m_uid).first()
    if not user:
        return JSONResponse(status_code=404, content={"success": False, "message": "User not in MySQL"})

    user.is_online = True
    db.commit()

    req.session['uid'], req.session['name'] = user.uid, user.name
    await lobby_mgr.broadcast({"type": "presence", "uid": user.uid, "status": "online"})
    
    return {"success": True, "uid": user.uid, "name": user.name, "elo_rating": user.elo_rating}

@app.post('/logout')
async def logout(req: Request, db: Session = Depends(get_db)):
    data = await req.json()
    uid = data.get('uid') or req.session.get('uid')
    
    if uid:
        user = db.query(User).filter(User.uid == uid).first()
        if user:
            user.is_online = False
            db.commit()
            await lobby_mgr.broadcast({"type": "presence", "uid": uid, "status": "offline"})
            
    if str(uid) == str(req.session.get('uid')):
        req.session.clear()
    return {"success": True}

@app.get('/api/players')
def get_players(db: Session = Depends(get_db)):
    return {"players": get_player_data(db)}

@app.get('/api/leaderboard')
def get_leaderboard(db: Session = Depends(get_db)):
    return {"players": get_player_data(db, include_rank=True)}

@app.get('/api/match-history/{uid}')
def get_match_history(uid: str, db: Session = Depends(get_db)):
    # 1. Fetch matches where the user was either Player 1 or Player 2
    # Ordered by most recent first
    matches = db.query(MatchHistory).filter(
        or_(MatchHistory.player1_uid == uid, MatchHistory.player2_uid == uid)
    ).order_by(MatchHistory.played_at.desc()).all()

    results = []
    for m in matches:
        # 2. Identify the opponent to fetch their name for the UI
        opp_uid = m.player2_uid if m.player1_uid == uid else m.player1_uid
        opp_user = db.query(User).filter(User.uid == opp_uid).first()
        opp_name = opp_user.name if opp_user else "Unknown Operator"

        # 3. Format payload to match what combat_logs.js expectations
        results.append({
            "played_at": m.played_at.strftime("%Y-%m-%d %H:%M:%S"), 
            "winner_uid": m.winner_uid,
            "player1_uid": m.player1_uid,
            "player2_uid": m.player2_uid,
            "p1_name": "YOU" if m.player1_uid == uid else opp_name,
            "p2_name": "YOU" if m.player2_uid == uid else opp_name,
            "player1_elo_before": m.player1_elo_before,
            "player1_elo_after": m.player1_elo_after,
            "player2_elo_before": m.player2_elo_before,
            "player2_elo_after": m.player2_elo_after,
            "forfeit": m.forfeit
        })

    return {"matches": results, "current_user_id": uid}

@app.get('/api/match_init/{rid}/{uid}')
def init_match(rid: str, uid: str, db: Session = Depends(get_db)):
    # 1. Ensure the room exists in active memory
    room = game_mgr.rooms.get(rid)
    if not room:
        return JSONResponse(status_code=404, content={"error": "Match room not found on server."})

    # 2. Identify the opponent's UID
    players = room["players"]
    opp_uid = players[0] if players[1] == uid else players[1]

    # 3. Fetch both users from the database
    my_user = db.query(User).filter(User.uid == uid).first()
    opp_user = db.query(User).filter(User.uid == opp_uid).first()

    # Helper function to calculate win rate on the fly
    def calc_winrate(user_id):
        total = db.query(MatchHistory).filter(or_(MatchHistory.player1_uid == user_id, MatchHistory.player2_uid == user_id)).count()
        wins = db.query(MatchHistory).filter(MatchHistory.winner_uid == user_id).count()
        return round((wins / total) * 100, 1) if total > 0 else 0.0

    # 4. Return the exact payload the frontend expects
    return {
        "opponent_name": opp_user.name if opp_user else f"OPERATOR {opp_uid}",
        "opponent_elo": opp_user.elo_rating if opp_user else 1200,
        "opponent_winrate": calc_winrate(opp_uid),
        "opponent_region": "GLOBAL", # Hardcoded placeholder for UI
        "my_winrate": calc_winrate(uid),
        "my_streak": "-"             # Hardcoded placeholder for UI
    }

# --- WEBSOCKET MANAGERS ---

class LobbyManager:
    def __init__(self):
        self.connections: dict[str, WebSocket] = {}

    async def connect(self, uid: str, ws: WebSocket):
        await ws.accept()
        self.connections[uid] = ws

    async def handle_disconnect(self, uid: str):
        self.connections.pop(uid, None)
        await asyncio.sleep(2.0)
        if uid not in self.connections:
            with SessionLocal() as db:
                user = db.query(User).filter(User.uid == uid).first()
                if user:
                    user.is_online = False
                    db.commit()
            await self.broadcast({"type": "presence", "uid": uid, "status": "offline"})

    async def broadcast(self, message: dict):
        for ws in list(self.connections.values()):
            try:
                await ws.send_json(message)
            except:
                pass

    async def send_to(self, uid: str, message: dict):
        if uid in self.connections:
            try:
                await self.connections[uid].send_json(message)
            except:
                self.connections.pop(uid, None)

class GameRoomManager:
    def __init__(self):
        self.rooms: dict[str, dict] = {}

    def create_room(self, uid_x: str, uid_o: str, r_x: int, r_o: int) -> str:
        rid = str(uuid.uuid4())
        self.rooms[rid] = {
            "engine": TicTacToeEngine(uid_x, uid_o),
            "connections": {},
            "ratings": {uid_x: r_x, uid_o: r_o},
            "players": [uid_x, uid_o]
        }
        return rid

    async def connect(self, rid: str, uid: str, ws: WebSocket):
        await ws.accept()
        if rid in self.rooms:
            self.rooms[rid]["connections"][uid] = ws
            return True
        return False

    async def broadcast_room(self, rid: str, msg: dict):
        if rid in self.rooms:
            for ws in list(self.rooms[rid]["connections"].values()):
                try:
                    await ws.send_json(msg)
                except:
                    pass

lobby_mgr = LobbyManager()
game_mgr = GameRoomManager()
pending_challenges = {}

async def finalize_match(rid: str, forfeit_winner: str = None):
    room = game_mgr.rooms.get(rid)
    if not room: return
    
    eng, uid_x, uid_o = room["engine"], room["players"][0], room["players"][1]
    
    with SessionLocal() as db:
        ux, uo = db.query(User).filter(User.uid == uid_x).first(), db.query(User).filter(User.uid == uid_o).first()
        
        if forfeit_winner:
            eng.winner = "X" if uid_x == forfeit_winner else "O"
            
        rx_new, ro_new = eng.get_match_results(ux.elo_rating, uo.elo_rating)
        win_uid = eng.players[eng.winner] if eng.winner in ["X", "O"] else None
        
        # Persistence
        match = MatchHistory(
            player1_uid=uid_x, player2_uid=uid_o, winner_uid=win_uid,
            player1_elo_before=ux.elo_rating, player2_elo_before=uo.elo_rating,
            player1_elo_after=rx_new, player2_elo_after=ro_new,
            forfeit=(forfeit_winner is not None)
        )
        ux.elo_rating, uo.elo_rating = rx_new, ro_new
        ux.is_fighting = uo.is_fighting = False
        db.add(match)
        db.commit()

        await game_mgr.broadcast_room(rid, {
            "type": "game_over",
            "winner": eng.winner,
            "new_ratings": {uid_x: rx_new, uid_o: ro_new}
        })
    game_mgr.rooms.pop(rid, None)

# --- WEBSOCKET ENDPOINTS ---

@app.websocket("/ws/lobby/{uid}")
async def ws_lobby(ws: WebSocket, uid: str):
    await lobby_mgr.connect(uid, ws)
    with SessionLocal() as db:
        u = db.query(User).filter(User.uid == uid).first()
        if u:
            u.is_online = True
            db.commit()
    await lobby_mgr.broadcast({"type": "presence", "uid": uid, "status": "online"})

    try:
        while True:
            msg = await ws.receive_json()
            mtype = msg.get("type")

            if mtype == "challenge":
                target = msg.get("target_uid")
                pending_challenges[uid] = target
                
                # --- NEW STAT FETCHING LOGIC ---
                with SessionLocal() as db:
                    challenger = db.query(User).filter(User.uid == uid).first()
                    c_name = challenger.name if challenger else f"OPERATOR {uid}"
                    c_elo = challenger.elo_rating if challenger else 1200
                    
                    # Calculate win rate on the fly
                    total = db.query(MatchHistory).filter(or_(MatchHistory.player1_uid == uid, MatchHistory.player2_uid == uid)).count()
                    wins = db.query(MatchHistory).filter(MatchHistory.winner_uid == uid).count()
                    c_winrate = round((wins / total) * 100, 1) if total > 0 else 0.0

                # Add the stats to the broadcast payload
                await lobby_mgr.send_to(target, {
                    "type": "challenge_received", 
                    "from_uid": uid,
                    "challenger_name": c_name,
                    "challenger_elo": c_elo,
                    "challenger_winrate": c_winrate
                })

            elif mtype == "challenge_response":
                challenger, accepted = msg.get("from_uid"), msg.get("accepted")
                if accepted and pending_challenges.get(challenger) == uid:
                    with SessionLocal() as db:
                        u1, u2 = db.query(User).filter(User.uid == challenger).first(), db.query(User).filter(User.uid == uid).first()
                        u1.is_fighting = u2.is_fighting = True
                        db.commit()
                        rid = game_mgr.create_room(challenger, uid, u1.elo_rating, u2.elo_rating)
                    
                    await lobby_mgr.send_to(challenger, {"type": "match_start", "room_id": rid, "symbol": "X", "opponent_uid": uid})
                    await lobby_mgr.send_to(uid, {"type": "match_start", "room_id": rid, "symbol": "O", "opponent_uid": challenger})
                elif not accepted:
                    # FIX: If declined, explicitly notify the challenger so their UI can reset
                    await lobby_mgr.send_to(challenger, {"type": "challenge_declined"})
                    
                pending_challenges.pop(challenger, None)
                
            # FIX: Handle the sender hitting "Dismiss" before the target answers
            elif mtype == "cancel_challenge":
                target = msg.get("target_uid")
                if pending_challenges.get(uid) == target:
                    pending_challenges.pop(uid, None)
                    # Notify the target to close their incoming challenge modal
                    await lobby_mgr.send_to(target, {"type": "challenge_cancelled"})
    except:
        await lobby_mgr.handle_disconnect(uid)

@app.websocket("/ws/game/{rid}/{uid}")
async def ws_game(ws: WebSocket, rid: str, uid: str):
    if not await game_mgr.connect(rid, uid, ws):
        return await ws.close(code=4004)

    room = game_mgr.rooms[rid]
    eng = room["engine"]

    await ws.send_json({
        "type": "board_state", 
        "board": eng.board, 
        "turn": eng.current_turn,
        "current_turn": eng.current_turn 
    })

    try:
        while True:
            data = await ws.receive_json()
            mtype = data.get("type")
            
            if mtype == "move":
                success, _ = eng.make_move(uid, data.get("row"), data.get("col"))
                if success:
                    await game_mgr.broadcast_room(rid, {
                        "type": "board_update", 
                        "board": eng.board, 
                        "turn": eng.current_turn,
                        "current_turn": eng.current_turn
                    })
                    if eng.winner:
                        await finalize_match(rid)
            
            elif mtype == "resign":
                other_uid = [p for p in room["players"] if p != uid][0]
                await finalize_match(rid, forfeit_winner=other_uid)
                
                    
    except Exception as e:
        print(f"WebSocket Game Error: {e}") # This will now print the exact crash reason!
        if rid in game_mgr.rooms and not eng.winner:
            other = [p for p in room["players"] if p != uid][0]
            try:
                await finalize_match(rid, forfeit_winner=other)
            except Exception as inner_e:
                print(f"Finalize match crashed on disconnect: {inner_e}")

if __name__ == '__main__':
    uvicorn.run("app:app", host="127.0.0.1", port=5001, reload=True)