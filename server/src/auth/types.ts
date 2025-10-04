/**
 * Authentication Types
 * Challenge-response authentication with JWT tokens
 */

export interface AuthChallenge {
  challenge: string;
  expiresAt: number;
}

export interface AuthRequest {
  agentAddress: string;
  signature: string;
  challenge: string;
}

export interface AuthResponse {
  token: string;
  expiresIn: number;
}

export interface TokenPayload {
  agentAddress: string;
  agentDomain: string;
  iat: number;
  exp: number;
}

