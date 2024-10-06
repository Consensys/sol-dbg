pragma solidity 0.8.21;

contract FailingConstructor {
    constructor() public {
        revert();
    }
}

contract Killable {
    function die() public {
        selfdestruct(payable(0x0));
    }
}

contract NestedCreation is Killable {
    Killable k;
    constructor() public {
        k = new Killable();
    }
}

contract NestedCreationFail is Killable {
    constructor() public {
        try new FailingConstructor() returns (FailingConstructor k) {} catch {
            // nada
        }
        Killable k = new Killable();
    }
}
