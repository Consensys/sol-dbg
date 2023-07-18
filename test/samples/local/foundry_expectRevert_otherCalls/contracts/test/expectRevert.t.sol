// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";

contract Bomb {
	constructor() public {
		revert();
	}
}

contract Bomb2 {
	constructor() public {
	}

    function boom() public view returns (uint256){
        revert();
    }

    function noBoom() public view returns (uint256){
        return 1;
    }
}

library LibBomb {
    function boom() external view returns (uint256){
        revert();
    }

    function noBoom() external view returns (uint256){
        return 1;
    }
}

contract Test_expectRevertOtherCalls is Test {
    Bomb2 b;
    event AssertionFailed(string message);

    error E1();
    error E2(string m);

    uint256 private c;

    constructor() {
        b = new Bomb2();
    }

    function test_expectRevertNested_0() external returns (uint256) {
        vm.expectRevert(); // Expected to fail
        try new Bomb() returns (Bomb b) {
            assert(false); //should get here
        } catch {
            return 3;
        }
    }

    function test_expectRevertNested_1() external returns (uint256) {
        vm.expectRevert(); // Expected to fail
        try new Bomb{salt: bytes32(uint(1))}() returns (Bomb b) {
            assert(false); //should get here
        } catch {
            return 3;
        }
    }

    function test_expectRevertNested_2() external returns (uint256) {
        vm.expectRevert(); // Expected to fail
        try new Bomb{salt: bytes32(uint(1))}() returns (Bomb b) {
            assert(false); //should get here
        } catch {
            return 3;
        }
    }

    function test_expectRevertNested_3() external returns (uint256) {
        vm.expectRevert(); // Expected to fail
        try b.boom() returns (uint256 x) {
            assert(false); //should get here
        } catch {
            return 3;
        }
    }

    function test_expectRevertNested_4() external returns (uint256) {
        vm.expectRevert(); // Expected to fail
        try b.noBoom() returns (uint256 x) {
            return 3;
        } catch {
            assert(false); //should get here
        }
    }

/*
    // Don't support these as `fuzz forge test` command doesn't yet support linked libraries
    function test_expectRevertNested_5() external returns (uint256) {
        vm.expectRevert(); // Expected to fail
        try LibBomb.boom() returns (uint256 x) {
            assert(false); //should get here
        } catch {
            return 3;
        }
    }

    function test_expectRevertNested_6() external returns (uint256) {
        vm.expectRevert(); // Expected to fail
        try LibBomb.noBoom() returns (uint256 x) {
            return 3;
        } catch {
            assert(false); //should get here
        }
    }
    */
}
