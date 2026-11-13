import { useEffect, useState } from 'react';
import { OfficeCanvas } from './game/OfficeCanvas';
import { bootstrap } from './net';
import { useStore } from './store';
import { AgentEditor } from './ui/AgentEditor';
import { AgentPanel } from './ui/AgentPanel';
import { AlbumModal, DialogBox, StarterModal } from './ui/Companions';
import { Feed, Roster, Toasts, TopBar } from './ui/Hud';
import { PeopleModal } from './ui/PeopleModal';
import { SettingsModal } from './ui/SettingsModal';
import { TasksModal } from './ui/TasksModal';

export function App() {
  const ready = useStore((s) => s.ready);
  const modal = useStore((s) => s.modal);
  const selected = useStore((s) => s.selectedAgentId);
  const hasCompanion = useStore((s) => !!s.settings.playerCompanion);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const start = () => bootstrap().catch((e) => {
      if (cancelled) return;
      setError(e.message);
      setTimeout(start, 2000);
    });
    void start();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="loading">
        <span>🏢</span>
        <p>Abriendo la oficina…</p>
        {error && <small>Esperando al servidor ({error})</small>}
      </div>
    );
  }

  return (
    <div className={`app ${selected ? 'with-panel' : ''}`}>
      <OfficeCanvas />
      <TopBar />
      <Roster />
      <Feed />
      <div className="help"><kbd>WASD</kbd> o clic para moverte · <kbd>E</kbd> o clic en un agente para hablar · rueda para zoom</div>
      <DialogBox />
      <AgentPanel />
      <Toasts />
      {modal?.kind === 'settings' && <SettingsModal tab={modal.tab} />}
      {modal?.kind === 'people' && <PeopleModal />}
      {modal?.kind === 'album' && <AlbumModal />}
      {!hasCompanion && <StarterModal />}
      {modal?.kind === 'agent' && <AgentEditor key={modal.id ?? 'new'} id={modal.id} teamId={modal.teamId} />}
      {modal?.kind === 'tasks' && <TasksModal taskId={modal.taskId} />}
    </div>
  );
}
