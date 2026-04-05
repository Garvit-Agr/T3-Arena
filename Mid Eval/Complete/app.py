import os
import base64
import pymongo
from flask import Flask, request, jsonify, session
from flask_cors import CORS
import facial_recognition_module
from dotenv import load_dotenv

# Load environment variables (like your MONGO_URI)
load_dotenv()

app = Flask(__name__)
app.secret_key = "some_random_secret_string" 
CORS(app)

def load_mongo_database():
    """
    Connects to MongoDB, retrieves all profile images, 
    and decodes them back into bytes to create the dictionary:
    { "uid": image_bytes }
    """
    db_dict = {}
    
    try:
        # 1. Connect to MongoDB (Defaults to localhost if no .env is set)
        mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
        client = pymongo.MongoClient(mongo_uri)
        db = client[os.getenv("DB_NAME", "arena_db")]
        collection = db["profile_images"]
        
        # 2. Fetch all users from the database
        all_users = collection.find({})
        
        # 3. Build the dictionary
        for user in all_users:
            uid = user.get("uid")
            base64_image_data = user.get("image_data")
            
            if uid and base64_image_data:
                # Decode the base64 string back into raw bytes
                # This perfectly mimics what 'image_file.read()' used to do
                image_bytes = base64.b64decode(base64_image_data)
                db_dict[uid] = image_bytes
                
        client.close()
        return db_dict

    except Exception as e:
        print(f"⚠️ Failed to load from MongoDB: {e}")
        return db_dict

@app.route('/', methods=['GET'])
def home():
    return "✅ Face Recognition API is up and running with MongoDB!"

@app.route('/login', methods=['POST'])
def handle_login():
    incoming_data = request.get_json()
    base64_string = incoming_data.get('image')
    
    if not base64_string:
        return jsonify({"success": False, "message": "No image provided"}), 400

    try:
        # 1. CLEAN THE STRING
        if ',' in base64_string:
            cleaned_string = base64_string.split(',')[1]
        else:
            cleaned_string = base64_string
            
        # 2. FETCH DATABASE FROM MONGODB
        # This pulls all stored user encodings directly from the database
        mock_database = load_mongo_database()
        
        if not mock_database:
            return jsonify({"success": False, "message": "Database is empty or could not connect"}), 500
        
        # 3. USE THE BLACK BOX!
        matched_uid = facial_recognition_module.find_closest_match(cleaned_string, mock_database)
        
        # 4. CHECK THE RESULT
        if matched_uid is not None:
            session['uid'] = matched_uid
            print(f"✅ MATCH FOUND! Logged in as: {matched_uid}")
            # Matching the keys expected by your frontend login
            return jsonify({
                "success": True, 
                "name": matched_uid
            }), 200
        else:
            print("❌ INTRUDER! Face did not match.")
            return jsonify({"success": False, "message": "Face not recognized"}), 401

    except Exception as e:
        print(f"⚠️ Server Error: {e}")
        return jsonify({"success": False, "message": str(e)}), 500

if __name__ == '__main__':
    # Using 5001 to avoid AirPlay port conflicts on Mac
    app.run(debug=True, port=5001)