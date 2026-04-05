import os
from flask import Flask, request, jsonify, session
from flask_cors import CORS
import facial_recognition_module

app = Flask(__name__)
app.secret_key = "some_random_secret_string" 
CORS(app)

# Path to your mock database folder
MOCK_DB_PATH = "mock_db"

def load_mock_database():
    """
    Scans the mock_db folder and creates a dictionary:
    { "filename_without_extension": image_bytes }
    """
    db = {}
    if not os.path.exists(MOCK_DB_PATH):
        print(f"⚠️ Warning: {MOCK_DB_PATH} folder not found.")
        return db

    for filename in os.listdir(MOCK_DB_PATH):
        if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            # Get name without extension (e.g., 'garvit.jpg' -> 'garvit')
            user_id = os.path.splitext(filename)[0]
            file_path = os.path.join(MOCK_DB_PATH, filename)
            
            with open(file_path, "rb") as image_file:
                db[user_id] = image_file.read()
    
    return db

@app.route('/', methods=['GET'])
def home():
    return "✅ Face Recognition API is up and running!"

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
            
        # 2. CREATE A MOCK DATABASE DYNAMICALLY
        # This now loads EVERYONE in the mock_db folder
        mock_database = load_mock_database()
        
        if not mock_database:
            return jsonify({"success": False, "message": "Database is empty"}), 500
        
        # 3. USE THE BLACK BOX!
        matched_uid = facial_recognition_module.find_closest_match(cleaned_string, mock_database)
        
        # 4. CHECK THE RESULT
        if matched_uid is not None:
            session['uid'] = matched_uid
            print(f"✅ MATCH FOUND! Logged in as: {matched_uid}")
            # Matching the keys expected by your login.js
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
    # Using 5000, but remember to change to 5001 if on a Mac with AirPlay issues
    app.run(debug=True, port=5000)
