import { useEffect, useRef, useState } from 'react';
import {
  ACCESSORIES, EYES, HAIRS, HAIR_COLORS, LABELS, SHIRTS, SKINS, drawCharacter, randomAppearance,
} from '../game/character';
import { api } from '../net';
import { setState, toast, useStore } from '../store';
import type { Appearance } from '../types';
import { randomCompanion } from '../game/creature';
import { Avatar, Modal } from './common';
import { CompanionPicker } from './Companions';

function Body({ appearance }: { appearance: Appearance }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(3, 0, 0, 3, 0, 0);
      drawCharacter(ctx, 30, 66, appearance, { facing: 'down', moving: true, seated: false, time: now / 1000, seed: 0 });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [appearance]);
  return <canvas ref={ref} width={180} height={210} className="bodypreview" />;
}

export function AppearanceEditor({ value, onChange }: { value: Appearance; onChange: (a: Appearance) => void }) {
  const set = (patch: Partial<Appearance>) => onChange({ ...value, ...patch });
  const swatches = (key: keyof Appearance, colors: string[]) => (
    <div className="swatches">
      {colors.map((c) => (
        <button key={c} type="button" className={value[key] === c ? 'on' : ''} style={{ background: c }} onClick={() => set({ [key]: c })} aria-label={c} />
      ))}
    </div>
  );
  const chips = (key: keyof Appearance, options: string[]) => (
    <div className="chips">
      {options.map((o) => (
        <button key={o} type="button" className={value[key] === o ? 'on' : ''} onClick={() => set({ [key]: o })}>{LABELS[o]}</button>
      ))}
    </div>
  );
  return (
    <div className="appearance">
      <div className="preview">
        <Body appearance={value} />
        <Avatar appearance={value} size={72} />
        <button type="button" onClick={() => onChange(randomAppearance())}>🎲 Aleatorio</button>
      </div>
      <div className="options">
        <label>Piel</label>{swatches('skin', SKINS)}
        <label>Peinado</label>{chips('hair', HAIRS)}
        <label>Color de pelo</label>{swatches('hairColor', HAIR_COLORS)}
        <label>Ojos</label>{chips('eyes', EYES)}
        <label>Accesorio</label>{chips('accessory', ACCESSORIES)}
        <label>Ropa</label>{swatches('shirt', SHIRTS)}
      </div>
    </div>
  );
}

export function AgentEditor({ id, teamId }: { id?: string; teamId?: string }) {
  const existing = useStore((s) => s.agents.find((a) => a.id === id));
  const teams = useStore((s) => s.teams);
  const providers = useStore((s) => s.providers);
  const nodes = useStore((s) => s.nodes);
  const [form, setForm] = useState(() => ({
    name: existing?.name ?? '',
    role: existing?.role ?? '',
    personality: existing?.personality ?? '',
    instructions: existing?.instructions ?? '',
    providerId: existing?.providerId ?? '',
    model: existing?.model ?? '',
    nodeId: existing?.nodeId ?? '',
    teamId: existing?.teamId ?? teamId ?? '',
    appearance: existing?.appearance ?? randomAppearance(),
    companion: existing?.companion ?? randomCompanion(),
  }));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const close = () => setState({ modal: null });

  const save = async () => {
    setBusy(true);
    try {
      const body = { ...form, providerId: form.providerId || null, teamId: form.teamId || null, nodeId: form.nodeId || null };
      if (existing) await api('PATCH', `/agents/${existing.id}`, body);
      else await api('POST', '/agents', body);
      close();
    } catch (e) {
      toast((e as Error).message, false);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!existing || !confirm(`¿Despedir a ${existing.name}? Se borrará su conversación.`)) return;
    await api('DELETE', `/agents/${existing.id}`).catch((e) => toast(e.message, false));
    close();
  };

  return (
    <Modal title={existing ? `Editar a ${existing.name}` : 'Contratar un agente'} onClose={close} wide>
      <div className="editor">
        <AppearanceEditor value={form.appearance} onChange={(appearance) => set({ appearance })} />
        <div className="fields">
          <div className="row">
            <label>Nombre<input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Marta" autoFocus /></label>
            <label>Puesto<input value={form.role} onChange={(e) => set({ role: e.target.value })} placeholder="Diseñadora de producto" /></label>
          </div>
          <label>Compi<CompanionPicker value={form.companion} onChange={(companion) => set({ companion })} /></label>
          <label>Personalidad
            <input value={form.personality} onChange={(e) => set({ personality: e.target.value })} placeholder="Metódica, optimista, con sentido del humor…" />
          </label>
          <label>Instrucciones de trabajo (opcional)
            <textarea rows={3} value={form.instructions} onChange={(e) => set({ instructions: e.target.value })}
              placeholder="Cómo debe trabajar, formato de sus entregas, en qué es experta…" />
          </label>
          <div className="row">
            <label>Departamento
              <select value={form.teamId} onChange={(e) => set({ teamId: e.target.value })}>
                <option value="">Sin departamento</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label>Cerebro (LLM)
              <select value={form.providerId} onChange={(e) => set({ providerId: e.target.value })}>
                <option value="">El de la oficina por defecto</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>
          <div className="row">
            <label>Modelo propio (opcional)
              <input value={form.model} onChange={(e) => set({ model: e.target.value })} placeholder="Vacío = el modelo del proveedor" />
            </label>
            <label>Dónde se ejecuta
              <select value={form.nodeId} onChange={(e) => set({ nodeId: e.target.value })}>
                {nodes.map((n) => <option key={n.id} value={n.local ? '' : n.id}>{n.local ? 'En esta oficina' : `🛰 ${n.name}${n.online ? '' : ' (desconectado)'}`}</option>)}
              </select>
            </label>
          </div>
          <footer>
            {existing && <button className="danger" onClick={() => void remove()}>Despedir</button>}
            <span />
            <button onClick={close}>Cancelar</button>
            <button className="primary" disabled={busy || !form.name.trim()} onClick={() => void save()}>
              {existing ? 'Guardar' : 'Contratar'}
            </button>
          </footer>
        </div>
      </div>
    </Modal>
  );
}
