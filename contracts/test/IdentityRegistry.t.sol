// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {Constants} from "../src/libraries/Constants.sol";

contract IdentityRegistryTest is Test {
    IdentityRegistry identityRegistry;

    address alice = address(0x1);
    address bob = address(0x2);
    address charlie = address(0x3);

    string aliceDomain = "alice.com";
    string bobDomain = "bob.agent.com";
    string charlieDomain = "charlie.my.agent.com";

    event AgentRegistered(uint256 indexed agentId, string indexed agentDomain, address indexed agentAddress);

    event AgentUpdated(
        uint256 indexed agentId,
        string previousAgentDomain,
        string indexed newAgentDomain,
        address previousAgentAddress,
        address indexed newAgentAddress
    );

    function setUp() public {
        identityRegistry = new IdentityRegistry();
    }

    function test_NewAgent() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit AgentRegistered(1, aliceDomain, alice);
        uint256 aliceId = identityRegistry.newAgent(aliceDomain, alice);
        assertEq(aliceId, 1);
    }

    function test_NewAgent_Multiple() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit AgentRegistered(1, aliceDomain, alice);
        uint256 aliceId = identityRegistry.newAgent(aliceDomain, alice);
        assertEq(aliceId, 1);

        vm.prank(bob);
        vm.expectEmit(true, true, true, true);
        emit AgentRegistered(2, bobDomain, bob);
        uint256 bobId = identityRegistry.newAgent(bobDomain, bob);
        assertEq(bobId, 2);

        vm.prank(charlie);
        vm.expectEmit(true, true, true, true);
        emit AgentRegistered(3, charlieDomain, charlie);
        uint256 charlieId = identityRegistry.newAgent(charlieDomain, charlie);
        assertEq(charlieId, 3);
    }

    function test_NewAgent_Unauthorized() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSignature("Unauthorized(address,address)", bob, alice));
        identityRegistry.newAgent(aliceDomain, alice);
    }

    function test_NewAgent_InvalidDomain() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("InvalidDomain()"));
        identityRegistry.newAgent("", alice);
    }

    function test_NewAgent_InvalidAddress() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("InvalidAddress()"));
        identityRegistry.newAgent(aliceDomain, address(0));
    }

    function test_NewAgent_DomainAlreadyRegistered() public {
        vm.prank(alice);
        identityRegistry.newAgent(aliceDomain, alice);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSignature("DomainAlreadyRegistered(string)", aliceDomain));
        identityRegistry.newAgent(aliceDomain, bob);
    }

    function test_NewAgent_AddressAlreadyRegistered() public {
        vm.prank(alice);
        identityRegistry.newAgent(aliceDomain, alice);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("AddressAlreadyRegistered(address)", alice));
        identityRegistry.newAgent(bobDomain, alice);
    }

    function test_UpdateAgent_Domain() public {
        vm.prank(alice);
        identityRegistry.newAgent(aliceDomain, alice);

        string memory newAliceDomain = "alice.newdomain.com";
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit AgentUpdated(1, aliceDomain, newAliceDomain, alice, alice);
        bool success = identityRegistry.updateAgent(1, newAliceDomain, address(0));
        assertTrue(success);
    }

    function test_UpdateAgent_Address() public {
        vm.prank(alice);
        identityRegistry.newAgent(aliceDomain, alice);

        address newAliceAddress = address(0x4);
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit AgentUpdated(1, aliceDomain, aliceDomain, alice, newAliceAddress);
        bool success = identityRegistry.updateAgent(1, "", newAliceAddress);
        assertTrue(success);
    }

    function test_UpdateAgent_DomainAndAddress() public {
        vm.prank(alice);
        identityRegistry.newAgent(aliceDomain, alice);

        string memory newAliceDomain = "alice.newdomain.com";
        address newAliceAddress = address(0x4);
        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit AgentUpdated(1, aliceDomain, newAliceDomain, alice, newAliceAddress);
        bool success = identityRegistry.updateAgent(1, newAliceDomain, newAliceAddress);
        assertTrue(success);
    }

    function test_UpdateAgent_Unauthorized() public {
        vm.prank(alice);
        identityRegistry.newAgent(aliceDomain, alice);

        string memory newAliceDomain = "alice.newdomain.com";
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSignature("Unauthorized(address,address)", bob, alice));
        identityRegistry.updateAgent(1, newAliceDomain, address(0));
    }

    function test_UpdateAgent_AgentNotFound() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSignature("AgentNotFound(uint256)", 1));
        identityRegistry.updateAgent(1, "newdomain.com", address(0));
    }

    function test_UpdateAgent_DomainAlreadyRegistered() public {
        vm.prank(alice);
        identityRegistry.newAgent(aliceDomain, alice);

        vm.prank(bob);
        identityRegistry.newAgent(bobDomain, bob);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSignature("DomainAlreadyRegistered(string)", aliceDomain));
        identityRegistry.updateAgent(2, aliceDomain, address(0));
    }

    function test_UpdateAgent_AddressAlreadyRegistered() public {
        vm.prank(alice);
        identityRegistry.newAgent(aliceDomain, alice);

        vm.prank(bob);
        identityRegistry.newAgent(bobDomain, bob);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSignature("AddressAlreadyRegistered(address)", alice));
        identityRegistry.updateAgent(2, "", alice);
    }

    function test_GetAgent() public {
        vm.prank(alice);
        identityRegistry.newAgent(aliceDomain, alice);

        (uint256 agentId, string memory agentDomain, address agentAddress) = identityRegistry.getAgent(1);
        assertEq(agentId, 1);
        assertEq(agentDomain, aliceDomain);
        assertEq(agentAddress, alice);
    }

    function test_GetAgent_AgentNotFound() public view {
        (uint256 agentId, string memory agentDomain, address agentAddress) = identityRegistry.getAgent(1);
        assertEq(agentId, Constants.AGENT_ID_NONE);
        assertEq(agentDomain, Constants.AGENT_DOMAIN_NONE);
        assertEq(agentAddress, Constants.AGENT_ADDRESS_NONE);
    }

    function test_ResolveAgentByDomain() public {
        vm.prank(alice);
        identityRegistry.newAgent(aliceDomain, alice);

        (uint256 agentId, string memory agentDomain, address agentAddress) =
            identityRegistry.resolveAgentByDomain(aliceDomain);
        assertEq(agentId, 1);
        assertEq(agentDomain, aliceDomain);
        assertEq(agentAddress, alice);
    }

    function test_ResolveAgentByDomain_AgentNotFound() public view {
        (uint256 agentId, string memory agentDomain, address agentAddress) =
            identityRegistry.resolveAgentByDomain("unknown.com");
        assertEq(agentId, Constants.AGENT_ID_NONE);
        assertEq(agentDomain, Constants.AGENT_DOMAIN_NONE);
        assertEq(agentAddress, Constants.AGENT_ADDRESS_NONE);
    }

    function test_ResolveAgentByAddress() public {
        vm.prank(alice);
        identityRegistry.newAgent(aliceDomain, alice);

        (uint256 agentId, string memory agentDomain, address agentAddress) =
            identityRegistry.resolveAgentByAddress(alice);
        assertEq(agentId, 1);
        assertEq(agentDomain, aliceDomain);
        assertEq(agentAddress, alice);
    }

    function test_ResolveAgentByAddress_AgentNotFound() public view {
        (uint256 agentId, string memory agentDomain, address agentAddress) =
            identityRegistry.resolveAgentByAddress(address(0x4));
        assertEq(agentId, Constants.AGENT_ID_NONE);
        assertEq(agentDomain, Constants.AGENT_DOMAIN_NONE);
        assertEq(agentAddress, Constants.AGENT_ADDRESS_NONE);
    }
}
