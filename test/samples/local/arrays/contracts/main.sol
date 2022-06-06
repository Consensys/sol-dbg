type DummyInt16 is int16;

contract Arrays {
    constructor() { }

    function allNonZero(uint[] memory arr) public {
        for (uint i = 0; i < arr.length; i++) {
            assert(arr[i] != 0);
        }
    }

    function allNonZeroExt(uint[] calldata arr) public {
        for (uint i = 0; i < arr.length; i++) {
            assert(arr[i] != 0);
        }
    }

    function noByte42(bytes memory b) public {
        for (uint i = 0; i < b.length; i++) {
           assert(b[i] != 0x2a);
        }
    }

    function checkBytesEq(bytes memory a, bytes memory b) public {
        assert(a.length == b.length);
        for (uint i = 0; i < a.length; i++) {
            assert(a[i] == b[i]);
        }
    }

    function checkStrEq(string memory a, string memory b) public {
        checkBytesEq(bytes(a), bytes(b));
    }

    function noZeros2D(int16[][] memory arr) public {
        for (uint i = 0; i < arr.length; i++) {
            for (uint j = 0; j < arr[i].length; j++) {
                assert(arr[i][j] != 0);
            }
        }
    }

    function noZeros3D(uint8[][][] memory arr) public {
        for (uint i = 0; i < arr.length; i++) {
            for (uint j = 0; j < arr[i].length; j++) {
                for (uint k = 0; k < arr[i][j].length; k++) {
                    assert(arr[i][j][k] != 0);
                }
            }
        }
    }

    function noByte422D(bytes[] memory arr) public {
        for (uint i = 0; i < arr.length; i++) {
            noByte42(arr[i]);
        }
    }

    function bytesEq(bytes memory a, bytes memory b) public returns (bool) {
        if (!(a.length == b.length)) {
            return false;
        }

        for (uint i = 0; i < a.length; i++) {
            if ((a[i] != b[i])) {
                return false;
            }
        }

        return true;
    }

    function checkStrNEq(string memory a, string memory b) public {
        assert(!bytesEq(bytes(a), bytes(b)));
    }

    function noStringInArr(string[] memory arr, string memory badStr) public {
        for (uint i = 0; i < arr.length; i++) {
            checkStrNEq(arr[i], badStr);
        }
    }
}
