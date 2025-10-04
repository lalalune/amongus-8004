// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {IdentityRegistry} from "../src/IdentityRegistry.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {ValidationRegistry} from "../src/ValidationRegistry.sol";

contract Deploy is Script {
    function run() external {
        vm.startBroadcast();

        // Deploy IdentityRegistry
        IdentityRegistry identityRegistry = new IdentityRegistry();
        console.log("IdentityRegistry deployed at:", address(identityRegistry));

        // Deploy ReputationRegistry
        ReputationRegistry reputationRegistry = new ReputationRegistry(address(identityRegistry));
        console.log("ReputationRegistry deployed at:", address(reputationRegistry));

        // Deploy ValidationRegistry (with 7 day TTL)
        ValidationRegistry validationRegistry = new ValidationRegistry(address(identityRegistry), 7 days);
        console.log("ValidationRegistry deployed at:", address(validationRegistry));

        vm.stopBroadcast();
    }
}

