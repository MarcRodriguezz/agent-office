# 🏢 Agent Office

Una oficina virtual donde cada empleado es un agente de IA. Tú eres el jefe: te mueves por la oficina, vas a la mesa de un agente a hablar con él, le llamas a tu despacho, le encargas trabajo y él vuelve a traértelo cuando termina. Los agentes se organizan en departamentos, se reúnen, se reparten las tareas y trabajan en segundo plano con el LLM que tú elijas (en la nube, local o un CLI como Claude Code o Codex).

Y tiene alma de RPG de criaturas: cada persona de la oficina (tú incluido) tiene un **compi** original que le sigue a todas partes, gana experiencia con el trabajo entregado, sube de nivel y evoluciona.

Los agentes pueden ejecutarse en esta máquina o en **servidores remotos** tuyos, y varias oficinas pueden **conectarse entre sí** para encargarse trabajo.

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
| Configurar el LLM | **Modelos y ajustes** (o tu ordenador, o la consola de la sala de servidores). Arriba, «Conectar en un paso»: tu cuenta de Claude, tu cuenta de ChatGPT o una API key pegada. |
| Iniciar sesión en Claude Code o Codex | **Modelos y ajustes → Iniciar sesión**: botón para abrir la página, botón para copiar el enlace o el código, y al terminar la oficina empieza a usar esa cuenta. |
| Cambiar de oficina | Pulsa el nombre de la oficina, arriba a la izquierda. |
| Abrir, enlazar o eliminar oficinas | **Oficinas → Mis oficinas**. |
| Cambiar el plano | **Arquitecto**: mueve y redimensiona salas, abre puertas, añade departamentos, despachos y salas. |
| Poner agentes en otro servidor | **Servidores y sesiones → Añadir un servidor remoto**, y elige «Dónde se ejecuta» al editar el agente. |
| Conectar con una oficina de otro equipo | **Oficinas → Oficinas de fuera**: una crea la invitación y la otra la pega. |
| Ver las ejecuciones en segundo plano | Indicador de la barra superior o pestaña **Actividad**. |
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

## Iniciar sesión con tu cuenta (Claude Code y Codex)

No hace falta copiar tokens a mano. En **LLM y ajustes → Servidores y sesiones** cada servidor muestra si Claude Code y Codex tienen sesión:

- **Claude Code**: pulsa *Iniciar sesión*, abre el enlace, autoriza y pega en la oficina el código que te da la página.
- **Codex**: pulsa *Iniciar sesión*, abre el enlace e introduce el código de un solo uso que aparece; la oficina detecta sola cuándo terminas.

La sesión se guarda en un volumen (`agent-home`), así que sobrevive a reinicios y reconstrucciones. Después conecta el proveedor «Claude Code» o «Codex CLI» en *Proveedores LLM* y márcalo por defecto.

## Servidores remotos

Un servidor remoto ejecuta el trabajo de los agentes que le asignes (por ejemplo, una máquina con GPU y Ollama, o un VPS con su propia sesión de Claude Code).

1. En **Servidores y sesiones** añade el servidor: la oficina te da el comando con su token.
2. En la máquina remota, con este repositorio clonado:
   ```bash
   OFFICE_URL=http://direccion-de-la-oficina:8090/o/3101 NODE_TOKEN=<token> docker compose -f docker-compose.node.yml up -d --build
   ```
3. Al editar un agente, elige el servidor en **Dónde se ejecuta**.

Es el servidor remoto quien se conecta a la oficina, así que no necesita puertos abiertos. La oficina sí debe ser alcanzable por su **puerto de enlace** (ver más abajo). Desde la oficina puedes iniciar sesión en Claude Code y Codex de cada servidor.

## Varias oficinas

Una instalación aloja todas las oficinas que quieras en la misma dirección. En **Oficinas → Mis oficinas** abres una nueva (llega con su plantilla, su plano y sus ajustes), entras en cualquiera, las enlazas entre sí con un botón o las eliminas. Para cambiar rápido, pulsa el nombre de la oficina en la barra superior.

Dos oficinas enlazadas se ven la gente y los departamentos, se encargan trabajo y, cuando terminan, alguien de esa oficina entra por la puerta a entregártelo en persona (**Oficinas → Encargar a otra oficina**).

Una oficina de otro equipo se enlaza igual, pero con una invitación: una la crea en **Oficinas de fuera** y la otra la pega.

## Modo arquitecto

El botón **Arquitecto** convierte la oficina en un plano editable:

- **Arrastra** una sala para moverla y **tira de una esquina** para cambiarle el tamaño.
- **Pulsa un muro** entre dos salas para abrir o cerrar una puerta. Si una sala se queda sin acceso, se le abre una sola.
- **Añade** zonas de departamento, despachos, salas de reuniones, cafeterías, salas de descanso y salas de servidores. Si no caben, la planta crece.
- Una zona de departamento se asigna a un departamento (o crea uno nuevo): su gente se sienta ahí. Un despacho se le puede dar a una persona.
- Los muebles y las mesas se colocan solos según el tipo y el tamaño de la sala. **Deshacer** revierte el último cambio y **Plano de serie** vuelve al original.

La oficina no deja guardar un plano con salas solapadas, aisladas o con menos mesas que personas, y siempre conserva tu despacho, RRHH y una sala de reuniones.

### Puerto de enlace

Los servidores remotos y las otras oficinas entran por un puerto aparte (`LINK_PORT`, 8090) que solo expone las rutas `/o/<oficina>/link/`, protegidas por token. Por defecto solo escucha en `127.0.0.1`; para aceptar conexiones de otras máquinas pon `LINK_BIND=0.0.0.0` en `.env`. La interfaz y la API siguen siendo solo locales.

## Proveedores de LLM

Cada agente usa el proveedor por defecto de la oficina o uno propio (y, opcionalmente, un modelo propio).

| Tipo | Proveedores | Notas |
|---|---|---|
| API en la nube | Anthropic (Claude), OpenAI, Google Gemini, OpenRouter, Groq, Mistral, DeepSeek | Anthropic usa el SDK oficial; el resto, el protocolo compatible con OpenAI. |
| Local | Ollama, LM Studio, cualquier servidor compatible con OpenAI (vLLM, llama.cpp, LiteLLM…) | Se accede a tu máquina con `host.docker.internal`. Sin API key. |
| Agentes CLI | Claude Code (`claude -p`), Codex (`codex exec`), comando propio | Vienen instalados. Se inicia sesión desde la propia oficina. |
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
| `LINK_PORT` | `8090` | Puerto de enlace para servidores remotos y otras oficinas. |
| `LINK_BIND` | `127.0.0.1` | Interfaz en la que escucha el puerto de enlace. `0.0.0.0` para aceptar otras máquinas. |
| `LINK_PUBLIC_URL` | vacío | Dirección por la que los demás llegan a esta oficina (también se puede fijar desde la interfaz). |
| `OFFICE_URL`, `NODE_TOKEN` | vacío | Solo para `docker-compose.node.yml`: oficina a la que se conecta un servidor remoto y su token. |
| `INSTALL_AGENT_CLIS` | `true` | Instala `claude` y `codex` en la imagen. Ponlo a `false` para una imagen más ligera. |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN` | vacío | Credenciales por entorno, como alternativa a guardarlas desde la interfaz. |

## Seguridad

Es una herramienta **local y de un solo usuario**: no hay login y el puerto solo se publica en `127.0.0.1`. Las API keys que guardes desde la interfaz se almacenan en la base de datos SQLite del volumen `office-data` y nunca se devuelven al navegador. No la expongas a Internet tal cual.

El puerto de enlace es lo único pensado para abrirse a otras máquinas: solo acepta conexiones con un token generado por la oficina. Ten en cuenta que una oficina conectada puede encargar trabajo a tus agentes (y gastar tus tokens), y que un servidor remoto ejecuta lo que le mande su oficina, incluido el proveedor «comando propio». Conecta solo oficinas y servidores de confianza y, fuera de una red privada, pon el enlace detrás de HTTPS o una VPN.

## Estado

Primera versión. Limitaciones conocidas y siguientes pasos en [docs/DECISIONES.md](docs/DECISIONES.md#limitaciones-conocidas-y-siguientes-pasos).
