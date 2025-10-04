import os, time, requests
from typing import Dict, Any, List
from flask import Flask, jsonify, request, abort
from flask_cors import CORS

NASA_API = "https://api.nasa.gov/neo/rest/v1/neo/browse"
API_KEY  = os.getenv("NASA_API_KEY", "DEMO_KEY")

app = Flask(__name__)
CORS(app)

def map_neo_object(o: dict) -> dict:
    orb = o.get("orbital_data") or {}
    def f(x):
        try: return float(x)
        except: return None
    return {
        "id": o.get("id"),
        "name": o.get("name"),
        "hazardous": bool(o.get("is_potentially_hazardous_asteroid")),
        "a": f(orb.get("semi_major_axis")),
        "e": f(orb.get("eccentricity")),
        "i": f(orb.get("inclination")),
        "om": f(orb.get("ascending_node_longitude")),
        "w": f(orb.get("perihelion_argument")),
        "epoch": f(orb.get("epoch_osculation")),
        "mean_anomaly_deg": f(orb.get("mean_anomaly")),
        "M0": f(orb.get("mean_motion")),
    }

def fetch_browse_page(page: int, size: int) -> List[Dict[str, Any]]:
    """Llama a /neo/browse para una página y devuelve SOLO la lista de NEOs mapeados."""
    params = {"page": page, "size": size, "api_key": API_KEY}
    r = requests.get(NASA_API, params=params, timeout=20)
    r.raise_for_status()
    data = r.json()
    return [map_neo_object(o) for o in data.get("near_earth_objects", [])]

@app.get("/api/neos")
def get_neos():
    """
    Devuelve NEOs mapeados desde /neo/browse.
    Query params:
      - page (int, por defecto 0)
      - size (int, por defecto 20)
      - pages (int, por defecto 1) -> acumula varias páginas
      - sleep_ms (int, por defecto 0) -> espera entre páginas
    """
    try:
        page = int(request.args.get("page", 0))
        size = int(request.args.get("size", 20))
        pages = int(request.args.get("pages", 1))
        sleep_ms = int(request.args.get("sleep_ms", 0))
    except ValueError:
        abort(400, "Parámetros page/size/pages/sleep_ms deben ser enteros")

    if size <= 0 or pages <= 0 or page < 0:
        abort(400, "Parámetros inválidos")

    all_items: List[Dict[str, Any]] = []
    for k in range(pages):
        p = page + k
        items = fetch_browse_page(p, size)
        all_items.extend(items)
        if sleep_ms > 0 and k < pages - 1:
            time.sleep(sleep_ms / 1000.0)

    # Sin metadatos de paginación: solo lo que necesita el front
    return jsonify({"count": len(all_items), "items": all_items})

# Alias para el front: mismo resultado que /api/neos
@app.route("/api/asteroides", methods=["GET"])
def get_asteroides():
    return get_neos()

def get_earth_orbit_json():
    earth_orbit = {
        "id": "earth",
        "name": "Earth",
        "hazardous": False,
        "a": 1.00000011,        # Semi-major axis (AU)
        "e": 0.01671022,        # Eccentricity
        "i": 0.00005,           # Inclination (degrees)
        "om": -11.26064,        # Longitude of ascending node (degrees)
        "w": 102.94719,         # Argument of perihelion (degrees)
        "epoch": 2451545.0,     # Epoch (Julian Date, J2000.0)
        "mean_anomaly_deg": 100.46435,  # Mean anomaly (degrees)
        "M0": 0.9856076686,     # Mean motion (degrees/day)
    }
    return jsonify(earth_orbit)

@app.route("/api/earth", methods=["GET"])
def get_earth():
    return get_earth_orbit_json()

#Ruta para recibir datos en general
@app.route("/api/send-general", methods=["POST"])
def receive_data_general():
    data = request.get_json() #guarda los datos recibidos en formato JSON
    print("Datos recibidos:", data)
    return jsonify({"status": "OK", "received": data}), 200 #Devuelve en formato JSON respuesta correcta

#Ejemplo de recibir datos de asteroides (por si gurdamos en BD algo del front)
@app.route("/api/send-asteroides", methods=["POST"])
def receive_data_asteroides():
    data = request.get_json()
    #Accedemos a los campos de JSON recibido
    nombre = data.get("nombre") 
    posicion = data.get("posicion")
    velocidad = data.get("velocidad")

    print(f"Asteroide: {nombre}")
    print(f"Posición: {posicion}")
    print(f"Velocidad: {velocidad}")

    return jsonify({"status": "OK", "received": data}), 200


if __name__ == "__main__":
    app.run(debug=True)
