import csv
import requests
import os
import mysql.connector
import pymongo
import base64
from dotenv import load_dotenv

current_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(current_dir, ".env")
load_dotenv(env_path)

REQUEST_TIMEOUT = 5 

def harvest_images(csv_filepath):
    try:
        db_connection = mysql.connector.connect(
            host=os.getenv("DB_HOST", "localhost"),
            user=os.getenv("DB_USER", "root"),
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_NAME", "arena_db")
        )
        cursor = db_connection.cursor()
        print(" Successfully connected to MySQL")
    except mysql.connector.Error as err:
        print(f" Failed to connect to MySQL: {err}")
        return
        
    try:
        mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
        mongo_client = pymongo.MongoClient(mongo_uri)
        mongo_db = mongo_client[os.getenv("DB_NAME", "arena_db")]
        mongo_collection = mongo_db["profile_images"]
        print(" Successfully connected to MongoDB")
    except Exception as e:
        print(f" Failed to connect to MongoDB: {e}")
        return

    with open(csv_filepath, mode='r', encoding='utf-8') as file:
        csv_reader = csv.DictReader(file)
        for row in csv_reader:
            uid = row.get('uid')
            name = row.get('name')
            base_url = row.get('website_url')
            
            if not base_url:
                print(f" No URL provided for {name} ({uid}). Skipping...")
                continue
                
            base_url = base_url.rstrip('/')
            image_url = f"https://{base_url}/images/pfp.jpg"
            
            print(f"\nAttempting to fetch image for {name} ({uid}) at {image_url}...")
            
            try:
                response = requests.get(image_url, timeout=REQUEST_TIMEOUT)
                
                if response.status_code == 200:
                    print(f" Success! Image downloaded for {uid}.")
                    
                    try:
                        sql_query = """
                            INSERT INTO players (uid, name, elo_rating, is_online) 
                            VALUES (%s, %s, %s, %s)
                            ON DUPLICATE KEY UPDATE name = VALUES(name)
                        """
                        values = (uid, name, 1200, False)
                        cursor.execute(sql_query, values)
                        db_connection.commit() 
                        print(f"    Saved metadata to MySQL.")
                    except mysql.connector.Error as err:
                        print(f"    Failed to save to MySQL: {err}")
                        
                    try:
                        image_binary_data = response.content 
                        encoded_image = base64.b64encode(image_binary_data).decode('utf-8')
                        
                        mongo_collection.update_one(
                            {"uid": uid}, 
                            {"$set": {"uid": uid, "image_data": encoded_image}}, 
                            upsert=True
                        )
                        print(f"    Saved profile image to MongoDB.")
                    except Exception as e:
                        print(f"    Failed to save to MongoDB: {e}")
                        
                elif response.status_code == 404:
                    print(f" HTTP 404: Image not found for {uid}. Skipping...")
                else:
                    print(f" HTTP {response.status_code}: Failed to fetch for {uid}. Skipping...")
                    
            except requests.exceptions.Timeout:
                print(f" Timeout: Connection took too long for {uid}. Skipping...")
            except requests.exceptions.ConnectionError:
                print(f" Connection Error: Could not reach the server for {uid}. Skipping...")
            except requests.exceptions.RequestException as e:
                print(f" An unexpected network error occurred for {uid}: {e}. Skipping...")

    if db_connection.is_connected():
        cursor.close()
        db_connection.close()
        print("\n🔌 MySQL connection safely closed.")
        
    mongo_client.close()
    print("🔌 MongoDB connection safely closed.")

if __name__ == "__main__":
    project_root = os.path.join(current_dir)
    csv_path = os.path.join(project_root, 'batch_data.csv')
    harvest_images(csv_path)