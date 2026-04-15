import csv
import requests
import os
import pymongo
import base64
import urllib.parse
from datetime import datetime
from dotenv import load_dotenv

from sqlalchemy import create_engine, Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker

cur_dir = os.path.dirname(os.path.abspath(__file__))
env_pth = os.path.join(cur_dir, ".env")
load_dotenv(env_pth)

REQ_TOUT = 5

raw_password = os.getenv('DB_PASSWORD', '')
encoded_password = urllib.parse.quote(raw_password)

DB_URL = f"mysql+mysqlconnector://{os.getenv('DB_USER')}:{encoded_password}@{os.getenv('DB_HOST', 'localhost')}/{os.getenv('DB_NAME', 'arena_db')}"

engine = create_engine(DB_URL, pool_size=5, max_overflow=10)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

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
    played_at = Column(DateTime, default=datetime.utcnow)

def start_harvest(csv_path_1, csv_path_2):
    print("Verifying database schema...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    print("MySQL connection ready")

    # mongo for storing profile image blobs
    try:
        mg_conn = pymongo.MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017"))
        mg_db   = mg_conn[os.getenv("DB_NAME", "arena_db")]
        mg_col  = mg_db["profile_images"]
        print("MongoDB connection ready")
    except Exception as e:
        print(f"MongoDB connection failed: {e}")
        return

    # updates name if user exists, otherwise creates with default elo
    def upsert_user(uid, nm):
        try:
            user = db.query(User).filter(User.uid == uid).first()
            if user:
                user.name = nm
            else:
                new_user = User(uid=uid, name=nm, elo_rating=1200, is_online=False, is_fighting=False)
                db.add(new_user)
            db.commit()
        except Exception as e:
            print(f"SQL fail -> {e}")
            db.rollback()

    def scrape_file(f_path, is_ta_list=False):
        print(f"\n--- scraping {os.path.basename(f_path)} ---")
        with open(f_path, mode='r', encoding='utf-8') as f:
            csv_hdr = csv.DictReader(f)

            for rw in csv_hdr:
                uid    = rw.get('uid')
                nm     = rw.get('name')
                
                if is_ta_list:
                    base_url = rw.get('url')
                    img_src = f"https://{base_url}"
                else:
                    base_url = rw.get('website_url')
                    img_src = f"https://{base_url}/images/pfp.jpg"

                print(f"fetching meta for: {nm} ({uid})")
                
                try:
                    res = requests.get(img_src, timeout=REQ_TOUT)

                    if res.status_code == 200:
                        
                        upsert_user(uid, nm)

                        try:
                            enc_img = base64.b64encode(res.content).decode('utf-8')
                            mg_col.update_one(
                                {"uid": uid},
                                {"$set": {"uid": uid, "image_data": enc_img}},
                                upsert=True
                            )
                        except Exception as e:
                            print(f"Mongo fail -> {e}")

                    elif res.status_code == 404:
                        upsert_user(uid, nm)
                        print(f"No PFP resolving for {nm}, writing stubbed baseline")
                    else:
                        pass
                        
                except Exception:
                    print(f"Timeout scraping record {uid}")

    scrape_file(csv_path_1, is_ta_list=False)
    scrape_file(csv_path_2, is_ta_list=True)

    db.close()
    print("\nMySQL closed")
    mg_conn.close()
    print("MongoDB closed")
    print("Harvest complete")

if __name__ == "__main__":
    csv_1 = os.path.join(cur_dir, 'batch_data.csv')
    csv_2 = os.path.join(cur_dir, 'ta_data.csv')
    start_harvest(csv_1, csv_2)