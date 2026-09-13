import { useEffect, useMemo, useState } from 'react';
import './index.css';

const groups = [
  { name: 'Front-of-stage', people: 9000, entry: 'East Gate', destination: 'Main Stage' },
  { name: 'Mid-field', people: 7000, entry: 'East Gate', destination: 'Main Stage' },
  { name: 'West-side', people: 2500, entry: 'West Gate', destination: 'Main Stage' },
  { name: 'Food-court', people: 1500, entry: 'South Gate', destination: 'North Food Court' },
];

function App() {
  const [running, setRunning] = useState(false);
  const [density, setDensity] = useState(28);
  const [flow, setFlow] = useState(92);
  const [selected, setSelected] = useState('East Junction');
  const [emergency, setEmergency] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setDensity((d) => Math.min(96, d + 2));
      setFlow((f) => Math.max(45, f - 1));
    }, 1100);
    return () => window.clearInterval(id);
  }, [running]);

  const risk = useMemo(() => emergency ? 92 : density, [density, emergency]);
  const riskLevel = emergency ? 'EMERGENCY' : risk >= 85 ? 'CRITICAL' : risk >= 60 ? 'HIGH' : risk >= 35 ? 'MODERATE' : 'LOW';
  const bottleneck = density >= 70 || emergency;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div><div className="eyebrow">LIVE CROWD OPERATIONS</div><h1>Crowd Optimiser</h1></div>
        <div className="top-actions">
          <button onClick={() => setRunning((v) => !v)}>{running ? 'Pause' : 'Start simulation'}</button>
          <button className="ghost" onClick={() => { setRunning(false); setDensity(28); setFlow(92); setEmergency(false); }}>Reset</button>
        </div>
      </header>

      <main>
        <section className="metrics">
          <Metric label="People" value="20,000" />
          <Metric label="Density" value={`${density}%`} />
          <Metric label="Flow / min" value={`${flow}`} />
          <Metric label="Avg speed" value={`${Math.max(31, 68 - Math.floor(density / 3))}`} />
          <Metric label="Capacity" value={`${Math.min(97, density + 18)}%`} />
          <Metric label="Bottlenecks" value={bottleneck ? '1' : '0'} />
          <Metric label="Risk" value={riskLevel} alert={risk >= 70} />
        </section>

        <section className="layout">
          <div className="main-column">
            <div className="card map-card">
              <div className="card-head"><div><div className="eyebrow">VENUE GRAPH</div><h2>Live crowd flow</h2></div><span className={`pill ${riskLevel.toLowerCase()}`}>{riskLevel}</span></div>
              <div className="venue">
                <button className="map-node gate east">East Gate</button>
                <button className="map-node gate west">West Gate</button>
                <button className="map-node gate south">South Gate</button>
                <button className={`map-node junction ${bottleneck ? 'hot' : ''}`} onClick={() => setSelected('East Junction')}>East Junction</button>
                <button className="map-node junction north" onClick={() => setSelected('North Junction')}>North Junction</button>
                <div className="map-node stage">Main Stage</div>
                <div className="map-node food">North Food Court</div>
                <div className="edge e1" /><div className="edge e2" /><div className="edge e3" /><div className="edge e4" /><div className="edge e5" /><div className="edge e6" />
                {Array.from({length: 42}).map((_, i) => <span key={i} className="agent" style={{left: `${10 + ((i * 17) % 78)}%`, top: `${14 + ((i * 29) % 68)}%`, animationDelay: `${i * 70}ms`}} />)}
              </div>
              <div className="legend"><span><i className="dot green" /> Open</span><span><i className="dot amber" /> Congested</span><span><i className="dot red" /> Bottleneck</span></div>
            </div>

            <div className="grid2">
              <div className="card"><div className="card-head"><h3>Camera context</h3><span className="live">LIVE</span></div><div className="camera"><div className="camera-grid" /><div className="camera-count">183 <span>people detected</span></div></div><div className="camera-stats"><span>Density <b>1.52 p/m²</b></span><span>Flow <b>142/min</b></span><span>Capacity <b>91%</b></span></div></div>
              <div className="card"><div className="card-head"><h3>Inspector</h3><span className="eyebrow">NODE</span></div><h4>{selected}</h4><div className="inspector-grid"><span>Occupancy<b>{Math.round(density * 1.8)}</b></span><span>Utilisation<b>{Math.min(97, density + 18)}%</b></span><span>Flow<b>{flow}/min</b></span><span>TTC<b>{bottleneck ? '06 min' : '—'}</b></span></div></div>
            </div>
          </div>

          <aside className="sidebar">
            <div className="card"><div className="eyebrow">BOTTLENECKS</div><h3>{bottleneck ? 'East Junction requires attention' : 'No active bottleneck'}</h3><div className="severity"><span>Utilisation</span><b>{Math.min(97, density + 18)}%</b></div><div className="severity"><span>Time to critical</span><b>{bottleneck ? '06 min' : '—'}</b></div></div>
            <div className="card"><div className="eyebrow">AI SAFETY ANALYST</div><h3>{bottleneck ? 'East Junction is becoming constrained.' : 'Conditions are currently stable.'}</h3><p>{bottleneck ? 'Redirect incoming crowd to an alternative corridor and monitor the east approach.' : 'Current flow and density remain within the operating envelope. Continue monitoring.'}</p><div className="ai-note">Basis: live density, flow, capacity and route state.</div></div>
            <div className="card"><div className="eyebrow">DYNAMIC ROUTING</div><h3>Current route</h3><div className="route">East Gate <span>→</span> East Junction <span>→</span> Main Stage</div><div className="route alt">Alternative <span>→</span> West Junction <span>→</span> Main Stage</div></div>
            <div className="card"><div className="eyebrow">EMERGENCY CONTROL</div><div className="emergency-grid">{['Fire','Medical','Structural','Security'].map((x) => <button key={x} className="danger" onClick={() => setEmergency(true)}>{x}</button>)}</div>{emergency && <button className="clear" onClick={() => setEmergency(false)}>Clear emergency</button>}</div>
          </aside>
        </section>

        <section className="card scenario"><div><div className="eyebrow">SCENARIO</div><h3>20,000-person evening concert</h3><p>Four crowd groups enter through three gates and route toward the stage or food court.</p></div><div className="groups">{groups.map((g) => <div key={g.name} className="group"><b>{g.name}</b><span>{g.people.toLocaleString()} people</span><small>{g.entry} → {g.destination}</small></div>)}</div></section>
      </main>
    </div>
  );
}
function Metric({label,value,alert=false}:{label:string,value:string,alert?:boolean}){return <div className={`metric ${alert?'alert':''}`}><span>{label}</span><b>{value}</b></div>}
export default App;
