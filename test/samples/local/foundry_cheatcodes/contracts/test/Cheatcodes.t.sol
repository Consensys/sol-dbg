// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/Counter.sol";

contract CheatcodeTest is Test {
    function setUp() public {
    }

    function testWarp() public {
        vm.warp(0x42);
        assertEq(block.timestamp, 0x42);
    }
}
