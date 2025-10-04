// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title IValidationRegistry
/// @notice Interface for the Validation Registry contract as defined in ERC-8004 (draft)
interface IValidationRegistry {
    /// @notice Struct representing a validation request
    /// @param agentValidatorId The ID of the validator agent
    /// @param agentServerId The ID of the server agent
    /// @param expiresAt The timestamp when the request expires
    /// @param responded Whether the request has been responded to
    struct Request {
        uint256 agentValidatorId;
        uint256 agentServerId;
        uint256 expiresAt;
        bool responded;
    }

    /// @notice Emitted when a new validation request is created
    /// @param agentValidatorId The ID of the validator agent
    /// @param agentServerId The ID of the server agent
    /// @param dataHash The hash of the data to be validated
    event ValidationRequest(uint256 indexed agentValidatorId, uint256 indexed agentServerId, bytes32 indexed dataHash);

    /// @notice Emitted when a validation response is submitted
    /// @param agentValidatorId The ID of the validator agent
    /// @param agentServerId The ID of the server agent
    /// @param dataHash The hash of the data that was validated
    /// @param response The response is value between 0 and 100
    event ValidationResponse(
        uint256 indexed agentValidatorId, uint256 indexed agentServerId, bytes32 indexed dataHash, uint8 response
    );

    /// @notice Thrown when the provided identity registry address is invalid (e.g., zero address)
    error InvalidIdentityRegistryAddress();

    /// @notice Thrown when an agent with the specified ID is not found
    /// @param agentId The ID of the agent that was not found
    error AgentNotFound(uint256 agentId);

    /// @notice Thrown when a validation request for the given data hash already exists
    /// @param agentValidatorId The ID of the validator agent
    /// @param agentServerId The ID of the server agent
    /// @param dataHash The hash of the data for which the request already exists
    error AlreadyRequested(uint256 agentValidatorId, uint256 agentServerId, bytes32 dataHash);

    /// @notice Thrown when a validation request has already been responded to
    /// @param agentValidatorId The ID of the validator agent
    /// @param agentServerId The ID of the server agent
    /// @param dataHash The hash of the data for which the request was made
    error AlreadyResponded(uint256 agentValidatorId, uint256 agentServerId, bytes32 dataHash);

    /// @notice Thrown when a validation request for the given data hash is not found
    /// @param dataHash The hash of the data for which the request was not found
    error RequestNotFound(bytes32 dataHash);

    /// @notice Thrown when a validation request has expired
    /// @param dataHash The hash of the data for which the request expired
    /// @param currentTime The current block timestamp
    /// @param expiresAt The timestamp when the request expired
    error RequestExpired(bytes32 dataHash, uint256 currentTime, uint256 expiresAt);

    /// @notice Thrown when the caller is not authorized to perform an action
    /// @param caller The address of the caller
    /// @param expected The expected address that is authorized
    error Unauthorized(address caller, address expected);

    /// @notice Thrown when the provided response is invalid (not between 0 and 100)
    /// @param response The invalid response value
    /// @param minResponse The minimum valid response value
    /// @param maxResponse The maximum valid response value
    error InvalidResponse(uint8 response, uint8 minResponse, uint8 maxResponse);

    /// @notice Create a new validation request
    /// @param agentValidatorId The ID of the validator agent
    /// @param agentServerId The ID of the server agent
    /// @param dataHash The hash of the data to be validated
    function validationRequest(uint256 agentValidatorId, uint256 agentServerId, bytes32 dataHash) external;

    /// @notice Submit a response to a validation request
    /// @param dataHash The hash of the data that was validated
    /// @param response The response is value between 0 and 100
    function validationResponse(bytes32 dataHash, uint8 response) external;
}
