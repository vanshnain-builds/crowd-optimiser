import { useRef, useEffect, useCallback, useState } from 'react';
import { useSimulation } from '@/state/SimulationContext';
import { STADIUM_A, NODE_MAP, EDGE_MAP } from '@/data/venue';
import { nodeKindColor, nodeKindRadius } from '@/utils/venueColors';
import { riskColor } from '@/utils/display';
import type { VenueNode, VenueEdge, SimAgent } from '@/types';

const LOGICAL_W = 1000;
const LOGICAL_H = 620;
interface ViewState { scale: number; offsetX: number; offsetY: number }

export function VenueMap() {
  const { snapshot, liveEdges, liveAgents, layers, selectedNodeId, selectNode, selectEdge } = useSimulation();
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewState>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [size, setSize] = useState({ w: 800, h: 600 });
  const drag = useRef({ x: 0, y: 0, ox: 0, oy: 0, active: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (size.w < 10) return;
    const scale = Math.min(size.w / LOGICAL_W, size.h / LOGICAL_H) * 0.92;
    setView({ scale, offsetX: (size.w - LOGICAL_W * scale) / 2, offsetY: (size.h - LOGICAL_H * scale) / 2 });
  }, [size.w, size.h]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    setView(v => {
      const ns = Math.max(0.3, Math.min(4, v.scale * (1 - e.deltaY * 0.0015)));
      const ratio = ns / v.scale;
      return { scale: ns, offsetX: mx - (mx - v.offsetX) * ratio, offsetY: my - (my - v.offsetY) * ratio };
    });
  }, []);

  const onDown = useCallback((e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, ox: view.offsetX, oy: view.offsetY, active: true };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [view]);
  const onMove = useCallback((e: React.PointerEvent) => {
    if (drag.current.active) {
      setView(v => ({ ...v, offsetX: drag.current.ox + e.clientX - drag.current.x, offsetY: drag.current.oy + e.clientY - drag.current.y }));
    }
  }, []);
  const onUp = useCallback((e: React.PointerEvent) => {
    drag.current.active = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }, []);

  const click = useCallback((e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const x = (e.clientX - r.left - view.offsetX) / view.scale;
    const y = (e.clientY - r.top - view.offsetY) / view.scale;
    let nearest: VenueNode | null = null;
    let distance = 18;
    for (const n of STADIUM_A.nodes) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < distance) { distance = d; nearest = n; }
    }
    if (nearest) selectNode(nearest.id);
  }, [view, selectNode]);

  const agents = liveAgents;
  const bottlenecks = snapshot?.safety.bottlenecks ?? [];
  const routes = snapshot?.routing.activeRoutes ?? [];
  const alternatives = snapshot?.routing.alternativeRoutes ?? [];
  const disabled = new Set(snapshot?.routing.disabledEdges ?? []);
  const transform = `translate(${view.offsetX},${view.offsetY}) scale(${view.scale})`;

  return (
    <div ref={ref} className="relative w-full h-full overflow-hidden" style={{ background: '#070b10', cursor: drag.current.active ? 'grabbing' : 'grab' }} onWheel={onWheel} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onClick={click}>
      <GridBg w={size.w} h={size.h} />
      <svg width={size.w} height={size.h} className="absolute inset-0">
        <g transform={transform}>
          {layers.heatmap && <Heatmap edges={liveEdges} />}
          {STADIUM_A.edges.map(edge => {
            const live = liveEdges[edge.id] || edge;
            const density = live.density || 0;
            const hot = bottlenecks.some(b => b.edgeId === edge.id);
            const off = disabled.has(edge.id);
            const stroke = off ? '#ff1744' : hot ? '#ef4444' : density > 0.5 ? '#f59e0b' : density > 0.2 ? '#3a5a72' : '#2a3a4d';
            return <line key={edge.id} x1={NODE_MAP[edge.from].x} y1={NODE_MAP[edge.from].y} x2={NODE_MAP[edge.to].x} y2={NODE_MAP[edge.to].y} stroke={stroke} strokeWidth={off || hot ? 4 : density > 0.5 ? 3 : 2} strokeLinecap="round" strokeDasharray={off ? '6 4' : undefined} onClick={ev => { ev.stopPropagation(); selectEdge(edge.id); }} />;
          })}
          {layers.routes && routes.map((route: any) => <RouteLine key={route.id} r={route} />)}
          {layers.routes && alternatives.map((route: any) => <RouteLine key={route.id} r={route} alt />)}
          {layers.bottlenecks && bottlenecks.map((b: any) => {
            const edge = EDGE_MAP[b.edgeId];
            const node = edge ? NODE_MAP[edge.to] : undefined;
            if (!node) return null;
            return <g key={b.id}><circle cx={node.x} cy={node.y} r={nodeKindRadius(node.kind) + 8} fill="none" stroke={riskColor(b.risk)} strokeWidth="2" className="cmd-pulse" /><circle cx={node.x} cy={node.y} r={nodeKindRadius(node.kind) + 14} fill="none" stroke={riskColor(b.risk)} strokeWidth="1" opacity=".3" /></g>;
          })}
          {STADIUM_A.nodes.map(node => <Node key={node.id} n={node} selected={selectedNodeId === node.id} count={agents.filter((a: SimAgent) => a.fromNodeId === node.id).length} />)}
        </g>
      </svg>
      {layers.crowd && <div className="absolute inset-0 pointer-events-none">{agents.slice(0, 1000).map((agent: SimAgent) => {
        const from = NODE_MAP[agent.fromNodeId];
        const to = NODE_MAP[agent.toNodeId];
        if (!from || !to) return null;
        return <span key={agent.id} style={{ position: 'absolute', left: `${((from.x + (to.x - from.x) * agent.t) / 1000) * 100}%`, top: `${((from.y + (to.y - from.y) * agent.t) / 620) * 100}%`, width: 4, height: 4, borderRadius: '50%', background: '#46b8d2', opacity: .7 }} />;
      })}</div>}
      <div className="zoom-controls absolute bottom-3 right-3 flex gap-1">
        <button onClick={() => setView(v => ({ ...v, scale: Math.min(4, v.scale * 1.2) }))} className="cmd-surface w-7 h-7">+</button>
        <button onClick={() => setView(v => ({ ...v, scale: Math.max(.3, v.scale / 1.2) }))} className="cmd-surface w-7 h-7">−</button>
      </div>
      <div className="map-legend absolute top-3 left-3 px-3 py-2 rounded text-[10px]"><b className="text-white">Agents {agents.length.toLocaleString()}</b><div className="mt-1">● Low　<span style={{ color: '#d9a441' }}>● Med</span>　<span style={{ color: '#ef4b4b' }}>● High</span></div></div>
    </div>
  );
}

function GridBg({ w, h }: { w: number; h: number }) {
  const vertical = Array.from({ length: Math.ceil(w / 40) }, (_, i) => `M${i * 40} 0V${h}`).join(' ');
  const horizontal = Array.from({ length: Math.ceil(h / 40) }, (_, i) => `M0 ${i * 40}H${w}`).join(' ');
  return <svg width={w} height={h} className="absolute inset-0 pointer-events-none opacity-30"><path d={vertical + ' ' + horizontal} stroke="#0f1720" fill="none" /></svg>;
}

function Node({ n, selected, count }: { n: VenueNode; selected: boolean; count: number }) {
  const r = nodeKindRadius(n.kind), c = nodeKindColor(n.kind);
  return <g><rect x={n.x - r} y={n.y - r} width={r * 2} height={r * 2} fill={c + '26'} stroke={selected ? '#46b8d2' : c} strokeWidth="2" transform={`rotate(${n.kind === 'junction' ? 0 : 45} ${n.x} ${n.y})`} /><text x={n.x} y={n.y - 15} textAnchor="middle" fill="#aeb8c2" fontSize="11">{n.label}</text>{count > 0 && <text x={n.x} y={n.y + 3} textAnchor="middle" fill={c} fontSize="7" fontWeight="700">{count}</text>}</g>;
}

function RouteLine({ r, alt = false }: { r: any; alt?: boolean }) {
  return <g>{r.segments.map((s: any, i: number) => { const edge = EDGE_MAP[s.edgeId], a = NODE_MAP[s.fromNodeId], b = NODE_MAP[s.toNodeId]; return edge && a && b ? <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={alt ? '#71808c' : '#46b8d2'} strokeWidth={alt ? 3 : 2} strokeDasharray={alt ? '8 4' : undefined} /> : null; })}</g>;
}

function Heatmap({ edges }: { edges: Record<string, VenueEdge> }) {
  return <g opacity=".35">{STADIUM_A.edges.map(edge => { const density = edges[edge.id]?.density ?? 0; if (density < .1) return null; const a = NODE_MAP[edge.from], b = NODE_MAP[edge.to]; return <line key={edge.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={density > .8 ? '#dc2626' : density > .6 ? '#ef4444' : density > .4 ? '#f59e0b' : '#38bdf8'} strokeWidth={Math.max(4, density * 24)} strokeLinecap="round" />; })}</g>;
}
