/**
 * Custom Error Types for Among Us ERC-8004 Plugin
 * Provides specific error types for better error handling and debugging
 */

/**
 * Base error class for all plugin errors
 */
export class AmongUsPluginError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'AmongUsPluginError';
  }
}

/**
 * Thrown when Web3 or blockchain operations fail
 */
export class Web3Error extends AmongUsPluginError {
  constructor(message: string, public readonly originalError?: Error) {
    super(message, 'WEB3_ERROR');
    this.name = 'Web3Error';
  }
}

/**
 * Thrown when ERC-8004 agent registration fails
 */
export class RegistrationError extends AmongUsPluginError {
  constructor(message: string, public readonly agentAddress?: string) {
    super(message, 'REGISTRATION_ERROR');
    this.name = 'RegistrationError';
  }
}

/**
 * Thrown when A2A protocol communication fails
 */
export class A2AProtocolError extends AmongUsPluginError {
  constructor(
    message: string,
    public readonly method?: string,
    public readonly originalError?: Error
  ) {
    super(message, 'A2A_PROTOCOL_ERROR');
    this.name = 'A2AProtocolError';
  }
}

/**
 * Thrown when Agent Card fetch or validation fails
 */
export class AgentCardError extends AmongUsPluginError {
  constructor(message: string, public readonly url?: string) {
    super(message, 'AGENT_CARD_ERROR');
    this.name = 'AgentCardError';
  }
}

/**
 * Thrown when game state is invalid or corrupted
 */
export class GameStateError extends AmongUsPluginError {
  constructor(message: string, public readonly phase?: string) {
    super(message, 'GAME_STATE_ERROR');
    this.name = 'GameStateError';
  }
}

/**
 * Thrown when a skill execution fails
 */
export class SkillExecutionError extends AmongUsPluginError {
  constructor(
    message: string,
    public readonly skillId?: string,
    public readonly reason?: string
  ) {
    super(message, 'SKILL_EXECUTION_ERROR');
    this.name = 'SkillExecutionError';
  }
}

/**
 * Thrown when required services are not available
 */
export class ServiceNotAvailableError extends AmongUsPluginError {
  constructor(message: string, public readonly serviceType?: string) {
    super(message, 'SERVICE_NOT_AVAILABLE');
    this.name = 'ServiceNotAvailableError';
  }
}

/**
 * Thrown when configuration is invalid or missing
 */
export class ConfigurationError extends AmongUsPluginError {
  constructor(message: string, public readonly configKey?: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}

/**
 * Thrown when network operations fail
 */
export class NetworkError extends AmongUsPluginError {
  constructor(
    message: string,
    public readonly url?: string,
    public readonly statusCode?: number
  ) {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

/**
 * Thrown when streaming operations fail
 */
export class StreamingError extends AmongUsPluginError {
  constructor(message: string, public readonly reason?: string) {
    super(message, 'STREAMING_ERROR');
    this.name = 'StreamingError';
  }
}

