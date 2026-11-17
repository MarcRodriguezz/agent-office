import type { LlmJob } from './types.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LOOKS_LIKE_TASK = /\b(haz|hazme|prepara|prepárame|escribe|escríbeme|redacta|crea|créame|analiza|investiga|diseña|planifica|resume|necesito que|encárgate|quiero que|puedes hacer|genera|monta|organiza)\b/i;

export async function mock(job: LlmJob): Promise<string> {
  await sleep(1500 + Math.random() * 2500);
  const last = [...job.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  switch (job.intent) {
    case 'test':
      return 'OK';
    case 'plan': {
      const reports = job.hint?.reports ?? [];
      return JSON.stringify({
        subtasks: reports.slice(0, 3).map((r, i) => ({
          agentId: r.id,
          title: `Parte ${i + 1} (${r.role})`,
          description: `Desde tu especialidad como ${r.role}, prepara tu parte del siguiente encargo:\n${last.slice(0, 600)}`,
        })),
      });
    }
    case 'task':
      return [
        `**Entrega de ${job.agentName} (modo simulado)**`,
        '',
        'He revisado el encargo y este es mi resultado:',
        '',
        '1. Análisis del objetivo y de las restricciones.',
        '2. Propuesta de solución con los pasos principales.',
        '3. Riesgos detectados y siguientes pasos recomendados.',
        '',
        '_Este texto lo genera el cerebro simulado. Configura un proveedor LLM en tu despacho o en la sala de servidores para obtener trabajo real._',
      ].join('\n');
    case 'meeting': {
      const lines = [
        'Desde mi lado propongo empezar por lo mínimo que aporte valor y medirlo antes de ampliar.',
        'Estoy de acuerdo con lo dicho, pero añadiría una fecha de revisión para no perder el foco.',
        'Veo un riesgo: no tenemos claro quién valida el resultado. Propongo que lo decidamos hoy.',
        'Me encargo de mi parte si cerramos el alcance. Necesitaría un par de días para tener una primera versión.',
        'Yo separaría lo imprescindible de lo deseable y dejaría lo segundo para una segunda fase.',
        'Coincido. Dejemos por escrito los criterios de aceptación para que nadie trabaje a ciegas.',
      ];
      const said = (last.match(/\n\n[^\n:]+: /g) ?? []).length;
      return `${lines[(said + job.agentName.length) % lines.length]} (respuesta simulada)`;
    }
    case 'minutes': {
      const spec = /especificación/i.test(job.messages[job.messages.length - 1]?.content.split('Has moderado')[1] ?? '');
      return (spec
        ? ['## Objetivo', 'Lo que se ha planteado en la reunión, acotado a una primera versión.', '', '## Alcance', '- Primera fase: lo imprescindible.', '- Segunda fase: lo deseable.', '', '## Requisitos', '- Criterios de aceptación por escrito antes de empezar.', '', '## Decisiones técnicas', '- Pendiente de concretar con un modelo real.', '', '## Riesgos y dudas abiertas', '- Quién valida el resultado.', '', '## Reparto del trabajo', '- Cada participante se encarga de su especialidad.']
        : ['## Resumen', 'El equipo ha debatido el tema y está de acuerdo en empezar por lo mínimo.', '', '## Decisiones', '- Separar lo imprescindible de lo deseable.', '- Fijar una fecha de revisión.', '', '## Siguientes pasos', '- Cada participante prepara su parte.', '', '## Temas abiertos', '- Quién valida el resultado.']
      ).concat('', `_Acta simulada redactada por ${job.agentName}. Conecta un modelo real para reuniones de verdad._`).join('\n');
    }
    case 'synth':
      return [
        `**Resumen del equipo (modo simulado)** — coordinado por ${job.agentName}`,
        '',
        'He reunido las entregas de todo el equipo y las he integrado en un único resultado. Todas las partes están completas y son coherentes entre sí.',
        '',
        '_Configura un proveedor LLM real para que la síntesis sea auténtica._',
      ].join('\n');
    default:
      if (LOOKS_LIKE_TASK.test(last)) return `¡Claro, jefe! Me pongo con ello ahora mismo.\n[[TAREA: ${last.trim()}]]`;
      if (/hola|buenas|qué tal|que tal|hey/i.test(last)) return `¡Hola! Soy ${job.agentName}. Todo en orden por aquí. ¿En qué te ayudo?`;
      return `Entendido. Ahora mismo pienso con el cerebro simulado, así que mis respuestas son limitadas. Conéctame a un LLM desde tu ordenador o la sala de servidores y hablamos en serio. Si me encargas algo ("prepara…", "analiza…"), me pongo a ello.`;
  }
}
