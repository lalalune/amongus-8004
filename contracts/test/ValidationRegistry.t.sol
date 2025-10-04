// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {ValidationRegistry} from "../src/ValidationRegistry.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {Constants} from "../src/libraries/Constants.sol";

contract ValidationRegistryTest is Test {
    IdentityRegistry identityRegistry;
    ValidationRegistry validationRegistry;

    address alice = address(0x1);
    address bob = address(0x2);
    address charlie = address(0x3);

    string aliceDomain = "alice.com";
    string bobDomain = "bob.agent.com";
    string charlieDomain = "charlie.my.agent.com";

    event ValidationRequest(uint256 indexed agentValidatorId, uint256 indexed agentServerId, bytes32 indexed dataHash);
    event ValidationResponse(
        uint256 indexed agentValidatorId, uint256 indexed agentServerId, bytes32 indexed dataHash, uint8 response
    );

    function setUp() public {
        identityRegistry = new IdentityRegistry();
        validationRegistry = new ValidationRegistry(address(identityRegistry), 1 days);
    }

    function test_ValidationRequestEvent() public {
        vm.prank(alice);
        uint256 aliceId = identityRegistry.newAgent(aliceDomain, alice);
        assertEq(aliceId, 1);

        vm.prank(bob);
        uint256 bobId = identityRegistry.newAgent(bobDomain, bob);
        assertEq(bobId, 2);

        bytes32 dataHash = keccak256(abi.encodePacked("Some important data"));

        vm.prank(bob);
        vm.expectEmit(true, true, true, true);
        emit ValidationRequest(aliceId, bobId, dataHash);
        validationRegistry.validationRequest(aliceId, bobId, dataHash);
    }

    function test_ValidationResponseEvent() public {
        vm.prank(alice);
        uint256 aliceId = identityRegistry.newAgent(aliceDomain, alice);
        assertEq(aliceId, 1);

        vm.prank(bob);
        uint256 bobId = identityRegistry.newAgent(bobDomain, bob);
        assertEq(bobId, 2);

        bytes32 dataHash = keccak256(abi.encodePacked("Some important data"));

        vm.prank(bob);
        validationRegistry.validationRequest(aliceId, bobId, dataHash);

        vm.prank(alice);
        vm.expectEmit(true, true, true, true);
        emit ValidationResponse(aliceId, bobId, dataHash, 1);
        validationRegistry.validationResponse(dataHash, 1);
    }

    function test_ValidationRequest_Unauthorized() public {
        vm.prank(alice);
        uint256 aliceId = identityRegistry.newAgent(aliceDomain, alice);
        assertEq(aliceId, 1);

        vm.prank(bob);
        uint256 bobId = identityRegistry.newAgent(bobDomain, bob);
        assertEq(bobId, 2);

        bytes32 dataHash = keccak256(abi.encodePacked("Some important data"));

        vm.prank(charlie);
        vm.expectRevert(abi.encodeWithSignature("Unauthorized(address,address)", charlie, bob));
        validationRegistry.validationRequest(aliceId, bobId, dataHash);
    }

    function test_ValidationResponse_Unauthorized() public {
        vm.prank(alice);
        uint256 aliceId = identityRegistry.newAgent(aliceDomain, alice);
        assertEq(aliceId, 1);

        vm.prank(bob);
        uint256 bobId = identityRegistry.newAgent(bobDomain, bob);
        assertEq(bobId, 2);

        bytes32 dataHash = keccak256(abi.encodePacked("Some important data"));

        vm.prank(bob);
        validationRegistry.validationRequest(aliceId, bobId, dataHash);

        vm.prank(charlie);
        vm.expectRevert(abi.encodeWithSignature("Unauthorized(address,address)", charlie, alice));
        validationRegistry.validationResponse(dataHash, 1);
    }

    function test_ValidationResponse_RequestNotFound() public {
        bytes32 dataHash = keccak256(abi.encodePacked("Some important data"));

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("RequestNotFound(bytes32)", dataHash));
        validationRegistry.validationResponse(dataHash, 1);
    }

    function test_ValidationResponse_InvalidResponse() public {
        vm.prank(alice);
        uint256 aliceId = identityRegistry.newAgent(aliceDomain, alice);
        assertEq(aliceId, 1);

        vm.prank(bob);
        uint256 bobId = identityRegistry.newAgent(bobDomain, bob);
        assertEq(bobId, 2);

        bytes32 dataHash = keccak256(abi.encodePacked("Some important data"));

        vm.prank(bob);
        validationRegistry.validationRequest(aliceId, bobId, dataHash);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("InvalidResponse(uint8,uint8,uint8)", 255, 0, 100));
        validationRegistry.validationResponse(dataHash, 255);
    }

    function test_ValidationResponse_RequestExpired() public {
        vm.prank(alice);
        uint256 aliceId = identityRegistry.newAgent(aliceDomain, alice);
        assertEq(aliceId, 1);

        vm.prank(bob);
        uint256 bobId = identityRegistry.newAgent(bobDomain, bob);
        assertEq(bobId, 2);

        bytes32 dataHash = keccak256(abi.encodePacked("Some important data"));

        vm.prank(bob);
        validationRegistry.validationRequest(aliceId, bobId, dataHash);

        vm.warp(block.timestamp + 2 days);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSignature(
                "RequestExpired(bytes32,uint256,uint256)", dataHash, block.timestamp, block.timestamp - 1 days
            )
        );
        validationRegistry.validationResponse(dataHash, 1);
    }

    function test_ValidationRequest_AlreadyRequested() public {
        vm.prank(alice);
        uint256 aliceId = identityRegistry.newAgent(aliceDomain, alice);
        assertEq(aliceId, 1);

        vm.prank(bob);
        uint256 bobId = identityRegistry.newAgent(bobDomain, bob);
        assertEq(bobId, 2);

        bytes32 dataHash = keccak256(abi.encodePacked("Some important data"));

        vm.prank(bob);
        validationRegistry.validationRequest(aliceId, bobId, dataHash);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSignature("AlreadyRequested(uint256,uint256,bytes32)", aliceId, bobId, dataHash));
        validationRegistry.validationRequest(aliceId, bobId, dataHash);
    }

    function test_ValidationResponse_AlreadyResponded() public {
        vm.prank(alice);
        uint256 aliceId = identityRegistry.newAgent(aliceDomain, alice);
        assertEq(aliceId, 1);

        vm.prank(bob);
        uint256 bobId = identityRegistry.newAgent(bobDomain, bob);
        assertEq(bobId, 2);

        bytes32 dataHash = keccak256(abi.encodePacked("Some important data"));

        vm.prank(bob);
        validationRegistry.validationRequest(aliceId, bobId, dataHash);

        vm.prank(alice);
        validationRegistry.validationResponse(dataHash, 1);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("AlreadyResponded(uint256,uint256,bytes32)", aliceId, bobId, dataHash));
        validationRegistry.validationResponse(dataHash, 1);
    }

    function test_ValidationRequest_AgentNotFound() public {
        bytes32 dataHash = keccak256(abi.encodePacked("Some important data"));

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSignature("AgentNotFound(uint256)", 1));
        validationRegistry.validationRequest(1, 2, dataHash);
    }

    function test_ValidationRequest_AgentNotFound_Server() public {
        vm.prank(alice);
        uint256 aliceId = identityRegistry.newAgent(aliceDomain, alice);
        assertEq(aliceId, 1);

        bytes32 dataHash = keccak256(abi.encodePacked("Some important data"));

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSignature("AgentNotFound(uint256)", 2));
        validationRegistry.validationRequest(aliceId, 2, dataHash);
    }
}
