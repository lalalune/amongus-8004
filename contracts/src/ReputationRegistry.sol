// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IReputationRegistry} from "./interfaces/IReputationRegistry.sol";
import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {Constants} from "./libraries/Constants.sol";

contract ReputationRegistry is IReputationRegistry {
    IIdentityRegistry public immutable identityRegistry;

    uint256 private _feedbackCount;

    /// @notice Initializes the Reputation Registry with the address of the Identity Registry
    /// @param identityRegistryAddress The address of the deployed Identity Registry contract
    constructor(address identityRegistryAddress) {
        if (identityRegistryAddress == address(0)) {
            revert InvalidIdentityRegistryAddress();
        }

        _feedbackCount = 0;
        identityRegistry = IIdentityRegistry(identityRegistryAddress);
    }

    /// @inheritdoc IReputationRegistry
    function acceptFeedback(uint256 agentClientId, uint256 agentServerId) external {
        (,, address agentClientAddress) = identityRegistry.getAgent(agentClientId);
        if (agentClientAddress == Constants.AGENT_ADDRESS_NONE) {
            revert AgentNotFound(agentClientId);
        }

        (,, address agentServerAddress) = identityRegistry.getAgent(agentServerId);
        if (agentServerAddress == Constants.AGENT_ADDRESS_NONE) {
            revert AgentNotFound(agentServerId);
        }
        if (msg.sender != agentServerAddress) {
            revert Unauthorized(msg.sender, agentServerAddress);
        }

        bytes32 feedbackAuthId = _generateFeedbackAuthId(agentClientId, agentServerId);

        emit AuthFeedback(agentClientId, agentServerId, feedbackAuthId);
    }

    /// @dev Generates a unique feedback authorization ID based on the client and server agent IDs
    /// @param agentClientId The ID of the client agent
    /// @param agentServerId The ID of the server agent
    /// @return feedbackAuthId_ A unique identifier for the authorized feedback
    function _generateFeedbackAuthId(uint256 agentClientId, uint256 agentServerId)
        private
        returns (bytes32 feedbackAuthId_)
    {
        unchecked {
            feedbackAuthId_ = keccak256(
                abi.encodePacked(block.chainid, address(this), agentClientId, agentServerId, ++_feedbackCount)
            );
        }
    }
}
