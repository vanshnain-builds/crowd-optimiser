from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

app = FastAPI(title='Crowd Optimiser API', version='1.0.0')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_credentials=True, allow_methods=['*'], allow_headers=['*'])

@app.get('/health')
def health():
    return {'status':'ok','service':'crowd-optimiser','time':datetime.utcnow().isoformat()}

@app.get('/api/state')
def state():
    return {'people':20000,'density':28,'flow_per_min':92,'capacity_utilization':46,'bottlenecks':0,'risk':28,'risk_level':'LOW'}

@app.get('/api/cctv/status')
def cctv_status():
    return {'enabled':True,'source':'demo','people_detected':183,'density':1.52,'flow_per_min':142,'capacity_utilization':91}

@app.websocket('/ws')
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    await ws.send_json({'type':'connected','payload':{'people':20000,'density':28,'risk':28,'risk_level':'LOW'}})
    while True:
        await ws.receive_text()
