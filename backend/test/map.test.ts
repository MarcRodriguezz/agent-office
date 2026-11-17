import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_LAYOUT, addFunRoom, findPath, map, setLayout, walkable, type Layout } from '../src/map.js';

const copy = (layout: Layout): Layout => JSON.parse(JSON.stringify(layout));

describe('floor plan', () => {
  it('accepts the default plan with its meeting table, jukebox and dance floor', () => {
    setLayout(copy(DEFAULT_LAYOUT), 6);
    assert.equal(map.furniture.find((f) => f.id === 'meet-table')?.interact, 'meeting');
    assert.equal(map.furniture.find((f) => f.id === 'jukebox')?.interact, 'party');
    assert.ok(map.meetingSeats.length >= 8);
    assert.ok(map.dance.length >= 16);
    for (const [x, y] of map.dance) assert.ok(walkable(x, y), `dance cell ${x},${y} must be walkable`);
    assert.ok(findPath(map.bossSeat, map.dance[0]), 'the boss can reach the dance floor');
    assert.ok(findPath(map.bossSeat, map.meetingSeats[0]), 'the boss can reach the meeting room');
  });

  it('rejects overlapping rooms', () => {
    const layout = copy(DEFAULT_LAYOUT);
    layout.rooms.push({ ...layout.rooms[0], id: 'overlap', kind: 'lounge', x: 3, y: 3 });
    assert.throws(() => setLayout(layout, 0), /se pisan/);
  });

  it('rejects a plan without a required room', () => {
    const layout = copy(DEFAULT_LAYOUT);
    layout.rooms = layout.rooms.filter((r) => r.kind !== 'meeting');
    assert.throws(() => setLayout(layout, 0), /necesita una sala/);
  });

  it('rejects a room nobody can reach', () => {
    const layout = copy(DEFAULT_LAYOUT);
    layout.h = 44;
    layout.rooms.push({ id: 'island', kind: 'lounge', name: 'ISLA', x: 1, y: 36, w: 7, h: 6, teamId: null, agentId: null });
    assert.throws(() => setLayout(layout, 0), /aislada/);
  });

  it('rejects a plan with fewer desks than people', () => {
    assert.throws(() => setLayout(copy(DEFAULT_LAYOUT), 500), /mesas/);
  });

  it('adds a fun zone once to a saved plan that has none', () => {
    const old = copy(DEFAULT_LAYOUT);
    old.h = 26;
    old.rooms = old.rooms.filter((r) => r.kind !== 'fun' && r.kind !== 'lounge');
    old.doors = old.doors.filter(([, y]) => y < 25);
    setLayout(old, 0);
    assert.equal(map.layout.rooms.some((r) => r.kind === 'fun'), false);
    const grown = addFunRoom();
    assert.ok(grown?.rooms.some((r) => r.kind === 'fun'));
    assert.ok(findPath(map.bossSeat, map.dance[0]), 'the new fun zone is reachable');
    assert.equal(addFunRoom(), null);
  });
});
