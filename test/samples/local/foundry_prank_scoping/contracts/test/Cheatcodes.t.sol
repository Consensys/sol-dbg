// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/Counter.sol";

contract CheatcodeTest is Test {
    function setUp() public {
    }

    function prankBegin() public {
	    vm.startPrank(address(0x2));
    }

    function getSender() public returns (address) {
	    return msg.sender;
    }

    function testPrankScoped() public {
	    vm.startPrank(address(0x3));
	    address x = this.getSender();
	    // Expected behavior:
	    //assert(x == address(0x3));
	    // Fail behavior:
	    assertEq(x, address(this));
	    vm.stopPrank();
    }

    function testPrankScopeEscape() public {
	    // Prank should be limited to `this.prankBegin()`
	    this.prankBegin();
	    address x = this.getSender();
	    // Expected behavior:
	    // assert(x == address(this));
	    // Fail behavior:
	    assertEq(x, address(0x2));
    }
}
