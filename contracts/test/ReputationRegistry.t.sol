// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {Constants} from "../src/libraries/Constants.sol";

contract ReputationRegistryTest is Test {
    IdentityRegistry identityRegistry;
    ReputationRegistry reputationRegistry;

    address alice = address(0x1);
    address bob = address(0x2);
    address charlie = address(0x3);

    string aliceDomain = "alice.com";
    string bobDomain = "bob.agent.com";
    string charlieDomain = "charlie.my.agent.com";

    event AuthFeedback(uint256 indexed agentClientId, uint256 indexed agentServerId, bytes32 indexed feedbackAuthId);

    function setUp() public {
        identityRegistry = new IdentityRegistry();
        reputationRegistry = new ReputationRegistry(address(identityRegistry));
    }

    function test_AuthFeedbackEvent() public {
        vm.prank(alice);
        uint256 aliceId = identityRegistry.newAgent(aliceDomain, alice);
        assertEq(aliceId, 1);

        vm.prank(bob);
        uint256 bobId = identityRegistry.newAgent(bobDomain, bob);
        assertEq(bobId, 2);

        vm.prank(bob);
        vm.expectEmit(true, true, true, true);
        emit AuthFeedback(
            aliceId,
            bobId,
            keccak256(abi.encodePacked(block.chainid, address(reputationRegistry), aliceId, bobId, uint256(1)))
        );
        reputationRegistry.acceptFeedback(aliceId, bobId);
    }

    function test_AuthFeedbackEvent_Multiple() public {
        vm.prank(alice);
        uint256 aliceId = identityRegistry.newAgent(aliceDomain, alice);
        assertEq(aliceId, 1);

        vm.prank(bob);
        uint256 bobId = identityRegistry.newAgent(bobDomain, bob);
        assertEq(bobId, 2);

        vm.prank(charlie);
        uint256 charlieId = identityRegistry.newAgent(charlieDomain, charlie);
        assertEq(charlieId, 3);

        vm.prank(bob);
        vm.expectEmit(true, true, true, true);
        emit AuthFeedback(
            aliceId,
            bobId,
            keccak256(abi.encodePacked(block.chainid, address(reputationRegistry), aliceId, bobId, uint256(1)))
        );
        reputationRegistry.acceptFeedback(aliceId, bobId);

        vm.prank(charlie);
        vm.expectEmit(true, true, true, true);
        emit AuthFeedback(
            bobId,
            charlieId,
            keccak256(abi.encodePacked(block.chainid, address(reputationRegistry), bobId, charlieId, uint256(2)))
        );
        reputationRegistry.acceptFeedback(bobId, charlieId);
    }

    function test_AuthFeedbackEvent_Unauthorized() public {
        vm.prank(alice);
        uint256 aliceId = identityRegistry.newAgent(aliceDomain, alice);
        assertEq(aliceId, 1);

        vm.prank(bob);
        uint256 bobId = identityRegistry.newAgent(bobDomain, bob);
        assertEq(bobId, 2);

        vm.prank(charlie);
        vm.expectRevert(abi.encodeWithSignature("Unauthorized(address,address)", charlie, bob));
        reputationRegistry.acceptFeedback(aliceId, bobId);
    }

    function test_AuthFeedbackEvent_AgentNotFound() public {
        vm.prank(alice);
        uint256 aliceId = identityRegistry.newAgent(aliceDomain, alice);
        assertEq(aliceId, 1);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSignature("AgentNotFound(uint256)", 2));
        reputationRegistry.acceptFeedback(aliceId, 2);
    }

    function test_AuthFeedbackEvent_AgentNotFound_Both() public {
        vm.prank(alice);
        uint256 aliceId = identityRegistry.newAgent(aliceDomain, alice);
        assertEq(aliceId, 1);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSignature("AgentNotFound(uint256)", 2));
        reputationRegistry.acceptFeedback(2, 3);
    }

    function test_Constructor_InvalidIdentityRegistryAddress() public {
        vm.expectRevert(abi.encodeWithSignature("InvalidIdentityRegistryAddress()"));
        new ReputationRegistry(address(0));
    }

    function test_Constructor_ValidIdentityRegistryAddress() public {
        ReputationRegistry repReg = new ReputationRegistry(address(identityRegistry));
        assertEq(address(repReg.identityRegistry()), address(identityRegistry));
    }
}
