from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Permite solicitudes desde cualquier origen

#Datos a mandar
asteroides = [
    { "name": "433 Eros", "a": 1.458, "e": 0.2228, "i": 10.83, "om": 304.27, "w": 178.93, "M0": 310.55, "epoch": 2461000.5 },
    { "name": "719 Albert", "a": 2.637, "e": 0.5466, "i": 11.57, "om": 183.86, "w": 156.19, "M0": 240.61, "epoch": 2461000.5 },
    { "name": "887 Alinda", "a": 2.474, "e": 0.5712, "i": 9.40, "om": 110.41, "w": 350.53, "M0": 81.54, "epoch": 2461000.5 },
    { "name": "1036 Ganymed", "a": 2.665, "e": 0.5332, "i": 26.68, "om": 215.44, "w": 132.50, "M0": 97.59, "epoch": 2461000.5 }
]

#Define ruta en el servidor, para acceder a ella usar /api/asteroides
@app.route("/api/asteroides", methods=["GET"])
def get_asteroides():
    return jsonify(asteroides)

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
