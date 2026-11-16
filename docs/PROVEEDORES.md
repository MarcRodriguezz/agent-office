# Proveedores de LLM

Se configuran desde la interfaz (tu ordenador en el despacho o la consola de la sala de servidores). **Guardar y probar** lanza una llamada real a través de la cola y muestra la respuesta o el error.

Cada agente usa el proveedor **por defecto** de la oficina salvo que le asignes uno propio al editarlo. También puedes fijarle un modelo propio (por ejemplo, un modelo potente para los responsables y uno barato para el resto).

## API en la nube

| Proveedor | Tipo interno | URL base | Modelo sugerido |
|---|---|---|---|
| Anthropic (Claude) | `anthropic` | (la del SDK) | `claude-opus-5-5` |
| OpenAI | `openai` | `https://api.openai.com/v1` | el que uses |
| Google Gemini | `openai` | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` |
| OpenRouter | `openai` | `https://openrouter.ai/api/v1` | `openrouter/auto` |
| Groq | `openai` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Mistral | `openai` | `https://api.mistral.ai/v1` | `mistral-large-latest` |
| DeepSeek | `openai` | `https://api.deepseek.com/v1` | `deepseek-chat` |

Los nombres de modelo de terceros cambian a menudo: son valores de partida editables, comprueba el catálogo de cada proveedor.

**Anthropic** usa el SDK oficial (`@anthropic-ai/sdk`) con streaming. En los modelos que lo admiten se activa el *fallback* de servidor para rechazos por política. Si no escribes API key, se usa `ANTHROPIC_API_KEY` del entorno.

**Compatible con OpenAI** llama a `POST {URL base}/chat/completions`. No se envía límite de tokens para no chocar con las diferencias entre proveedores.

## Local

| Proveedor | URL base |
|---|---|
| Ollama | `http://host.docker.internal:11434/v1` |
| LM Studio | `http://host.docker.internal:1234/v1` |
| Otro (vLLM, llama.cpp, LiteLLM…) | la que corresponda |

Los contenedores llegan a tu máquina por `host.docker.internal`. En Ollama, el servidor debe escuchar en todas las interfaces si usas Linux (`OLLAMA_HOST=0.0.0.0`). No hace falta API key.

## Agentes CLI

Se ejecutan como subproceso dentro del contenedor `worker`, con el prompt por la entrada estándar y `/workspace` (volumen) como directorio de trabajo.

| Proveedor | Comando | Credenciales |
|---|---|---|
| Claude Code | `claude -p --output-format text [--model …]` | Sesión iniciada desde **Servidores y sesiones** (recomendado). Alternativas: token de `claude setup-token` o API key de Anthropic, en el campo de la interfaz o en `.env`. |
| Codex | `codex exec --skip-git-repo-check --sandbox read-only -o <fichero> [-m …] -` | Sesión iniciada desde **Servidores y sesiones** con el código de dispositivo (recomendado). Alternativa: API key de OpenAI en el campo o en `.env`. |
| Comando propio | `sh -c "<tu comando>"` | Las que necesite tu comando; debe estar instalado en la imagen. |

Son más lentos que una API (arrancan un agente completo por llamada) pero permiten usar una suscripción en lugar de pago por token. Con `INSTALL_AGENT_CLIS=false` no se instalan.

### Iniciar sesión

En **LLM y ajustes → Servidores y sesiones** (o en la ficha del propio proveedor) cada servidor muestra el estado de sus sesiones y un botón para iniciarla o cerrarla. La sesión vive en el volumen `agent-home` de ese servidor: cada servidor remoto tiene la suya.

Si en Codex el inicio con código de dispositivo aparece deshabilitado, actívalo en los ajustes de seguridad de tu cuenta de ChatGPT.

### Dónde se ejecuta cada agente

Un agente usa el proveedor configurado, pero la llamada sale desde el servidor que tenga asignado. Para un modelo local en una máquina remota, crea un proveedor que apunte a `http://host.docker.internal:11434/v1` (visto desde ese servidor) y asigna los agentes a ese servidor. «Guardar y probar» permite elegir desde qué servidor se prueba.

## Cerebro simulado

Tipo `mock`. Responde con textos fijos tras una pequeña espera, entiende encargos sencillos («prepara…», «analiza…») y reparte subtareas entre el equipo. Sirve para probar la oficina y la cola sin gastar nada.

## Añadir un proveedor nuevo

- Si habla el protocolo de OpenAI, basta con añadir un preset en `web/src/ui/SettingsModal.tsx` (`PRESETS`).
- Si necesita un adaptador propio, sigue la skill `.claude/skills/anadir-proveedor`.
