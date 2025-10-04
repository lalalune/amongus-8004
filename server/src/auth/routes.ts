/**
 * Authentication Routes
 * Handles challenge generation and token issuance
 * These are NOT A2A protocol endpoints - they're auth-specific
 */

import type { Request, Response } from 'express';
import type { AuthService } from './service.js';
import type { AuthRequest } from './types.js';

export function createAuthRoutes(authService: AuthService) {
  return {
    // POST /auth/challenge
    // Request a signing challenge for an agent address
    getChallenge: (req: Request, res: Response): void => {
      const { agentAddress } = req.body as { agentAddress?: string };

      if (!agentAddress) {
        res.status(400).json({
          error: 'Missing agentAddress'
        });
        return;
      }

      const challenge = authService.generateChallenge(agentAddress);

      res.json({
        challenge: challenge.challenge,
        message: authService.constructSignatureMessage(challenge.challenge),
        expiresAt: challenge.expiresAt
      });
    },

    // POST /auth/authenticate
    // Submit signed challenge to receive JWT token
    authenticate: async (req: Request, res: Response): Promise<void> => {
      const authRequest = req.body as Partial<AuthRequest>;

      if (!authRequest.agentAddress || !authRequest.signature || !authRequest.challenge) {
        res.status(400).json({
          error: 'Missing required fields: agentAddress, signature, challenge'
        });
        return;
      }

      try {
        const authResponse = await authService.authenticate({
          agentAddress: authRequest.agentAddress,
          signature: authRequest.signature,
          challenge: authRequest.challenge
        });

        res.json(authResponse);
      } catch (error) {
        res.status(401).json({
          error: error instanceof Error ? error.message : 'Authentication failed'
        });
      }
    }
  };
}

