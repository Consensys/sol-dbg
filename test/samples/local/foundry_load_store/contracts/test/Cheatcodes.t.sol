// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/Counter.sol";

contract CheatcodeTest is Test {
    function setUp() public {
    }

    function testLoad() public {
	    Counter c = new Counter();
	    c.setNumber(0x10);
	    uint256 n = uint256(vm.load(address(c), bytes32(uint256(0x0))));
	    assertEq(n, 0x11);
    }

    function testStore() public {
	    Counter c = new Counter();
	    c.setNumber(0x10);
	    vm.store(address(c), bytes32(uint256(0x0)), bytes32(uint256(0x13)));
	    assertEq(c.number(), 0x14);
    }
}
