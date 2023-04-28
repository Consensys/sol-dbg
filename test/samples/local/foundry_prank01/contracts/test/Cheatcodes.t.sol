// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/Counter.sol";

contract CheatcodeTest is Test {
    function setUp() public {
    }

    function testPrank() public {
	    Counter c = new Counter();
	    vm.prank(address(0x42));

	    address x = c.getSender();

	    assertEq(x, address(0x43));
    }

    function testPrankDone() public {
	    Counter c = new Counter();
	    vm.prank(address(0x42));

	    address x = c.getSender();
	    assertEq(x, address(0x42));
	    x = c.getSender();

	    assertEq(x, address(0x42));
    }
}
