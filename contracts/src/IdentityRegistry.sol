// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IIdentityRegistry} from "./interfaces/IIdentityRegistry.sol";
import {Constants} from "./libraries/Constants.sol";

/// @title IdentityRegistry
/// @notice Implementation of the Identity Registry contract as defined in ERC-8004 (draft)
contract IdentityRegistry is IIdentityRegistry {
    uint256 private _agentCount;

    mapping(uint256 agentId => Agent) private _agentById;
    mapping(string agentDomain => uint256 agentId) private _agentIdByDomain;
    mapping(address agentAddress => uint256 agentId) private _agentIdByAddress;

    /// @notice Initializes the Identity Registry
    constructor() {
        _agentCount = 0;
    }

    /// @inheritdoc IIdentityRegistry
    function newAgent(string calldata agentDomain, address agentAddress) external returns (uint256 agentId_) {
        if (bytes(agentDomain).length == 0) {
            revert InvalidDomain();
        }
        if (agentAddress == address(0)) {
            revert InvalidAddress();
        }
        if (_agentIdByDomain[agentDomain] != 0) {
            revert DomainAlreadyRegistered(agentDomain);
        }
        if (_agentIdByAddress[agentAddress] != 0) {
            revert AddressAlreadyRegistered(agentAddress);
        }
        if (msg.sender != agentAddress) {
            revert Unauthorized(msg.sender, agentAddress);
        }

        unchecked {
            agentId_ = ++_agentCount;
        }

        _agentById[agentId_] = Agent({domain: agentDomain, addr: agentAddress});
        _agentIdByDomain[agentDomain] = agentId_;
        _agentIdByAddress[agentAddress] = agentId_;

        emit AgentRegistered(agentId_, agentDomain, agentAddress);
    }

    /// @inheritdoc IIdentityRegistry
    function updateAgent(uint256 agentId, string calldata newAgentDomain, address newAgentAddress)
        external
        returns (bool success_)
    {
        Agent storage agent = _agentById[agentId];

        if (agent.addr == address(0)) {
            revert AgentNotFound(agentId);
        }
        if (msg.sender != agent.addr) {
            revert Unauthorized(msg.sender, agent.addr);
        }

        if (
            bytes(newAgentDomain).length != 0 && _agentIdByDomain[newAgentDomain] != 0
                && keccak256(bytes(newAgentDomain)) != keccak256(bytes(agent.domain))
        ) {
            revert DomainAlreadyRegistered(newAgentDomain);
        }
        if (
            newAgentAddress != address(0) && _agentIdByAddress[newAgentAddress] != 0
                && _agentIdByAddress[newAgentAddress] != agentId
        ) {
            revert AddressAlreadyRegistered(newAgentAddress);
        }

        string memory previousDomain = agent.domain;
        address previousAddress = agent.addr;

        if (bytes(newAgentDomain).length != 0) {
            delete _agentIdByDomain[agent.domain];
            agent.domain = newAgentDomain;
            _agentIdByDomain[newAgentDomain] = agentId;
        }
        if (newAgentAddress != address(0)) {
            delete _agentIdByAddress[agent.addr];
            agent.addr = newAgentAddress;
            _agentIdByAddress[newAgentAddress] = agentId;
        }

        success_ = true;

        emit AgentUpdated(agentId, previousDomain, agent.domain, previousAddress, agent.addr);
    }

    /// @inheritdoc IIdentityRegistry
    function getAgent(uint256 agentId)
        external
        view
        returns (uint256 agentId_, string memory agentDomain_, address agentAddress_)
    {
        Agent storage agent = _agentById[agentId];

        if (agent.addr == address(0)) {
            return (Constants.AGENT_ID_NONE, Constants.AGENT_DOMAIN_NONE, Constants.AGENT_ADDRESS_NONE);
        }

        agentId_ = agentId;
        agentDomain_ = agent.domain;
        agentAddress_ = agent.addr;
    }

    /// @inheritdoc IIdentityRegistry
    function resolveAgentByDomain(string calldata agentDomain)
        external
        view
        returns (uint256 agentId_, string memory agentDomain_, address agentAddress_)
    {
        uint256 agentId = _agentIdByDomain[agentDomain];
        if (agentId == 0) {
            return (Constants.AGENT_ID_NONE, Constants.AGENT_DOMAIN_NONE, Constants.AGENT_ADDRESS_NONE);
        }

        Agent storage agent = _agentById[agentId];
        agentId_ = agentId;
        agentDomain_ = agent.domain;
        agentAddress_ = agent.addr;
    }

    /// @inheritdoc IIdentityRegistry
    function resolveAgentByAddress(address agentAddress)
        external
        view
        returns (uint256 agentId_, string memory agentDomain_, address agentAddress_)
    {
        uint256 agentId = _agentIdByAddress[agentAddress];
        if (agentId == 0) {
            return (Constants.AGENT_ID_NONE, Constants.AGENT_DOMAIN_NONE, Constants.AGENT_ADDRESS_NONE);
        }

        Agent storage agent = _agentById[agentId];
        agentId_ = agentId;
        agentDomain_ = agent.domain;
        agentAddress_ = agent.addr;
    }
}
