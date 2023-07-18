// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";

contract Test_expectRevertNested is Test {
    event AssertionFailed(string message);

    error E1();
    error E2(string m);

    uint256 private c;

    function reverting() external returns (uint256) {
        require(msg.sender == address(this));
        revert E1();
        return 1;
    }

    function callRevertingNoRevert() external returns (uint256) {
	try this.reverting() {
        	assert(false);
	} catch {
		return 1;
	}
    }

    function test_expectRevertNested_0() external returns (uint256) {
        vm.expectRevert(); // Expected to fail
        try this.callRevertingNoRevert() returns (uint256 r) {
            return 3;
        } catch {
            assert(false); //should get here
        }
    }

    function notReverting() external returns (uint256) {
        require(msg.sender == address(this));
        return 1;
    }

    function callNotRevertingReverts() external returns (uint256) {
	try this.notReverting() {
        	assert(false);
	} catch {
		return 1;
	}
    }

    function test_expectRevertNested_1() external returns (uint256) {
        vm.expectRevert();
        try this.callNotRevertingReverts() returns (uint256 r) {
            assert(false); //should get here
        } catch {
            return 3;//shouldnt get here
        }
    }

    function callRevertingReverts() external returns (uint256) {
	try this.reverting() {
		return 1;
	} catch {
        	assert(false);
	}
    }

    function test_expectRevertNested_2() external returns (uint256) {
        vm.expectRevert();
        try this.callRevertingReverts() returns (uint256 r) {
            assert(false); //should get here
        } catch {
            return 3;//shouldnt get here
        }
    }

    function reverting_1() external returns (uint256) {
        require(msg.sender == address(this));
	assembly { stop() }
        return 1;
    }

    function callRevertingReverts_1() external returns (uint256) {
	try this.reverting_1() {
		return 1;
	} catch {
        	assert(false);
	}
    }

    function test_expectRevertNested_3() external returns (uint256) {
        vm.expectRevert();
        try this.callRevertingReverts_1() returns (uint256 r) {
            assert(false); //should get here
        } catch {
            return 3;//shouldnt get here
        }
    }

    function callRevertingReverts_2() external returns (uint256) {
	try this.reverting() {
		return 1;
	} catch {
		assembly { invalid() }
	}
    }

    function test_expectRevertNested_4() external returns (uint256) {
        vm.expectRevert();
        try this.callRevertingReverts_2() returns (uint256 r) {
            assert(false); //should get here
        } catch {
            return 3;//shouldnt get here
        }
    }
}
