# Crowd Optimiser

Real-time crowd safety and flow optimisation dashboard.

## Frontend
```bash
cd frontend
npm install
npm run dev
```

## Backend
```bash
cd backend
pip install -r requirements-cctv.txt
uvicorn app.main:app --reload --port 8000
```

## Core pipeline
CCTV / simulation -> people state -> density + flow + capacity -> bottleneck -> risk -> dynamic A* routing -> AI safety explanation -> operator dashboard.
