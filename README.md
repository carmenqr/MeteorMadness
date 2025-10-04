# 🌠 Welcome to Meteor Bot App!

**Meteor Bot App** is an interactive educational platform that brings the science of asteroid impacts to life.  
Developed by **Orbit-ers**, this project aims to transform real NASA and USGS data into intuitive, visual stories that empower people to understand planetary risks.

## 🚀 About the Project

The app integrates **NASA’s Near-Earth Object (NEO) datasets** for orbital modeling and **USGS elevation data** for terrain and impact analysis.  
By combining physics-based simulation with modern web technologies, **Meteor Bot App** enables users to:

- 🌍 **Visualize 3D asteroid orbits** and query their parameters in real time.  
- ☄️ **Simulate asteroid impacts** and explore the effects of "Impactor-2025" on Earth.  
- 🌊 **Analyze 2D consequence maps**, including craters, shock waves, tsunamis, and local terrain impact.  
- 🧠 **Learn about deflection strategies** and mitigation approaches through an accessible, didactic interface.

Whether you’re a **scientist**, **educator**, **student**, or **policy-maker**, our goal is to make asteroid impact science **interactive, visual, and understandable**.

# ⚙️ Installation Guide
## 🚀 Getting Started

Follow these steps to set up the project locally.

### 1️⃣ Clone the repository

git clone https://github.com/carmenqr/MeteorMadness.git
cd MeteorMadness

### 2️⃣ Set up the Backend (Flask + Python)
cd back

#### Create
python -m venv env

#### Activate (Linux/Mac)
source env/bin/activate

#### Activate (Windows)
env\Scripts\activate

#### Install dependencies
pip install -r requirements.txt

#### Configurate APIs
export NASA_API_KEY="BrayMFziYdhq2l5OaNMzEnpL46gaVEWEbVjDzOQe"

#### Run the Flask App
python app.py


### 3️⃣ Set up the Frontend (React + Vite)
open a new terminal
cd front
npm install

#### Start the development server
npm run dev
you'll see VITE vX.Y.Z  ready
Now open your browser at http://127.0.0.1:5173/
