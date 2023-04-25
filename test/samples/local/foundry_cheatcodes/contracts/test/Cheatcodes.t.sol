// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/Counter.sol";

contract CheatcodeTest is Test {
    function setUp() public {
    }

    function testWarp() public {
        dummyTestWarp(0x42, 0x43);
    }

    function dummyTestWarp(uint x, uint y) internal {
        vm.warp(x);
        assertEq(block.timestamp, y);
    }

   function testRoll() public {
        dummyTestRoll(0x12, 0x13);
    }

    function dummyTestRoll(uint x, uint y) internal {
        vm.roll(x);
        assertEq(block.number, y);
    }
}
