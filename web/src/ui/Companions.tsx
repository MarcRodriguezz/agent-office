import { useEffect, useRef, useState } from 'react';
import {
  SPECIES, STAGE_LABEL, XP_PER_LEVEL, drawCreature, levelOf, nextEvolution, speciesOf, stageOf,
} from '../game/creature';
import { api, selectAgent } from '../net';
import { setState, toast, useStore } from '../store';
import type { Companion } from '../types';
import { Avatar, Modal } from './common';

export function CreatureView({ species, stage = 1, size = 64, hidden = false }: { species: string; stage?: number; size?: number; hidden?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const scale = (size / 44) * 2;
    canvas.width = size * 2;
    canvas.height = size * 2;
    let raf = 0;
    const frame = (now: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawCreature(ctx, 22, 38, species, stage, { time: hidden ? 0 : now / 1000, seed: 0, moving: false, facing: 'down' });
      if (hidden) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = '#2c3144';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [species, stage, size, hidden]);
  return <canvas ref={ref} className="creature" style={{ width: size, height: size }} />;
}

export function XpBar({ xp, color }: { xp: number; color?: string }) {
  const level = levelOf(xp);
  const next = nextEvolution(level);
  return (
    <div className="xp" title={next ? `Evoluciona en el nivel ${next}` : 'Forma final'}>
      <b>Nv {level}</b>
      <div><i style={{ width: `${((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100}%`, background: color }} /></div>
      <small>{xp % XP_PER_LEVEL}/{XP_PER_LEVEL}</small>
    </div>
  );
}

export function CompanionPicker({ value, onChange }: { value: Companion; onChange: (c: Companion) => void }) {
  return (
    <div className="picker">
      <div className="species">
        {SPECIES.map((s) => (
          <button key={s.id} type="button" className={value.species === s.id ? 'on' : ''} title={`${s.name} · ${s.type}`}
            onClick={() => onChange({ species: s.id, name: !value.name || SPECIES.some((x) => x.name === value.name) ? s.name : value.name })}>
            <CreatureView species={s.id} size={40} />
          </button>
        ))}
      </div>
      <input value={value.name} maxLength={20} placeholder="Mote del compi" onChange={(e) => onChange({ ...value, name: e.target.value })} />
    </div>
  );
}

export function StarterModal() {
  const [choice, setChoice] = useState(SPECIES[0].id);
  const [name, setName] = useState('');
  const species = speciesOf(choice);
  const confirm = async () => {
    await api('PATCH', '/settings', { playerCompanion: { species: choice, name: name.trim() || species.name } })
      .catch((e) => toast(e.message, false));
  };
  return (
    <div className="backdrop">
      <div className="modal starter">
        <div className="modal-body">
          <h2>¡Bienvenido a tu oficina!</h2>
          <p className="hint">Aquí nadie trabaja solo: cada persona tiene un <strong>compi</strong> que le acompaña, gana experiencia con el trabajo bien hecho y evoluciona. Elige el tuyo.</p>
          <div className="startergrid">
            {SPECIES.map((s) => (
              <button key={s.id} className={choice === s.id ? 'on' : ''} onClick={() => setChoice(s.id)}>
                <CreatureView species={s.id} size={72} />
                <strong>{s.name}</strong>
                <small style={{ color: s.color }}>{s.type}</small>
              </button>
            ))}
          </div>
          <p className="blurb">«{species.blurb}»</p>
          <footer>
            <input value={name} maxLength={20} placeholder={`Ponle un mote (${species.name})`} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void confirm()} />
            <button className="primary" onClick={() => void confirm()}>¡Te elijo, {name.trim() || species.name}!</button>
          </footer>
        </div>
      </div>
    </div>
  );
}

export function AlbumModal() {
  const agents = useStore((s) => s.agents);
  const settings = useStore((s) => s.settings);
  const tasks = useStore((s) => s.tasks);
  const owners = [
    ...(settings.playerCompanion ? [{
      id: 'player', name: `${settings.playerName} (tú)`, appearance: settings.playerAppearance, companion: settings.playerCompanion, xp: settings.playerXp, done: 0,
    }] : []),
    ...agents.map((a) => ({
      id: a.id, name: a.name, appearance: a.appearance, companion: a.companion, xp: a.xp,
      done: tasks.filter((t) => t.agentId === a.id && t.status === 'done').length,
    })),
  ].sort((a, b) => b.xp - a.xp);
  const reached = (species: string) => Math.max(0, ...owners.filter((o) => o.companion.species === species).map((o) => stageOf(levelOf(o.xp))));
  const seen = SPECIES.reduce((n, s) => n + reached(s.id), 0);

  return (
    <Modal title="Álbum de compis" onClose={() => setState({ modal: null })} wide>
      <div className="album">
        <h4>Clasificación de la oficina</h4>
        <div className="ranking">
          {owners.map((o, i) => {
            const s = speciesOf(o.companion.species);
            const level = levelOf(o.xp);
            return (
              <button key={o.id} className="rank" onClick={() => { if (o.id !== 'player') { setState({ modal: null }); void selectAgent(o.id); } }}>
                <em>{i + 1}</em>
                <CreatureView species={s.id} stage={stageOf(level)} size={48} />
                {o.appearance && <Avatar appearance={o.appearance} size={30} />}
                <span>
                  <strong>{o.companion.name} <small>de {o.name}</small></strong>
                  <XpBar xp={o.xp} color={s.color} />
                </span>
                <small className="meta">{s.type} · {STAGE_LABEL[stageOf(level)]}{o.id !== 'player' ? ` · ${o.done} tareas` : ''}</small>
              </button>
            );
          })}
        </div>
        <h4>Especies descubiertas · {seen}/{SPECIES.length * 3} formas</h4>
        <p className="hint">Las formas se descubren cuando algún compi de la oficina las alcanza: evolucionan en los niveles 3 y 6. Cada tarea entregada da experiencia.</p>
        <div className="dex">
          {SPECIES.map((s) => (
            <div key={s.id} className="dexcard" style={{ borderColor: `${s.color}66` }}>
              <header><strong>{reached(s.id) ? s.name : '???'}</strong><small style={{ color: s.color }}>{s.type}</small></header>
              <div className="stages">
                {[1, 2, 3].map((stage) => (
                  <div key={stage}>
                    <CreatureView species={s.id} stage={stage} size={56} hidden={reached(s.id) < stage} />
                    <small>{reached(s.id) >= stage ? STAGE_LABEL[stage] : '???'}</small>
                  </div>
                ))}
              </div>
              <p>{reached(s.id) ? s.blurb : 'Contrata a alguien con este compi para descubrirlo.'}</p>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

const plain = (text: string) => text.replace(/[*_`#>]/g, '').replace(/\n{2,}/g, '\n').trim();

export function DialogBox() {
  const dialog = useStore((s) => s.dialog);
  const agent = useStore((s) => s.agents.find((a) => a.id === s.dialog?.agentId));
  const modal = useStore((s) => s.modal);
  const [shown, setShown] = useState(0);
  const full = dialog ? plain(dialog.text) : '';
  const text = full.length > 300 ? `${full.slice(0, 297)}…` : full;

  useEffect(() => {
    setShown(0);
    if (!dialog) return;
    const timer = setInterval(() => setShown((n) => n + 2), 22);
    const close = setTimeout(() => setState({ dialog: null }), 14000);
    return () => {
      clearInterval(timer);
      clearTimeout(close);
    };
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setShown((n) => {
          if (n < text.length) return text.length;
          setState({ dialog: null });
          return n;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, text.length]);

  const who = agent ?? dialog?.guest;
  if (!dialog || !who || modal) return null;
  const done = shown >= text.length;
  return (
    <div className="dialogbox">
      <div className="portrait">
        <Avatar appearance={who.appearance} size={64} />
        {who.companion && <CreatureView species={who.companion.species} stage={stageOf(levelOf(who.xp))} size={34} />}
      </div>
      <div className="speech">
        <strong>{who.name}</strong>
        <p>{text.slice(0, shown)}{done && <span className="next">▼</span>}</p>
      </div>
      <div className="dialogactions">
        {agent
          ? <button className="primary" onClick={() => void selectAgent(agent.id, false)}>{full.length > 300 ? 'Leer todo' : 'Responder'}</button>
          : <button className="primary" onClick={() => setState({ dialog: null, modal: { kind: 'offices' } })}>Ver encargo</button>}
        <button onClick={() => setState({ dialog: null })}>Cerrar</button>
      </div>
    </div>
  );
}
