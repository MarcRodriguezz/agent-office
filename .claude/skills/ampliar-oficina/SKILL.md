---
name: ampliar-oficina
description: Cambia cómo se construye la oficina de Agent Office (tipos de sala, muebles que trae cada una, plano de serie, objetos interactivos) o añade especies de compis. Úsala cuando se pida un tipo de sala nuevo, otro mobiliario, otro aspecto o más criaturas. Para mover salas o añadir mesas basta el modo arquitecto de la interfaz.
---

# Ampliar o cambiar la oficina

El plano de cada oficina es un dato (`Layout`: salas rectangulares y puertas) que el jefe edita en el **modo arquitecto**. Todo lo demás se deriva en `backend/src/map.ts`:

- `KINDS`: los tipos de sala, con su suelo, tamaño mínimo, tamaño al crearla y si es única u obligatoria.
- `compile(layout)`: levanta muros alrededor de las salas, abre las puertas válidas y amuebla cada sala según su tipo.
- `check(layout, personas)`: valida límites, solapes, salas obligatorias, accesos y número de mesas.
- `DEFAULT_LAYOUT`: el plano con el que nace una oficina.

Las coordenadas son celdas, con el origen arriba a la izquierda. Una celda mide 48 px en el cliente. Una sala es su interior; el muro la rodea, así que dos salas vecinas dejan una celda entre ellas.

## Cambiar los muebles de un tipo de sala

Cada tipo tiene su bloque en `compile`. Dentro hay tres ayudas:

- `put(id, type, x, y, w, h, extra)`: mueble necesario. Si lleva `spot`, esa celda queda reservada.
- `decor(id, type, x, y, w, h)`: adorno. Se omite solo si no cabe, pisa algo o estorba una puerta.
- `desk(x, y, type)`: mesa de 3×1 con asiento al norte y punto de visita al sur; devuelve ambos.

Coloca siempre en relación con `x`, `y`, `w`, `h` de la sala, para que funcione con cualquier tamaño por encima del mínimo. Si el `type` es nuevo, añade su `case` en `drawFurniture` (`web/src/game/draw.ts`); las alfombras se pintan en `buildFloor`.

## Un tipo de sala nuevo

1. Añádelo a `RoomKind` y a `KINDS` en `map.ts`, y a `RoomKind` en `web/src/types.ts`.
2. Escribe su bloque de muebles en `compile`. Si aporta mesas, empuja a `desks`; si aporta sitios para pasear, lo recoge el bucle de `hangouts`.
3. Añádelo a `ADDABLE` y `NOTE` en `web/src/ui/Architect.tsx`.
4. Un suelo nuevo se define en `FLOORS` (`draw.ts`).

## Un objeto interactivo

Añade `interact`, `label` y `spot` al `put`. Las acciones existentes son `llm`, `hire`, `tasks`, `coffee` y `offices`. Una nueva requiere: añadirla al tipo `interact` en `map.ts` y en `web/src/types.ts`, su icono en `INTERACT_ICON` (`draw.ts`) y su comportamiento en `runInteraction` (`OfficeCanvas.tsx`).

La barra superior camina hasta `hr-desk`, `meet-board` y `boss-desk`: son los identificadores de la primera sala de cada tipo. Consérvalos.

## Comprobar

Tras tocar `compile`, levanta la oficina y prueba por API que el plano de serie sigue siendo válido y que los límites responden:

```bash
curl -s -X PUT localhost:8080/o/3101/api/layout -H 'content-type: application/json' -d '{"reset":true}' | head -c 80
```

Un error devuelve `400` con el motivo en español. Luego, en el modo arquitecto, añade una sala del tipo que hayas tocado en su tamaño mínimo y en uno grande, y comprueba que los agentes llegan a sus mesas.

## Compis

Las especies están en `backend/src/companions.ts` (id y nombre) y `web/src/game/creature.ts` (dibujo en tres fases). El id debe coincidir en ambos. Son especies propias: no se usan nombres, personajes ni arte de juegos existentes.
