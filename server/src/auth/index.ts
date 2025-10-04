/**
 * Authentication Module
 * Export all auth-related functionality
 */

export { AuthService } from './service.js';
export { createAuthMiddleware } from './middleware.js';
export { createAuthRoutes } from './routes.js';
export type { AuthChallenge, AuthRequest, AuthResponse, TokenPayload } from './types.js';

