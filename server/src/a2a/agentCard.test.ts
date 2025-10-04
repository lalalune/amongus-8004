/**
 * Agent Card Tests
 */

import { describe, test, expect } from 'bun:test';
import { generateAgentCard, validateAgentCard, getSkill, getAllSkillIds, type A2AAgentCard } from './agentCard';

describe('Agent Card', () => {
  const card = generateAgentCard('http://localhost:3000');

  describe('Structure', () => {
    test('should have required fields', () => {
      expect(card.protocolVersion).toBe('0.3.0');
      expect(card.name).toBeDefined();
      expect(card.description).toBeDefined();
      expect(card.url).toBe('http://localhost:3000/a2a');
      expect(card.version).toBeDefined();
    });

    test('should have correct capabilities', () => {
      expect(card.capabilities.streaming).toBe(true);
      expect(card.capabilities.pushNotifications).toBe(false);
      expect(card.capabilities.stateTransitionHistory).toBe(false);
    });

    test('should have default input/output modes', () => {
      expect(card.defaultInputModes).toContain('application/json');
      expect(card.defaultInputModes).toContain('text/plain');
      expect(card.defaultOutputModes).toContain('application/json');
    });

    test('should have all 12 skills', () => {
      expect(card.skills.length).toBe(12);
    });
  });

  describe('Skills', () => {
    test('should have join-game skill', () => {
      const skill = card.skills.find((s) => s.id === 'join-game');
      expect(skill).toBeDefined();
      expect(skill?.name).toBe('Join Game Lobby');
      expect(skill?.tags).toContain('game');
    });

    test('should have move-to-room skill', () => {
      const skill = card.skills.find((s) => s.id === 'move-to-room');
      expect(skill).toBeDefined();
      expect(skill?.tags).toContain('movement');
    });

    test('should have imposter-only skills', () => {
      const killSkill = card.skills.find((s) => s.id === 'kill-player');
      const ventSkill = card.skills.find((s) => s.id === 'use-vent');
      const sabotageSkill = card.skills.find((s) => s.id === 'sabotage');

      expect(killSkill).toBeDefined();
      expect(ventSkill).toBeDefined();
      expect(sabotageSkill).toBeDefined();
    });

    test('should have crewmate-only skills', () => {
      const taskSkill = card.skills.find((s) => s.id === 'complete-task');
      expect(taskSkill).toBeDefined();
      expect(taskSkill?.tags).toContain('crewmate');
    });

    test('should have shared skills', () => {
      const statusSkill = card.skills.find((s) => s.id === 'get-status');
      const meetingSkill = card.skills.find((s) => s.id === 'call-meeting');
      const voteSkill = card.skills.find((s) => s.id === 'vote');

      expect(statusSkill).toBeDefined();
      expect(meetingSkill).toBeDefined();
      expect(voteSkill).toBeDefined();
    });

    test('all skills should have required fields', () => {
      for (const skill of card.skills) {
        expect(skill.id).toBeDefined();
        expect(skill.name).toBeDefined();
        expect(skill.description).toBeDefined();
        expect(skill.tags.length).toBeGreaterThan(0);
        expect(skill.examples.length).toBeGreaterThan(0);
      }
    });

    test('all skills should have unique IDs', () => {
      const ids = card.skills.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('Validation', () => {
    test('should validate correct agent card', () => {
      const result = validateAgentCard(card);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    test('should detect missing required fields', () => {
      const invalidCard: A2AAgentCard = {
        ...card,
        name: '',
        protocolVersion: ''
      };

      const result = validateAgentCard(invalidCard);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should validate skills', () => {
      const cardWithInvalidSkill = {
        ...card,
        skills: [
          ...card.skills,
          { id: '', name: '', description: '', tags: [], examples: [] }
        ]
      };

      const result = validateAgentCard(cardWithInvalidSkill);
      expect(result.valid).toBe(false);
    });
  });

  describe('Utilities', () => {
    test('should get skill by ID', () => {
      const skill = getSkill(card, 'join-game');
      expect(skill).toBeDefined();
      expect(skill?.name).toBe('Join Game Lobby');
    });

    test('should return undefined for non-existent skill', () => {
      const skill = getSkill(card, 'non-existent');
      expect(skill).toBeUndefined();
    });

    test('should get all skill IDs', () => {
      const ids = getAllSkillIds(card);
      expect(ids.length).toBe(12);
      expect(ids).toContain('join-game');
      expect(ids).toContain('move-to-room');
      expect(ids).toContain('kill-player');
    });
  });

  describe('A2A Protocol Conformance', () => {
    test('should use correct protocol version', () => {
      expect(card.protocolVersion).toBe('0.3.0');
    });

    test('should use JSONRPC transport', () => {
      expect(card.preferredTransport).toBe('JSONRPC');
    });

    test('should declare streaming capability', () => {
      expect(card.capabilities.streaming).toBe(true);
    });

    test('should have proper URL structure', () => {
      expect(card.url).toMatch(/^http/);
      expect(card.url).toContain('/a2a');
    });

    test('should include additionalInterfaces per §5.6.2', () => {
      expect(card.additionalInterfaces).toBeDefined();
      expect(card.additionalInterfaces?.length).toBeGreaterThan(0);
      expect(card.additionalInterfaces?.[0].transport).toBe('JSONRPC');
      expect(card.additionalInterfaces?.[0].url).toContain('/a2a');
    });

    test('should have documentationUrl', () => {
      expect(card.documentationUrl).toBeDefined();
    });

    test('should declare supportsAuthenticatedExtendedCard', () => {
      expect(card.supportsAuthenticatedExtendedCard).toBeDefined();
      expect(card.supportsAuthenticatedExtendedCard).toBe(false);
    });
  });
});

