/**
 * Authentication Service
 * Implements challenge-response authentication with signature verification
 */

import { ethers } from 'ethers';
import jwt from 'jsonwebtoken';
import type { ERC8004Registry } from '../blockchain/registry.js';
import type { AuthChallenge, AuthRequest, AuthResponse, TokenPayload } from './types.js';

export class AuthService {
  private challenges: Map<string, AuthChallenge> = new Map();
  private readonly JWT_SECRET: string;
  private readonly TOKEN_EXPIRY = 24 * 60 * 60; // 24 hours
  private readonly CHALLENGE_EXPIRY = 5 * 60 * 1000; // 5 minutes

  constructor(
    private registry: ERC8004Registry,
    jwtSecret?: string
  ) {
    this.JWT_SECRET = jwtSecret || process.env.JWT_SECRET || this.generateSecret();
  }

  // ============================================================================
  // Challenge Generation
  // ============================================================================

  generateChallenge(agentAddress: string): AuthChallenge {
    const challenge = ethers.hexlify(ethers.randomBytes(32));
    const expiresAt = Date.now() + this.CHALLENGE_EXPIRY;

    const authChallenge: AuthChallenge = {
      challenge,
      expiresAt
    };

    this.challenges.set(agentAddress.toLowerCase(), authChallenge);

    // Cleanup expired challenges periodically
    this.cleanupExpiredChallenges();

    return authChallenge;
  }

  private cleanupExpiredChallenges(): void {
    const now = Date.now();
    for (const [address, challenge] of this.challenges.entries()) {
      if (challenge.expiresAt < now) {
        this.challenges.delete(address);
      }
    }
  }

  // ============================================================================
  // Signature Verification & Token Generation
  // ============================================================================

  async authenticate(request: AuthRequest): Promise<AuthResponse> {
    const { agentAddress, signature, challenge } = request;
    const normalizedAddress = agentAddress.toLowerCase();

    // 1. Check if agent is registered in ERC-8004
    const isRegistered = await this.registry.isAgentRegistered(agentAddress);
    if (!isRegistered) {
      throw new Error('Agent not registered in ERC-8004 registry');
    }

    // 2. Verify challenge exists and not expired
    const storedChallenge = this.challenges.get(normalizedAddress);
    if (!storedChallenge) {
      throw new Error('Challenge not found or expired');
    }

    if (storedChallenge.challenge !== challenge) {
      throw new Error('Challenge mismatch');
    }

    if (storedChallenge.expiresAt < Date.now()) {
      this.challenges.delete(normalizedAddress);
      throw new Error('Challenge expired');
    }

    // 3. Verify signature
    const message = this.constructSignatureMessage(challenge);
    const recoveredAddress = ethers.verifyMessage(message, signature);

    if (recoveredAddress.toLowerCase() !== normalizedAddress) {
      throw new Error('Signature verification failed');
    }

    // 4. Get agent info from registry
    const agentInfo = await this.registry.getAgentInfoByAddress(agentAddress);
    if (!agentInfo) {
      throw new Error('Agent info not found');
    }

    // 5. Clear used challenge
    this.challenges.delete(normalizedAddress);

    // 6. Generate JWT token
    const token = this.generateToken(agentAddress, agentInfo.agentDomain);

    return {
      token,
      expiresIn: this.TOKEN_EXPIRY
    };
  }

  // ============================================================================
  // JWT Token Management
  // ============================================================================

  private generateToken(agentAddress: string, agentDomain: string): string {
    const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
      agentAddress: agentAddress.toLowerCase(),
      agentDomain
    };

    return jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.TOKEN_EXPIRY
    });
  }

  verifyToken(token: string): TokenPayload {
    const payload = jwt.verify(token, this.JWT_SECRET) as TokenPayload;
    return payload;
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  constructSignatureMessage(challenge: string): string {
    return `Sign this message to authenticate with Among Us ERC-8004 Game Master.\n\nChallenge: ${challenge}\n\nThis request will not trigger a blockchain transaction or cost any gas fees.`;
  }

  private generateSecret(): string {
    console.warn('⚠️  No JWT_SECRET provided, generating random secret. This will invalidate tokens on restart!');
    return ethers.hexlify(ethers.randomBytes(32));
  }

  // ============================================================================
  // Middleware Helper
  // ============================================================================

  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) return null;
    
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }
    
    return parts[1];
  }
}

