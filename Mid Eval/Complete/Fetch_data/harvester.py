import csv
import requests
import os
import mysql.connector
import pymongo
import base64
from dotenv import load_dotenv

current_dir = os.path.dirname(os.path.abspath(__file__))
env_path    = os.path.join(current_dir, ".env")
load_dotenv(env_path)

REQUEST_TIMEOUT = 5


def harvest_images(csv_filepath):

    # ── MySQL ──────────────────────────────────────────────────────────────
    try:
        db_connection = mysql.connector.connect(
            host=os.getenv("DB_HOST", "localhost"),
            user=os.getenv("DB_USER", "root"),
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_NAME", "arena_db")
        )
        cursor = db_connection.cursor()
        print("✅ Connected to MySQL")
    except mysql.connector.Error as err:
        print(f"❌ MySQL connection failed: {err}")
        return

    # ── MongoDB ────────────────────────────────────────────────────────────
    try:
        mongo_client     = pymongo.MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017"))
        mongo_db         = mongo_client[os.getenv("DB_NAME", "arena_db")]
        mongo_collection = mongo_db["profile_images"]
        print("✅ Connected to MongoDB")
    except Exception as e:
        print(f"❌ MongoDB connection failed: {e}")
        return

    # ── Process each row ───────────────────────────────────────────────────
    with open(csv_filepath, mode='r', encoding='utf-8') as file:
        csv_reader = csv.DictReader(file)

        for row in csv_reader:
            uid      = row.get('uid')
            name     = row.get('name')
            base_url = row.get('website_url')

            if not base_url:
                print(f"⚠️  No URL for {name} ({uid}). Skipping...")
                continue

            # FIX: use the URL exactly as given in CSV — don't prepend https://
            # The CSV website_url may already include the protocol.
            # Strip trailing slash and build the image path.
            base_url  = base_url.rstrip('/')
            # If no protocol present, add https://
            if not base_url.startswith('http'):
                base_url = 'https://' + base_url
            image_url = f"{base_url}/images/pfp.jpg"

            print(f"\n→ Fetching image for {name} ({uid})")
            print(f"  URL: {image_url}")

            try:
                response = requests.get(image_url, timeout=REQUEST_TIMEOUT)

                if response.status_code == 200:
                    print(f"  ✅ Image downloaded.")

                    # ── Save to MySQL (table = users, as per spec) ──────────
                    try:
                        # FIX: table name is 'users' not 'players'
                        cursor.execute("""
                            INSERT INTO users (uid, name, elo_rating, is_online)
                            VALUES (%s, %s, %s, %s)
                            ON DUPLICATE KEY UPDATE name = VALUES(name)
                        """, (uid, name, 1200, False))
                        db_connection.commit()
                        print(f"  ✅ MySQL: saved metadata.")
                    except mysql.connector.Error as err:
                        print(f"  ❌ MySQL error: {err}")

                    # ── Save image to MongoDB as base64 ─────────────────────
                    try:
                        encoded_image = base64.b64encode(response.content).decode('utf-8')
                        mongo_collection.update_one(
                            {"uid": uid},
                            {"$set": {"uid": uid, "image_data": encoded_image}},
                            upsert=True
                        )
                        print(f"  ✅ MongoDB: saved profile image.")
                    except Exception as e:
                        print(f"  ❌ MongoDB error: {e}")

                elif response.status_code == 404:
                    # FIX: on 404, still insert user into MySQL (no image)
                    print(f"  ⚠️  HTTP 404 — no image. Inserting metadata only.")
                    try:
                        cursor.execute("""
                            INSERT INTO users (uid, name, elo_rating, is_online)
                            VALUES (%s, %s, %s, %s)
                            ON DUPLICATE KEY UPDATE name = VALUES(name)
                        """, (uid, name, 1200, False))
                        db_connection.commit()
                        print(f"  ✅ MySQL: metadata saved (no image).")
                    except mysql.connector.Error as err:
                        print(f"  ❌ MySQL error: {err}")
                else:
                    print(f"  ⚠️  HTTP {response.status_code} — skipping.")

            except requests.exceptions.Timeout:
                print(f"  ⚠️  Timeout for {uid}. Inserting metadata only.")
                try:
                    cursor.execute("""
                        INSERT INTO users (uid, name, elo_rating, is_online)
                        VALUES (%s, %s, %s, %s)
                        ON DUPLICATE KEY UPDATE name = VALUES(name)
                    """, (uid, name, 1200, False))
                    db_connection.commit()
                except mysql.connector.Error:
                    pass

            except requests.exceptions.ConnectionError:
                print(f"  ⚠️  Connection error for {uid}. Skipping.")

            except requests.exceptions.RequestException as e:
                print(f"  ⚠️  Request error for {uid}: {e}. Skipping.")

    # ── Close connections ──────────────────────────────────────────────────
    if db_connection.is_connected():
        cursor.close()
        db_connection.close()
        print("\n🔌 MySQL connection closed.")

    mongo_client.close()
    print("🔌 MongoDB connection closed.")
    print("\n✅ Harvester complete.")


if __name__ == "__main__":
    csv_path = os.path.join(current_dir, 'batch_data.csv')
    harvest_images(csv_path)