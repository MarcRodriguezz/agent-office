import { useEffect, useState } from 'react';
import { addRoom, canUndo, patchRoom, removeRoom, resizePlant, undo } from '../game/architect';
import { api, saveLayout } from '../net';
import { setState, toast, useStore } from '../store';
import type { Room, RoomKind, Team } from '../types';

const ADDABLE: RoomKind[] = ['work', 'office', 'meeting', 'cafe', 'lounge', 'server'];
const NOTE: Record<RoomKind, string> = {
  work: 'Mesas para un departamento. Cuanto más grande, más mesas.',
  office: 'Una mesa aparte, para una persona concreta o libre.',
  meeting: 'Mesa de reuniones y tablón de tareas.',
  cafe: 'Barra de café y mesas para los descansos.',
  lounge: 'Sofás para que la gente se despeje.',
  server: 'Consola para configurar los proveedores LLM.',
  boss: '',
  hr: '',
};

function RoomForm({ room }: { room: Room }) {
  const map = useStore((s) => s.map)!;
  const teams = useStore((s) => s.teams);
  const agents = useStore((s) => s.agents);
  const [name, setName] = useState(room.name);
  useEffect(() => setName(room.name), [room.name]);
  const info = map.kinds[room.kind];
  const desks = map.desks.filter((d) => d.roomId === room.id).length;
  const last = info.required && map.rooms.filter((r) => r.kind === room.kind).length === 1;
  const here = agents.filter((a) => map.desks[a.desk]?.roomId === room.id);

  const setTeam = (teamId: string | null) => {
    const team = teams.find((t) => t.id === teamId);
    void patchRoom(room.id, { teamId, ...(team ? { name: team.name } : {}) });
  };

  return (
    <section className="archroom">
      <h4>{info.label}</h4>
      <label>Nombre en el plano
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={28}
          onBlur={() => name.trim() && name.trim().toUpperCase() !== room.name && void patchRoom(room.id, { name })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      </label>
      {(room.kind === 'work' || room.kind === 'office') && (
        <label>Departamento
          <select value={room.teamId ?? ''} onChange={(e) => setTeam(e.target.value || null)}>
            <option value="">Sin asignar: mesas para cualquiera</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      )}
      {room.kind === 'office' && (
        <label>Persona
          <select value={room.agentId ?? ''} onChange={(e) => void patchRoom(room.id, { agentId: e.target.value || null })}>
            <option value="">Sin dueño</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
          </select>
        </label>
      )}
      <dl>
        <dt>Tamaño</dt><dd>{room.w} × {room.h} casillas (mínimo {info.min[0]} × {info.min[1]})</dd>
        {desks > 0 && <><dt>Mesas</dt><dd>{desks}{here.length ? ` · ${here.map((a) => a.name).join(', ')}` : ' · vacías'}</dd></>}
      </dl>
      <button className="danger" disabled={last || info.unique}
        title={info.unique || last ? 'La oficina necesita esta sala: puedes moverla o cambiarle el tamaño' : ''}
        onClick={() => confirm(`¿Quitar «${room.name}» del plano?`) && void removeRoom(room.id)}>
        Quitar esta sala
      </button>
    </section>
  );
}

function NewDepartment({ onDone }: { onDone: () => void }) {
  const teams = useStore((s) => s.teams);
  const rooms = useStore((s) => s.map!.rooms);
  const [teamId, setTeamId] = useState(teams.find((t) => !rooms.some((r) => r.teamId === t.id))?.id ?? 'new');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      let team: Team | undefined = teams.find((t) => t.id === teamId);
      if (teamId === 'new') team = await api<Team>('POST', '/teams', { name, color: '#2fa37a', mission: '' });
      if (await addRoom('work', team ? { teamId: team.id, name: team.name } : {})) onDone();
    } catch (e) {
      toast((e as Error).message, false);
    }
    setBusy(false);
  };
  return (
    <div className="archnew">
      <label>¿Para qué departamento?
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          <option value="new">Un departamento nuevo…</option>
          <option value="">Ninguno: mesas libres</option>
        </select>
      </label>
      {teamId === 'new' && <label>Nombre del departamento<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Diseño, Legal, Datos…" autoFocus /></label>}
      <div className="row">
        <button onClick={onDone}>Cancelar</button>
        <button className="primary" disabled={busy || (teamId === 'new' && !name.trim())} onClick={() => void create()}>Añadir al plano</button>
      </div>
    </div>
  );
}

export function Architect() {
  const map = useStore((s) => s.map);
  const roomId = useStore((s) => s.roomId);
  const people = useStore((s) => s.agents.length);
  const [department, setDepartment] = useState(false);
  if (!map) return null;
  const room = map.rooms.find((r) => r.id === roomId);
  const step = 4;

  return (
    <aside className="panel arch">
      <header>
        <div className="who">
          <strong>Modo arquitecto</strong>
          <small>{map.rooms.length} salas · {map.desks.length} mesas para {people} personas</small>
        </div>
        <button className="primary" onClick={() => setState({ architect: false, roomId: null })}>Terminar</button>
      </header>
      <div className="archbody">
        <ul className="archhelp">
          <li><b>Arrastra</b> una sala para moverla.</li>
          <li><b>Tira de una esquina</b> de la sala elegida para cambiarle el tamaño.</li>
          <li><b>Pulsa un muro</b> entre dos salas para abrir o cerrar una puerta.</li>
          <li><b>Arrastra el fondo</b> para desplazarte y usa la rueda para alejarte.</li>
        </ul>

        {room ? <RoomForm key={room.id} room={room} /> : <p className="hint">Pulsa una sala del plano para editarla.</p>}

        <section>
          <h4>Añadir al plano</h4>
          {department ? <NewDepartment onDone={() => setDepartment(false)} /> : (
            <div className="archkinds">
              {ADDABLE.map((kind) => (
                <button key={kind} onClick={() => (kind === 'work' ? setDepartment(true) : void addRoom(kind))}>
                  <strong>{map.kinds[kind].label}</strong>
                  <small>{NOTE[kind]}</small>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <h4>Planta · {map.w} × {map.h} casillas</h4>
          <div className="archgrid">
            <span>Ancho</span>
            <button disabled={map.w - step < map.limits.minW} onClick={() => void resizePlant(-step, 0)}>Reducir</button>
            <button disabled={map.w + step > map.limits.maxW} onClick={() => void resizePlant(step, 0)}>Ampliar</button>
            <span>Fondo</span>
            <button disabled={map.h - step < map.limits.minH} onClick={() => void resizePlant(0, -step)}>Reducir</button>
            <button disabled={map.h + step > map.limits.maxH} onClick={() => void resizePlant(0, step)}>Ampliar</button>
          </div>
        </section>

        <footer>
          <button disabled={!canUndo()} onClick={() => void undo()}>Deshacer</button>
          <span />
          <button className="danger" onClick={() => confirm('¿Volver a la distribución de serie? Se pierden las salas que hayas añadido.') && void saveLayout({ reset: true })}>
            Plano de serie
          </button>
        </footer>
      </div>
    </aside>
  );
}
