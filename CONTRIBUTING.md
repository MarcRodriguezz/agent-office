# Contributing to Agent Office

Thanks for wanting to help. Bug reports, ideas and pull requests are welcome.

Agent Office is **source-available, not open source**. You may fork and run it only to prepare contributions to this repository; any other use needs permission. By contributing you accept the terms in section 3 of the [license](LICENSE).

## Before you start

- **Bugs:** open an issue with the steps to reproduce it, what you expected and what happened. Say whether it happens in the [browser demo](https://agent-office-5cj.pages.dev) or in the Docker installation, and with which brain (mock, API, local model, Claude Code, Codex).
- **New features:** open an issue first and describe the idea. It saves you work if it does not fit the design (see [docs/DECISIONS.md](docs/DECISIONS.md)).
- **Security problems:** do not open a public issue. Follow [SECURITY.md](SECURITY.md).

## Setting up

```bash
docker compose up -d --build   # the full office at http://localhost:8080
```

For changes that only touch the office or the interface, the browser demo is faster and needs no Docker:

```bash
cd backend && npm ci
cd ../web && npm ci && npm run build:demo && npx vite preview --outDir dist-demo
```

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how the pieces fit together, and the skills in `.claude/skills/` describe the usual procedures (starting the office, adding a room type or an LLM provider, testing links).

## Rules of the project

- **The server is the authority.** The client only sends intentions and paints what it receives.
- **The floor plan is rooms and doors** (`backend/src/map.ts`); furniture and desks are derived, never stored.
- **The worker is stateless**: provider + prompt + work context in, text out.
- **Permissions are enforced in code** and must mean the same for every brain (`read`, `edit`, `full`).
- **The LLM is only used** for chat, plans, tasks, synthesis, meeting turns and minutes. Movement, idle life and parties are code.
- **Limits go in code, not in prompts.**
- **No graphic assets**: everything is drawn in code. Creatures are original; nothing from existing games.
- **Install and login commands come from the tool catalogue** (`backend/src/tools.ts`); no free terminal.
- **Backend code shared with the demo must run in the browser.** A new store method needs its twin in `web/demo/db.ts`.
- **Language:** documentation and commit messages are in English. The interface and the prompts are written in Spanish in the code and translated to English through the dictionaries (see below).

## Texts in the interface and the prompts

Every text a person or an agent reads goes through a translation function. The Spanish text is the key, and the English one lives in a dictionary:

- **Interface** (`web/src`): `t('Texto')` from `web/src/i18n.ts`, with the English in `web/src/i18n-en.ts`.
- **Server, worker and prompts** (`backend/src`): `t('Texto')` from `backend/src/i18n.ts`, with the English in `backend/src/i18n-en.ts`. It uses the office language, or the job's language inside the worker.
- **Placeholders:** `t('{name} entrega «{title}»', { name, title })`. The English text must keep the same `{placeholders}`; a test checks it.
- **Activity feed:** `feed(m('…', params))` stores the message, not the text, so each browser shows it in its own language.
- **Module-level constants** in the backend use `N('…')` to declare the key and `tr(value)` where they are used, because the office language can change while the process runs.
- **Plurals:** one key per form, chosen in code (`n === 1 ? t('mesa') : t('mesas')`, or a whole sentence per form); never an untranslated word inside a ternary.

A Spanish text without its English entry does not compile: the keys are typed.

## Code style

- Strict TypeScript. Backend in ESM with imports ending in `.js`.
- No comments or docstrings in the code: explain the why in the pull request, and in `docs/DECISIONS.md` if it changes the design.
- New styles use the variables in `web/src/styles.css` and follow the paper and ink interface (decision 18).

## Pull requests

1. Keep each pull request to one change, and each commit to one logical step with a title that describes a feature.
2. Make sure the checks pass. CI runs them on every pull request:
   ```bash
   cd backend && npx tsc -p . --noEmit && npm test
   cd ../web && npx tsc --noEmit && npm run build:demo
   ```
3. Try your change in the browser and describe how you tested it.
4. If you change the design, update `docs/DECISIONS.md` and, if needed, `docs/ARCHITECTURE.md`.
