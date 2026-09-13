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

function Dashboard() {
  const { state, reset } = useSimulation();
  const [activePanel, setActivePanel] = useState<'operations' | 'monitor'>('monitor');

  useEffect(() => {
    document.title = 'Crowd Optimiser';
  }, []);

  return (
    <div className="min-h-screen bg-[#f4f1e9] text-[#20201c]">
      <Header activePanel={activePanel} onPanelChange={setActivePanel} onReset={reset} />
      <EmergencyBanner />
      <main className="mx-auto max-w-[1600px] p-4 md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#76736a]">Live crowd operations</p>
            <h1 className="text-2xl font-semibold tracking-tight">Crowd Optimiser</h1>
          </div>
          <SimulationControls />
        </div>

        {activePanel === 'operations' ? (
          <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
            <AIScenarioAssistant />
            <ScenarioConfig />
          </div>
        ) : (
          <>
            <MetricsPanel />
            <div className="mt-4 grid gap-4 xl:grid-cols-[1.8fr_1fr]">
              <section className="min-w-0 space-y-4">
                <VenueMap />
                <div className="grid gap-4 lg:grid-cols-2">
                  <CameraWall />
                  <Inspector />
                </div>
                <Timeline />
              </section>
              <aside className="space-y-4">
                <LayerToggles />
                <BottleneckPanel />
                <AlertPanel />
                <AISafetyAnalyst />
                <RoutePanel />
                <EmergencyPanel />
              </aside>
            </div>
          </>
        )}
      </main>
      <ConnectionOverlay />
      <footer className="mx-auto max-w-[1600px] px-4 pb-8 pt-2 text-xs text-[#817d72] md:px-6">
        {state.connectionMode === 'backend' ? 'Connected to live backend' : 'Browser simulation mode'}
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <SimulationProvider>
      <Dashboard />
    </SimulationProvider>
  );
}
