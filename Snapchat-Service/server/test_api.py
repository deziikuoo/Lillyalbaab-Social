import requests
import json

def test_download_api():
    url = "http://localhost:8000/download"
    data = {
        "username": "testuser",
        "download_type": "stories"
    }
    
    try:
        print("Testing download API...")
        print(f"URL: {url}")
        print(f"Data: {json.dumps(data, indent=2)}")
        
        response = requests.post(url, json=data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"Success: {result}")
        else:
            print(f"Error: {response.text}")
            
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    test_download_api() 