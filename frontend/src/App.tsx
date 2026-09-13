import { useEffect, useState } from 'react';
import { SimulationProvider, useSimulation } from '@/state/SimulationContext';
import { Header } from '@/components/layout/Header';
import { VenueMap } from '@/components/venue/VenueMap';
import { CameraWall } from '@/components/venue/CameraWall';
import { Inspector } from '@/components/venue/Inspector';
import { LayerToggles } from '@/components/venue/LayerToggles';
import { SimulationControls } from '@/components/scenario/SimulationControls';
import { ScenarioConfig } from '@/components/scenario/ScenarioConfig';
import { AIScenarioAssistant } from '@/components/ai/AIScenarioAssistant';
import { MetricsPanel } from '@/components/metrics/MetricsPanel';
import { BottleneckPanel } from '@/components/safety/BottleneckPanel';
import { AlertPanel } from '@/components/safety/AlertPanel';
import { AISafetyAnalyst } from '@/components/ai/AISafetyAnalyst';
import { RoutePanel } from '@/components/routing/RoutePanel';
import { EmergencyPanel } from '@/components/emergency/EmergencyPanel';
import { Timeline } from '@/components/safety/Timeline';
import { EmergencyBanner } from '@/components/emergency/EmergencyBanner';
import { ConnectionOverlay } from '@/components/layout/ConnectionOverlay';
import { Settings2, Monitor, Video, ChevronDown, ChevronRight } from 'lucide-react';

export default function App() {
  return (
    <SimulationProvider>
      <Dashboard />
    </SimulationProvider>
  );
}

function Dashboard() {
  const { snapshot, connection } = useSimulation();
  const [mode, setMode] = useState<'configure' | 'monitor'>('configure');
  const [showCameras, setShowCameras] = useState(false);
  const [showLayers, setShowLayers] = useState(false);

  useEffect(() => {
    if (snapshot?.simulation.status === 'running') setMode('monitor');
  }, [snapshot?.simulation.status]);

  const hasSnapshot = snapshot !== null;
  const isRunning = snapshot?.simulation.status === 'running';

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--cmd-bg)' }}>
      <Header />
      <EmergencyBanner />
      {connection !== 'live' && <ConnectionOverlay state={connection} />}

      <div className="flex-1 min-h-0 overflow-hidden dashboard-shell">
        <aside className="dashboard-rail dashboard-rail--left overflow-y-auto">
          <div className="rail-heading">
            <div>
              <div className="section-title">Operations</div>
              <div className="rail-context">Scenario and simulation control</div>
            </div>
          </div>

          <div className="mode-switch" role="tablist" aria-label="Dashboard mode">
            <button type="button" role="tab" aria-selected={mode === 'configure'} className={mode === 'configure' ? 'mode-switch__item is-active' : 'mode-switch__item'} onClick={() => setMode('configure')}>
              <Settings2 size={13} /> Configure
            </button>
            <button type="button" role="tab" aria-selected={mode === 'monitor'} className={mode === 'monitor' ? 'mode-switch__item is-active' : 'mode-switch__item'} onClick={() => setMode('monitor')}>
              <Monitor size={13} /> Monitor
            </button>
          </div>

          <section className="cmd-panel control-card">
            <div className="panel-header">
              <span className="panel-title">Run controls</span>
              <span className="panel-state">{isRunning ? 'Live' : 'Ready'}</span>
            </div>
            <div className="panel-body compact-body">
              <SimulationControls />
            </div>
          </section>

          {mode === 'configure' ? (
            <div className="space-y-2">
              <AIScenarioAssistant />
              <ScenarioConfig />
            </div>
          ) : (
            <>
            <section className="cmd-panel">
              <div className="panel-header">
                <span className="panel-title">Monitor tools</span>
                <span className="panel-state">Live view</span>
              </div>
              <div className="panel-body space-y-2">
                <button type="button" className="tool-row" onClick={() => setShowCameras((v) => !v)}>
                  <span className="tool-row__label"><Video size={14} /> Camera context</span>
                  {showCameras ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <button type="button" className="tool-row" onClick={() => setShowLayers((v) => !v)}>
                  <span className="tool-row__label"><Settings2 size={14} /> Map layers</span>
                  {showLayers ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                {showLayers && <LayerToggles />}
              </div>
            </section>
            <AIScenarioAssistant />
            </>
          )}

          {mode === 'configure' && (
            <section className="cmd-panel">
              <div className="panel-header">
                <span className="panel-title">Map layers</span>
                <span className="panel-state">View</span>
              </div>
              <div className="panel-body"><LayerToggles /></div>
            </section>
          )}
        </aside>

        <main className="dashboard-main min-w-0 min-h-0">
          <MetricsPanel />

          <section className="hero-map cmd-panel min-h-0 flex-1 flex flex-col">
            <div className="hero-map__header">
              <div>
                <div className="section-title">Live crowd flow</div>
                <div className="hero-map__meta">Venue topology · {snapshot?.simulation.agents?.length?.toLocaleString() ?? 0} active agents</div>
              </div>
              <div className="hero-map__status">
                <span className="status-key"><span className="status-dot status-dot--live" /> Agents</span>
                <span className="status-key"><span className="status-line" /> Active route</span>
                <span className="status-key"><span className="status-line status-line--alt" /> Alternative</span>
              </div>
            </div>
            <div className="hero-map__body min-h-0 flex-1 relative">
              <VenueMap />
              <Inspector />
            </div>
          </section>

          <div className="monitor-bottom">
            <div className="monitor-bottom__timeline min-w-0"><Timeline /></div>
            <button type="button" className={`camera-toggle ${showCameras ? 'camera-toggle--active' : ''}`} onClick={() => setShowCameras((v) => !v)} aria-expanded={showCameras}>
              <span className="tool-row__label"><Video size={14} /> Camera context</span>
              {showCameras ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>

          {showCameras && <div className="camera-drawer"><CameraWall /></div>}
        </main>

        <aside className="dashboard-rail dashboard-rail--right overflow-y-auto">
          <div className="rail-heading">
            <div>
              <div className="section-title">Safety desk</div>
              <div className="rail-context">Decision support and response</div>
            </div>
            {snapshot?.safety && <span className="rail-risk" data-risk={snapshot.safety.riskLevel}>{snapshot.safety.riskLevel}</span>}
          </div>
          <EmergencyPanel />
          <AlertPanel />
          <BottleneckPanel />
          <AISafetyAnalyst />
          <RoutePanel />
        </aside>
      </div>

      {!hasSnapshot && connection === 'live' && <LoadingOverlay />}
    </div>
  );
}

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="cmd-surface loading-card flex flex-col items-center gap-3">
        <div className="loading-spinner" />
        <div className="text-[12px] font-medium" style={{ color: 'var(--cmd-text-dim)' }}>Initializing simulation…</div>
      </div>
    </div>
  );
}
