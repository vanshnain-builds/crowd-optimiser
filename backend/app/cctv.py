import os
import time
import threading
from collections import deque
from datetime import datetime, timezone
from typing import Optional

import cv2

try:
    from ultralytics import YOLO
except Exception:
    YOLO = None

try:
    import yt_dlp
except Exception:
    yt_dlp = None


class CCTVAnalyzer:
    """Live CCTV analyzer. Video is the source of truth; no crowd counts are synthesized."""

    def __init__(self):
        self.source = os.getenv("CCTV_SOURCE", "https://www.youtube.com/@ttdevasthanams/live")
        self.source_type = "public-live" if "youtube.com" in self.source or "youtu.be" in self.source else "stream"
        self.camera_name = os.getenv("CCTV_CAMERA_NAME", "Public Live Camera")
        self.zone_area_m2 = float(os.getenv("CCTV_ZONE_AREA_M2", "250"))
        self.flow_line_y = float(os.getenv("CCTV_FLOW_LINE_Y", "0.55"))
        self.capacity_people = int(os.getenv("CCTV_CAPACITY_PEOPLE", "250"))
        self.flow_window_seconds = int(os.getenv("CCTV_FLOW_WINDOW_SECONDS", "60"))
        self.running = False
        self.thread: Optional[threading.Thread] = None
        self.lock = threading.Lock()
        self.latest_frame = None
        self.latest = {
            "enabled": True,
            "source": self.source,
            "source_type": self.source_type,
            "camera_name": self.camera_name,
            "connected": False,
            "people_detected": 0,
            "density_people_per_m2": 0.0,
            "flow_in_per_min": 0.0,
            "flow_out_per_min": 0.0,
            "net_flow_per_min": 0.0,
            "capacity_people": self.capacity_people,
            "capacity_utilization": 0.0,
            "bottleneck": False,
            "risk_score": 0,
            "risk_level": "LOW",
            "last_frame_at": None,
            "fps": 0.0,
            "error": None,
        }
        self.crossings = deque(maxlen=5000)
        self.last_positions = {}
        self.model = None

    def configure(self, source: str, camera_name: Optional[str] = None):
        with self.lock:
            self.source = source.strip()
            self.source_type = "public-live" if "youtube.com" in self.source or "youtu.be" in self.source else "stream"
            if camera_name:
                self.camera_name = camera_name
            self.latest["source"] = self.source
            self.latest["source_type"] = self.source_type
            self.latest["camera_name"] = self.camera_name
            self.latest["error"] = None
        self.stop()
        self.start()

    def start(self):
        if self.running:
            return
        self.running = True
        self.thread = threading.Thread(target=self._worker, daemon=True)
        self.thread.start()

    def stop(self):
        self.running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.5)
        self.thread = None

    def status(self):
        with self.lock:
            return dict(self.latest)

    def _resolve_source(self):
        source = self.source
        if ("youtube.com" in source or "youtu.be" in source) and yt_dlp:
            opts = {
                "quiet": True,
                "no_warnings": True,
                "format": "best[ext=mp4]/best",
                "noplaylist": True,
                "live_from_start": False,
            }
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(source, download=False)
                return info.get("url")
        return source

    def _load_model(self):
        if self.model is not None:
            return self.model
        if YOLO is None:
            raise RuntimeError("Ultralytics is not installed")
        model_name = os.getenv("CCTV_MODEL", "yolo11n.pt")
        self.model = YOLO(model_name)
        return self.model

    def _worker(self):
        while self.running:
            cap = None
            try:
                source = self._resolve_source()
                cap = cv2.VideoCapture(source)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                if not cap.isOpened():
                    raise RuntimeError("Could not open CCTV/public live stream")
                model = self._load_model()
                with self.lock:
                    self.latest["connected"] = True
                    self.latest["error"] = None

                while self.running:
                    ok, frame = cap.read()
                    if not ok:
                        break
                    h, w = frame.shape[:2]
                    result = model.track(frame, persist=True, classes=[0], verbose=False, tracker="bytetrack.yaml")[0]
                    ids = []
                    centers = {}
                    boxes = result.boxes
                    if boxes is not None and len(boxes) > 0:
                        xyxy = boxes.xyxy.cpu().numpy()
                        track_ids = boxes.id.cpu().numpy().astype(int).tolist() if boxes.id is not None else list(range(len(xyxy)))
                        for box, tid in zip(xyxy, track_ids):
                            x1, y1, x2, y2 = box
                            cx = float((x1 + x2) / 2)
                            cy = float((y1 + y2) / 2)
                            ids.append(tid)
                            centers[tid] = (cx, cy)
                            prev = self.last_positions.get(tid)
                            if prev is not None:
                                prev_y = prev[1] / max(1, h)
                                cur_y = cy / max(1, h)
                                if prev_y < self.flow_line_y <= cur_y:
                                    self.crossings.append((time.time(), "in"))
                                elif prev_y >= self.flow_line_y > cur_y:
                                    self.crossings.append((time.time(), "out"))
                            self.last_positions[tid] = (cx, cy)

                    now = time.time()
                    while self.crossings and now - self.crossings[0][0] > self.flow_window_seconds:
                        self.crossings.popleft()
                    in_count = sum(1 for _, d in self.crossings if d == "in")
                    out_count = sum(1 for _, d in self.crossings if d == "out")
                    scale = 60.0 / max(1, self.flow_window_seconds)
                    people = len(ids)
                    density = people / max(1.0, self.zone_area_m2)
                    utilization = people / max(1, self.capacity_people)
                    bottleneck = utilization >= 0.85 or density >= float(os.getenv("CCTV_DENSITY_THRESHOLD", "2.0")) or (in_count - out_count) * scale >= self.capacity_people * 0.15
                    score = min(100, round(utilization * 70 + max(0, density - 1.0) * 10 + max(0, (in_count - out_count) * scale) / max(1, self.capacity_people) * 20))
                    risk = "CRITICAL" if score >= 85 else "HIGH" if score >= 65 else "MODERATE" if score >= 40 else "LOW"
                    with self.lock:
                        self.latest.update({
                            "connected": True,
                            "people_detected": people,
                            "density_people_per_m2": round(density, 3),
                            "flow_in_per_min": round(in_count * scale, 1),
                            "flow_out_per_min": round(out_count * scale, 1),
                            "net_flow_per_min": round((in_count - out_count) * scale, 1),
                            "capacity_utilization": round(min(1.5, utilization), 3),
                            "bottleneck": bottleneck,
                            "risk_score": score,
                            "risk_level": risk,
                            "last_frame_at": datetime.now(timezone.utc).isoformat(),
                            "fps": round(cap.get(cv2.CAP_PROP_FPS) or 0, 1),
                            "error": None,
                        })
                        self.latest_frame = frame
                    time.sleep(0.03)
            except Exception as exc:
                with self.lock:
                    self.latest["connected"] = False
                    self.latest["error"] = str(exc)
                time.sleep(5)
            finally:
                if cap is not None:
                    cap.release()


analyzer = CCTVAnalyzer()
