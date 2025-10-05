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

Before starting, make sure you have installed:

- [Python 3.10+](https://www.python.org/downloads/)
- [Node.js 18+ and npm](https://nodejs.org/)
- [Git](https://git-scm.com/downloads)

> 💡 *Tip: To check if they’re installed, run in your terminal:*
> ```bash
> python --version
> npm --version
> git --version
> ```

If Python is **not installed**:
- 🐍 Go to [python.org/downloads](https://www.python.org/downloads/) and install the latest version.
- During installation, **check the box** that says *“Add Python to PATH”*.
- After that, you can verify:
```bash
  python --version
```

If Git is **not installed**:
- 🧩 Download and install from [git-scm.com/downloads](/https://git-scm.com/downloads) and install the latest version.
- **Accept** “Add Git to PATH” during setup.
- After that, you can verify:
```bash
  git --version
```

If Node is **not installed**:
- ⚡ Open a new terminal and run the following command to install nvm (version manager):
```bash
  nvm install --lts
```
- After that, you can verify:
```bash
  node --version
  # You can also check Node Package Manager's version
  npm --version
```

### 1️⃣ Clone the repository
```bash
git clone https://github.com/carmenqr/MeteorMadness.git

cd MeteorMadness
```
### 2️⃣ Set up the Backend (Flask + Python)
Open a new terminal and move to the backend directory:
```bash
cd backend
```
#### Create
```bash
python -m venv env
```
#### Activate (Linux/Mac)
```bash
source env/bin/activate
```
#### Install dependencies
```bash
pip install -r requirements.txt
```
#### Configurate APIs
```bash
# This API_KEY is an example generated in: https://api.nasa.gov/
export NASA_API_KEY="BrayMFziYdhq2l5OaNMzEnpL46gaVEWEbVjDzOQe"
```
#### Run the Flask App
```bash
python app.py
```

### 3️⃣ Set up the Frontend (React + Vite)
Open a new terminal and move to the frontend directory:
```bash
cd frontend
```

### Ensure Node version and istall dependencies
```bash
# Ensure correct Node version
nvm use

# Install dependencies
npm ci
```
#### Start the development server
```bash
npm run dev
-- You'll see VITE vX.Y.Z  ready
```
Now open your browser at http://127.0.0.1:5173/


## ✅ The app is now running locally!
Backend → http://127.0.0.1:5000/

Frontend → http://localhost:5173/

You can now explore:

🌌 3D orbits of asteroids

☄️ Interactive impact simulations

🌍 Mitigation scenarios


Made with ❤️ by Orbit-ers
NASA Space Apps Challenge — Meteor Madness 2025
(AI-generated assistance used for documentation formatting)
