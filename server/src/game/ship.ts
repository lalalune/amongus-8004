/**
 * Ship Layout Definition
 * Defines the map structure, rooms, connections, and vents
 */

import type { ShipLayout, Room } from '@elizagames/shared';

export function createShipLayout(): ShipLayout {
  const rooms = new Map<string, Room>();

  // Define all rooms
  rooms.set('cafeteria', {
    id: 'cafeteria',
    name: 'Cafeteria',
    description: 'Central meeting area with tables and emergency button',
    taskIds: ['trash-cafeteria'],
    connectedRooms: ['upper-hallway', 'storage', 'medbay'],
    hasVent: false
  });

  rooms.set('upper-hallway', {
    id: 'upper-hallway',
    name: 'Upper Hallway',
    description: 'Hallway connecting upper sections of the ship',
    taskIds: [],
    connectedRooms: ['cafeteria', 'weapons', 'navigation', 'shields'],
    hasVent: false
  });

  rooms.set('weapons', {
    id: 'weapons',
    name: 'Weapons',
    description: 'Weapons control room with asteroid defense system',
    taskIds: ['weapons-asteroids'],
    connectedRooms: ['upper-hallway', 'navigation'],
    hasVent: true
  });

  rooms.set('navigation', {
    id: 'navigation',
    name: 'Navigation',
    description: 'Ship navigation and steering controls',
    taskIds: ['navigation-course'],
    connectedRooms: ['upper-hallway', 'weapons', 'shields'],
    hasVent: true
  });

  rooms.set('shields', {
    id: 'shields',
    name: 'Shields',
    description: 'Shield generator and priming station',
    taskIds: ['shields-prime'],
    connectedRooms: ['upper-hallway', 'navigation', 'storage'],
    hasVent: true
  });

  rooms.set('storage', {
    id: 'storage',
    name: 'Storage',
    description: 'Storage area with fuel tanks and supplies',
    taskIds: ['fuel-download', 'trash-storage'],
    connectedRooms: ['cafeteria', 'shields', 'electrical', 'lower-hallway'],
    hasVent: true
  });

  rooms.set('electrical', {
    id: 'electrical',
    name: 'Electrical',
    description: 'Electrical systems and wiring panels',
    taskIds: ['wiring-electrical', 'download-electrical'],
    connectedRooms: ['storage', 'lower-hallway', 'security'],
    hasVent: true
  });

  rooms.set('lower-hallway', {
    id: 'lower-hallway',
    name: 'Lower Hallway',
    description: 'Hallway connecting lower sections of the ship',
    taskIds: [],
    connectedRooms: ['storage', 'electrical', 'security', 'reactor', 'engine'],
    hasVent: false
  });

  rooms.set('security', {
    id: 'security',
    name: 'Security',
    description: 'Security monitoring with camera feeds',
    taskIds: ['wiring-security'],
    connectedRooms: ['electrical', 'lower-hallway', 'reactor'],
    hasVent: false
  });

  rooms.set('reactor', {
    id: 'reactor',
    name: 'Reactor',
    description: 'Nuclear reactor requiring careful monitoring',
    taskIds: ['reactor-unlock'],
    connectedRooms: ['security', 'lower-hallway', 'engine'],
    hasVent: false
  });

  rooms.set('engine', {
    id: 'engine',
    name: 'Engine Room',
    description: 'Main engines requiring fuel and maintenance',
    taskIds: ['fuel-upload', 'engine-align'],
    connectedRooms: ['reactor', 'lower-hallway'],
    hasVent: false
  });

  rooms.set('medbay', {
    id: 'medbay',
    name: 'MedBay',
    description: 'Medical bay with scanner',
    taskIds: ['medbay-scan'],
    connectedRooms: ['cafeteria'],
    hasVent: false
  });

  // Define vent connections
  const vents = new Map<string, string[]>();
  vents.set('weapons', ['navigation', 'shields']);
  vents.set('navigation', ['weapons', 'shields']);
  vents.set('shields', ['weapons', 'navigation', 'storage']);
  vents.set('storage', ['shields', 'electrical']);
  vents.set('electrical', ['storage']);

  return { rooms, vents };
}

// ============================================================================
// Helper Functions
// ============================================================================

export function areRoomsAdjacent(ship: ShipLayout, from: string, to: string): boolean {
  const fromRoom = ship.rooms.get(from);
  if (!fromRoom) return false;
  return fromRoom.connectedRooms.includes(to);
}

export function areRoomsConnectedByVent(ship: ShipLayout, from: string, to: string): boolean {
  const ventConnections = ship.vents.get(from);
  if (!ventConnections) return false;
  return ventConnections.includes(to);
}

export function getRoomsByTaskId(ship: ShipLayout, taskId: string): string[] {
  const roomsWithTask: string[] = [];
  for (const [roomId, room] of ship.rooms) {
    if (room.taskIds.includes(taskId)) {
      roomsWithTask.push(roomId);
    }
  }
  return roomsWithTask;
}

export function getPlayersInRoom(players: Map<string, { location: string }>, roomId: string): string[] {
  const playersInRoom: string[] = [];
  for (const [playerId, player] of players) {
    if (player.location === roomId) {
      playersInRoom.push(playerId);
    }
  }
  return playersInRoom;
}

export function getRoomDescription(ship: ShipLayout, roomId: string): string {
  const room = ship.rooms.get(roomId);
  if (!room) return 'Unknown room';

  let desc = `${room.name}: ${room.description}`;
  
  if (room.taskIds.length > 0) {
    desc += `\nTasks available: ${room.taskIds.length}`;
  }
  
  if (room.hasVent) {
    desc += '\n⚠️ Has vent access';
  }
  
  const connections = room.connectedRooms.map((id) => ship.rooms.get(id)?.name || id).join(', ');
  desc += `\nConnected to: ${connections}`;
  
  return desc;
}

