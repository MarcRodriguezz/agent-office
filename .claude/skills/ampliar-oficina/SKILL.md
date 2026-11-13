---
name: ampliar-oficina
description: Modifica el mapa de Agent Office (salas, muebles, mesas para más agentes, objetos interactivos) o añade especies de compis. Úsala cuando se pida cambiar la distribución, el aspecto de la oficina o las criaturas.
---

# Ampliar o cambiar la oficina

El mapa se define **solo** en `backend/src/map.ts` y se envía al navegador en el bootstrap. El dibujo de cada tipo de mueble está en `web/src/game/draw.ts`.

Las coordenadas son celdas (`W` × `H`), con el origen arriba a la izquierda. Una celda mide 48 px en el cliente.

## Añadir un mueble

1. En `map.ts`, añade una entrada a `furniture`:
   ```ts
   { id: 'mi-mueble', type: 'plant', x: 20, y: 12, w: 1, h: 1, block: true },
   ```
   `block: true` lo hace infranqueable. Comprueba que no tapa una puerta, un asiento ni un punto de `COFFEE_SPOTS`, `HANGOUT_SPOTS`, `MEETING_SEATS` o `BOSS_VISITOR_SPOTS`.
2. Si el `type` es nuevo, añade su `case` en `drawFurniture` (`draw.ts`). Usa el helper `box` para los volúmenes: recibe la huella en el suelo y una elevación, y pinta cara superior y frontal. Los muebles planos (alfombras) se pintan en `buildFloor`.

## Hacerlo interactivo

Añade `interact`, `label` y `spot` (celda transitable donde se coloca el jefe):

```ts
{ id: 'archivo', type: 'cabinet', x: 40, y: 1, w: 3, h: 1, block: true,
  interact: 'tasks', label: 'Archivo', spot: [41, 2] },
```

Las acciones existentes son `llm`, `hire`, `tasks` y `coffee`. Una acción nueva requiere: añadirla al tipo `interact` en `map.ts` y en `web/src/types.ts`, su icono en `INTERACT_ICON` (`draw.ts`) y su comportamiento en `runInteraction` (`OfficeCanvas.tsx`).

## Más mesas (más agentes)

Las mesas salen de `DESK_COUNT` y `deskOrigin(i)` en `map.ts`. Cada mesa ocupa 3×1 celdas, con el asiento una celda al norte y el punto de visita una al sur. Al subir `DESK_COUNT`, ajusta `deskOrigin` para que las nuevas no pisen muebles ni pasillos.

## Salas y paredes

- Paredes: `wallH(y, x1, x2)` y `wallV(x, y1, y2)`; las puertas se abren con `door(x, y)`.
- Salas: añade una entrada a `rooms` (rectángulo interior, nombre y tipo de suelo: `wood`, `carpet`, `tech`, `tile`, `office`, `cafe`). Un suelo nuevo se define en `FLOORS` (`draw.ts`).
- Si cambias `W` o `H`, revisa que todo siga siendo alcanzable.

## Añadir una especie de compi

1. Añade el id y el nombre a `SPECIES` en `backend/src/companions.ts`.
2. Añade la especie (id, nombre, tipo, colores y descripción) a `SPECIES` en `web/src/game/creature.ts` y su `case` en `drawCreature`, con sus tres fases (`stage` 1 a 3). Debe ser un diseño propio.
3. Comprueba que se ve en el selector del editor de agentes y en el álbum, incluida la silueta de las fases sin descubrir.

## Verificar

Tras reconstruir (`docker compose up -d --build`), comprueba en el navegador que:

- El jefe puede llegar andando a todas las salas y a cada objeto interactivo.
- Los agentes llegan a su mesa, a la cafetería y a la sala de reuniones (encarga un trabajo a un departamento).
- El mueble nuevo se ordena bien en profundidad: un personaje al norte queda detrás y uno al sur queda delante.
