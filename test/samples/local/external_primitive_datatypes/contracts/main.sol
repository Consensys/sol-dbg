type DummyInt16 is int16;

contract Failing {
    uint x;

    enum E {
        O1,
        O2,
        O3,
        O4
    }
    constructor(uint arg) {
        x = arg;
    }

    function isPositive(DummyInt16 t) external {
        assert(DummyInt16.unwrap(t) > 0);
    }

    function shouldBeO3(E e) external {
        assert(e == E.O3);
    }

    function wasntMe(address a) external {
        assert(a != address(this));
    }

    function isAll42(bytes7 b) external {
        for (uint i = 0; i < 7; i++) {
            assert(b[i] == bytes1(0x2a));
        }
    }

    function areDifferent(bool shouldBeDiff, bytes5 a, bytes5 b) external {
        bytes5 c = a ^ b;
        if (shouldBeDiff) {
            assert(c == bytes5(uint40((1 << 40) - 1)));
        } else {
            assert(c == bytes5(uint40(0x0)));
        }
    }

    function isConcat(int n, int128 lowerHalf, int128 upperHalf) external {
        int t = (int(upperHalf) << 128) | int(lowerHalf);
        assert(n == t);
    }

    function wasntMe2(address a) external {
        checkItsNotMe(this, a);
    }

    function checkItsNotMe(Failing f, address a) public {
        assert(a != address(f));
    }
}
