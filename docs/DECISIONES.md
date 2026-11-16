# Decisiones de diseño

Registro de las decisiones tomadas, con su motivo y lo que se descartó. Decisiones 1 a 12: 2026-11-13. Decisiones 13 a 15: 2026-11-16.

## 1. Qué es el producto

**Decisión:** una oficina virtual «de vida» en la que tú eres el jefe y los empleados son agentes de IA que hacen trabajo real con un LLM (redactar, analizar, planificar) y lo entregan en persona.

**Motivo:** el planteamiento original era una fábrica simulada; al concretarlo se pidió una oficina, con despachos, visitas entre mesas y configuración del LLM dentro del propio espacio. Se mezcla lo mejor de las dos opciones que se barajaron: la parte visual de una simulación y la utilidad de agentes que producen algo.

**Estética propia:** personajes y mobiliario dibujados por código, vista 3/4 plana. Es un juego de gestión original, no una recreación de ningún título existente.

## 2. La simulación no la decide el LLM

**Decisión:** moverse, sentarse, tomar café o charlar es código normal en el servidor. El LLM solo interviene en cuatro momentos: conversación, planificar un reparto, ejecutar una tarea y sintetizar las entregas.

**Motivo:** si cada paso lo decidiera un modelo, sería lento y caro. Así una tarea individual cuesta una llamada y una tarea de departamento cuesta `2 + nº de miembros implicados`. La vida ociosa cuesta cero.

## 3. Servidor autoritativo

**Decisión:** las posiciones y estados viven en el servidor y se difunden por WebSocket; el navegador interpola y solo envía intenciones.

**Motivo:** los agentes siguen trabajando aunque cierres la pestaña, varias pestañas ven lo mismo y el mapa se define en un único sitio (`backend/src/map.ts`).

**Descartado:** simulación en el cliente (más sencilla, pero el trabajo se pararía al cerrar el navegador).

## 4. Ejecuciones en segundo plano con BullMQ + Redis

**Decisión:** cada llamada a un LLM es un trabajo en una cola BullMQ que ejecuta un contenedor `worker` aparte.

**Motivo:** las llamadas duran de segundos a minutos (más aún con los CLIs) y pueden fallar. Fuera del proceso que mueve la oficina no bloquean nada, se limita la concurrencia (`WORKER_CONCURRENCY`) y se pueden escalar los workers (`docker compose up --scale worker=3`).

**Detalles:**
- El worker no tiene estado ni toca la base de datos: recibe proveedor + prompt y devuelve texto. Toda la lógica está en `server`.
- Un intento por trabajo: los errores típicos (key inválida, modelo inexistente) no mejoran reintentando, y el SDK de Anthropic ya reintenta los transitorios.
- Los trabajos se borran de Redis al terminar porque llevan la API key en sus datos. Los contadores de completados y fallidos los lleva el servidor en memoria.

**Descartado:** `setTimeout`/promesas dentro del servidor (sin límite de concurrencia ni aislamiento) y Celery/Temporal (demasiado para una primera versión).

## 5. Proveedores

**Decisión:** seis tipos de adaptador que cubren prácticamente cualquier LLM:

| Tipo | Cubre |
|---|---|
| `anthropic` | Claude por API, con el SDK oficial. |
| `openai` | Todo lo que hable `/chat/completions`: OpenAI, Gemini, OpenRouter, Groq, Mistral, DeepSeek, Ollama, LM Studio, vLLM, llama.cpp, LiteLLM… |
| `claude-code` | Claude Code en modo no interactivo, para usar una suscripción. |
| `codex` | Codex CLI de OpenAI. |
| `cli` | Cualquier comando que lea de stdin y escriba en stdout. |
| `mock` | Cerebro simulado para probar sin coste. |

**Motivo:** el protocolo de OpenAI es el estándar de facto, así que un adaptador genérico con presets da soporte a una docena de proveedores sin código específico. Anthropic tiene adaptador propio para usar su SDK. Los CLIs se incluyen porque permiten usar agentes ya autenticados y suscripciones.

**Modelo por defecto para Anthropic:** `claude-opus-5-5`. Se puede cambiar por proveedor o por agente.

**Proveedor por agente:** cada agente puede usar el de la oficina o uno propio, y un modelo propio. Permite mezclar (por ejemplo, responsables con un modelo potente y el resto con uno local).

## 6. Departamentos

**Decisión:** la jerarquía se expresa con departamentos (`teams`) que tienen color, misión, miembros y un responsable. No hay campo «jefe de» en el agente.

**Motivo:** es más fácil de entender y de editar que un organigrama arbitrario, y da pie al comportamiento colaborativo: reunión en la sala, reparto, entregas al responsable y síntesis.

**Reglas firmes en código (no en el prompt):**
- Solo se delega en tareas de primer nivel. Una subtarea nunca se vuelve a repartir, así no hay bucles ni cadenas infinitas.
- Como máximo una subtarea por miembro.
- Si el plan del responsable no es JSON válido o sale vacío, hace él la tarea.
- La reunión espera a los miembros un máximo de 45 segundos.

## 7. Cómo se crea una tarea desde el chat

**Decisión:** el agente decide si un mensaje es un encargo añadiendo `[[TAREA: …]]` al final de su respuesta; el servidor lo detecta, crea la tarea y oculta la etiqueta.

**Motivo:** funciona con cualquier proveedor, incluidos los modelos locales y los CLIs, que no comparten un mecanismo común de *tool calling*. Además existe el formulario explícito de la pestaña Tareas.

## 8. Persistencia en SQLite con `node:sqlite`

**Decisión:** una base de datos SQLite en un volumen, usando el módulo incluido en Node 24.

**Motivo:** un solo proceso escribe (el servidor), los datos son pocos y no hay que compilar dependencias nativas ni levantar otro contenedor.

**Descartado:** Postgres (innecesario mientras solo escriba un proceso).

## 9. Frontend: React + Canvas 2D sin motor de juego

**Decisión:** la oficina se pinta en un `<canvas>` con funciones propias; los paneles son React. Sin assets: suelos, muebles, personajes y caras se generan por código.

**Motivo:** las caras personalizables salen gratis (el mismo dibujo sirve para el personaje, el retrato y el editor), no hay licencias de arte que gestionar y el bundle es mínimo. Para ~10 personajes un motor como Phaser o PixiJS no aporta nada.

## 10. Un solo puerto y solo en local

**Decisión:** nginx sirve el frontend y hace de proxy de la API y el WebSocket. Se publica únicamente `127.0.0.1:8080`. No hay autenticación.

**Motivo:** es una herramienta personal. Publicar solo en loopback evita exponer en la red local una API que guarda claves y puede ejecutar comandos (proveedor `cli`).

## 11. Idioma

**Decisión:** interfaz, prompts y documentación en español. Los agentes responden en el idioma en que se les habla.

## 12. Capa RPG de criaturas: compis, experiencia y evolución

**Decisión:** cada persona de la oficina tiene una criatura compañera («compi») que le sigue, y el trabajo entregado da experiencia. Cada 100 puntos se sube de nivel y el compi evoluciona en los niveles 3 y 6. Se añade además movimiento con teclado, interacción con una tecla, cuadro de diálogo con texto progresivo para lo que te dicen los agentes, elección de compi inicial y un álbum de colección.

**Motivo:** se pidió un aire de RPG de coleccionar criaturas. Aporta progresión visible (se ve quién ha trabajado más), motivos para volver y personalidad a cada agente, sin tocar el flujo de trabajo.

**Criaturas originales:** las ocho especies, sus nombres, tipos y diseños son propios de este proyecto y se dibujan por código (`web/src/game/creature.ts`). Se toman las mecánicas del género (compañeros, niveles, evoluciones, colección), no personajes, nombres ni arte de ningún juego existente.

**La experiencia la otorga el servidor**, nunca el cliente ni el LLM: se suma en `brain.ts` al completar una conversación, una tarea o una entrega. Así no se puede inflar desde el navegador ni depende de lo que diga un modelo.

**Los compis son solo visuales en el cliente:** siguen a su dueño con una «correa» calculada en el navegador a partir de la posición del dueño. No son actores del servidor, no ocupan celdas y no añaden tráfico de red.

**El tipo es cosmético.** No hay combates ni ventajas por tipo: no encajan con una oficina y añadirían complejidad sin aportar al trabajo real.

**Descartado por ahora:** criaturas salvajes que aparecen y se pueden adoptar, objetos, y que el nivel influya en el comportamiento del agente (por ejemplo, desbloquear herramientas o un modelo mejor).

## 13. Servidores remotos que se conectan a la oficina

**Decisión:** un servidor remoto es el mismo worker con dos variables (`OFFICE_URL`, `NODE_TOKEN`). Abre él la conexión (WebSocket) hacia la oficina y por ella recibe los trabajos de los agentes que tiene asignados. Cada agente elige dónde se ejecuta.

**Motivo:** permite repartir agentes entre máquinas (una con GPU, otra con una suscripción distinta) sin exponer Redis ni abrir puertos en el servidor remoto: basta con que alcance la oficina. Se reutiliza la imagen y los adaptadores de proveedor.

**Detalles:**
- Los trabajos locales siguen pasando por BullMQ; los remotos van por el WebSocket del servidor, que aplica su propia concurrencia.
- Si el servidor de un agente está desconectado, su trabajo falla con un mensaje claro. No se desvía a otra máquina, porque el proveedor configurado (un modelo local, una sesión concreta) puede no existir allí.
- Al quitar un servidor, sus agentes vuelven a ejecutarse en la oficina.

**Descartado:** exponer Redis a los workers remotos (habría que protegerlo y abrirlo a la red) y controlar los servidores por SSH desde la oficina (exige guardar credenciales de máquinas ajenas).

## 14. Inicio de sesión real en Claude Code y Codex desde la interfaz

**Decisión:** la oficina lanza el inicio de sesión oficial de cada CLI (`claude auth login`, `codex login --device-auth`) dentro del servidor elegido, muestra la salida y reenvía el código que pega el usuario. La sesión queda guardada en un volumen.

**Motivo:** usar una suscripción no debería obligar a entrar al contenedor ni a copiar tokens. Se usa el flujo oficial de cada herramienta en lugar de reimplementar su OAuth, así sigue funcionando cuando cambien.

**Detalles:**
- Solo se pueden lanzar cuatro acciones fijas (iniciar y cerrar sesión de cada CLI): la interfaz no ofrece un terminal libre.
- El pseudoterminal se consigue con `script`, que ya viene en la imagen, para no compilar módulos nativos.
- La imagen instala ahora `ca-certificates`: sin ellos Codex no podía conectar por HTTPS.

## 15. Oficinas independientes que se conectan entre sí

**Decisión:** cada oficina es una instalación completa y autónoma. Dos oficinas se enlazan con un código de invitación y un WebSocket persistente; comparten su directorio de personas y departamentos y se envían encargos. No hay servidor central.

**Motivo:** cada oficina conserva sus datos, sus claves y su gasto, puede estar en otra máquina o pertenecer a otra persona, y sigue funcionando sola si el enlace se cae.

**Detalles:**
- Solo la oficina que se une necesita alcanzar a la otra; el canal es bidireccional.
- Un encargo remoto es una tarea local normal con un origen: reutiliza el flujo existente (incluido el reparto en equipo) y las reglas contra bucles.
- La entrega se representa con un visitante que entra a la oficina que hizo el encargo.
- Los resultados que no se pueden entregar por una caída se guardan en memoria y se reconcilian al reconectar.
- El enlace entra por un puerto aparte que solo publica `/link/` y exige token, para poder abrirlo a otras máquinas sin exponer la interfaz ni la API.

**Descartado:** varias oficinas dentro de un mismo servidor y base de datos (acopla datos y claves de equipos distintos) y un directorio central de oficinas.

## 16. Varias oficinas en la misma dirección, un proceso por oficina

**Decisión:** una instalación aloja varias oficinas. Una centralita (`gateway.ts`) arranca un proceso `server.js` por oficina, cada uno con su puerto interno y su base de datos, y nginx encamina `/o/<puerto>/…` al que toca. La interfaz elige oficina con un selector y las gestiona desde un panel.

**Motivo:** gestionar varias oficinas no puede exigir levantar otro despliegue en otro puerto. Un proceso por oficina mantiene la decisión 15 (oficinas autónomas, datos y claves separados) sin reescribir el servidor para que sea multiinquilino: todo el estado en memoria (simulación, runtimes, enlaces) sigue siendo de una sola oficina.

**Detalles:**
- Enlazar dos oficinas locales es el mismo protocolo que con una de fuera; solo cambia quién reparte el token.
- El worker es común: una sesión de Claude Code o Codex vale para todas las oficinas de la instalación.
- La dirección de enlace de cada oficina lleva su prefijo (`…:8090/o/3101`). `/link/` sin prefijo sigue llegando a la primera oficina para no romper los servidores remotos ya desplegados.

**Descartado:** un servidor multiinquilino con una base de datos compartida (reescritura amplia y acopla datos) y un contenedor por oficina creado desde la interfaz (obliga a dar acceso al socket de Docker).

## 17. El plano es un dato y los muebles se derivan

**Decisión:** la oficina se describe con salas rectangulares y puertas. Muros, muebles, mesas y puntos de interés se calculan a partir de ahí. El modo arquitecto edita solo salas y puertas, y cada cambio lo valida y lo aplica el servidor.

**Motivo:** editar mueble a mueble es lento y permite dejar la oficina rota. Con salas tipadas, quien edita piensa en «un despacho» o «una zona para Marketing» y el resultado siempre es transitable.

**Detalles:**
- El servidor rechaza planos con salas solapadas, inaccesibles o sin mesas suficientes, y abre puertas por su cuenta cuando una sala queda sin acceso.
- Las mesas se reparten por pertenencia: despacho propio, zona del departamento, mesas libres. Cambiar de departamento a alguien lo cambia de sitio.
- Los cambios se aplican en vivo: los personajes recalculan su camino y van a su nueva mesa.

**Descartado:** un editor libre de muebles y un borrador en el cliente que se guarda al final (obliga a duplicar la validación en el navegador).

## 18. Interfaz de papel y tinta

**Decisión:** la interfaz usa fondo claro, bordes de tinta, esquinas rectas, una sola tipografía con su monoespaciada (IBM Plex) y un único color de acento. Sin emojis como iconos, sin vidrio esmerilado ni degradados. Los botones responden con un desplazamiento y una sombra dura.

**Motivo:** el aspecto anterior (paneles oscuros translúcidos, azul, todo redondeado y con emojis) se leía como una plantilla genérica. La oficina dibujada es lo vistoso; la interfaz debe parecer una herramienta con criterio propio y no competir con ella.

**Detalles:** se siguieron los principios de la skill `design-taste-frontend` aplicables a una aplicación (un sistema de botones, una escala de radios, color plano, texto llano). Su flujo de construcción y verificación está pensado para páginas web de empresa y no se usó.

## Limitaciones conocidas y siguientes pasos

- **Los agentes solo producen texto.** No tienen herramientas (ficheros, web, código) salvo lo que haga por su cuenta un proveedor CLI. Siguiente paso natural: herramientas por agente y un espacio de trabajo compartido por departamento.
- **Sin memoria a largo plazo.** Cada agente recuerda los últimos 24 mensajes de su conversación; no hay resúmenes ni memoria entre tareas.
- **Sin streaming** de las respuestas en el chat.
- **Tantos agentes como mesas** quepan en el plano; para más, se amplía en el modo arquitecto.
- **Todas las oficinas de una instalación comparten worker y sesiones de CLI**: no se puede usar una cuenta distinta por oficina salvo con API keys o un servidor remoto.
- **El modo arquitecto no deja colocar muebles sueltos** ni dibujar salas que no sean rectangulares.
- **Reinicios:** las tareas que estén en curso al reiniciar el servidor se marcan como fallidas; no se reanudan.
- **Sin presupuesto de tokens** por agente ni contador de coste.
- **Un solo usuario por oficina**, sin login en la interfaz.
- **El enlace no va cifrado por sí mismo.** Entre máquinas hay que ponerlo detrás de HTTPS o una VPN. Una oficina conectada puede encargar trabajo sin límite.
- **Las oficinas no comparten conversación ni tareas en vivo**: solo directorio, encargos y resultados. No se puede pasear por la otra oficina.
- **Las API keys se guardan sin cifrar** en SQLite (volumen local).
- **Colisiones:** los personajes se atraviesan entre sí.
- **El nivel no cambia lo que sabe hacer un agente.** La progresión es visual; enlazarla con capacidades reales (herramientas, memoria, modelo) es un siguiente paso natural.
