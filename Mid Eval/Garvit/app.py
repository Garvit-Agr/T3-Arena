from flask import Flask, request, jsonify, session
from flask_cors import CORS
import facial_recognition_module # <-- Import your TA's black box!

app = Flask(__name__)
app.secret_key = "some_random_secret_string" 
CORS(app)

@app.route('/login', methods=['POST'])
def handle_login():
    incoming_data = request.get_json()
    base64_string = incoming_data.get('image')
    
    if not base64_string:
        return jsonify({"status": "error", "message": "No image provided"}), 400

    try:
        # 1. CLEAN THE STRING
        # We still must chop off the "data:image/jpeg;base64," header.
        # The module will crash if we hand it the header.
        if ',' in base64_string:
            cleaned_string = base64_string.split(',')[1]
        else:
            cleaned_string = base64_string
            
        # 2. CREATE A MOCK DATABASE (To test without Member 1's MongoDB)
        # We read the picture of your face as raw bytes and assign it to a fake UID
        with open("mock_db/garvit.jpg", "rb") as image_file:
            mock_database = {
                "mock_user_123": image_file.read()
            }
        
        # 3. USE THE BLACK BOX!
        # The module accepts the Base64 string directly and does all the decoding and math.
        matched_uid = facial_recognition_module.find_closest_match(cleaned_string, mock_database)
        
        # 4. CHECK THE RESULT AND LOG THEM IN
        if matched_uid is not None:
            session['uid'] = matched_uid
            print(f"✅ MATCH FOUND! Logged in as: {matched_uid}")
            return jsonify({"status": "success", "uid": matched_uid}), 200
        else:
            print("❌ INTRUDER! Face did not match.")
            return jsonify({"status": "error", "message": "Face not recognized"}), 401

    except Exception as e:
        print(f"⚠️ Server Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)