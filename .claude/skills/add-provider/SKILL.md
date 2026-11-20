---
name: add-provider
description: Adds an LLM provider to Agent Office, either an OpenAI-compatible preset or a new adapter. Use it when support for another model, API or agent CLI is requested.
---

# Add an LLM provider

First decide which of the two cases it is.

## Case A: it speaks the OpenAI protocol (`/chat/completions`)

Only a preset is needed. In `web/src/ui/SettingsModal.tsx`, add an entry to `PRESETS`:

```ts
{ key: 'myprovider', group: 'API en la nube', label: 'My Provider', kind: 'openai',
  baseUrl: 'https://api.myprovider.com/v1', model: 'default-model',
  help: 'Dónde se consigue la API key y qué hay que saber.' },
```

`label`, `group` and `help` are written in Spanish inside `t('…')` and need their English entry in `web/src/i18n-en.ts`. For local servers, the URL must use `host.docker.internal`. Add the matching row in `docs/PROVIDERS.md`.

## Case B: it needs its own adapter

1. **Kind.** Add the new value to `ProviderKind` in `backend/src/types.ts` and `web/src/types.ts`, and to the `KINDS` list in `backend/src/routes.ts`.
2. **Adapter.** In `backend/src/providers.ts` write a function `(job: LlmJob) => Promise<LlmResult>` and add it to the `switch` in `runProvider`. Rules:
   - It receives `job.system`, `job.messages` (run them through `normalize`), `job.provider` (URL, key, model, command) and `job.work` (folder, permissions, credentials and session).
   - It returns only the final text. If there is no text, throw an `Error` with a clear message through `t('…')` and add its English in `backend/src/i18n-en.ts`: it is what the user sees in the connection test, in their language.
   - Put a timeout on the call.
   - Apply the agent's permissions (`job.work.access`) with the same meaning as the other adapters: see decision 19 in `docs/DECISIONS.md`.
   - If it is a CLI, use `runCli` and `flatten(job)`; the binary must be installed in `backend/Dockerfile`.
   - For Claude always use the `@anthropic-ai/sdk` SDK, never hand-written HTTP.
3. **Interface.** In `web/src/ui/SettingsModal.tsx` add the preset, the label in `KIND_LABEL` and check which fields `ProviderForm` shows for the new kind (URL, key, model, command).
4. **Environment.** If it accepts credentials through the environment, add them to `docker-compose.yml` (`x-backend` block) and `.env.example`.
5. **Documentation.** Update `docs/PROVIDERS.md` and the table in decision 5 of `docs/DECISIONS.md`.

## Verify

```bash
cd backend && npx tsc -p .
cd ../web && npx tsc --noEmit
docker compose up -d --build
```

In the interface: connect the provider and press **Save and test**. Then assign it to an agent and ask it something in the chat. Adapter errors show up in `docker compose logs worker`.
