# <p align="center">🌐 ASTRAM</p>
### <p align="center">**AI-Powered Smart Traffic Management & Emergency Response System**</p>

<p align="center">
  <img src="frontend/public/logo.jpg" alt="ASTRAM Logo" width="200" height="200" style="border-radius: 20%; box-shadow: 0 4px 10px rgba(0,0,0,0.15);" />
</p>

<p align="center">
  <a href="https://github.com/Sanjayduduka45/ASTRAM-Flipkart-Gridlock-2.0-Smart-Traffic-Management-Emergency-Response-System.git">
    <img src="https://img.shields.io/badge/GitHub-Repository-2563EB?style=for-the-badge&logo=github&logoColor=white" alt="GitHub Repository" />
  </a>
  <a href="https://astram-flipkart-gridlock-2-0-smart.vercel.app">
    <img src="https://img.shields.io/badge/Vercel-Frontend_Live-black?style=for-the-badge&logo=vercel&logoColor=white" alt="Frontend Live" />
  </a>
  <a href="https://astram-flipkart-gridlock-20-smart-traffic-manag-production.up.railway.app/docs">
    <img src="https://img.shields.io/badge/Railway-API_Docs-0B0D18?style=for-the-badge&logo=railway&logoColor=white" alt="API Docs" />
  </a>
</p>

---

## 📋 Table of Contents
1. [Project Overview](#-project-overview)
2. [Live Demos & API Docs](#-live-demos--api-docs)
3. [Key Features](#-key-features)
4. [System Architecture](#-system-architecture)
5. [Technology Stack](#-technology-stack)
6. [Screenshots](#-screenshots)
7. [Project Structure](#-project-structure)
8. [Installation Guide](#-installation-guide)
9. [API Usage & Endpoints](#-api-usage--endpoints)
10. [Deployment Architecture](#-deployment-architecture)
11. [Future Enhancements](#-future-enhancements)
12. [Team & Credentials](#-team--credentials)
13. [License](#-license)

---

## 🔍 Project Overview

### 🚦 The Traffic Gridlock Challenge
Urban centers like Bengaluru suffer from extreme traffic congestion, costing billions in lost productivity, escalating carbon emissions, and critically delaying emergency responders (ambulances, police, and fire crews). Heavy monsoon seasons introduce additional road hazards like waterlogging and tree falls, causing disjointed traffic management desks to collapse under severe bottlenecks.

### 💡 The ASTRAM Solution
**ASTRAM** (AI-Powered Smart Traffic Management & Emergency Response System) is a government-grade unified command platform designed to resolve urban gridlocks. It merges real-time telemetry analytics, machine-learning-driven bottleneck forecasting, weather hazard indicators, and automated emergency squad dispatch routines with a citizen portal and mobile routing simulator.

By bridging **Traffic Police**, **BBMP Municipal Operations**, and **Emergency Services** into one cohesive desk, ASTRAM achieves a dynamic, closed-loop urban optimization flow where incidents are reported by the public, verified by AI models, routed preemptively, and resolved by dispatched crews in real-time.

---

## 🚀 Live Demos & API Docs

* **🌐 Frontend Production (Vercel):** [https://astram-flipkart-gridlock-2-0-smart.vercel.app](https://astram-flipkart-gridlock-2-0-smart.vercel.app)
* **🔌 Backend API Gateway (Railway):** [https://astram-flipkart-gridlock-20-smart-traffic-manag-production.up.railway.app](https://astram-flipkart-gridlock-20-smart-traffic-manag-production.up.railway.app)
* **📄 Interactive Swagger API Documentation:** [https://astram-flipkart-gridlock-20-smart-traffic-manag-production.up.railway.app/docs](https://astram-flipkart-gridlock-20-smart-traffic-manag-production.up.railway.app/docs)

---

## ✨ Key Features

* **🤖 AI Traffic Risk Prediction:** Utilizes advanced classification models to calculate road closure probabilities, traffic rise percentages, and congestion impact indices for public event gathers.
* **📈 Congestion Analytics Dashboard:** Displays interactive telemetry tracking average speeds, bottleneck locations, and peak traffic volume windows.
* **🧠 Explainable AI Insights (SHAP):** Features machine learning transparency dashboards showing how features like crowd sizes, rain mm, and duration impact AI risk calculations.
* **🚨 Emergency Response Management:** Direct dispatch desk to establish **Green Corridors** with automated traffic signal preemption timers for ambulances and emergency units.
* **📢 Citizen Incident Reporting:** Responsive geo-located form for citizens to file pothole, waterlogging, or accident reports with Base64 camera image uploads.
* **🌦️ Weather-Based Risk Analysis:** Auto-polls meteorological streams to correlate rainfall intensity with travel delay increments.
* **📊 Executive Reporting:** Generates high-fidelity summaries of active deployment plans, municipal resources, and city traffic indices.
* **📺 Real-Time Monitoring Dashboard:** Simulates live CCTV camera feeds monitoring traffic volume, vehicle queues, and stream latency at major intersections.
* **🔌 API-Driven Architecture:** Backed by high-throughput FastAPI endpoints and a persistent PostgreSQL schema managed via Supabase.

---

## 🏗️ System Architecture

```
                       ┌─────────────────────────┐
                       │   Citizen Mobile PWA    │
                       └────────────┬────────────┘
                                    │ (Submit Reports / Navigation)
                                    ▼
                       ┌─────────────────────────┐
                       │  React Vite Frontend    │
                       └────────────┬────────────┘
                                    │ (REST / JSON Payload)
                                    ▼
                       ┌─────────────────────────┐
                       │   FastAPI Backend API   │
                       └────────────┬────────────┘
                                    ├──────────────────────────────┐
                                    ▼                              ▼
                       ┌─────────────────────────┐    ┌─────────────────────────┐
                       │   ML Prediction Engine  │    │   Supabase DB Store     │
                       │ (Classifier & SHAP Exp) │    │ (PostgreSQL / Telemetry)│
                       └─────────────────────────┘    └─────────────────────────┘
                                    │                              │
                                    └──────────────┬───────────────┘
                                                   ▼
                                      ┌─────────────────────────┐
                                      │  Analytics & PDF Reports│
                                      └─────────────────────────┘
```

---

## 🛠️ Technology Stack

### **Frontend & Visuals**
* **Framework:** React (v19) & Vite (Fast SPA Build Tool)
* **Language:** TypeScript (Type Safety & Maintainability)
* **Styling:** Tailwind CSS (Responsive Utility-First Layout)
* **Charts:** Recharts (High-Performance SVG Telemetry Charts)
* **Maps:** Leaflet & React Leaflet (Interactive GIS Overlays)

### **Backend & Machine Learning**
* **Framework:** FastAPI (High-performance ASGI API framework)
* **Runtime:** Python (v3.11+)
* **Server:** Uvicorn (ASGI web server)
* **Models:** Scikit-Learn (Predictive engine), SHAP (Explainability values), Joblib (Model serialization)

### **Database & Hosting**
* **Database:** PostgreSQL (Database store)
* **Provider:** Supabase (Real-time SQL and REST client connection)
* **Hosting (Backend):** Railway (Automatic server builds and scale)
* **Hosting (Frontend):** Vercel (Optimized static deployment and routing)

---

## 📸 Screenshots

### 🖥️ Desktop Overview Dashboard
![Dashboard Placeholder](https://raw.githubusercontent.com/Sanjayduduka45/ASTRAM-Flipkart-Gridlock-2.0-Smart-Traffic-Management-Emergency-Response-System/main/frontend/public/og-image.png)
*Unified Command Center showing metrics, live map overlays, resource counters, and recent alerts feed.*

### 📊 Congestion Analytics
*(Placeholder for Analytics Screen)*
*Hourly delay indicators, historical baselines, and rainfall speed-drop correlations.*

### 🧠 Explainability Dashboard
*(Placeholder for SHAP Insights)*
*Real-time feature weights showing model risk decisions.*

### 📢 Citizen Reporting Interface
*(Placeholder for Reporting Screen)*
*Mobile simulator showing Base64 photo attachment, severity tags, and character counters.*

### 🚨 Emergency Corridor Planner
*(Placeholder for Dispatch Screen)*
*Establishment of preemptive green corridor timers.*

### 🔮 Traffic Risk Prediction
*(Placeholder for Prediction Screen)*
*Predictive bottleneck impact form and simulated event congestion graphs.*

---

## 📂 Project Structure

```
ASTRAM/
├── Data/                       # Raw datasets & simulation logs
├── serve/                      # Python FastAPI Backend
│   ├── main.py                 # API Gateway, routes, and DB connectors
│   ├── predictor.py            # SHAP explainer & predictor wrapper
│   └── schema.py               # Data validation models
├── models/                     # Trained ML model weights (.pkl)
├── artifacts/                  # Serialized classifiers & preprocessors
├── frontend/                   # React TypeScript Frontend
│   ├── public/                 # Static assets (logo, icons, manifests)
│   └── src/
│       ├── components/         # Reusable widgets (Layout, Maps, Mobile device)
│       ├── pages/              # Platform tabs (Analytics, BBMP, Command desk)
│       └── config/             # Environment API URL mappings
├── Procfile                    # Railway start script
├── runtime.txt                 # Railway python version pin
└── requirements.txt            # Python dependencies
```

---

## 💻 Installation Guide

### Prerequisites
* Python 3.11.x installed.
* Node.js v18+ installed.

### 1. Clone the Repository
```bash
git clone https://github.com/Sanjayduduka45/ASTRAM-Flipkart-Gridlock-2.0-Smart-Traffic-Management-Emergency-Response-System.git
cd ASTRAM-Flipkart-Gridlock-2.0-Smart-Traffic-Management-Emergency-Response-System
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory:
```env
VITE_API_URL=http://localhost:8000
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
```

### 3. Backend Setup
```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Launch FastAPI local server
python -m uvicorn serve.main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. Frontend Setup
```bash
cd frontend

# Install package dependencies
npm install

# Start Vite local development server
npm run dev
```

---

## 🔌 API Usage & Endpoints

### 1. Get System Health
* **Endpoint:** `GET /api/health`
* **Response:**
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-06-21T17:15:00.000Z",
    "version": "1.0.0"
  }
  ```

### 2. Predict Event Traffic Impact
* **Endpoint:** `POST /api/predict`
* **Request Payload:**
  ```json
  {
    "event_name": "IPL Cricket Tournament",
    "location": "Chinnaswamy Stadium",
    "expected_crowd": 45000,
    "duration_hours": 6,
    "weather": "Rainy"
  }
  ```
* **Response Payload:**
  ```json
  {
    "congestion_level": "CRITICAL",
    "traffic_increase_pct": 82,
    "expected_delay_mins": 45,
    "risk_score": 85.5,
    "recommendations": [
      "Position 12 officers at stadium exits.",
      "Activate dynamic VMS warnings.",
      "Preempt signals at MG Road."
    ]
  }
  ```

### 3. Additional Core Endpoints
* `GET /api/congestion` - Fetch real-time junction flow speeds.
* `GET /api/explainability` - Fetch SHAP force plot weights for the last query.
* `GET /api/weather` - Fetch current Bengaluru telemetry sensor metrics.

---

## ☁️ Deployment Architecture

* **Frontend:** Hosted on **Vercel** with SPA route rewriting configured inside `vercel.json` to route all virtual pathways to `index.html`.
* **Backend:** Hosted on **Railway** utilizing a root `Procfile` mapping:
  `web: python -m uvicorn serve.main:app --host 0.0.0.0 --port $PORT`
* **API Documentation:** Integrated via Swagger UI and accessible directly on the live backend base path.

---

## 🔮 Future Enhancements

* **🎥 CCTV AI Traffic Counter:** Integrated video-processing pipelines to calculate traffic density on live feeds.
* **🚦 Adaptive Smart Signals:** Dynamic grid phase adjustment adapting green light duration to queue sizes.
* **🌐 Digital Twin Simulation:** 3D visual twin representing vehicle flow predictions to simulate layout shifts.

---

## 👥 Team & Credentials

* **Developer:** Sanjay Duduka
* **Institution:** SR University
* **Hackathon Challenge:** Flipkart Gridlock 2.0 Hackathon Submission

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
