---
name: levantar-oficina
description: Levanta Agent Office con Docker y comprueba que funciona de punta a punta (API, cola en segundo plano y navegador). Úsala para arrancar la app, verificar un cambio o diagnosticar por qué no responde.
---

# Levantar y verificar la oficina

## 1. Arrancar

```bash
docker compose up -d --build
docker compose ps
```

Deben quedar cuatro servicios en marcha: `redis` (healthy), `server`, `worker` y `web`. Si Docker Desktop está parado, arráncalo antes.

## 2. Comprobar la API y la cola

```bash
curl -s localhost:8080/api/health
curl -s localhost:8080/api/bootstrap | head -c 300
```

Prueba de la cola con el proveedor simulado (sustituye el id por uno de `providers` del bootstrap):

```bash
curl -s -X POST localhost:8080/api/providers/<id>/test
```

Debe responder `{"ok":true,...}` en 2–4 segundos. Si se queda colgado, el worker no está consumiendo: `docker compose logs worker`.

## 3. Probar el flujo de equipo

```bash
curl -s -X POST localhost:8080/api/teams/<teamId>/tasks \
  -H "content-type: application/json" \
  -d '{"title":"Prueba","description":"Preparad un plan breve."}'
```

En `docker compose logs -f worker` deben aparecer, en orden: `plan`, un `task` por miembro y `synth`. Con el cerebro simulado tarda alrededor de un minuto porque los agentes caminan hasta la sala de reuniones.

## 4. Probar en el navegador

Abre `http://localhost:8080` y comprueba:

- Se ve la oficina con los agentes en sus mesas y la lista de equipo a la izquierda.
- Clic en el suelo mueve al jefe; clic en un agente abre su panel.
- Un mensaje en el chat recibe respuesta y aparece el bocadillo sobre el agente.
- El indicador «en segundo plano» de la barra superior se activa mientras hay trabajos.

## Problemas habituales

| Síntoma | Causa probable |
|---|---|
| La web carga pero dice «reconectando…» | `server` caído: `docker compose logs server`. |
| Puerto 8080 ocupado | Cambia `OFFICE_PORT` en `.env`. |
| Un proveedor local no conecta | La URL debe usar `host.docker.internal`, no `localhost`. |
| `claude` o `codex` no existen en el worker | La imagen se construyó con `INSTALL_AGENT_CLIS=false`. |
| Quiero empezar de cero | `docker compose down -v` borra la base de datos. |
