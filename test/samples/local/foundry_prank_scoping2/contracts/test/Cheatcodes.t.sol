// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/Counter.sol";

contract CheatcodeTest is Test {
    function setUp() public {
    }

    function B() public {
	    assertEq(msg.sender, address(this));
	    assertEq(tx.origin, address(0x2));
    }

    function A() public {
	    assertEq(msg.sender, address(0x1));
	    assertEq(tx.origin, address(0x2));

	    this.B();

	    assertEq(msg.sender, address(0x1));
	    assertEq(tx.origin, address(0x2));

    }


    address oldSender ;
    address oldOrigin ;

    function testStop() public {
	    oldSender = msg.sender;
	    oldOrigin = tx.origin;

	    vm.startPrank(address(0x1), address(0x2));
	    assertEq(msg.sender, oldSender);
	    assertEq(tx.origin, oldOrigin);
	    this.A();

	    this.A();
	    assertEq(msg.sender, oldSender);
	    assertEq(tx.origin, oldOrigin);
    }
}
