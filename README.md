# ISS-Project
## Name of Contributors:

1) Garvit Agrawal
2) Pranay Mehtta
3) Daksh Panchotiya


### Steps to run code:
<pre>
**Make sure that you are in the directory of terminal where app.py and facial_recognition_module.py resides.**<br>
1) **Terminal 1:** uv run app.py
2) **Terminal 2:** python3 -m http.server 8000
3) **In Browser:** http://localhost:8000/Frontend/htmls/login.html
</pre>

### UV Add Commands:
1) uv add mysql-connector-python pymongo python-dotenv
2) uv add flask flask-cors face-recognition numpy pillow "setuptools<70" requests


### .env configurations:
<pre>
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=YourMysqlPasswordHere
DB_NAME=arena_db
</pre>

### Create Data Base:
<pre>
1) CREATE DATABASE arena_db;
2) USE arena_db;
3) CREATE TABLE players (
    uid VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100),
    elo_rating INT DEFAULT 1200,
    is_online BOOLEAN DEFAULT FALSE
    );
4) exit;
</pre>

### Mac Specific Commands:
<pre>
1) brew install cmake, boost, pkg-config, openblas, dlib, mysql, mongodb-community
2) brew services start mysql ->(then) mysql -u root -p
3) brew tap mongodb/brew  ->(then) brew install mongodb-community  ->(then) brew services start mongodb-community
</pre>
