// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/Counter.sol";

contract CheatcodeTest is Test {
    function setUp() public {
    }

    function testWarp() public {
        dummy(0x42, 0x43);
    }

    function dummy(uint x, uint y) internal {
        vm.warp(x);
        assertEq(block.timestamp, y);
    }
}
