---
name: probar-enlaces
description: Monta en local un servidor remoto de agentes y una segunda oficina para probar los enlaces de Agent Office (trabajos remotos, inicio de sesión de los CLIs y encargos entre oficinas). Úsala al tocar nodes.ts, node-client.ts, offices.ts o el puerto de enlace.
---

# Probar servidores remotos y oficinas conectadas

Todo se puede probar en una sola máquina con Docker. La oficina principal debe estar levantada (`docker compose up -d --build`).

## Servidor remoto

1. Crea el servidor y copia su token:
   ```bash
   curl -s -X POST localhost:8080/o/3101/api/nodes -H 'content-type: application/json' -d '{"name":"Servidor de pruebas"}'
   ```
2. Levántalo apuntando al puerto de enlace:
   ```bash
   OFFICE_URL=http://host.docker.internal:8090/o/3101 NODE_TOKEN=<token> docker compose -f docker-compose.node.yml up -d
   ```
3. En `GET /api/bootstrap`, `nodes` debe mostrarlo con `online: true` y la versión de los CLIs.
4. Prueba un trabajo remoto: `POST /api/providers/<id>/test` con `{"nodeId":"<id del servidor>"}`. En `/api/jobs` el campo `node` debe ser el nombre del servidor.
5. Asigna un agente (`PATCH /api/agents/<id>` con `nodeId`) y encárgale una tarea.

Para quitarlo: `docker compose -p agent-office-node down -v` y bórralo en la interfaz.

## Segunda oficina

No hace falta otro despliegue: la centralita abre oficinas en la misma instalación.

```bash
curl -X POST localhost:8080/api/hub/offices -H 'content-type: application/json' -d '{"name":"Oficina Norte"}'   # devuelve su id (3102…)
curl -X POST localhost:8080/api/hub/links -H 'content-type: application/json' -d '{"a":"3101","b":"3102"}'
curl localhost:8080/api/hub/offices
```

1. `GET /api/hub/offices` debe mostrar las dos con un enlace `online: true` hacia la otra.
2. En la interfaz, el nombre de la oficina (arriba a la izquierda) permite cambiar entre ellas.
3. `GET /o/3101/api/bootstrap` debe traer en `offices.peers` el directorio de la otra.
4. Envía un encargo a una persona y a un departamento. Comprueba en la oficina que lo recibe que la tarea lleva el origen, y en la que lo pidió que entra un visitante a entregarlo y aparece el cuadro de diálogo.
5. Reinicia el servidor (`docker compose up -d --force-recreate server`): todas las oficinas deben volver y reenlazarse solas en unos segundos.

Para quitarla: `curl -X DELETE localhost:8080/api/hub/offices/3102` (o **Oficinas → Eliminar esta oficina**). La otra oficina debe perder el enlace.

El enlace con una oficina de otro equipo se prueba con una segunda instalación (`OFFICE_PORT=8081 LINK_PORT=8091 docker compose -p agent-office-2 up -d`) y una invitación de **Oficinas → Oficinas de fuera**.

## Inicio de sesión de los CLIs

En **LLM y ajustes → Servidores y sesiones**, *Iniciar sesión* debe mostrar el enlace (Claude Code) o el enlace y el código (Codex) en pocos segundos. Completarlo requiere una cuenta real; sin ella, basta con comprobar que aparece el enlace y que al cerrar la ventana el proceso termina.

Desde la línea de comandos:

```bash
docker compose exec worker claude auth status
docker compose exec worker codex login status
```
