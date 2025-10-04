/**
 * Authentication Middleware
 * Validates JWT bearer tokens on A2A requests
 */

import type { Request, Response, NextFunction } from 'express';
import type { AuthService } from './service.js';
import { createErrorResponse, A2A_ERROR_CODES } from '../a2a/types';

// Extend Express Request to include authenticated agent info
declare global {
  namespace Express {
    interface Request {
      agentAddress?: string;
      agentDomain?: string;
    }
  }
}

export function createAuthMiddleware(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    
    const token = authService.extractTokenFromHeader(authHeader);
    
    if (!token) {
      res.status(401).json(
        createErrorResponse(
          (req.body as { id?: string | number })?.id ?? null,
          A2A_ERROR_CODES.INVALID_REQUEST,
          'Authentication required: Missing or invalid Authorization header'
        )
      );
      res.setHeader('WWW-Authenticate', 'Bearer realm="A2A"');
      return;
    }

    try {
      const payload = authService.verifyToken(token);
      
      // Attach agent info to request
      req.agentAddress = payload.agentAddress;
      req.agentDomain = payload.agentDomain;
      
      next();
    } catch (error) {
      res.status(401).json(
        createErrorResponse(
          (req.body as { id?: string | number })?.id ?? null,
          A2A_ERROR_CODES.INVALID_REQUEST,
          error instanceof Error ? `Authentication failed: ${error.message}` : 'Invalid token'
        )
      );
      res.setHeader('WWW-Authenticate', 'Bearer realm="A2A"');
    }
  };
}

