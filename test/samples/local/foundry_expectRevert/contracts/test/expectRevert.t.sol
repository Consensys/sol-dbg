// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Test.sol";

contract Bomb {
    function boom() external {
        selfdestruct(payable(msg.sender));
    }
}

contract Test_expectRevert is Test {
    event AssertionFailed(string message);

    error E1();
    error E2(string m);

    uint256 private c;

    function reverting() external returns (uint256) {
        require(msg.sender == address(this));
        revert E1();
        return 1;
    }

    function test_expectRevert_0() external returns (uint256) {
        vm.expectRevert();
        try this.reverting() returns (uint256 r) {
            if (r != 0) {
                return 2;
            }

            assert(false); //should get here
        } catch {
            return 1;//shouldnt get here
        }
    }

    function notReverting() external returns (uint256) {
        require(msg.sender == address(this));
        return 1;
    }

    function test_expectRevert_1() external returns (uint256) {
        vm.expectRevert();  // expected to fail
        try this.notReverting() returns (uint256 r) {
            return 1;
        } catch {
            assert(false); //should get here
        }
    }

    function missingCall() external returns (uint256) {
        require(msg.sender == address(this));
        vm.expectRevert();  // expected to fail
        return 1;
    }

    function test_expectRevert_2() external returns (uint256) {
        try this.missingCall() returns (uint256 r) {
            return 1;
        } catch {
            assert(false); //should get here
        }
        return 2;
    }

    function test_expectRevert_3() external returns (uint256) {
        vm.expectRevert();
        vm.assume(true);
        try this.reverting() returns (uint256 r) {
            if (r != 0) {
                return 1;
            }
            assert(false); // should get here;
        } catch {
            return 2;
        }
    }

/*
    function test_expectRevert_4() external returns (uint256) {
        vm.expectRevert();
        vm.expectRevert();
        try this.reverting() returns (uint256 r) {
            if (r != 0) {
                emit AssertionFailed("test_expectRevert_4@1"); assert(false);
            }
            return r;
        } catch {
            emit AssertionFailed("test_expectRevert_4@2"); assert(false);
            return 1;
        }
    }
*/

    function reverting2() external returns (uint256, uint256) {
        require(msg.sender == address(this));
        revert E1();
        return (1, 1);
    }

    function test_expectRevert_5() external returns (uint256) {
        vm.expectRevert();
        try this.reverting2() returns (uint256 r0, uint256 r1) {
            if (r0 != 0) {
                return 1;
            }
            if (r1 != 0) {
                return 2;
            }
            assert(false); // should get here
        } catch {
            return 3;
        }
    }

    function test_stop() external {
        assembly {
            stop()
        }
    }

    function missingCall2() external {
        vm.expectRevert();
        assembly {
            stop()
        }
    }

    function test_expectRevert_stop() external {
        try this.missingCall() {
        } catch {
            assert(false); // Should get here
        }
    }

    function reverting3() external returns (uint256, uint256) {
        require(msg.sender == address(this));
        revert("M0001");
        return (1, 1);
    }

    function test_expectRevert_6() external returns (uint256) {
        vm.expectRevert();
        try this.reverting3() returns (uint256 r0, uint256 r1) {
            if (r0 != 0) {
                return 2;
            }
            if (r1 != 0) {
                emit AssertionFailed("test_expectRevert_6@2");
                return 3;
            }
            assert(false);// Should get here
            return r0 + r1;
        } catch {
            emit AssertionFailed("test_expectRevert_6@3"); 
            return 1;
        }
    }

    function reverting4() external returns (uint256[] memory r) {
        require(msg.sender == address(this));
        revert E2("M0002");
        r = new uint[](2);
        r[0] = 1;
        r[1] = 1;
    }

    function test_expectRevert_7() external returns (uint256) {
        vm.expectRevert();
        try this.reverting4() returns (uint256[] memory r) {
            if (0 < r.length) {
                emit AssertionFailed("test_expectRevert_7@1"); 
                return 2;
            }
            assert(false);// Shouldn't get here
            return r.length;
        } catch {
            emit AssertionFailed("test_expectRevert_7@2"); 
            return 1;
        }
    }

    function test_expectRevert_8() external returns (uint256) {
        vm.expectRevert("M0001");
        try this.reverting3() returns (uint256 r0, uint256 r1) {
            if (r0 != 0) {
                emit AssertionFailed("test_expectRevert_8@1"); return 2;
            }
            if (r1 != 0) {
                emit AssertionFailed("test_expectRevert_8@2"); return 3;
            }
            assert(false);// Should get here
            return r0 + r1;
        } catch {
            emit AssertionFailed("test_expectRevert_8@3"); assert(false);// Shouldn't get here
            return 1;
        }
    }

    function test_expectRevert_9() external returns (uint256) {
        vm.expectRevert("M0003");  // expected to fail
        try this.reverting3() returns (uint256 r0, uint256 r1) {
            emit AssertionFailed("test_expectRevert_9@1");
            return r0 + r1;
        } catch {
            emit AssertionFailed("test_expectRevert_9@2");
            assert(false);
        }
    }

    function test_expectRevert_10() external returns (uint256) {
        vm.expectRevert(E1.selector);
        try this.reverting2() returns (uint256 r0, uint256 r1) {
            if (r0 != 0) {
                emit AssertionFailed("test_expectRevert_10@1"); return 2;
            }
            if (r1 != 0) {
                emit AssertionFailed("test_expectRevert_10@2"); return 3;
            }
            assert(false);// Should get here
            return r0 + r1;
        } catch {
            emit AssertionFailed("test_expectRevert_10@3"); 
            return 1;
        }
    }

    function test_expectRevert_11() external returns (uint256) {
        vm.expectRevert(E2.selector);  // expected to fail
        try this.reverting2() returns (uint256 r0, uint256 r1) {
            emit AssertionFailed("test_expectRevert_11@1"); 
            return r0 + r1;
        } catch {
            emit AssertionFailed("test_expectRevert_11@2");
            assert(false);// Should get here
        }
    }

    function reverting5() external returns (uint256) {
        require(msg.sender == address(this));
        return uint256(0) - uint256(1);
    }

    function test_expectRevert_12() external returns (uint256) {
        vm.expectRevert(abi.encodeWithSignature("Panic(uint256)", 0x11));
        try this.reverting5() returns (uint256 r) {
            if (r != 0) {
                emit AssertionFailed("test_expectRevert_12@1");
                return 2;
            }
            assert(false);// Should get here
            return r;
        } catch {
            emit AssertionFailed("test_expectRevert_12@2"); 
            return 1;
        }
    }

    function test_expectRevert_13() external returns (uint256) {
        vm.expectRevert(abi.encodeWithSignature("Panic(uint256)", 0x0));  // expected to fail
        try this.reverting5() returns (uint256 r) {
            emit AssertionFailed("test_expectRevert_13@1");
            return r;
        } catch {
            emit AssertionFailed("test_expectRevert_13@2");
            assert(false);
        }
    }

/*
    function notReverting2() external returns (uint256 r) {
        require(msg.sender == address(this));
        c = 0;
        while (true) { c++; }
        return c;
    }

    function test_expectRevert_14() external returns (uint256) {
        vm.expectRevert();  // expected to fail
        try this.notReverting2() returns (uint256 r) {
            emit AssertionFailed("test_expectRevert_14@1"); assert(false);
            return r;
        } catch {
            emit AssertionFailed("test_expectRevert_14@2"); assert(false);
            return 1;
        }
    }
*/

    function notReverting3() external {
        require(msg.sender == address(this));
    }

    function test_expectRevert_15() external returns (uint256) {
        vm.expectRevert();  // expected to fail
        try this.notReverting3() {
            emit AssertionFailed("test_expectRevert_15@1");
            return 1;
        } catch {
            emit AssertionFailed("test_expectRevert_15@2");
            assert(false);
        }
    }

    function notReverting4() external {
        require(msg.sender == address(this));
        assembly { stop() }
    }

    function test_expectRevert_16() external returns (uint256) {
        vm.expectRevert();  // expected to fail
        try this.notReverting4() {
            emit AssertionFailed("test_expectRevert_16@1");
            return 1;
        } catch {
            emit AssertionFailed("test_expectRevert_16@2");
            assert(false);
        }
    }

    function notReverting5() external {
        require(msg.sender == address(this));
        assembly { invalid() }
    }

    function test_expectRevert_17() external returns (uint256) {
        vm.expectRevert();
        try this.notReverting5() {
            emit AssertionFailed("test_expectRevert_17@1");
            assert(false);
            return 1;
        } catch {
            emit AssertionFailed("test_expectRevert_17@2");
        }
    }

    function notReverting6() external {
        require(msg.sender == address(this));
        assembly { invalid() }
    }

    function test_expectRevert_18() external returns (uint256) {
        Bomb b = new Bomb();
        vm.expectRevert();  // expected to fail
        try b.boom() {
            emit AssertionFailed("test_expectRevert_18@1");
            return 1;
        } catch {
            emit AssertionFailed("test_expectRevert_18@2");
            assert(false);// Should get here
        }
    }

    function test_expectRevert_19() external returns (uint256) {
        vm.expectRevert(bytes(""));  // expected to fail
        try this.notReverting() {
            emit AssertionFailed("test_expectRevert_19@1");
            return 1;
        } catch {
            emit AssertionFailed("test_expectRevert_19@2");
            assert(false);// Should get here
        }
    }

    function reverting6() external {
        require(msg.sender == address(this));
        revert();
    }

    function test_expectRevert_20() external returns (uint256) {
        vm.expectRevert(bytes(""));
        try this.reverting6() {
            assert(false);// Should get here
        } catch {
            emit AssertionFailed("test_expectRevert_20@2");
            return 1;
        }
    }

    function reverting7() external {
        require(msg.sender == address(this));
        revert E1();
    }

    function test_expectRevert_21() external returns (uint256) {
        vm.expectRevert("M0001");  // expected to fail
        try this.reverting7() {
            emit AssertionFailed("test_expectRevert_21@1");
            return 1;
        } catch {
            emit AssertionFailed("test_expectRevert_21@2");
            assert(false);
        }
    }

    function test_expectRevert_22() external returns (uint256) {
        vm.expectRevert(E1.selector);  // expected to fail
        try this.reverting3() {
            emit AssertionFailed("test_expectRevert_22@1");
            return 1;
        } catch {
            emit AssertionFailed("test_expectRevert_22@2");
            assert(false);
        }
    }

    function reverting8() external {
        assert(block.number != 42);
    }

    function test_expectRevert_23() external returns (uint256) {
        vm.roll(41);
        vm.expectRevert();
        vm.roll(42);
        try this.reverting8() {
            assert(false);
        } catch {
            return 1;
        }
    }
}
