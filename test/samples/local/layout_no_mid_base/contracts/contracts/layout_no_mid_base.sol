pragma solidity 0.8.21;

contract Base {
    uint8 a;

    constructor() public {
        a = 1;
    }
}

contract MidBase is Base {
    int8 b;

    constructor() public {
        b = -1;
    }
}

contract Layout_no_mid_base is MidBase {
    int8 c;

    constructor() public {
        c = 2;
    }

    function ping() public {}
}
