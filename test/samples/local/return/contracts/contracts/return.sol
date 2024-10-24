pragma solidity 0.8.21;

contract Returns {
    struct S {
        int8 a;
        bool[] b;
        string c;
    }

    constructor() public {}

    uint x;

    function noRet() public {
      x = 1;
    }

    function returnUint() public returns (uint) {
        return 42;
    }

    function returnInt8() public returns (int8) {
        return -2;
    }

    function returnPair() public returns (int8, bool) {
        return (-11, true);
    }

    function returnTuple() public returns (int8, string memory, bool) {
        return (-12, "hoho", false);
    }

    function returnArr() public returns (int8[] memory) {
        int8[] memory x = new int8[](4);
        x[0] = -1;
        x[1] = this.returnInt8();
        x[2] = -3;
        return x;
    }

    function returnStr() public returns (string memory) {
        return "why doe";
    }

    function returnStruct() public returns (S memory) {
        bool[] memory b = new bool[](2);
        b[1] = true;

        S memory s = S(-1, b, "seriously");
        return s;
    }

    function main() public {
        this.noRet();
        this.returnUint();
        this.returnInt8();
        this.returnPair();
        this.returnTuple();
        this.returnArr();
        this.returnStr();
        this.returnStruct();
    }
}
