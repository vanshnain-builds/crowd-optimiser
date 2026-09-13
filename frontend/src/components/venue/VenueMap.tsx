import { useRef, useEffect, useCallback, useState } from 'react';
import { useSimulation } from '@/state/SimulationContext';
import { STADIUM_A, NODE_MAP, EDGE_MAP } from '@/data/venue';
import { nodeKindColor, nodeKindRadius } from '@/utils/venueColors';
import { riskColor } from '@/utils/display';
import type { VenueNode, VenueEdge, SimAgent } from '@/types';

const LOGICAL_W = 1000;
const LOGICAL_H = 620;

interface ViewState { scale: number; offsetX: number; offsetY: number; }

export function VenueMap() {
  const { snapshot, liveEdges, liveAgents, layers, selectedNodeId, selectedEdgeId, selectNode, selectEdge } = useSimulation();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<ViewState>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [size, setSize] = useState({ w: 800, h: 600 });
  const dragRef = useRef({ x: 0, y: 0, ox: 0, oy: 0, active: false });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setSize({ w: r.width, h: r.height }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (size.w < 10) return;
    const s = Math.min(size.w / LOGICAL_W, size.h / LOGICAL_H) * 0.92;
    setView({ scale: s, offsetX: (size.w - LOGICAL_W * s) / 2, offsetY: (size.h - LOGICAL_H * s) / 2 });
  }, [size.w, size.h]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr; canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`; canvas.style.height = `${size.h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, size.w, size.h);
      if (layers.crowd) {
        for (const a of liveAgents) {
          const sx = a.x * view.scale + view.offsetX;
          const sy = a.y * view.scale + view.offsetY;
          if (sx < -5 || sx > size.w + 5 || sy < -5 || sy > size.h + 5) continue;
          const d = liveEdges[a.edgeId]?.density ?? 0;
          ctx.fillStyle = d > 0.8 ? '#ef4444' : d > 0.6 ? '#f59e0b' : '#38bdf8';
          ctx.globalAlpha = 0.65;
          ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [size, view, liveAgents, liveEdges, layers.crowd]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const el = containerRef.current; if (!el) return;
    const r = el.getBoundingClientRect(); const mx = e.clientX - r.left; const my = e.clientY - r.top;
    setView(v => {
      const newScale = Math.max(0.3, Math.min(4, v.scale * (1 - e.deltaY * 0.0015)));
      const ratio = newScale / v.scale;
      return { scale: newScale, offsetX: mx - (mx - v.offsetX) * ratio, offsetY: my - (my - v.offsetY) * ratio };
    });
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, ox: view.offsetX, oy: view.offsetY, active: true };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [view]);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.x, dy = e.clientY - dragRef.current.y;
    setView(v => ({ ...v, offsetX: dragRef.current.ox + dx, offsetY: dragRef.current.oy + dy }));
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent) => { dragRef.current.active = false; (e.target as HTMLElement).releasePointerCapture?.(e.pointerId); }, []);

  const screenToLogical = useCallback((sx: number, sy: number) => ({ x: (sx - view.offsetX) / view.scale, y: (sy - view.offsetY) / view.scale }), [view]);
  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    const el = containerRef.current; if (!el) return;
    const r = el.getBoundingClientRect(); const { x, y } = screenToLogical(e.clientX - r.left, e.clientY - r.top);
    let nearest: VenueNode | null = null, nearestDist = 18;
    for (const n of STADIUM_A.nodes) { const d = Math.hypot(n.x - x, n.y - y); if (d < nearestDist) { nearestDist = d; nearest = n; } }
    if (nearest) { selectNode(nearest.id); return; }
    let nearestEdge: VenueEdge | null = null, nearestEdgeDist = 8;
    for (const ed of STADIUM_A.edges) { const a = NODE_MAP[ed.from], b = NODE_MAP[ed.to]; const d = pointToSegmentDist(x, y, a.x, a.y, b.x, b.y); if (d < nearestEdgeDist) { nearestEdgeDist = d; nearestEdge = ed; } }
    if (nearestEdge) { selectEdge(nearestEdge.id); return; }
    selectNode(null);
  }, [screenToLogical, selectNode, selectEdge]);

  const simTime = snapshot?.simulation.simTimeMin ?? 0;
  const agents = liveAgents;
  const bottlenecks = snapshot?.safety.bottlenecks ?? [];
  const routes = snapshot?.routing.activeRoutes ?? [];
  const altRoutes = snapshot?.routing.alternativeRoutes ?? [];
  const disabledEdges = new Set(snapshot?.routing.disabledEdges ?? []);
  const isEm = snapshot?.emergency?.active === true;
  const densityCounts = agents.reduce((acc, agent) => { const d = liveEdges[agent.edgeId]?.density ?? 0; if (d > 0.8) acc.high += 1; else if (d > 0.6) acc.medium += 1; else acc.low += 1; return acc; }, { low: 0, medium: 0, high: 0 });
  const transform = `translate(${view.offsetX},${view.offsetY}) scale(${view.scale})`;

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden" style={{ background: '#070b10', cursor: dragRef.current.active ? 'grabbing' : 'grab' }} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onClick={handleSvgClick}>
      <GridBg w={size.w} h={size.h} />
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
      <svg width={size.w} height={size.h} className="absolute inset-0 pointer-events-none">
        <g transform={transform}>
          {layers.heatmap && <HeatmapLayer edges={liveEdges} />}
          {STADIUM_A.edges.map(e => {
            const live = liveEdges[e.id]; const density = live?.density ?? 0; const status = live?.status ?? 'open'; const isDisabled = disabledEdges.has(e.id); const isSelected = selectedEdgeId === e.id;
            return <EdgeLine key={e.id} edge={e} density={density} status={status} isDisabled={isDisabled} isSelected={isSelected} showFlow={layers.density} />;
          })}
          {layers.routes && routes.map(r => <RouteLine key={r.id} route={r} alt={false} />)}
          {layers.routes && altRoutes.map(r => <RouteLine key={r.id} route={r} alt={true} />)}
          {layers.bottlenecks && bottlenecks.map(b => {
            const e = EDGE_MAP[b.edgeId]; if (!e) return null; const n = NODE_MAP[e.to];
            return <g key={b.id}><circle cx={n.x} cy={n.y} r={nodeKindRadius(n.kind) + 8} fill="none" stroke={riskColor(b.risk)} strokeWidth="2" opacity="0.7" className="cmd-pulse" /><circle cx={n.x} cy={n.y} r={nodeKindRadius(n.kind) + 14} fill="none" stroke={riskColor(b.risk)} strokeWidth="1" opacity="0.3" /></g>;
          })}
          {STADIUM_A.nodes.map(n => <NodeShape key={n.id} node={n} selected={selectedNodeId === n.id} isEmergency={isEm && snapshot?.emergency?.nodeId === n.id} agentCount={agents.filter((a: SimAgent) => a.fromNodeId === n.id).length} />)}
          {isEm && snapshot?.emergency && <EmergencyMarker nodeId={snapshot.emergency.nodeId} />}
        </g>
      </svg>
      <ZoomControls view={view} setView={setView} />
      <MapLegend layers={layers} agentCount={agents.length} densityCounts={densityCounts} simTime={simTime} />
    </div>
  );
}

function GridBg({ w, h }: { w: number; h: number }) { const grid = 40; const lines: string[] = []; for (let x = 0; x < w; x += grid) lines.push(`M${x} 0V${h}`); for (let y = 0; y < h; y += grid) lines.push(`M0 ${y}H${w}`); return <svg width={w} height={h} className="absolute inset-0 pointer-events-none opacity-30"><path d={lines.join(' ')} stroke="#0f1720" strokeWidth="1" fill="none" /></svg>; }

function EdgeLine({ edge, density, status, isDisabled, isSelected, showFlow }: { edge: VenueEdge; live?: VenueEdge; density: number; status: VenueEdge['status']; isDisabled: boolean; isSelected: boolean; showFlow: boolean; }) {
  const a = NODE_MAP[edge.from], b = NODE_MAP[edge.to]; if (!a || !b) return null;
  let stroke = '#2a3a4d', width = 2; let dash: string | undefined;
  if (isDisabled || status === 'emergency-closed') { stroke = '#ff1744'; width = 2; dash = '6 4'; }
  else if (status === 'congested') { stroke = density > 0.9 ? '#dc2626' : density > 0.8 ? '#ef4444' : '#f59e0b'; width = 3; }
  else if (density > 0.5) { stroke = '#f59e0b'; width = 2.5; }
  else if (density > 0.2) { stroke = '#3a5a72'; width = 2.5; }
  if (isSelected) { stroke = '#06b6d4'; width = 4; }
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  return <g><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeDasharray={dash} opacity={isDisabled ? 0.6 : 0.85} />{showFlow && !isDisabled && density > 0.05 && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={width + 2} strokeLinecap="round" opacity={0.15} />} {!isDisabled && <g transform={`translate(${mx},${my}) rotate(${angle})`}><polygon points="-3,-3 4,0 -3,3" fill={stroke} opacity="0.7" /></g>}</g>;
}

function RouteLine({ route, alt }: { route: import('@/types').Route; alt: boolean }) { const color = alt ? '#71808c' : '#46b8d2'; const dash = alt ? '8 4' : undefined; return <g>{route.segments.map((seg, i) => { const e = EDGE_MAP[seg.edgeId]; if (!e) return null; const a = NODE_MAP[seg.fromNodeId], b = NODE_MAP[seg.toNodeId]; if (!a || !b) return null; return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={alt ? 3 : 2} fill="none" strokeDasharray={dash} strokeLinecap="round" opacity="0.5" className={alt ? 'cmd-flow-dash-alt' : 'cmd-flow-dash'} />; })}</g>; }

function NodeShape({ node, selected, isEmergency, agentCount }: { node: VenueNode; selected: boolean; isEmergency: boolean; agentCount: number; }) {
  const r = nodeKindRadius(node.kind), color = isEmergency ? '#ff3b3b' : nodeKindColor(node.kind), size = Math.max(7, Math.round(r * 1.45)), isEndpoint = node.kind === 'entry' || node.kind === 'exit';
  return <g>{isEndpoint && <rect x={node.x - size / 2 - 4} y={node.y - size / 2 - 4} width={size + 8} height={size + 8} fill="none" stroke={color} strokeWidth="1" opacity="0.5" />}{selected && <rect x={node.x - size / 2 - 5} y={node.y - size / 2 - 5} width={size + 10} height={size + 10} fill="none" stroke="#46b8d2" strokeWidth="1.5" />}{node.kind === 'junction' ? <rect x={node.x - size / 2} y={node.y - size / 2} width={size} height={size} fill={color + '26'} stroke={color} strokeWidth="1.5" /> : <rect x={node.x - size / 2} y={node.y - size / 2} width={size} height={size} fill={color + '26'} stroke={color} strokeWidth="1.5" transform={`rotate(45 ${node.x} ${node.y})`} />}<text x={node.x} y={node.y + 3.5} textAnchor="middle" fontSize={node.kind === 'stage' ? 9 : 7} fontWeight="700" fill={color} pointerEvents="none">{node.label.length > 10 ? node.label.slice(0, 9) + '…' : node.label}</text>{agentCount > 0 && <text x={node.x} y={node.y - size / 2 - 5} textAnchor="middle" fontSize="8" fontWeight="700" fill="#d9e2e9" pointerEvents="none">{agentCount}</text>}</g>;
}

function EmergencyMarker({ nodeId }: { nodeId: string }) { const n = NODE_MAP[nodeId]; if (!n) return null; return <g><circle cx={n.x} cy={n.y} r="30" fill="none" stroke="#ff1744" strokeWidth="2" className="cmd-pulse" opacity="0.7" /><circle cx={n.x} cy={n.y} r="40" fill="none" stroke="#ff1744" strokeWidth="1" opacity="0.3" /></g>; }

function HeatmapLayer({ edges }: { edges: Record<string, VenueEdge> }) { return <g opacity="0.35">{STADIUM_A.edges.map(e => { const d = edges[e.id]?.density ?? 0; if (d < 0.1) return null; const a = NODE_MAP[e.from], b = NODE_MAP[e.to]; const color = d > 0.8 ? '#dc2626' : d > 0.6 ? '#ef4444' : d > 0.4 ? '#f59e0b' : '#38bdf8'; return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={Math.max(4, d * 24)} strokeLinecap="round" opacity={0.2 + d * 0.4} />; })}</g>; }

function ZoomControls({ view, setView }: { view: ViewState; setView: (v: ViewState) => void; }) { return <div className="zoom-controls absolute bottom-3 right-3"><button aria-label="Zoom in" onClick={() => setView({ ...view, scale: Math.min(4, view.scale * 1.2) })} className="cmd-surface w-7 h-7 text-sm hover:bg-[var(--cmd-surface-2)] text-[var(--cmd-text)]">+</button><button aria-label="Zoom out" onClick={() => setView({ ...view, scale: Math.max(0.3, view.scale / 1.2) })} className="cmd-surface w-7 h-7 text-sm hover:bg-[var(--cmd-surface-2)] text-[var(--cmd-text)]">−</button><button aria-label="Fit map" onClick={() => setView({ scale: 1, offsetX: 0, offsetY: 0 })} className="cmd-surface w-7 h-7 text-[8px] hover:bg-[var(--cmd-surface-2)] text-[var(--cmd-text)]">{Math.round(view.scale * 100)}%</button></div>; }

function MapLegend({ layers, agentCount, densityCounts, simTime }: { layers: { crowd: boolean; density: boolean; bottlenecks: boolean; routes: boolean; heatmap: boolean }; agentCount: number; densityCounts: { low: number; medium: number; high: number }; simTime: number; }) { return <div className="map-legend absolute top-3 left-3 px-3 py-2 rounded text-[10px] space-y-1.5 pointer-events-none"><div className="flex items-baseline justify-between gap-5"><span className="metric-label">Agents</span><strong className="text-[15px] font-semibold text-white cmd-mono-value">{agentCount.toLocaleString()}</strong></div><div className="grid grid-cols-3 gap-3 pt-1.5 border-t border-[var(--cmd-border)]"><LegendDot color="#61b7d8" label={`Low ${densityCounts.low}`} /><LegendDot color="#d9a441" label={`Med ${densityCounts.medium}`} /><LegendDot color="#ef4b4b" label={`High ${densityCounts.high}`} /></div>{layers.routes && <div className="flex gap-3 pt-1"><LegendLine color="#46b8d2" label="Active" /><LegendLine color="#7b8791" label="Alt" dashed /></div>}</div>; }

function LegendDot({ color, label }: { color: string; label: string }) { return <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full" style={{ background: color }} /><span style={{ color: 'var(--cmd-text-dim)' }}>{label}</span></div>; }
function LegendLine({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) { return <div className="flex items-center gap-1"><svg width="14" height="4"><line x1="0" y1="2" x2="14" y2="2" stroke={color} strokeWidth="2" strokeDasharray={dashed ? '3 2' : undefined} /></svg><span style={{ color: 'var(--cmd-text-dim)' }}>{label}</span></div>; }
function pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number { const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy; if (len2 === 0) return Math.hypot(px - x1, py - y1); let t = ((px - x1) * dx + (py - y1) * dy) / len2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)); }
