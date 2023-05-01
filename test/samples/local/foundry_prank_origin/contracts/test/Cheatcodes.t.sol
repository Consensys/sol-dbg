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

    function getSenderAndOrigin() public returns (address, address) {
	    return (msg.sender, tx.origin);
    }

    function testBothPranksCorrect() public {
	    address oldOrigin = tx.origin;
	    vm.startPrank(address(0x1), address(0x2));
	    (address x, address y) = this.getSenderAndOrigin();

	    assertEq(x, address(0x1));
	    assertEq(y, address(0x2));

	    vm.stopPrank();

	    vm.startPrank(address(0x3));
	    (x, y) = this.getSenderAndOrigin();

	    assertEq(x, address(0x3));
	    assertEq(y, oldOrigin);
    }

    function testBothPranks01() public {
	    address oldOrigin = tx.origin;
	    vm.startPrank(address(0x1), address(0x2));
	    (address x, address y) = this.getSenderAndOrigin();

	    assertEq(x, address(0x42)); // fail here
	    assertEq(y, address(0x2));

	    vm.stopPrank();

	    vm.startPrank(address(0x3));
	    (x, y) = this.getSenderAndOrigin();

	    assertEq(x, address(0x3));
	    assertEq(y, oldOrigin);
    }

    function testBothPranks02() public {
	    address oldOrigin = tx.origin;
	    vm.startPrank(address(0x1), address(0x2));
	    (address x, address y) = this.getSenderAndOrigin();

	    assertEq(x, address(0x1));
	    assertEq(y, address(0x42)); // fail here

	    vm.stopPrank();

	    vm.startPrank(address(0x3));
	    (x, y) = this.getSenderAndOrigin();

	    assertEq(x, address(0x3));
	    assertEq(y, oldOrigin);
    }

    function testBothPranks03() public {
	    address oldOrigin = tx.origin;
	    vm.startPrank(address(0x1), address(0x2));
	    (address x, address y) = this.getSenderAndOrigin();

	    assertEq(x, address(0x1));
	    assertEq(y, address(0x2)); 

	    vm.stopPrank();

	    vm.startPrank(address(0x3));
	    (x, y) = this.getSenderAndOrigin();

	    assertEq(x, address(0x3));
	    assertEq(y, address(0x2));// fail here
    }
}
