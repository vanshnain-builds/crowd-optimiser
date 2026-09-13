import { useState } from 'react';
import { Camera, Video, Maximize2, Activity } from 'lucide-react';
import { useSimulation } from '@/state/SimulationContext';

const API = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8000';

export function CameraWall() {
  const { cctv } = useSimulation();
  const [src, setSrc] = useState('');
  const [cameraName, setCameraName] = useState('Public Live Camera');
  const [playing, setPlaying] = useState(false);
  const source = src || cctv?.source || (import.meta.env.VITE_CCTV_URL as string | undefined) || '';
  const applySource = async () => {
    if (!src.trim()) return;
    try {
      await fetch(`${API}/api/cctv/config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: src.trim(), camera_name: cameraName }) });
      setPlaying(true);
    } catch { /* dashboard continues in offline mode */ }
  };
  const connected = !!cctv?.connected;
  return <div className="camera-wall">
    <div className="camera-wall__header"><div><div className="camera-wall__title">Camera context</div><div className="camera-wall__subtitle">Live source · OpenCV + YOLO analytics</div></div><span className="live-badge"><span>●</span>{connected ? 'ANALYZING' : source ? 'CONNECTING' : 'NO SOURCE'}</span></div>
    <div className="camera-wall__body">
      <div className="camera-main">
        {source && !source.startsWith('rtsp://') && !source.includes('youtube.com') ? <video className="camera-main__video" src={source} controls autoPlay={playing} muted playsInline /> : <div className="camera-main__offline"><Camera size={20}/><strong>{connected ? 'Backend CV analysis active' : 'Enter a public live video or authorized CCTV stream'}</strong><span>RTSP and YouTube live sources are processed server-side by OpenCV; browser preview needs HLS/MP4/WebRTC.</span></div>}
        <div className="camera-main__overlay"><span>CAM-01</span><span>{cctv?.camera_name || cameraName}</span><span>• {connected ? 'LIVE CV' : 'WAITING'}</span></div><button className="camera-expand" onClick={() => setPlaying(v => !v)}><Maximize2 size={12}/></button>
      </div>
      <div className="camera-feed-list">
        <div className="camera-feed camera-feed--active"><div className="camera-feed__thumb"><div style={{height:'100%',background:'#0b1219'}}/></div><div className="camera-feed__meta"><strong>Live source</strong><small>{cctv?.source_type || 'public-live'}</small></div></div>
        <div className="camera-feed"><div className="camera-feed__thumb"/><div className="camera-feed__meta"><strong>People detected</strong><small>{(cctv?.people_detected ?? 0).toLocaleString()}</small></div></div>
        <div className="camera-feed"><div className="camera-feed__thumb"/><div className="camera-feed__meta"><strong>Live flow</strong><small>{Math.round(cctv?.net_flow_per_min ?? 0)}/min net</small></div></div>
        <div className="camera-source"><div className="text-[9px] mb-1">Public live / authorized CCTV URL</div><div className="flex gap-1"><input className="cmd-input flex-1" value={src} onChange={e=>setSrc(e.target.value)} placeholder="YouTube live / RTSP / HLS"/><button className="icon-btn px-2" onClick={applySource}><Video size={12}/></button></div><div className="mt-1"><input className="cmd-input w-full" value={cameraName} onChange={e=>setCameraName(e.target.value)} placeholder="Camera / venue name"/></div></div>
      </div>
    </div>
    <div className="camera-wall__footer"><Activity size={12}/> Source data is observed from the selected live stream. OpenCV reads frames; YOLO detects/tracks people; flow crossings and calibrated capacity drive the bottleneck/risk engine.</div>
  </div>;
}
