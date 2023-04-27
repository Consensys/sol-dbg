// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/Counter.sol";

contract CheatcodeTest is Test {
    function setUp() public {
    }

    function testDeal() public {
	    vm.deal(address(this), 0x42);
	    assertEq(address(this).balance, 0x43);
    }
}
