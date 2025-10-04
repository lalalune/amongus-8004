/**
 * Ship Layout Tests
 */

import { describe, test, expect } from 'bun:test';
import { createShipLayout, areRoomsAdjacent, areRoomsConnectedByVent, getRoomsByTaskId, getPlayersInRoom } from './ship';

describe('Ship Layout', () => {
  const ship = createShipLayout();

  test('should create ship with all rooms', () => {
    expect(ship.rooms.size).toBeGreaterThan(0);
    expect(ship.rooms.has('cafeteria')).toBe(true);
    expect(ship.rooms.has('electrical')).toBe(true);
    expect(ship.rooms.has('engine')).toBe(true);
  });

  test('should have vent connections', () => {
    expect(ship.vents.size).toBeGreaterThan(0);
    expect(ship.vents.has('weapons')).toBe(true);
    expect(ship.vents.has('electrical')).toBe(true);
  });

  describe('Room Adjacency', () => {
    test('should detect adjacent rooms', () => {
      expect(areRoomsAdjacent(ship, 'cafeteria', 'upper-hallway')).toBe(true);
      expect(areRoomsAdjacent(ship, 'electrical', 'storage')).toBe(true);
    });

    test('should detect non-adjacent rooms', () => {
      expect(areRoomsAdjacent(ship, 'cafeteria', 'weapons')).toBe(false);
      expect(areRoomsAdjacent(ship, 'electrical', 'medbay')).toBe(false);
    });

    test('should handle invalid rooms', () => {
      expect(areRoomsAdjacent(ship, 'invalid', 'cafeteria')).toBe(false);
      expect(areRoomsAdjacent(ship, 'cafeteria', 'invalid')).toBe(false);
    });
  });

  describe('Vent Connections', () => {
    test('should detect vent-connected rooms', () => {
      expect(areRoomsConnectedByVent(ship, 'weapons', 'navigation')).toBe(true);
      expect(areRoomsConnectedByVent(ship, 'shields', 'storage')).toBe(true);
    });

    test('should detect non-vent-connected rooms', () => {
      expect(areRoomsConnectedByVent(ship, 'cafeteria', 'medbay')).toBe(false);
    });

    test('should handle rooms without vents', () => {
      expect(areRoomsConnectedByVent(ship, 'cafeteria', 'upper-hallway')).toBe(false);
    });
  });

  describe('Room Tasks', () => {
    test('should find rooms by task ID', () => {
      const rooms = getRoomsByTaskId(ship, 'wiring-electrical');
      expect(rooms).toContain('electrical');
    });

    test('should return empty array for non-existent task', () => {
      const rooms = getRoomsByTaskId(ship, 'invalid-task');
      expect(rooms.length).toBe(0);
    });

    test('should have tasks in multiple rooms', () => {
      const electricalRoom = ship.rooms.get('electrical');
      expect(electricalRoom?.taskIds.length).toBeGreaterThan(0);
    });
  });

  describe('Player Location', () => {
    test('should find players in room', () => {
      const players = new Map([
        ['p1', { location: 'cafeteria' }],
        ['p2', { location: 'cafeteria' }],
        ['p3', { location: 'electrical' }]
      ]);

      const inCafeteria = getPlayersInRoom(players, 'cafeteria');
      expect(inCafeteria.length).toBe(2);
      expect(inCafeteria).toContain('p1');
      expect(inCafeteria).toContain('p2');
    });

    test('should return empty for room with no players', () => {
      const players = new Map([
        ['p1', { location: 'cafeteria' }]
      ]);

      const inElectrical = getPlayersInRoom(players, 'electrical');
      expect(inElectrical.length).toBe(0);
    });
  });
});

