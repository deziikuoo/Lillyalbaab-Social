#!/usr/bin/env python3
"""
Test script for Snapchat Polling System
Phase 8: Testing and Validation
"""

import requests
import time
import json
import asyncio
import aiohttp

BASE_URL = 'http://localhost:8000'

def test_polling_system():
    """Test the complete polling system"""
    print("🧪 Testing Snapchat Polling System")
    print("=" * 50)
    
    # Test 1: Check service status
    print("\n1. Checking service status...")
    try:
        response = requests.get(f'{BASE_URL}/status')
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Service: {data.get('status', 'unknown')}")
            print(f"Target: {data.get('target_username', 'None')}")
            print(f"Polling Active: {data.get('polling_active', False)}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error connecting to service: {e}")
        return
    
    # Test 2: Set target username
    print("\n2. Setting target username...")
    try:
        test_username = "test_user"  # Replace with actual test username
        response = requests.post(f'{BASE_URL}/set-target', params={'username': test_username})
        print(f"Set target: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {data.get('message', 'Unknown')}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error setting target: {e}")
    
    # Test 3: Get polling configuration
    print("\n3. Getting polling configuration...")
    try:
        response = requests.get(f'{BASE_URL}/polling/config')
        print(f"Config: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Target: {data.get('target_username', 'None')}")
            print(f"Polling Enabled: {data.get('polling_enabled', False)}")
            print(f"Activity Level: {data.get('activity_level', 'unknown')}")
            print(f"Current Interval: {data.get('current_interval', 0)} minutes")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error getting config: {e}")
    
    # Test 4: Start polling
    print("\n4. Starting polling...")
    try:
        response = requests.post(f'{BASE_URL}/start-polling')
        print(f"Start polling: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {data.get('message', 'Unknown')}")
            print(f"Polling Active: {data.get('polling_active', False)}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error starting polling: {e}")
    
    # Test 5: Manual poll
    print("\n5. Triggering manual poll...")
    try:
        response = requests.get(f'{BASE_URL}/poll-now', params={'force': 'true'})
        print(f"Manual poll: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {data.get('message', 'Unknown')}")
            print(f"Force: {data.get('force', False)}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error manual polling: {e}")
    
    # Test 6: Check statistics
    print("\n6. Checking statistics...")
    try:
        response = requests.get(f'{BASE_URL}/stats')
        print(f"Stats: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Uptime: {data.get('uptime', {}).get('hours', 0)}h {data.get('uptime', {}).get('minutes', 0)}m")
            print(f"Snapchat Requests: {data.get('snapchat', {}).get('total', 0)}")
            print(f"Telegram Requests: {data.get('telegram', {}).get('total', 0)}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error getting stats: {e}")
    
    # Test 7: Stop polling
    print("\n7. Stopping polling...")
    try:
        response = requests.post(f'{BASE_URL}/stop-polling')
        print(f"Stop polling: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {data.get('message', 'Unknown')}")
            print(f"Polling Active: {data.get('polling_active', False)}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error stopping polling: {e}")
    
    print("\n✅ Testing completed!")

def test_telegram_integration():
    """Test Telegram integration endpoints"""
    print("\n🔗 Testing Telegram Integration")
    print("=" * 30)
    
    # Test Telegram config
    print("\n1. Checking Telegram configuration...")
    try:
        response = requests.get(f'{BASE_URL}/telegram/config')
        print(f"Telegram config: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Configured: {data.get('configured', False)}")
            print(f"Channel ID: {data.get('channel_id', 'None')}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error checking Telegram config: {e}")
    
    # Test Telegram stats
    print("\n2. Checking Telegram statistics...")
    try:
        response = requests.get(f'{BASE_URL}/telegram/stats')
        print(f"Telegram stats: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Total sent: {data.get('total_sent', 0)}")
            print(f"Total failed: {data.get('total_failed', 0)}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Error getting Telegram stats: {e}")

if __name__ == '__main__':
    print("🚀 Snapchat Polling System Test Suite")
    print("Make sure the server is running on http://localhost:8000")
    print()
    
    # Test polling system
    test_polling_system()
    
    # Test Telegram integration
    test_telegram_integration()
    
    print("\n🎉 All tests completed!")
    print("\nTo run the server:")
    print("cd Snapchat-Service/server")
    print("python main.py")
