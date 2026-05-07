import os
import base64
import uuid
import asyncio
import urllib.parse
import pymongo
import uvicorn
from datetime import datetime

from fastapi import FastAPI, Request, Depends, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from dotenv import load_dotenv

from sqlalchemy import create_engine, Column, Integer, String, Boolean, ForeignKey, DateTime, or_, func
from sqlalchemy.orm import declarative_base, sessionmaker, Session
import bcrypt

import facial_recognition_module
from engine import TicTacToeEngine

load_dotenv()

raw_password = os.getenv('DB_PASSWORD', '')
encoded_password = urllib.parse.quote(raw_password)

# Updated for Supabase (PostgreSQL)
DB_URL = f"postgresql+psycopg2://{os.getenv('DB_USER')}:{encoded_password}@{os.getenv('DB_HOST')}:5432/{os.getenv('DB_NAME', 'postgres')}"

engine = create_engine(DB_URL, pool_size=5, max_overflow=10)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    uid = Column(String(50), primary_key=True)
    name = Column(String(100))
    
    # --- NEW SECURITY & LRU COLUMNS ---
    password_hash = Column(String(255), nullable=True) 
    biometrics_active = Column(Boolean, default=True)  
    last_active = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    # ----------------------------------
    
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

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# preloaded face encodings so login comparisons are instant
enc_cache = {}

app = FastAPI()

def get_mg_imgs():
    """Fetches all stored facial encodings from MongoDB on startup"""
    try:
        cn = pymongo.MongoClient(os.getenv("MONGO_URI"))
        col = cn[os.getenv("DB_NAME_MONGO", "arena_db")]["profile_images"]
        
        # Fetch the documents from MongoDB
        docs = col.find({}, {"_id": 0, "uid": 1, "image_data": 1})
        
        # FIX: Clean the Base64 strings by stripping the prefix (if it exists)
        img_dict = {}
        for doc in docs:
            raw_b64 = doc["image_data"]
            # Strip 'data:image/jpeg;base64,' so the AI module gets raw bytes
            clean_b64 = raw_b64.split(',')[1] if ',' in raw_b64 else raw_b64
            img_dict[doc["uid"]] = clean_b64
        
        cn.close()
        return img_dict
        
    except Exception as e:
        print(f"Error fetching from MongoDB: {e}")
        return {}
@app.on_event("startup")
def load_encodings():
    global enc_cache
    print("Building facial encodings cache...")
    mg_db = get_mg_imgs()
    enc_cache = facial_recognition_module.build_encodings_cache(mg_db)


@app.get('/health')
async def health_check():
    """
    Keep-alive endpoint for cron jobs (e.g., cron-job.org).
    This ensures the Hugging Face Space doesn't spin down, 
    without hitting the databases and messing up our LRU timestamps.
    """
    return {
        "status": "alive", 
        "timestamp": datetime.now().isoformat()
    }

app.mount("/Frontend", StaticFiles(directory="Frontend"), name="frontend")
app.add_middleware(SessionMiddleware, secret_key=os.getenv("SESSION_SECRET", "super-secret-key"))

origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:5001,http://127.0.0.1:5001")
allowed_origins = [origin.strip() for origin in origins_env.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# pulls all face images from mongo for comparison

# --- STORAGE LRU CONFIGURATION ---
MAX_BIOMETRICS_CAP = 400

def manage_biometric_storage(db: Session):
    """
    Storage LRU Logic: Protects MongoDB Atlas free tier.
    Checks if the number of stored faces exceeds the cap. If it does, 
    it evicts the least recently active user from MongoDB and updates their Supabase record.
    """
    try:
        cn = pymongo.MongoClient(os.getenv("MONGO_URI"))
        col = cn[os.getenv("DB_NAME_MONGO", "arena_db")]["profile_images"]
        
        # 1. Count current documents in MongoDB
        current_count = col.count_documents({})
        
        # 2. Check against the cap
        if current_count > MAX_BIOMETRICS_CAP:
            # 3. Query Supabase for the LRU user (oldest last_active timestamp)
            oldest_user = db.query(User).filter(User.biometrics_active == True).order_by(User.last_active.asc()).first()
            
            if oldest_user:
                print(f"[LRU Engine] Cap exceeded ({current_count}/{MAX_BIOMETRICS_CAP}). Evicting biometrics for UID: {oldest_user.uid}")
                
                # 4. Delete the physical image data from MongoDB
                col.delete_one({"uid": oldest_user.uid})
                
                # 5. Flag the user in Supabase so they fall back to password login
                oldest_user.biometrics_active = False
                db.commit()
                
                # 6. Synchronize RAM cache (We will implement this function in Phase 3.2)
                sync_ram_cache(oldest_user.uid, remove=True)
                
        cn.close()
    except Exception as e:
        print(f"[LRU Engine Error]: {e}")

def sync_ram_cache(uid: str, b64_img: str = None, remove: bool = False):
    """
    Dynamically updates the in-memory facial encodings cache.
    Always removes the existing entry to ensure the old face is purged.
    """
    global enc_cache
    
    # --- FIX: Immediately purge the old face from RAM to prevent ghost matches ---
    if uid in enc_cache:
        del enc_cache[uid]
        print(f"[Cache Sync] Purged existing encoding for UID: {uid}")
        
    if remove:
        return True # Successfully removed
        
    if b64_img:
        # Strip data URI scheme if present
        cln_img = b64_img.split(',')[1] if ',' in b64_img else b64_img
        
        # Calculate new encoding
        new_enc = facial_recognition_module.get_face_encoding(cln_img)
        
        if new_enc is not None:
            enc_cache[uid] = new_enc
            print(f"[Cache Sync] Added new encoding for UID: {uid}")
            return True # Successfully updated
        else:
            print(f"[Cache Sync Error] No face detected in the update image for UID: {uid}")
            return False # Failed to find a face
    return False
@app.post('/signup')
async def handle_signup(req: Request, db: Session = Depends(get_db)):
    """
    Registers a new user. 
    Saves to Supabase (PostgreSQL), MongoDB Atlas (Image), updates RAM, and triggers LRU.
    """
    data = await req.json()
    uid = data.get('uid')
    name = data.get('name')
    password = data.get('password')
    b64_img = data.get('image')

    # 1. Validate Payload
    if not all([uid, name, password, b64_img]):
        return JSONResponse(status_code=400, content={"success": False, "message": "Missing required fields."})

    # 2. Check for existing user in Supabase
    existing_user = db.query(User).filter(User.uid == uid).first()
    if existing_user:
        return JSONResponse(status_code=400, content={"success": False, "message": "User ID already registered."})

    try:
        # 3. Secure the password
        hashed_pw = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        # 4. Create the Supabase Record
        # last_active is automatically set to now() by our model definition
        new_user = User(
            uid=uid,
            name=name,
            password_hash=hashed_pw,
            biometrics_active=True,
            elo_rating=1200,
            is_online=False,
            is_fighting=False
        )
        db.add(new_user)
        db.commit()

        # 5. Save the image to MongoDB Atlas
        cn = pymongo.MongoClient(os.getenv("MONGO_URI"))
        col = cn[os.getenv("DB_NAME_MONGO", "arena_db")]["profile_images"]
        col.update_one(
            {"uid": uid},
            {"$set": {"uid": uid, "image_data": b64_img}},
            upsert=True
        )
        cn.close()

        # 6. Synchronize RAM Cache dynamically
        await asyncio.to_thread(sync_ram_cache, uid, b64_img=b64_img)

        # 7. Trigger the Storage LRU Engine to ensure we haven't breached the 400 user cap
        await asyncio.to_thread(manage_biometric_storage, db)

        return {"success": True, "message": "Registration successful. Biometrics secured."}

    except Exception as e:
        db.rollback()
        print(f"[Signup Error]: {e}")
        return JSONResponse(status_code=500, content={"success": False, "message": "Internal server error during registration."})

def get_player_data(db: Session, include_rank: bool = False):
    users = db.query(User).order_by(User.elo_rating.desc()).all()
    results = []
    
    for i, u in enumerate(users):
        total = db.query(MatchHistory).filter(or_(MatchHistory.player1_uid == u.uid, MatchHistory.player2_uid == u.uid)).count()
        wins = db.query(MatchHistory).filter(MatchHistory.winner_uid == u.uid).count()
        
        win_rate = round(wins / total * 100, 1) if total > 0 else 0.0
        status = "fighting" if u.is_fighting else "online" if u.is_online else "offline"

        entry = {"uid": u.uid, "name": u.name, "elo_rating": u.elo_rating, "winrate": win_rate, "status": status}
        if include_rank:
            entry['rank'] = i + 1
        results.append(entry)
    return results

@app.post('/login')
async def handle_login(req: Request, db: Session = Depends(get_db)):
    """
    Hybrid Login Gateway.
    Accepts EITHER a biometric webcam frame OR a uid + password fallback.
    """
    data = await req.json()
    b64_img = data.get('image')
    uid = data.get('uid')
    password = data.get('password')

    # --- ROUTE A: BIOMETRIC LOGIN ---
    if b64_img:
        try:
            cln_img = b64_img.split(',')[1] if ',' in b64_img else b64_img
            
            # Check the dynamic RAM cache
            m_uid = await asyncio.to_thread(facial_recognition_module.find_closest_match, cln_img, enc_cache)
            
            if not m_uid:
                # Tell frontend to switch to the password fallback modal
                return JSONResponse(status_code=401, content={"success": False, "message": "FACE NOT RECOGNIZED", "action": "fallback_to_password"})

            user = db.query(User).filter(User.uid == m_uid).first()
            if not user:
                return JSONResponse(status_code=404, content={"success": False, "message": "User not in Database"})

            # Login successful: Update status and touch last_active
            user.is_online = True
            db.commit()

            req.session['uid'] = user.uid
            req.session['name'] = user.name

            await lobby_mgr.broadcast({"type": "presence", "uid": user.uid, "status": "online"})
            return {"success": True, "action": "login", "uid": user.uid, "name": user.name, "elo_rating": user.elo_rating}
            
        except Exception as e:
            print(f"[Biometric Login Error]: {e}")
            return JSONResponse(status_code=500, content={"success": False, "message": "Server error during scan."})

    # --- ROUTE B: PASSWORD FALLBACK LOGIN ---
    elif uid and password:
        user = db.query(User).filter(User.uid == uid).first()
        
        # Verify user exists and check the bcrypt hash
        if not user or not user.password_hash or not bcrypt.checkpw(password.encode('utf-8'), user.password_hash.encode('utf-8')):
            return JSONResponse(status_code=401, content={"success": False, "message": "Invalid UID or Password."})
            
        # Password is correct! Let's log them in and update their LRU timestamp
        user.is_online = True
        db.commit() 
        
        req.session['uid'] = user.uid
        req.session['name'] = user.name
        await lobby_mgr.broadcast({"type": "presence", "uid": user.uid, "status": "online"})
        
        # Determine why they used the fallback so the frontend knows what pop-up to show
        if user.biometrics_active:
            # Their face is in the DB, but the scan failed (bad lighting, changed appearance)
            return {"success": True, "action": "prompt_update", "uid": user.uid, "name": user.name, "elo_rating": user.elo_rating}
        else:
            # They were evicted by our MongoDB Storage LRU cap!
            return {"success": True, "action": "prompt_expired", "uid": user.uid, "name": user.name, "elo_rating": user.elo_rating}

    else:
        return JSONResponse(status_code=400, content={"success": False, "message": "Provide either an image or a UID/Password."})


@app.post('/update_biometrics')
async def update_biometrics(req: Request, db: Session = Depends(get_db)):
    data = await req.json()
    uid = data.get('uid')
    b64_img = data.get('image')

    if not uid or not b64_img:
        return JSONResponse(status_code=400, content={"success": False, "message": "Missing UID or Image."})

    user = db.query(User).filter(User.uid == uid).first()
    if not user:
        return JSONResponse(status_code=404, content={"success": False, "message": "User not found."})

    try:
        # 1. Update the image in MongoDB Atlas (overwrites old data)
        cn = pymongo.MongoClient(os.getenv("MONGO_URI"))
        col = cn[os.getenv("DB_NAME_MONGO", "arena_db")]["profile_images"]
        col.update_one({"uid": uid}, {"$set": {"uid": uid, "image_data": b64_img}}, upsert=True)
        cn.close()

        # 2. Synchronize RAM Cache (Purges old face and attempts to add new)
        # We wait for the result to see if a face was actually found
        success = await asyncio.to_thread(sync_ram_cache, uid, b64_img=b64_img)

        if not success:
            # If no face was found, we mark biometrics as inactive in the DB 
            # because the old face is gone and the new one failed.
            user.biometrics_active = False
            db.commit()
            return JSONResponse(status_code=422, content={
                "success": False, 
                "message": "NO FACE DETECTED. Old biometric data purged. Please try again with a clearer photo."
            })

        # 3. Success: Mark biometrics active and touch the timestamp
        user.biometrics_active = True
        db.commit()

        # 4. Trigger Storage LRU Engine
        await asyncio.to_thread(manage_biometric_storage, db)

        return {"success": True, "message": "Biometrics successfully updated."}

    except Exception as e:
        db.rollback()
        print(f"[Biometric Update Error]: {e}")
        return JSONResponse(status_code=500, content={"success": False, "message": "Internal server error."})

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
    matches = db.query(MatchHistory).filter(
        or_(MatchHistory.player1_uid == uid, MatchHistory.player2_uid == uid)
    ).order_by(MatchHistory.played_at.desc()).all()

    results = []
    for m in matches:
        opp_uid = m.player2_uid if m.player1_uid == uid else m.player1_uid
        opp_user = db.query(User).filter(User.uid == opp_uid).first()
        opp_name = opp_user.name if opp_user else "Unknown Operator"

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
    room = game_mgr.rooms.get(rid)
    if not room:
        return JSONResponse(status_code=404, content={"error": "Match room not found on server."})

    players = room["players"]
    opp_uid = players[0] if players[1] == uid else players[1]

    opp_user = db.query(User).filter(User.uid == opp_uid).first()

    def calc_wr(user_id):
        total = db.query(MatchHistory).filter(or_(MatchHistory.player1_uid == user_id, MatchHistory.player2_uid == user_id)).count()
        wins = db.query(MatchHistory).filter(MatchHistory.winner_uid == user_id).count()
        return round((wins / total) * 100, 1) if total > 0 else 0.0

    return {
        "opponent_name": opp_user.name if opp_user else f"OPERATOR {opp_uid}",
        "opponent_elo": opp_user.elo_rating if opp_user else 1200,
        "opponent_winrate": calc_wr(opp_uid),
        "opponent_region": "GLOBAL", 
        "my_winrate": calc_wr(uid),
        "my_streak": "-"             
    }

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
                
                with SessionLocal() as db:
                    challenger = db.query(User).filter(User.uid == uid).first()
                    c_name = challenger.name if challenger else f"OPERATOR {uid}"
                    c_elo = challenger.elo_rating if challenger else 1200
                    
                    total = db.query(MatchHistory).filter(or_(MatchHistory.player1_uid == uid, MatchHistory.player2_uid == uid)).count()
                    wins = db.query(MatchHistory).filter(MatchHistory.winner_uid == uid).count()
                    c_wr = round((wins / total) * 100, 1) if total > 0 else 0.0

                await lobby_mgr.send_to(target, {
                    "type": "challenge_received", 
                    "from_uid": uid,
                    "challenger_name": c_name,
                    "challenger_elo": c_elo,
                    "challenger_winrate": c_wr
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
                    await lobby_mgr.send_to(challenger, {"type": "challenge_declined"})
                    
                pending_challenges.pop(challenger, None)
                
            elif mtype == "cancel_challenge":
                target = msg.get("target_uid")
                if pending_challenges.get(uid) == target:
                    pending_challenges.pop(uid, None)
                    await lobby_mgr.send_to(target, {"type": "challenge_cancelled"})
    
    except WebSocketDisconnect:
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
                
            elif mtype == "offer_draw":
                other_uid = [p for p in room["players"] if p != uid][0]
                if other_uid in room["connections"]:
                    await room["connections"][other_uid].send_json({"type": "draw_offered"})
                    
            elif mtype == "accept_draw":
                eng.winner = "DRAW"
                await finalize_match(rid)
                
            elif mtype == "reject_draw":
                other_uid = [p for p in room["players"] if p != uid][0]
                if other_uid in room["connections"]:
                    await room["connections"][other_uid].send_json({"type": "draw_rejected"})
                    
    except WebSocketDisconnect:
        if rid in game_mgr.rooms and not eng.winner:
            other = [p for p in room["players"] if p != uid][0]
            try:
                await finalize_match(rid, forfeit_winner=other)
            except Exception as e:
                print(f"Finalize match crashed on disconnect: {e}")

if __name__ == '__main__':
    uvicorn.run("app:app", host="0.0.0.0", port=7860, reload=False)