// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title IReputationRegistry
/// @notice Interface for the Reputation Registry contract as defined in ERC-8004 (draft)
interface IReputationRegistry {
    /// @notice Emitted when feedback is authorized between a client and server agent
    /// @param agentClientId The ID of the client agent
    /// @param agentServerId The ID of the server agent
    /// @param feedbackAuthId The unique identifier for the authorized feedback
    event AuthFeedback(uint256 indexed agentClientId, uint256 indexed agentServerId, bytes32 indexed feedbackAuthId);

    /// @notice Thrown when the provided identity registry address is invalid (e.g., zero address)
    error InvalidIdentityRegistryAddress();

    /// @notice Thrown when an agent with the specified ID is not found
    /// @param agentId The ID of the agent that was not found
    error AgentNotFound(uint256 agentId);

    /// @notice Thrown when the caller is not authorized to perform an action
    /// @param caller The address of the caller
    /// @param expected The expected address that is authorized
    error Unauthorized(address caller, address expected);

    /// @notice Authorize feedback from a server agent to a client agent
    /// @param agentClientId The ID of the client agent
    /// @param agentServerId The ID of the server agent
    function acceptFeedback(uint256 agentClientId, uint256 agentServerId) external;
}
