import type { LlmJob } from './types.js';
import { t } from './i18n.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LOOKS_LIKE_TASK = /\b(haz|hazme|prepara|prepárame|escribe|escríbeme|redacta|crea|créame|analiza|investiga|diseña|planifica|resume|necesito que|encárgate|quiero que|puedes hacer|genera|monta|organiza|make|prepare|write|draft|create|analy[sz]e|research|design|plan|summari[sz]e|build|generate|organi[sz]e|i need you to|i want you to|can you do)\b/i;

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
          title: t('Parte {v0} ({role})', { v0: i + 1, role: r.role }),
          description: t('Desde tu especialidad como {role}, prepara tu parte del siguiente encargo:\n{v1}', { role: r.role, v1: last.slice(0, 600) }),
        })),
      });
    }
    case 'task':
      return [
        t('**Entrega de {agentName} (modo simulado)**', { agentName: job.agentName }),
        '',
        t('He revisado el encargo y este es mi resultado:'),
        '',
        t('1. Análisis del objetivo y de las restricciones.'),
        t('2. Propuesta de solución con los pasos principales.'),
        '3. Riesgos detectados y siguientes pasos recomendados.',
        '',
        t('_Este texto lo genera el cerebro simulado. Configura un proveedor LLM en tu despacho o en la sala de servidores para obtener trabajo real._'),
      ].join('\n');
    case 'meeting': {
      const lines = [
        t('Desde mi lado propongo empezar por lo mínimo que aporte valor y medirlo antes de ampliar.'),
        t('Estoy de acuerdo con lo dicho, pero añadiría una fecha de revisión para no perder el foco.'),
        t('Veo un riesgo: no tenemos claro quién valida el resultado. Propongo que lo decidamos hoy.'),
        t('Me encargo de mi parte si cerramos el alcance. Necesitaría un par de días para tener una primera versión.'),
        t('Yo separaría lo imprescindible de lo deseable y dejaría lo segundo para una segunda fase.'),
        t('Coincido. Dejemos por escrito los criterios de aceptación para que nadie trabaje a ciegas.'),
      ];
      const said = (last.match(/\n\n[^\n:]+: /g) ?? []).length;
      return t('{v0} (respuesta simulada)', { v0: lines[(said + job.agentName.length) % lines.length] });
    }
    case 'minutes': {
      const spec = /especificación acordada|agreed specification/i.test(job.messages[job.messages.length - 1]?.content ?? '');
      return (spec
        ? ['## Objetivo', t('Lo que se ha planteado en la reunión, acotado a una primera versión.'), '', '## Alcance', t('- Primera fase: lo imprescindible.'), t('- Segunda fase: lo deseable.'), '', '## Requisitos', t('- Criterios de aceptación por escrito antes de empezar.'), '', t('## Decisiones técnicas'), t('- Pendiente de concretar con un modelo real.'), '', '## Riesgos y dudas abiertas', t('- Quién valida el resultado.'), '', '## Reparto del trabajo', t('- Cada participante se encarga de su especialidad.')]
        : ['## Resumen', t('El equipo ha debatido el tema y está de acuerdo en empezar por lo mínimo.'), '', '## Decisiones', t('- Separar lo imprescindible de lo deseable.'), t('- Fijar una fecha de revisión.'), '', '## Siguientes pasos', t('- Cada participante prepara su parte.'), '', '## Temas abiertos', t('- Quién valida el resultado.')]
      ).concat('', t('_Acta simulada redactada por {agentName}. Conecta un modelo real para reuniones de verdad._', { agentName: job.agentName })).join('\n');
    }
    case 'synth':
      return [
        t('**Resumen del equipo (modo simulado)** — coordinado por {agentName}', { agentName: job.agentName }),
        '',
        t('He reunido las entregas de todo el equipo y las he integrado en un único resultado. Todas las partes están completas y son coherentes entre sí.'),
        '',
        t('_Configura un proveedor LLM real para que la síntesis sea auténtica._'),
      ].join('\n');
    default:
      if (LOOKS_LIKE_TASK.test(last)) return t('¡Claro, jefe! Me pongo con ello ahora mismo.\n[[TAREA: {v0}]]', { v0: last.trim() });
      if (/(^|[^\p{L}])(hola|buenas|qué tal|que tal|hey|hello|hi|good (morning|afternoon|evening))($|[^\p{L}])/iu.test(last)) return t('¡Hola! Soy {agentName}. Todo en orden por aquí. ¿En qué te ayudo?', { agentName: job.agentName });
      return t('Entendido. Ahora mismo pienso con el cerebro simulado, así que mis respuestas son limitadas. Conéctame a un LLM desde tu ordenador o la sala de servidores y hablamos en serio. Si me encargas algo ("prepara…", "analiza…"), me pongo a ello.');
  }
}
