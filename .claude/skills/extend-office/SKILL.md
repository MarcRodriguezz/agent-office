---
name: extend-office
description: Changes how the Agent Office office is built (room types, the furniture each one gets, the default floor plan, interactive objects) or adds compi species. Use it when a new room type, other furniture, another look or more creatures are requested. To move rooms or add desks, the architect mode in the interface is enough.
---

# Extend or change the office

Each office's floor plan is data (`Layout`: rectangular rooms and doors) that the boss edits in **architect mode**. Everything else is derived in `backend/src/map.ts`:

- `KINDS`: the room types, with their floor, minimum size, size when created and whether they are unique or required.
- `compile(layout)`: raises walls around the rooms, opens valid doors and furnishes each room by type. It also collects the points of interest: desks, meeting seats, coffee spots, hangouts and dance floor cells (`dance`).
- `check(layout, people)`: validates bounds, overlaps, required rooms, access and number of desks.
- `DEFAULT_LAYOUT`: the plan a new office is born with.
- `addFunRoom()`: adds a fun zone below a saved plan that has none (run once at startup).

Coordinates are cells, with the origin at the top left. A cell is 48 px in the client. A room is its interior; the wall surrounds it, so two neighbouring rooms leave one cell between them.

## Change the furniture of a room type

Each type has its block in `compile`. Inside there are three helpers:

- `put(id, type, x, y, w, h, extra)`: required furniture. If it has a `spot`, that cell is reserved. `{ block: false }` makes it walkable (rugs, dance floor).
- `decor(id, type, x, y, w, h)`: decoration. It is skipped only if it does not fit, overlaps something or blocks a door.
- `desk(x, y, type)`: a 3×1 desk with a seat to the north and a visitor spot to the south; returns both.

Always place relative to the room's `x`, `y`, `w`, `h`, so it works with any size above the minimum. If the `type` is new, add its `case` in `drawFurniture` (`web/src/game/draw.ts`). Rugs are painted in `buildFloor`; animated walkable furniture (like `dancefloor`) is drawn every frame in `OfficeCanvas.tsx`. If it should glow at night, add it to `LIGHTS` in `web/src/game/daylight.ts`.

## A new room type

1. Add it to `RoomKind` and `KINDS` in `map.ts`, and to `RoomKind` in `web/src/types.ts`.
2. Write its furniture block in `compile`. If it provides desks, push to `desks`; if it provides places to wander, the `hangouts` loop picks it up (add the kind to the count there).
3. Add it to `ADDABLE` and `NOTE` in `web/src/ui/Architect.tsx`.
4. A new floor is defined in `FLOORS` (`draw.ts`).

## An interactive object

Add `interact`, `label` and `spot` to the `put`. The existing actions are `llm`, `hire`, `tasks`, `coffee`, `offices`, `projects`, `meeting` and `party`. A new one requires: adding it to the `interact` type in `map.ts` and in `web/src/types.ts`, its icon in `INTERACT_ICON` (`draw.ts`) and its behaviour in `runInteraction` (`OfficeCanvas.tsx`).

The top bar walks to `hr-desk`, `meet-board`, `meet-table`, `archive` and `boss-desk`: they are the ids of the first room of each type. Keep them.

## Check

After touching `compile`, start the office and check through the API that the default plan is still valid and that the limits respond:

```bash
curl -s -X PUT localhost:8080/o/3101/api/layout -H 'content-type: application/json' -d '{"reset":true}' | head -c 80
```

An error returns `400` with the reason in the office language. Then, in architect mode, add a room of the type you touched at its minimum size and at a large size, and check that agents reach their desks.

## Compis

Species live in `backend/src/companions.ts` (id and name) and `web/src/game/creature.ts` (drawing in three stages). The id must match in both. They are original species: no names, characters or art from existing games.
