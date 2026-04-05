import base64
import requests

def test_login(image_path):
    print(f"\n--- Testing Login with {image_path} ---")
    
    # 1. Read the image and convert to Base64
    with open(image_path, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode('utf-8')

    # 2. Package it exactly like Member 2's JavaScript fetch() will
    payload = {
        "image": f"data:image/jpeg;base64,{encoded_string}"
    }

    # 3. Send the POST request to your running Flask server
    try:
        response = requests.post("http://127.0.0.1:5000/login", json=payload)
        print(f"Status Code: {response.status_code}")
        print(f"Server Response: {response.json()}")
    except Exception as e:
        print(f"Failed to connect to server: {e}")

# Test 1: The correct user (Should return 200 Success)
test_login("mock_db/garvit.jpg")

# Test 2: The intruder (Should return 401 Error)
test_login("mock_db/daksh.jpg")