from datetime import datetime, timezone
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .cctv import analyzer

app = FastAPI(title="Crowd Optimiser API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

class CCTVConfig(BaseModel):
    source: str
    camera_name: str = "Public Live Camera"

@app.on_event("startup")
def startup():
    analyzer.start()

@app.on_event("shutdown")
def shutdown():
    analyzer.stop()

@app.get("/health")
def health():
    return {"status": "ok", "service": "crowd-optimiser", "time": datetime.now(timezone.utc).isoformat(), "cctv_connected": analyzer.status()["connected"]}

@app.get("/api/cctv/status")
def cctv_status():
    return analyzer.status()

@app.post("/api/cctv/config")
def cctv_config(config: CCTVConfig):
    analyzer.configure(config.source, config.camera_name)
    return {"ok": True, "message": "CCTV source configured", "source": config.source}

@app.get("/api/state")
def state():
    s = analyzer.status()
    utilization = float(s["capacity_utilization"])
    score = int(s["risk_score"])
    return {
        "source": "cctv",
        "people": s["people_detected"],
        "density": s["density_people_per_m2"],
        "flow_per_min": s["net_flow_per_min"],
        "capacity_utilization": round(utilization * 100, 1),
        "bottlenecks": 1 if s["bottleneck"] else 0,
        "risk": score,
        "risk_level": s["risk_level"],
        "timestamp": s["last_frame_at"],
    }

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            await ws.send_json({"type": "cctv_state", "payload": analyzer.status()})
            await ws.receive_text()
    except Exception:
        pass
