pragma solidity 0.8.21;

contract Base {
    uint8 a;

    constructor() public {
        a = 1;
    }
}

contract Layout_no_base is Base {
    int8 b;

    constructor() public {
        b = -1;
    }

    function ping() public {}
}
