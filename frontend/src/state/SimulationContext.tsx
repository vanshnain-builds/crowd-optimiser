import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SCENARIO, STADIUM_A, NODE_MAP, EDGE_MAP, shortestPath } from '@/data/venue';
import type { Scenario, SimSnapshot, ConnectionState, EmergencyEvent, AIProcessingStage, RiskLevel, VenueEdge } from '@/types';

const C = createContext<any>(null);
let seq = 0;
const API = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:8000';

function makeSnapshot(s: Scenario, cctv: any, status: any, speed: number, em: EmergencyEvent | null): SimSnapshot {
  const observed = Number(cctv?.people_detected || 0);
  const density = Number(cctv?.density_people_per_m2 || 0);
  const flowIn = Number(cctv?.flow_in_per_min || 0);
  const flowOut = Number(cctv?.flow_out_per_min || 0);
  const netFlow = Number(cctv?.net_flow_per_min || 0);
  const util = Number(cctv?.capacity_utilization || 0);
  const riskScore = Number(cctv?.risk_score || 0);
  const riskLevel = (em ? 'emergency' : cctv?.risk_level?.toLowerCase() || 'low') as RiskLevel;
  const closed = em?.closedEdgeIds ?? [];

  const edges: Record<string, VenueEdge> = {};
  STADIUM_A.edges.forEach(e => {
    edges[e.id] = { ...e, flow: 0, density: 0, status: closed.includes(e.id) ? 'emergency-closed' : 'open' };
  });
  // A camera is explicitly mapped to the East Gate corridor in the prototype.
  // These values are measured by OpenCV/YOLO; we do not manufacture individual agents.
  const observedEdge = edges['e-ge-je'];
  if (observedEdge) {
    observedEdge.flow = Math.max(0, flowIn);
    observedEdge.density = Math.min(1.5, util);
    observedEdge.status = closed.includes(observedEdge.id) ? 'emergency-closed' : util >= 0.85 ? 'congested' : 'open';
  }

  const bottlenecks = cctv?.bottleneck && observedEdge ? [{
    id: 'bn-live-east', edgeId: observedEdge.id, location: `${NODE_MAP[observedEdge.from].label} → ${NODE_MAP[observedEdge.to].label}`,
    risk: riskLevel === 'low' ? 'moderate' as RiskLevel : riskLevel, capacityUtilization: util,
    timeToCriticalMin: util >= 0.9 ? 2 : Math.max(1, Math.round((0.9 - util) * 10)),
    recommendedAction: 'Reduce incoming load and redirect arrivals to a lower-load corridor.',
  }] : [];

  const predicted = !cctv?.bottleneck && util >= 0.65 && observedEdge ? [{
    id: 'pred-live-east', edgeId: observedEdge.id, location: `${NODE_MAP[observedEdge.from].label} → ${NODE_MAP[observedEdge.to].label}`,
    risk: 'moderate' as RiskLevel, capacityUtilization: util, timeToCriticalMin: Math.max(1, Math.round((0.9 - util) * 10)),
    recommendedAction: 'Pre-emptively route new arrivals toward a lower-load corridor.', predicted: true,
  }] : [];

  const route = shortestPath('gate-e', 'stage') || [];
  const segments = route.slice(0, -1).map((n, i) => {
    const e = STADIUM_A.edges.find(x => (x.from === n && x.to === route[i + 1]) || (x.to === n && x.from === route[i + 1]))!;
    return { edgeId: e.id, fromNodeId: n, toNodeId: route[i + 1] };
  });
  const altPath = shortestPath('gate-w', 'stage') || [];
  const altSeg = altPath.slice(0, -1).map((n, i) => {
    const e = STADIUM_A.edges.find(x => (x.from === n && x.to === altPath[i + 1]) || (x.to === n && x.from === altPath[i + 1]))!;
    return { edgeId: e.id, fromNodeId: n, toNodeId: altPath[i + 1] };
  });

  const rec = {
    id: 'ai-live-' + seq++,
    headline: bottlenecks.length ? 'Live bottleneck detected' : predicted.length ? 'Bottleneck forming' : 'Live crowd conditions are stable',
    explanation: bottlenecks.length
      ? `${bottlenecks[0].location} is at ${Math.round(util * 100)}% of calibrated capacity. Computer vision observes ${observed.toLocaleString()} people with ${Math.round(flowIn)}/min entering and ${Math.round(flowOut)}/min leaving.`
      : `OpenCV/YOLO currently observes ${observed.toLocaleString()} people. Current density is ${density.toFixed(2)} people/m² and net flow is ${Math.round(netFlow)}/min.`,
    recommendedAction: bottlenecks.length ? bottlenecks[0].recommendedAction : 'Continue monitoring the live camera and keep the current routing plan.',
    confidence: 'high' as const,
    basis: `Live CV · ${observed.toLocaleString()} people · ${density.toFixed(2)} p/m² · ${Math.round(util * 100)}% capacity · ${Math.round(netFlow)}/min net flow`,
    riskLevel, atMinute: 0,
  };

  return {
    simulation: { status, simTimeMin: 0, speedMultiplier: speed, agents: [] },
    metrics: { peopleCount: observed, avgDensity: density, flowRate: Math.round(netFlow), avgSpeed: 1.25, capacityUtilization: util },
    safety: { riskLevel, riskScore, bottlenecks, predictedBottlenecks: predicted, alerts: bottlenecks.map(b => ({ id: b.id, severity: b.risk, title: `Bottleneck: ${b.location}`, message: `Live CCTV reports ${Math.round(b.capacityUtilization * 100)}% capacity utilization.` })) },
    routing: { activeRoutes: [{ id: 'r-main', label: 'East Gate → Main Stage', segments, cost: segments.length, flow: Math.max(0, Math.round(flowIn)), status: bottlenecks.length ? 'rerouting' : 'active' }], alternativeRoutes: [{ id: 'r-alt', label: 'West Gate → Main Stage', segments: altSeg, cost: altSeg.length + 1, flow: Math.max(0, Math.round(flowOut)), status: bottlenecks.length ? 'recommended' : 'standby' }], disabledEdges: closed, recentChanges: bottlenecks.length ? [{ id: 'rc-live', reason: 'Live CCTV bottleneck detected; A* alternative route recommended', redistributedFlow: Math.max(0, Math.round(netFlow)) }] : [] },
    ai: { analyst: { stage: 'complete', current: rec, history: [rec] } },
    emergency: em,
    timeline: [{ id: 't-live', kind: 'simulation', title: 'Live CCTV analytics active', atMinute: 0 }, ...bottlenecks.map(b => ({ id: b.id, kind: 'bottleneck' as const, title: b.location, atMinute: 0, severity: b.risk }))],
  } as SimSnapshot;
}

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenario] = useState(DEFAULT_SCENARIO);
  const [status, setStatus] = useState<any>('idle');
  const [speed, setSpeed] = useState(1);
  const [em, setEm] = useState<EmergencyEvent | null>(null);
  const [selectedNodeId, setNode] = useState<string | null>(null);
  const [selectedEdgeId, setEdge] = useState<string | null>(null);
  const [layers, setLayers] = useState({ crowd: true, density: true, bottlenecks: true, routes: true, heatmap: true });
  const [aiStage, setAiStage] = useState<AIProcessingStage>('idle');
  const [aiNotes, setAiNotes] = useState<string[]>([]);
  const [aiExtracted, setAiExtracted] = useState<any>(null);
  const [cctv, setCctv] = useState<any>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting' as ConnectionState);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`${API}/api/cctv/status`, { cache: 'no-store' });
        if (!r.ok) throw new Error(`CCTV API ${r.status}`);
        const data = await r.json();
        if (alive) { setCctv(data); setConnection(data.connected ? 'live' : 'degraded' as ConnectionState); }
      } catch { if (alive) setConnection('offline' as ConnectionState); }
    };
    poll();
    const id = window.setInterval(poll, 2000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  const snapshot = useMemo(() => cctv ? makeSnapshot(scenario, cctv, status === 'idle' ? 'paused' : status, speed, em) : null, [scenario, cctv, status, speed, em]);
  const liveEdges = useMemo(() => snapshot ? Object.fromEntries(STADIUM_A.edges.map(e => [e.id, snapshot.routing.disabledEdges.includes(e.id) ? { ...e, status: 'emergency-closed' } : { ...e, ...(e.id === 'e-ge-je' ? { density: snapshot.metrics.capacityUtilization, flow: cctv?.flow_in_per_min || 0, status: snapshot.safety.bottlenecks.length ? 'congested' : 'open' } : {}) }])) : {}, [snapshot, cctv]);

  const interpretScenario = (text: string) => {
    setAiStage('understanding');
    window.setTimeout(() => setAiStage('extracting'), 300);
    window.setTimeout(() => { const m = text.match(/([\d,]+)\s*people/i)?.[1]; const crowdSize = m ? Number(m.replace(/,/g, '')) : scenario.crowdSize; setAiExtracted({ name: 'Live CCTV Scenario', crowdSize, source: cctv?.source }); setAiNotes([`Live observed: ${(cctv?.people_detected || 0).toLocaleString()} people`, `Camera: ${cctv?.camera_name || 'Public Live Camera'}`, `Source: ${cctv?.source_type || 'CCTV'}`]); setAiStage('ready'); }, 700);
  };

  const api = {
    snapshot, connection, scenario, liveEdges, liveAgents: [], cctv,
    start: () => setStatus('running'), pause: () => setStatus('paused'), resume: () => setStatus('running'), reset: () => { setStatus('idle'); setEm(null); }, setSpeedMult: setSpeed, setScenario, interpretScenario,
    aiStage, aiNotes, aiExtracted,
    triggerEm: (type: any, nodeId: string) => { const closed = STADIUM_A.edges.filter(e => e.from === nodeId || e.to === nodeId).slice(0, 2).map(e => e.id); setEm({ id: 'em-' + (++seq), type, location: NODE_MAP[nodeId]?.label ?? nodeId, summary: `${type} incident reported. Affected corridors are being isolated and A* routes recalculated using the current live crowd state.`, active: true, closedEdgeIds: closed, nodeId } as any); },
    clearEm: () => setEm(null), ackAlert: () => {}, selectedNodeId, selectedEdgeId, selectNode: setNode, selectEdge: setEdge, layers, toggleLayer: (k: any) => setLayers((x: any) => ({ ...x, [k]: !x[k] })),
  };
  return <C.Provider value={api}>{children}</C.Provider>;
}
export function useSimulation() { return useContext(C)!; }
