# ISS-Project
## Name of Contributors:
<b>
1) Garvit Agrawal<br>
2) Pranay Mehtta<br>
3) Daksh Panchotiya<br>
</b>

---
---

### Steps to run code:
<pre>
<u>* NOTE:</u> Make sure that you are in the directory of terminal where app.py and facial_recognition_module.py resides.<br>
<u>* NOTE:</u> Make sure that you create both `.env` files before running the codes.<br>

1) <b>Terminal:</b> uv run Fetch_data/harvester.py (To fetch data from IIIT server to MySQL)
2) <b>Terminal 1:</b> python3 -m http.server 8000
3) <b>Terminal 2:</b> uv run app.py
4) <b>In Browser:</b> http://localhost:8000/Frontend/HTML/login.html
</pre>

---

### UV Add Commands:
<pre>
1) uv add mysql-connector-python pymongo python-dotenv sqlalchemy websockets
2) uv add fastapi uvicorn face-recognition itsdangerous numpy pillow "setuptools<70" requests
</pre>
---

### .env configurations (near `app.py` and near `harvester.py`):
<pre>
# MySQL Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=YourMysqlPasswordHere
DB_NAME=arena_db

# MongoDB Configuration
MONGO_URI=mongodb://localhost:27017

# FastAPI Security
SESSION_SECRET=a_very_long_random_string_here_for_security
</pre>

---

### Create Data Bases:
<pre>
1) CREATE DATABASE IF NOT EXISTS arena_db;

2) USE arena_db;

3) CREATE TABLE IF NOT EXISTS users (
    uid         VARCHAR(50)  PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    elo_rating  INT          DEFAULT 1200,
    is_online   BOOLEAN      DEFAULT FALSE,
    is_fighting BOOLEAN      DEFAULT FALSE   -- needed for lobby "FIGHTING" status
    );

4) CREATE TABLE IF NOT EXISTS match_history (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    player1_uid         VARCHAR(50) NOT NULL,
    player2_uid         VARCHAR(50) NOT NULL,
    winner_uid          VARCHAR(50) DEFAULT NULL,   -- NULL = draw
    player1_elo_before  INT         NOT NULL,
    player2_elo_before  INT         NOT NULL,
    player1_elo_after   INT         NOT NULL,
    player2_elo_after   INT         NOT NULL,
    forfeit             BOOLEAN     DEFAULT FALSE,
    played_at           TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (player1_uid) REFERENCES users(uid),
    FOREIGN KEY (player2_uid) REFERENCES users(uid)
    );

5) exit;
</pre>

---

### Mac Specific Commands:
<pre>
1) brew install cmake, boost, pkg-config, openblas, dlib, mysql, mongodb-community
2) brew services start mysql ->(then) mysql -u root -p
3) brew tap mongodb/brew  ->(then) brew install mongodb-community  ->(then) brew services start mongodb-community
</pre>

---
