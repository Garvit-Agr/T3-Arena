import os
import base64
import pymongo
import mysql.connector
from flask import Flask, request, jsonify, session
from flask_cors import CORS
import facial_recognition_module
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.secret_key = "some_random_secret_string"
CORS(app, supports_credentials=True)


# ── DB helpers ────────────────────────────────────────────────────────────────

def get_mysql():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "localhost"),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME", "arena_db")
    )


def load_mongo_images():
    """Returns { uid: image_bytes } from MongoDB."""
    db_dict = {}
    try:
        client = pymongo.MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017"))
        col = client[os.getenv("DB_NAME", "arena_db")]["profile_images"]
        for doc in col.find({}):
            uid = doc.get("uid")
            b64  = doc.get("image_data")
            if uid and b64:
                db_dict[uid] = base64.b64decode(b64)
        client.close()
    except Exception as e:
        print(f"⚠️  MongoDB load failed: {e}")
    return db_dict


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route('/', methods=['GET'])
def home():
    return "✅ Arena API running."


# ── Phase 2: Biometric Login ──────────────────────────────────────────────────

@app.route('/login', methods=['POST'])
def handle_login():
    data = request.get_json()
    b64_image = data.get('image')

    if not b64_image:
        return jsonify({"success": False, "message": "No image provided"}), 400

    try:
        # 1. Strip the data-URL prefix if present
        cleaned = b64_image.split(',')[1] if ',' in b64_image else b64_image

        # 2. Load all profile images from MongoDB
        mongo_db = load_mongo_images()
        if not mongo_db:
            return jsonify({"success": False, "message": "No images in database. Run harvester first."}), 500

        # 3. Run facial recognition (black box)
        matched_uid = facial_recognition_module.find_closest_match(cleaned, mongo_db)

        if matched_uid is None:
            print("❌ No face match found.")
            return jsonify({"success": False, "message": "Face not recognised"}), 401

        # 4. Cross-reference with MySQL to get real name
        db = get_mysql()
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT uid, name, elo_rating FROM users WHERE uid = %s", (matched_uid,))
        user = cursor.fetchone()

        if not user:
            cursor.close(); db.close()
            return jsonify({"success": False, "message": "User not found in system"}), 401

        # 5. Set is_online = TRUE  (Phase 2 requirement)
        cursor.execute("UPDATE users SET is_online = TRUE WHERE uid = %s", (matched_uid,))
        db.commit()
        cursor.close(); db.close()

        # 6. Store in server-side session
        session['uid']  = user['uid']
        session['name'] = user['name']

        print(f"✅ Login: {user['name']} ({user['uid']})")

        return jsonify({
            "success":    True,
            "uid":        user['uid'],
            "name":       user['name'],      # ← real name, not UID
            "elo_rating": user['elo_rating']
        }), 200

    except Exception as e:
        print(f"⚠️  Server error: {e}")
        return jsonify({"success": False, "message": str(e)}), 500


# ── Phase 2: Logout ───────────────────────────────────────────────────────────

@app.route('/logout', methods=['POST'])
def logout():
    uid = session.get('uid')
    if uid:
        try:
            db = get_mysql()
            cursor = db.cursor()
            cursor.execute("UPDATE users SET is_online = FALSE WHERE uid = %s", (uid,))
            db.commit()
            cursor.close(); db.close()
        except Exception as e:
            print(f"⚠️  Logout DB error: {e}")
    session.clear()
    return jsonify({"success": True}), 200


# ── Phase 3: Players list for Lobby ──────────────────────────────────────────

@app.route('/api/players', methods=['GET'])
def get_players():
    """
    Returns all players with their status and computed winrate.
    Called every 5 seconds by lobby_command_center.js.
    """
    try:
        db = get_mysql()
        cursor = db.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                u.uid,
                u.name,
                u.elo_rating,
                u.is_online,
                u.is_fighting,
                COUNT(CASE WHEN
                    (m.player1_uid = u.uid OR m.player2_uid = u.uid)
                    THEN 1 END) AS total_games,
                COUNT(CASE WHEN m.winner_uid = u.uid THEN 1 END) AS wins
            FROM users u
            LEFT JOIN match_history m
                ON u.uid = m.player1_uid OR u.uid = m.player2_uid
            GROUP BY u.uid, u.name, u.elo_rating, u.is_online, u.is_fighting
            ORDER BY u.elo_rating DESC
        """)
        rows = cursor.fetchall()
        cursor.close(); db.close()

        players = []
        for p in rows:
            total   = p['total_games'] or 0
            wins    = p['wins'] or 0
            winrate = round(wins / total * 100, 1) if total > 0 else 0.0

            # Map DB booleans → status string the frontend expects
            if p['is_fighting']:
                status = "fighting"
            elif p['is_online']:
                status = "online"
            else:
                status = "offline"

            players.append({
                "uid":        p['uid'],
                "name":       p['name'],
                "elo_rating": p['elo_rating'],
                "winrate":    winrate,
                "status":     status
            })

        return jsonify({"players": players}), 200

    except Exception as e:
        print(f"⚠️  /api/players error: {e}")
        return jsonify({"players": [], "error": str(e)}), 500


# ── Phase 4: Leaderboard ──────────────────────────────────────────────────────

@app.route('/api/leaderboard', methods=['GET'])
def get_leaderboard():
    """
    Returns all players sorted by elo_rating DESC for the leaderboard page.
    """
    try:
        db = get_mysql()
        cursor = db.cursor(dictionary=True)

        cursor.execute("""
            SELECT
                u.uid,
                u.name,
                u.elo_rating,
                u.is_online,
                u.is_fighting,
                COUNT(CASE WHEN
                    (m.player1_uid = u.uid OR m.player2_uid = u.uid)
                    THEN 1 END) AS total_games,
                COUNT(CASE WHEN m.winner_uid = u.uid THEN 1 END) AS wins
            FROM users u
            LEFT JOIN match_history m
                ON u.uid = m.player1_uid OR u.uid = m.player2_uid
            GROUP BY u.uid, u.name, u.elo_rating, u.is_online, u.is_fighting
            ORDER BY u.elo_rating DESC
        """)
        rows = cursor.fetchall()
        cursor.close(); db.close()

        players = []
        for i, p in enumerate(rows):
            total   = p['total_games'] or 0
            wins    = p['wins'] or 0
            winrate = round(wins / total * 100, 1) if total > 0 else 0.0

            if p['is_fighting']:
                status = "fighting"
            elif p['is_online']:
                status = "online"
            else:
                status = "offline"

            players.append({
                "rank":       i + 1,
                "uid":        p['uid'],
                "name":       p['name'],
                "elo_rating": p['elo_rating'],
                "winrate":    winrate,
                "status":     status
            })

        return jsonify({"players": players}), 200

    except Exception as e:
        print(f"⚠️  /api/leaderboard error: {e}")
        return jsonify({"players": [], "error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5001)