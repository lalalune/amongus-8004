// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title IIdentityRegistry
/// @notice Interface for the Identity Registry contract as defined in ERC-8004 (draft)
interface IIdentityRegistry {
    /// @notice Struct representing an agent
    /// @param domain The domain of the agent
    /// @param addr The address of the agent
    struct Agent {
        string domain;
        address addr;
    }

    /// @notice Emitted when a new agent is registered
    /// @param agentId The ID of the agent
    /// @param agentDomain The domain of the agent
    /// @param agentAddress The address of the agent
    event AgentRegistered(uint256 indexed agentId, string indexed agentDomain, address indexed agentAddress);

    /// @notice Emitted when an agent is updated
    /// @param agentId The ID of the agent
    /// @param previousAgentDomain The previous domain of the agent
    /// @param newAgentDomain The new domain of the agent
    /// @param previousAgentAddress The previous address of the agent
    /// @param newAgentAddress The new address of the agent
    event AgentUpdated(
        uint256 indexed agentId,
        string previousAgentDomain,
        string indexed newAgentDomain,
        address previousAgentAddress,
        address indexed newAgentAddress
    );

    /// @notice Thrown when the caller is not authorized to perform an action
    /// @param caller The address of the caller
    /// @param expected The expected address that is authorized
    error Unauthorized(address caller, address expected);

    /// @notice Thrown when the provided domain is invalid (e.g., empty)
    error InvalidDomain();

    /// @notice Thrown when the provided address is invalid (e.g., zero address)
    error InvalidAddress();

    /// @notice Thrown when trying to register a domain that is already registered
    /// @param domain The domain that is already registered
    error DomainAlreadyRegistered(string domain);

    /// @notice Thrown when trying to register an address that is already registered
    /// @param agentAddress The address that is already registered
    error AddressAlreadyRegistered(address agentAddress);

    /// @notice Thrown when an agent with the specified ID is not found
    /// @param agentId The ID of the agent that was not found
    error AgentNotFound(uint256 agentId);

    /// @notice Register a new agent
    /// @param agentDomain The domain of the agent
    /// @param agentAddress The address of the agent
    /// @return agentId_ The ID of the newly registered agent
    function newAgent(string calldata agentDomain, address agentAddress) external returns (uint256 agentId_);

    /// @notice Update an existing agent's domain and/or address
    /// @param agentId The ID of the agent to update
    /// @param newAgentDomain The new domain of the agent (pass empty string to keep current)
    /// @param newAgentAddress The new address of the agent (pass address(0) to keep current)
    /// @return success_ True if the update was successful
    function updateAgent(uint256 agentId, string calldata newAgentDomain, address newAgentAddress)
        external
        returns (bool success_);

    /// @notice Get an agent by its ID
    /// @param agentId The ID of the agent to retrieve
    /// @return agentId_ The ID of the agent
    /// @return agentDomain_ The domain of the agent
    /// @return agentAddress_ The address of the agent
    function getAgent(uint256 agentId)
        external
        view
        returns (uint256 agentId_, string memory agentDomain_, address agentAddress_);

    /// @notice Resolve an agent by its domain
    /// @param agentDomain The domain of the agent to resolve
    /// @return agentId_ The ID of the agent
    /// @return agentDomain_ The domain of the agent
    /// @return agentAddress_ The address of the agent
    function resolveAgentByDomain(string calldata agentDomain)
        external
        view
        returns (uint256 agentId_, string memory agentDomain_, address agentAddress_);

    /// @notice Resolve an agent by its address
    /// @param agentAddress The address of the agent to resolve
    /// @return agentId_ The ID of the agent
    /// @return agentDomain_ The domain of the agent
    /// @return agentAddress_ The address of the agent
    function resolveAgentByAddress(address agentAddress)
        external
        view
        returns (uint256 agentId_, string memory agentDomain_, address agentAddress_);
}
