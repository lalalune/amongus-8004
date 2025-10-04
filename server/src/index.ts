#!/usr/bin/env bun
/**
 * Among Us ERC-8004 Game Master Server
 * Main entry point
 */

import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { GameEngine } from './game/engine.js';
import type { GameConfig } from '@elizagames/shared';
import { createRegistry } from './blockchain/registry.js';
import { A2AServer } from './a2a/server.js';
import { generateAgentCard, validateAgentCard } from './a2a/agentCard.js';

const PORT = parseInt(process.env.PORT || '3000');
const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';
const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;

async function main() {
  console.log('🚀 Starting Among Us ERC-8004 Game Master Server...\n');

  // Initialize game engine (allow fast timers via env for E2E/dev)
  const discussionMs = process.env.DISCUSSION_TIME_MS ? parseInt(process.env.DISCUSSION_TIME_MS, 10) : undefined;
  const votingMs = process.env.VOTING_TIME_MS ? parseInt(process.env.VOTING_TIME_MS, 10) : undefined;
  const killCooldownMs = process.env.KILL_COOLDOWN_MS ? parseInt(process.env.KILL_COOLDOWN_MS, 10) : undefined;
  const minPlayers = process.env.MIN_PLAYERS ? parseInt(process.env.MIN_PLAYERS, 10) : undefined;
  const maxPlayers = process.env.MAX_PLAYERS ? parseInt(process.env.MAX_PLAYERS, 10) : undefined;

  const gameConfig: Partial<GameConfig> = {
    ...(discussionMs !== undefined ? { discussionTime: discussionMs } : {}),
    ...(votingMs !== undefined ? { votingTime: votingMs } : {}),
    ...(killCooldownMs !== undefined ? { killCooldown: killCooldownMs } : {}),
    ...(minPlayers !== undefined ? { minPlayers } : {}),
    ...(maxPlayers !== undefined ? { maxPlayers } : {})
  };

  const gameEngine = new GameEngine(gameConfig);
  console.log('✅ Game engine initialized');

  // Initialize ERC-8004 registry
  const registry = await createRegistry(RPC_URL);
  console.log(`✅ Connected to ERC-8004 contracts`);
  console.log(`   Chain: ${registry.getContractAddresses().chainId}`);
  console.log(`   Wallet: ${registry.getWalletAddress()}`);

  // Initialize A2A server
  const a2aServer = new A2AServer(gameEngine, registry);
  console.log('✅ A2A server initialized');
  console.log('✅ Per-message signature verification enabled\n');

  // Generate and validate Agent Card
  const agentCard = generateAgentCard(SERVER_URL);
  const validation = validateAgentCard(agentCard);
  
  if (!validation.valid) {
    console.error('❌ Agent Card validation failed:');
    validation.errors.forEach((err) => console.error(`   - ${err}`));
    process.exit(1);
  }
  
  console.log('✅ Agent Card validated');
  console.log(`   Skills: ${agentCard.skills.length}`);
  console.log(`   Streaming: ${agentCard.capabilities.streaming}\n`);

  // Create Express app
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Request logging
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
    });
    next();
  });

  // ============================================================================
  // Routes
  // ============================================================================

  // Agent Card (well-known URI) - Public for discovery
  app.get('/.well-known/agent-card.json', (req: Request, res: Response) => {
    res.json(agentCard);
  });

  // A2A JSON-RPC endpoint - Signature verified on each message
  app.post('/a2a', async (req: Request, res: Response) => {
    await a2aServer.handleRequest(req, res);
  });

  // Health check
  app.get('/health', (req: Request, res: Response) => {
    const state = gameEngine.getState();
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      game: {
        phase: state.phase,
        players: state.players.size,
        round: state.round
      },
      streaming: {
        connections: a2aServer.getStreamingManager().getConnectionCount(),
        agents: a2aServer.getStreamingManager().getAllConnectedAgents().length
      }
    });
  });

  // Debug endpoints (remove in production)
  app.get('/debug/state', (req: Request, res: Response) => {
    const state = gameEngine.getState();
    res.json({
      id: state.id,
      phase: state.phase,
      round: state.round,
      players: Array.from(state.players.entries()).map(([id, p]) => ({
        id,
        name: p.name,
        role: p.role,
        location: p.location,
        isAlive: p.isAlive
      })),
      imposters: Array.from(state.imposterIds),
      deadPlayers: Array.from(state.deadPlayers)
    });
  });

  app.get('/debug/players', (req: Request, res: Response) => {
    const players = Array.from(gameEngine.getState().players.values());
    res.json(players);
  });

  app.get('/debug/ship', (req: Request, res: Response) => {
    const ship = gameEngine.getState().ship;
    res.json({
      rooms: Array.from(ship.rooms.values()),
      vents: Array.from(ship.vents.entries())
    });
  });

  // Unsafe debug reset endpoint (local/dev only)
  app.post('/debug/reset', (req: Request, res: Response) => {
    if (process.env.NODE_ENV && process.env.NODE_ENV !== 'local' && process.env.NODE_ENV !== 'development') {
      res.status(403).json({ error: 'Debug reset not allowed in this environment' });
      return;
    }
    gameEngine.reset();
    res.json({ ok: true });
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not found',
      message: `Route ${req.method} ${req.path} not found`,
      hint: 'Try GET /.well-known/agent-card.json to see available endpoints'
    });
  });

  // Error handler
  app.use((err: Error, req: Request, res: Response, next: Function) => {
    console.error('Server error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  });

  // Start server
  app.listen(PORT, () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎮 Among Us ERC-8004 Game Master Server READY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log();
    console.log('📡 Endpoints:');
    console.log(`   Agent Card:    ${SERVER_URL}/.well-known/agent-card.json`);
    console.log(`   A2A JSON-RPC:  ${SERVER_URL}/a2a`);
    console.log(`   Health Check:  ${SERVER_URL}/health`);
    console.log();
    console.log(`📡 Chain ID:      ${registry.getContractAddresses().chainId}`);
    console.log(`🏦 Contracts:     Identity, Reputation, Validation`);
    console.log();
    console.log('🔐 Security:      Per-message signature verification');
    console.log('🛡️  Anti-Impersonation: ENABLED');
    console.log('Ready for agents to connect! 🤖');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    a2aServer.getStreamingManager().closeAllConnections();
    process.exit(0);
  });
}

await main();

