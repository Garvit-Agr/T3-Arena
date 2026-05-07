# T3-Arena
---

## Team: *read -p team_name*
<b>

1) Garvit Agrawal<br>
2) Pranay Mehtta<br>
3) Daksh Panchotiya<br>
</b>

---
---

### UV Add Commands:
<pre>
1) uv add mysql-connector-python pymongo python-dotenv sqlalchemy websockets
2) uv add fastapi uvicorn face-recognition itsdangerous numpy pillow "setuptools<70" requests
3) uv add psycopg2-binary passlib bcrypt
</pre>

---

### Create Data Base in MySQL:
<pre>
1) CREATE DATABASE IF NOT EXISTS arena_db;
2) exit;
</pre>

---

### .env configurations (near `app.py`):
<pre>
# Relational Database (Supabase / PostgreSQL)
DB_USER="postgres"
DB_PASSWORD="<YOUR_SUPABASE_PASSWORD>"
DB_HOST="<YOUR_SUPABASE_HOST>.supabase.co"
DB_NAME="postgres"

# Note: The SQLAlchemy connection string in app.py will use these variables to build:
# postgresql+psycopg2://postgres:<YOUR_SUPABASE_PASSWORD>@<YOUR_SUPABASE_HOST>.supabase.co:5432/postgres

# Unstructured Database (MongoDB Atlas)
MONGO_URI="mongodb+srv://<YOUR_ATLAS_USER>:<YOUR_ATLAS_PASSWORD>@<YOUR_ATLAS_CLUSTER>.mongodb.net/?retryWrites=true&w=majority&appName=ArenaDB"
# Keep this consistent with your app logic
DB_NAME_MONGO="arena_db"

# Security & Sessions
SESSION_SECRET="generate-a-cryptographically-secure-random-string-here"

# CORS / Networking (Add your frontend domain and Hugging Face URL here)
ALLOWED_ORIGINS="http://localhost:5001,http://127.0.0.1:5001,https://<YOUR_FRONTEND_DOMAIN>.com,https://<YOUR_HUGGINGFACE_SPACE_URL>.hf.space"
</pre>

---

### Steps to run code:
<pre>
<u>* NOTE:</u> Make sure that you are in the directory of terminal where app.py and facial_recognition_module.py resides.<br>
<u>* NOTE:</u> Make sure that you create both `.env` files before running the codes.<br>

1) <b>Terminal:</b> uv run Fetch_data/harvester.py (To fetch data from IIIT server to MySQL)
2) <b>Terminal 1:</b> ngrok http 5001
3) <b>Terminal 2:</b> uv run app.py
4) <b>In Browser:</b> `https://your-ngrok-url-here.ngrok-free.dev/Frontend/HTML/login.html`
</pre>

---

### Project Structure
```text
.
├── app.py
├── engine.py
├── facial_recognition_module.py
└── Frontend
    ├── CSS
    │   ├── combat_logs.css
    │   ├── leaderboard.css
    │   ├── lobby_command_center.css
    │   ├── login.css
    │   └── match_arena.css
    ├── HTML
    │   ├── combat_logs.html
    │   ├── leaderboard.html
    │   ├── lobby_command_center.html
    │   ├── login.html
    │   └── match_arena.html
    └── JS
        ├── combat_logs.js
        ├── leaderboard.js
        ├── lobby_command_center.js
        ├── login.js
        └── match_arena.js
```
- **WebSocket Logic:** FastAPI WebSockets within `app.py` are utilized to manage real-time lobby presence, incoming matchmaking challenges, and seamless live game board synchronization.
- **Other Files in `Project/`:**
  - `app.py`: Serves as the main FastAPI backend handling HTTP routing, database interactions, and WebSockets.
  - `engine.py`: Houses the `TicTacToeEngine` governing core game constraints, winner validation, and Elo rating math.
  - `facial_recognition_module.py`: Caches profile encodings to securely authenticate faces during login.
  - `Fetch_data/`: Contains `harvester.py` to ingest user data from CSV batches and sync it directly into MySQL and MongoDB.
  - `Frontend/`: The web application's user interface cleanly segmented into `HTML`, `CSS`, and `JS` modules for specific pages.
---
