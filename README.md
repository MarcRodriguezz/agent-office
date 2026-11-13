# 🏢 Agent Office

Una oficina virtual donde cada empleado es un agente de IA. Tú eres el jefe: te mueves por la oficina, vas a la mesa de un agente a hablar con él, le llamas a tu despacho, le encargas trabajo y él vuelve a traértelo cuando termina. Los agentes se organizan en departamentos, se reúnen, se reparten las tareas y trabajan en segundo plano con el LLM que tú elijas (en la nube, local o un CLI como Claude Code o Codex).

Y tiene alma de RPG de criaturas: cada persona de la oficina (tú incluido) tiene un **compi** original que le sigue a todas partes, gana experiencia con el trabajo entregado, sube de nivel y evoluciona.

Todo corre en Docker con un solo comando.

## Arranque rápido

```bash
cp .env.example .env        # opcional: solo si quieres dejar API keys en el entorno
docker compose up -d --build
```

Abre **http://localhost:8080**.

La oficina arranca con cinco agentes, dos departamentos y un **cerebro simulado** (sin LLM), así que se puede probar sin ninguna API key. Para que piensen de verdad, conecta un proveedor desde tu ordenador (despacho) o desde la consola de la sala de servidores.

Para parar: `docker compose down` (los datos se conservan en volúmenes; `docker compose down -v` los borra).

## Cómo se usa

| Quieres… | Haz esto |
|---|---|
| Moverte | Teclas **WASD** o flechas, o clic en el suelo. Rueda del ratón para el zoom. |
| Interactuar con lo que tienes al lado | Tecla **E** (agente u objeto cercano). **Espacio** avanza o cierra el cuadro de diálogo. |
| Hablar con un agente | Clic sobre él (o en la lista de la izquierda): caminas hasta su mesa y se abre la conversación. |
| Que venga a tu despacho | Botón **«Que venga a verme»** en su panel. |
| Encargarle un trabajo | Díselo en el chat («prepárame un plan de…») o usa la pestaña **Tareas**. Irá a su mesa, trabajará en segundo plano y te traerá el resultado. |
| Encargar algo a un departamento | **Equipo y departamentos → Encargar un trabajo a todo el departamento**. El responsable convoca una reunión, reparte, espera las entregas y te trae el resultado integrado. |
| Contratar / editar / despedir | Mostrador de **RRHH** o botón **Contratar agente**. Nombre, puesto, personalidad, cara, ropa, departamento y cerebro. |
| Crear departamentos | **Equipo y departamentos**: nombre, color, misión, responsable (★) y miembros. |
| Configurar el LLM | Tu ordenador (despacho) o la consola de la **sala de servidores**. |
| Ver las ejecuciones en segundo plano | Indicador de la barra superior o pestaña **Segundo plano**. |
| Ver todas las tareas y resultados | **Tablón de tareas** de la sala de reuniones. |
| Ver los compis, su nivel y las formas descubiertas | **Álbum de compis**. |

## Compis, niveles y evolución

Al entrar por primera vez eliges a tu compi entre ocho especies originales (Brotín, Ascuo, Gotelo, Voltín, Pedrín, Nubi, Bitxo y Lumo) y le pones mote. Cada agente tiene el suyo, que puedes cambiar al contratarlo o editarlo.

| Acción | Experiencia |
|---|---|
| Responder en una conversación | +4 |
| Entregar una subtarea a su responsable | +35 |
| Entregar una tarea propia | +45 |
| Entregar una tarea coordinando a su departamento | +60 |
| Recibir una entrega (tu propio compi) | +20 |

Cada 100 puntos se sube un nivel. Los compis evolucionan en los niveles 3 y 6, y el álbum va descubriendo las formas que alcanza alguien de la oficina.

## Proveedores de LLM

Cada agente usa el proveedor por defecto de la oficina o uno propio (y, opcionalmente, un modelo propio).

| Tipo | Proveedores | Notas |
|---|---|---|
| API en la nube | Anthropic (Claude), OpenAI, Google Gemini, OpenRouter, Groq, Mistral, DeepSeek | Anthropic usa el SDK oficial; el resto, el protocolo compatible con OpenAI. |
| Local | Ollama, LM Studio, cualquier servidor compatible con OpenAI (vLLM, llama.cpp, LiteLLM…) | Se accede a tu máquina con `host.docker.internal`. Sin API key. |
| Agentes CLI | Claude Code (`claude -p`), Codex (`codex exec`), comando propio | Vienen instalados en el contenedor `worker`. |
| Sin LLM | Cerebro simulado | Para probar la oficina sin gastar tokens. |

Detalles de cada uno en [docs/PROVEEDORES.md](docs/PROVEEDORES.md).

## Arquitectura en una imagen

```
navegador ──HTTP/WS──▶ web (nginx + React/Canvas)
                          │ /api, /ws
                          ▼
                       server (Fastify)            worker (BullMQ)
                       ├─ simulación de la oficina   ├─ Anthropic SDK
                       ├─ orquestación de agentes    ├─ APIs compatibles OpenAI
                       ├─ SQLite (volumen)           ├─ claude / codex / comando
                       └─ encola trabajos ──▶ redis ──▶ y cerebro simulado
```

- **server** es el dueño del estado: mapa, posiciones, agentes, departamentos, tareas y conversaciones.
- **worker** solo ejecuta llamadas a LLM. Es lo lento y lo que puede fallar, así que va en segundo plano y con concurrencia configurable.
- **web** dibuja la oficina en un `<canvas>` y recibe el estado por WebSocket.

Más detalle en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md) y el porqué de cada decisión en [docs/DECISIONES.md](docs/DECISIONES.md).

## Configuración (`.env`)

| Variable | Por defecto | Para qué |
|---|---|---|
| `OFFICE_PORT` | `8080` | Puerto local de la web. |
| `WORKER_CONCURRENCY` | `4` | Llamadas a LLM simultáneas. |
| `INSTALL_AGENT_CLIS` | `true` | Instala `claude` y `codex` en la imagen. Ponlo a `false` para una imagen más ligera. |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN` | vacío | Credenciales por entorno, como alternativa a guardarlas desde la interfaz. |

## Seguridad

Es una herramienta **local y de un solo usuario**: no hay login y el puerto solo se publica en `127.0.0.1`. Las API keys que guardes desde la interfaz se almacenan en la base de datos SQLite del volumen `office-data` y nunca se devuelven al navegador. No la expongas a Internet tal cual.

## Estado

Primera versión. Limitaciones conocidas y siguientes pasos en [docs/DECISIONES.md](docs/DECISIONES.md#limitaciones-conocidas-y-siguientes-pasos).
