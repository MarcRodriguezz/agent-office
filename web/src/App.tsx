import { useEffect, useState } from 'react';
import { OfficeCanvas } from './game/OfficeCanvas';
import { bootstrap } from './net';
import { useStore } from './store';
import { DEMO } from './transport';
import { AgentEditor } from './ui/AgentEditor';
import { AgentPanel } from './ui/AgentPanel';
import { Architect } from './ui/Architect';
import { AlbumModal, DialogBox, StarterModal } from './ui/Companions';
import { Feed, Roster, Toasts, TopBar } from './ui/Hud';
import { MeetingsModal } from './ui/MeetingsModal';
import { OfficesModal } from './ui/OfficesModal';
import { PeopleModal } from './ui/PeopleModal';
import { ProjectsModal } from './ui/ProjectsModal';
import { SettingsModal } from './ui/SettingsModal';
import { TasksModal } from './ui/TasksModal';

export function App() {
  const ready = useStore((s) => s.ready);
  const modal = useStore((s) => s.modal);
  const selected = useStore((s) => s.selectedAgentId);
  const hasCompanion = useStore((s) => !!s.settings.playerCompanion);
  const architect = useStore((s) => s.architect);
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
        <span className="mark" />
        <p>Abriendo la oficina…</p>
        {error && <small>Esperando al servidor ({error})</small>}
      </div>
    );
  }

  return (
    <div className={`app ${selected || architect ? 'with-panel' : ''}`}>
      <OfficeCanvas />
      <TopBar />
      <Roster />
      <Feed />
      {!architect && <div className="help"><kbd>WASD</kbd> o clic para moverte · <kbd>E</kbd> o clic en alguien para hablar · rueda para acercar</div>}
      {DEMO && !modal && (
        <div className="demobar">
          <b>Demo</b>
          <span>Corre entera en tu navegador con respuestas simuladas y se reinicia al recargar. Para usar modelos reales, <a href="https://github.com/MarcRodriguezz/agent-office" target="_blank" rel="noreferrer">instálala con Docker</a>.</span>
        </div>
      )}
      <DialogBox />
      {architect ? <Architect /> : <AgentPanel />}
      <Toasts />
      {modal?.kind === 'settings' && <SettingsModal tab={modal.tab} />}
      {modal?.kind === 'people' && <PeopleModal />}
      {modal?.kind === 'album' && <AlbumModal />}
      {modal?.kind === 'offices' && <OfficesModal tab={modal.tab} />}
      {!hasCompanion && <StarterModal />}
      {modal?.kind === 'agent' && <AgentEditor key={modal.id ?? 'new'} id={modal.id} teamId={modal.teamId} />}
      {modal?.kind === 'tasks' && <TasksModal taskId={modal.taskId} />}
      {modal?.kind === 'projects' && <ProjectsModal projectId={modal.projectId} />}
      {modal?.kind === 'meetings' && <MeetingsModal meetingId={modal.meetingId} />}
    </div>
  );
}
