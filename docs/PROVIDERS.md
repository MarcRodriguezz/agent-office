# LLM providers

They are configured from the interface (your computer in your office or the server room console). **Guardar y probar** runs a real call through the queue and shows the answer or the error.

Each agent uses the office's **default** provider unless you assign it its own when editing it. You can also set its own model (for example, a powerful model for leads and a cheap one for the rest).

## Cloud API

| Provider | Internal kind | Base URL | Suggested model |
|---|---|---|---|
| Anthropic (Claude) | `anthropic` | (the SDK's) | `claude-opus-5-5` |
| OpenAI | `openai` | `https://api.openai.com/v1` | the one you use |
| Google Gemini | `openai` | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` |
| OpenRouter | `openai` | `https://openrouter.ai/api/v1` | `openrouter/auto` |
| Groq | `openai` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Mistral | `openai` | `https://api.mistral.ai/v1` | `mistral-large-latest` |
| DeepSeek | `openai` | `https://api.deepseek.com/v1` | `deepseek-chat` |

Third-party model names change often: these are editable starting values, check each provider's catalogue.

**Anthropic** uses the official SDK (`@anthropic-ai/sdk`) with streaming. On models that support it, the server-side *fallback* for policy refusals is enabled. If you leave the API key empty, `ANTHROPIC_API_KEY` from the environment is used.

**OpenAI-compatible** calls `POST {base URL}/chat/completions`. No token limit is sent, to avoid clashing with differences between providers.

## Local

| Provider | Base URL |
|---|---|
| Ollama | `http://host.docker.internal:11434/v1` |
| LM Studio | `http://host.docker.internal:1234/v1` |
| Other (vLLM, llama.cpp, LiteLLM…) | whatever applies |

Containers reach your machine through `host.docker.internal`. With Ollama on Linux, the server must listen on all interfaces (`OLLAMA_HOST=0.0.0.0`). No API key is needed.

## CLI agents

They run as a subprocess inside the `worker` container, with the prompt on standard input and the agent's project folder (inside the `/workspace` volume) as working directory. Permission and session options depend on the agent: see decisions 19 and 21 in [DECISIONS.md](DECISIONS.md).

| Provider | Command | Credentials |
|---|---|---|
| Claude Code | `claude -p --output-format text [--model …]` + permissions + `--session-id`/`--resume` | Session started from **Servidores y sesiones** (recommended). Alternatives: a `claude setup-token` token or an Anthropic API key, in the interface field or in `.env`. |
| Codex | `codex exec [resume <id>] --skip-git-repo-check --json -o <file> -c sandbox_mode=… [-m …] -` | Session started from **Servidores y sesiones** with the device code (recommended). Alternative: an OpenAI API key in the field or in `.env`. |
| Custom command | `sh -c "<your command>"` | Whatever your command needs; it must be installed in the image. |

They are slower than an API (they start a full agent per call) but let you use a subscription instead of paying per token. With `INSTALL_AGENT_CLIS=false` they are not installed.

### Logging in

In **Modelos y ajustes → Servidores y sesiones** (or in the provider's own card) each server shows the state of its sessions and a button to start or end them. The session lives in that server's `agent-home` volume: each remote server has its own.

If device-code login appears disabled for Codex, enable it in the security settings of your ChatGPT account.

### Where each agent runs

An agent uses the configured provider, but the call leaves from the server assigned to it. For a local model on a remote machine, create a provider pointing to `http://host.docker.internal:11434/v1` (as seen from that server) and assign the agents to that server. «Guardar y probar» lets you choose which server runs the test.

## Tools for API models

The `anthropic` and `openai` providers (local models included) get office tools to work in the project folder: `list_files`, `read_file` and `search`; with edit permission, `write_file`, `replace_in_file` and `run_tool` (the commands of their external tools, no shell); with full freedom, `shell`. Models with *tool calling* are required: if the server rejects the tools, the office repeats the call without them and the agent only answers with text.

## What each call is for (intents)

Every job carries an intent, shown in the **Actividad** tab:

| Intent | When |
|---|---|
| `chat` | Answering the boss in a conversation. |
| `task` | Doing a task. |
| `plan` | A lead splitting a job among its team, or the chair splitting the work agreed in a meeting. |
| `synth` | A lead combining the team's deliveries. |
| `meeting` | One turn of an agent in a meeting. |
| `minutes` | The chair writing the meeting minutes or spec. |
| `test` | «Guardar y probar». |

## Mock brain

Kind `mock`. It answers with fixed texts after a short wait, understands simple jobs ("prepara…", "analiza…"), splits subtasks among the team, speaks in meetings and writes sample minutes and specs. It is for trying the office and the queue without spending anything.

## Adding a new provider

- If it speaks the OpenAI protocol, adding a preset in `web/src/ui/SettingsModal.tsx` (`PRESETS`) is enough.
- If it needs its own adapter, follow the `.claude/skills/add-provider` skill.
