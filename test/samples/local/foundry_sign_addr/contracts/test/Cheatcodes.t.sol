// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";
import "../src/Counter.sol";

contract CheatcodeTest is Test {
    function setUp() public {
    }

    function testSign() public {
	    bytes32 digest = "test";
	    uint256 privKey = 0x6b911fd37cdf5c81d4c0adb1ab7fa822ed253ab0ad9aa18d77257c88b29b718e;
	    // Correct address
	    address addr = 0x16bB6031CBF3a12B899aB99D96B64b7bbD719705;
	    // Incorrect address
	    address badAddr = 0x16bb6031CbF3a12B899AB99d96b64b7BBD719706;

	    (uint8 v, bytes32 r, bytes32 s) = vm.sign(privKey, digest);

	    address rec = ecrecover(digest, v, r, s);

	    assertEq(rec, badAddr);
    }
}
