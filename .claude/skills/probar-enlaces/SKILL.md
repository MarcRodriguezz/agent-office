---
name: probar-enlaces
description: Monta en local un servidor remoto de agentes y una segunda oficina para probar los enlaces de Agent Office (trabajos remotos, inicio de sesión de los CLIs y encargos entre oficinas). Úsala al tocar nodes.ts, node-client.ts, offices.ts o el puerto de enlace.
---

# Probar servidores remotos y oficinas conectadas

Todo se puede probar en una sola máquina con Docker. La oficina principal debe estar levantada (`docker compose up -d --build`).

## Servidor remoto

1. Crea el servidor y copia su token:
   ```bash
   curl -s -X POST localhost:8080/api/nodes -H 'content-type: application/json' -d '{"name":"Servidor de pruebas"}'
   ```
2. Levántalo apuntando al puerto de enlace:
   ```bash
   OFFICE_URL=http://host.docker.internal:8090 NODE_TOKEN=<token> docker compose -f docker-compose.node.yml up -d
   ```
3. En `GET /api/bootstrap`, `nodes` debe mostrarlo con `online: true` y la versión de los CLIs.
4. Prueba un trabajo remoto: `POST /api/providers/<id>/test` con `{"nodeId":"<id del servidor>"}`. En `/api/jobs` el campo `node` debe ser el nombre del servidor.
5. Asigna un agente (`PATCH /api/agents/<id>` con `nodeId`) y encárgale una tarea.

Para quitarlo: `docker compose -p agent-office-node down -v` y bórralo en la interfaz.

## Segunda oficina

```bash
OFFICE_PORT=8081 LINK_PORT=8091 docker compose -p agent-office-2 up -d
```

1. En http://localhost:8081, **Oficinas → Generar código de invitación** con la dirección `http://host.docker.internal:8091`.
2. En http://localhost:8080, **Oficinas → Unirme con un código**.
3. Las dos deben verse en línea y con el directorio de la otra.
4. Envía un encargo a una persona y a un departamento. Comprueba en la oficina que lo recibe que la tarea lleva el origen, y en la que lo pidió que entra un visitante a entregarlo y aparece el cuadro de diálogo.
5. Reinicia el servidor de una de ellas (`docker compose -p agent-office-2 up -d --force-recreate server`): el enlace debe volver solo en unos segundos.

Para quitarla: `docker compose -p agent-office-2 down -v`.

## Inicio de sesión de los CLIs

En **LLM y ajustes → Servidores y sesiones**, *Iniciar sesión* debe mostrar el enlace (Claude Code) o el enlace y el código (Codex) en pocos segundos. Completarlo requiere una cuenta real; sin ella, basta con comprobar que aparece el enlace y que al cerrar la ventana el proceso termina.

Desde la línea de comandos:

```bash
docker compose exec worker claude auth status
docker compose exec worker codex login status
```
