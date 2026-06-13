from flask import Flask, jsonify, request
from flask_cors import CORS
import random
import requests

app = Flask(__name__)
CORS(app)

# --- CONFIGURATION ---
# Replace with your OpenWeatherMap API Key
OWM_API_KEY = "YOUR_OWM_API_KEY_HERE"
# ---------------------

@app.route('/api/airquality', methods=['GET'])
def get_air_quality():
    lat = request.args.get('lat', 51.5074) # Default London
    lon = request.args.get('lon', -0.1278)
    
    # 1. Try OpenWeatherMap (Primary)
    if OWM_API_KEY and OWM_API_KEY != "YOUR_OWM_API_KEY_HERE":
        try:
            print("Attempting OpenWeatherMap API...")
            owm_url = f"http://api.openweathermap.org/data/2.5/air_pollution?lat={lat}&lon={lon}&appid={OWM_API_KEY}"
            owm_res = requests.get(owm_url, timeout=3)
            
            if owm_res.status_code == 200:
                data = owm_res.json()
                # OWM returns components in µg/m3 directly
                pm25 = data['list'][0]['components']['pm2_5']
                
                # Fetch Weather (Temp/Humidity) - helper needed or separate call
                # For simplicity, we can still use Open-Meteo for WEATHER (Temp/Hum) 
                # or fetch OWM Weather if we want to be pure, but request just asked for OWM AQI.
                # Let's stick to Open-Meteo for Weather to keep it simple unless we want to do 2 OWM calls.
                weather_url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m"
                weather_res = requests.get(weather_url, timeout=3)
                weather_data = weather_res.json()
                temp = weather_data.get('current', {}).get('temperature_2m', 0)
                humidity = weather_data.get('current', {}).get('relative_humidity_2m', 0)

                # Simulate Atmospheric Gases (Real sensors for these are rare/expensive)
                oxygen = round(random.uniform(20.8, 21.0), 2)  # %
                nitrogen = round(random.uniform(78.0, 78.1), 2) # %
                hydrogen = round(random.uniform(0.4, 0.6), 3)   # ppm (trace)

                return jsonify({
                    "pm25": pm25,
                    "temperature": temp,
                    "humidity": humidity,
                    "oxygen": oxygen,
                    "nitrogen": nitrogen,
                    "hydrogen": hydrogen,
                    "source": "OpenWeatherMap (Primary)"
                })
        except Exception as e:
            print(f"OWM API failed (falling back): {e}")

    # 2. Open-Meteo (Backup)
    try:
        print("Using Open-Meteo API (Backup)...")
        # Fetch Air Quality (PM2.5)
        aq_url = f"https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lat}&longitude={lon}&current=pm2_5"
        aq_res = requests.get(aq_url, timeout=5)
        aq_data = aq_res.json()
        
        # Fetch Weather (Temp, Humidity)
        weather_url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m"
        weather_res = requests.get(weather_url, timeout=5)
        weather_data = weather_res.json()

        pm25 = aq_data.get('current', {}).get('pm2_5', 0)
        temp = weather_data.get('current', {}).get('temperature_2m', 0)
        humidity = weather_data.get('current', {}).get('relative_humidity_2m', 0)
        
        # Simulate Gases
        oxygen = round(random.uniform(20.8, 21.0), 2)
        nitrogen = round(random.uniform(78.0, 78.1), 2)
        hydrogen = round(random.uniform(0.4, 0.6), 3)

        return jsonify({
            "pm25": pm25,
            "temperature": temp,
            "humidity": humidity,
            "oxygen": oxygen,
            "nitrogen": nitrogen,
            "hydrogen": hydrogen,
            "source": "Open-Meteo (Backup)"
        })

    except Exception as e:
        print(f"Error fetching real data: {e}")
        # Fallback if API fails
        return jsonify({
            "pm25": round(random.uniform(10, 50), 2),
            "temperature": round(random.uniform(20, 30), 2),
            "humidity": round(random.uniform(40, 60), 2),
            "oxygen": round(random.uniform(20.8, 21.0), 2),
            "nitrogen": round(random.uniform(78.0, 78.1), 2),
            "hydrogen": round(random.uniform(0.4, 0.6), 3),
            "source": "Simulated (Fallback)"
        })

@app.route('/api/location', methods=['POST'])
def receive_location():
    data = request.json
    lat = data.get("latitude")
    lon = data.get("longitude")

    print("User Location:", lat, lon)

    # you can call weather API using lat & lon here

    return jsonify({"message": "Location received", "lat": lat, "lon": lon})

@app.route('/api/my_location', methods=['GET'])
def get_my_location():
    try:
        # Use ip-api.com to get location based on public IP
        response = requests.get('http://ip-api.com/json/')
        data = response.json()
        
        if data['status'] == 'success':
            return jsonify({
                "latitude": data['lat'],
                "longitude": data['lon'],
                "city": data['city'],
                "country": data['country'],
                "source": "backend_ip"
            })
        else:
            return jsonify({"error": "Unable to determine location"}), 400
    except Exception as e:
        print("Error fetching location:", e)
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)
