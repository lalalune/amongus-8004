/**
 * A2A Agent Card Generator
 * Creates the Agent Card for the Game Master server
 */

export interface A2ASecurityScheme {
  type: string;
  scheme?: string;
  bearerFormat?: string;
  description?: string;
}

export interface A2AAgentCard {
  protocolVersion: string;
  name: string;
  description: string;
  url: string;
  preferredTransport: string;
  additionalInterfaces?: Array<{
    url: string;
    transport: string;
  }>;
  provider: {
    organization: string;
    url: string;
  };
  version: string;
  documentationUrl?: string;
  securitySchemes?: Record<string, A2ASecurityScheme>;
  security?: Array<Record<string, string[]>>;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
    stateTransitionHistory: boolean;
  };
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: A2ASkill[];
  supportsAuthenticatedExtendedCard?: boolean;
}

export interface A2ASkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples: string[];
  inputModes?: string[];
  outputModes?: string[];
}

export function generateAgentCard(serverUrl: string = 'http://localhost:3000'): A2AAgentCard {
  return {
    protocolVersion: '0.3.0',
    name: 'Among Us ERC-8004 Game Master',
    description:
      'Multiplayer Among Us game coordinator using ERC-8004 trustless agent registry. Autonomous AI agents register on-chain, join games, and compete in social deduction gameplay.',
    url: `${serverUrl}/a2a`,
    preferredTransport: 'JSONRPC',
    additionalInterfaces: [
      {
        url: `${serverUrl}/a2a`,
        transport: 'JSONRPC'
      }
    ],
    provider: {
      organization: 'ERC-8004 Game Labs',
      url: serverUrl
    },
    version: '1.0.0',
    documentationUrl: `${serverUrl}/docs`,
    securitySchemes: {
      ethereumSignature: {
        type: 'signature',
        scheme: 'ethereum',
        description: 'Each message must be signed with the agent\'s Ethereum private key. Include agentAddress, signature, and timestamp in message data part. Server verifies signature matches ERC-8004 registered address.'
      }
    },
    security: [
      {
        ethereumSignature: []
      }
    ],
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: false
    },
    defaultInputModes: ['application/json', 'text/plain'],
    defaultOutputModes: ['application/json', 'text/plain'],
    supportsAuthenticatedExtendedCard: false,
    skills: [
      {
        id: 'join-game',
        name: 'Join Game Lobby',
        description:
          'Register to join the next game round. Game Master validates your ERC-8004 registration before allowing you to join. You will receive a stream of game events once joined.',
        tags: ['game', 'lobby', 'registration', 'multiplayer'],
        examples: [
          'I want to join the game',
          'Register me for Among Us',
          'Join lobby',
          'Let me play'
        ]
      },
      {
        id: 'leave-game',
        name: 'Leave Game',
        description: 'Exit the current game or lobby. Your ERC-8004 registration remains active.',
        tags: ['game', 'exit', 'quit'],
        examples: ['I want to leave', 'Exit game', 'Quit', 'Leave lobby']
      },
      {
        id: 'move-to-room',
        name: 'Move to Room',
        description:
          'Move your character to an adjacent room on the ship. You can only move to connected rooms. Returns your new location and nearby players.',
        tags: ['movement', 'navigation', 'rooms'],
        examples: [
          'Move to Engine Room',
          'Go to Cafeteria',
          'Walk to Electrical',
          'Enter Navigation'
        ]
      },
      {
        id: 'complete-task',
        name: 'Complete Task',
        description:
          'Attempt to complete one of your assigned repair tasks. Only crewmates can complete tasks. You must be in the correct room and provide the correct input for task validation.',
        tags: ['task', 'repair', 'crewmate', 'objective'],
        examples: [
          'Fix wiring in Electrical',
          'Complete fuel download',
          'Do medbay scan',
          'Align engines'
        ]
      },
      {
        id: 'kill-player',
        name: 'Kill Player',
        description:
          'Eliminate a crewmate in the same room (IMPOSTERS ONLY). Subject to 30-second cooldown. Target must be alive and in your current location.',
        tags: ['kill', 'imposter', 'elimination', 'attack'],
        examples: [
          'Kill the player in this room',
          'Eliminate Player3',
          'Attack the nearby crewmate'
        ]
      },
      {
        id: 'use-vent',
        name: 'Use Vent',
        description:
          'Enter or exit a vent to move quickly between connected rooms (IMPOSTERS ONLY). Vents provide strategic mobility but can reveal imposter identity if witnessed.',
        tags: ['vent', 'imposter', 'movement', 'stealth'],
        examples: [
          'Enter vent',
          'Use vent to Electrical',
          'Vent to Navigation',
          'Exit vent'
        ]
      },
      {
        id: 'sabotage',
        name: 'Sabotage System',
        description:
          'Trigger a critical system failure (IMPOSTERS ONLY). Options: Oxygen, Reactor, Lights, Communications. Sabotages create urgency and chaos, forcing crewmates to respond. Oxygen and Reactor are urgent (require fix or crewmates lose).',
        tags: ['sabotage', 'imposter', 'emergency', 'distraction'],
        examples: [
          'Sabotage oxygen',
          'Trigger reactor meltdown',
          'Cut the lights',
          'Disable communications'
        ]
      },
      {
        id: 'call-meeting',
        name: 'Call Emergency Meeting',
        description:
          'Call all living players to Cafeteria for discussion phase. Use strategically to share information or deflect suspicion. Transitions game to discussion phase.',
        tags: ['meeting', 'discussion', 'voting', 'emergency'],
        examples: [
          'Call emergency meeting',
          'Start meeting',
          'Emergency button',
          'Call meeting'
        ]
      },
      {
        id: 'report-body',
        name: 'Report Dead Body',
        description:
          'Report a dead player, immediately triggering discussion phase. All players teleport to Cafeteria. Provide the player ID or name of the deceased.',
        tags: ['report', 'body', 'meeting', 'discovery'],
        examples: [
          'Report body',
          'I found a dead player',
          'Report Player3',
          'Dead body here'
        ]
      },
      {
        id: 'send-message',
        name: 'Send Chat Message',
        description:
          'Send a text message during discussion phase. Use to share information, ask questions, or make accusations. All living players can see messages.',
        tags: ['chat', 'communication', 'discussion', 'social'],
        examples: [
          'Say: I saw red in electrical',
          'Chat: Where was everyone?',
          'Message: I was doing tasks in medbay',
          'I think it is Player2'
        ]
      },
      {
        id: 'vote',
        name: 'Cast Vote',
        description:
          'Vote to eject a suspected imposter during voting phase. You can vote for any player or skip. Majority vote ejects the player. Dead players cannot vote.',
        tags: ['vote', 'ejection', 'voting', 'democracy'],
        examples: [
          'Vote for Player3',
          'Vote Player2',
          'Skip vote',
          'I vote to skip'
        ]
      },
      {
        id: 'get-status',
        name: 'Get Game Status',
        description:
          'Retrieve comprehensive game state including your current location, role (private), assigned tasks, nearby players, available actions, and game phase. Essential for strategic decision-making.',
        tags: ['status', 'info', 'state', 'query'],
        examples: [
          "What's my status?",
          'Where am I?',
          'What can I do?',
          'Show game state',
          'Get my info'
        ]
      }
    ]
  };
}

// Utility to validate agent card against A2A spec
export function validateAgentCard(card: A2AAgentCard): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!card.protocolVersion) errors.push('Missing protocolVersion');
  if (!card.name) errors.push('Missing name');
  if (!card.description) errors.push('Missing description');
  if (!card.url) errors.push('Missing url');
  if (!card.version) errors.push('Missing version');
  if (!card.capabilities) errors.push('Missing capabilities');
  if (!card.defaultInputModes || card.defaultInputModes.length === 0) {
    errors.push('Missing defaultInputModes');
  }
  if (!card.defaultOutputModes || card.defaultOutputModes.length === 0) {
    errors.push('Missing defaultOutputModes');
  }
  if (!card.skills || card.skills.length === 0) errors.push('Missing skills');

  // Validate each skill
  card.skills?.forEach((skill, index) => {
    if (!skill.id) errors.push(`Skill ${index}: Missing id`);
    if (!skill.name) errors.push(`Skill ${index}: Missing name`);
    if (!skill.description) errors.push(`Skill ${index}: Missing description`);
    if (!skill.tags || skill.tags.length === 0) errors.push(`Skill ${index}: Missing tags`);
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

// Get skill by ID
export function getSkill(card: A2AAgentCard, skillId: string): A2ASkill | undefined {
  return card.skills.find((s) => s.id === skillId);
}

// Get all skill IDs
export function getAllSkillIds(card: A2AAgentCard): string[] {
  return card.skills.map((s) => s.id);
}

