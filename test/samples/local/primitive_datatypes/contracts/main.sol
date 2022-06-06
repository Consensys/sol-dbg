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

    function isPositive(DummyInt16 t) public {
        assert(DummyInt16.unwrap(t) > 0);
    }

    function shouldBeO3(E e) public {
        assert(e == E.O3);
    }

    function wasntMe(address a) public {
        assert(a != address(this));
    }

    function isAll42(bytes7 b) public {
        for (uint i = 0; i < 7; i++) {
            assert(b[i] == bytes1(0x2a));
        }
    }

    function areDifferent(bool shouldBeDiff, bytes5 a, bytes5 b) public {
        bytes5 c = a ^ b;
        if (shouldBeDiff) {
            assert(c == bytes5(uint40((1 << 40) - 1)));
        } else {
            assert(c == bytes5(uint40(0x0)));
        }
    }

    function isConcat(int n, int128 lowerHalf, int128 upperHalf) public {
        int t = (int(upperHalf) << 128) | int(lowerHalf);
        assert(n == t);
    }

    function wasntMe2(address a) public {
        checkItsNotMe(this, a);
    }

    function checkItsNotMe(Failing f, address a) public {
        assert(a != address(f));
    }
}
