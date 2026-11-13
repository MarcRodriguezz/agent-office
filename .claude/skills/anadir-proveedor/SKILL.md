---
name: anadir-proveedor
description: Añade un proveedor de LLM a Agent Office, ya sea un preset compatible con OpenAI o un adaptador nuevo. Úsala cuando se pida soportar otro modelo, API o CLI de agente.
---

# Añadir un proveedor de LLM

Primero decide cuál de los dos casos es.

## Caso A: habla el protocolo de OpenAI (`/chat/completions`)

Solo hace falta un preset. En `web/src/ui/SettingsModal.tsx`, añade una entrada a `PRESETS`:

```ts
{ key: 'miproveedor', group: 'API en la nube', label: 'Mi Proveedor', kind: 'openai',
  baseUrl: 'https://api.miproveedor.com/v1', model: 'modelo-por-defecto',
  help: 'Dónde se consigue la API key y qué hay que saber.' },
```

Para servidores locales, la URL debe usar `host.docker.internal`. Añade la fila correspondiente en `docs/PROVEEDORES.md`.

## Caso B: necesita adaptador propio

1. **Tipo.** Añade el nuevo valor a `ProviderKind` en `backend/src/types.ts` y en `web/src/types.ts`, y a la lista `KINDS` de `backend/src/server.ts`.
2. **Adaptador.** En `backend/src/providers.ts` escribe una función `(job: LlmJob) => Promise<string>` y añádela al `switch` de `runProvider`. Reglas:
   - Recibe `job.system`, `job.messages` (pásalos por `normalize`) y `job.provider` (URL, key, modelo, comando).
   - Devuelve solo el texto final. Si no hay texto, lanza un `Error` con un mensaje claro en español: es lo que verá el usuario en la prueba de conexión.
   - Pon tiempo máximo a la llamada.
   - Si es un CLI, usa `runCli` y `flatten(job)`; el binario debe instalarse en `backend/Dockerfile`.
   - Para Claude usa siempre el SDK `@anthropic-ai/sdk`, no HTTP a mano.
3. **Interfaz.** En `web/src/ui/SettingsModal.tsx` añade el preset, la etiqueta en `KIND_LABEL` y revisa qué campos muestra `ProviderForm` para el nuevo tipo (URL, key, modelo, comando).
4. **Entorno.** Si admite credenciales por entorno, añádelas a `docker-compose.yml` (bloque `x-backend`) y a `.env.example`.
5. **Documentación.** Actualiza `docs/PROVEEDORES.md` y la tabla de la decisión 5 en `docs/DECISIONES.md`.

## Verificar

```bash
cd backend && npx tsc -p .
cd ../web && npx tsc --noEmit
docker compose up -d --build
```

En la interfaz: conecta el proveedor y pulsa **Guardar y probar**. Después asígnaselo a un agente y pídele algo por el chat. Los errores del adaptador se ven en `docker compose logs worker`.
