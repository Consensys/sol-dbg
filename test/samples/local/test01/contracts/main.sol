contract Failing {
    uint x;
    constructor(uint arg) {
        x = arg;
    }

    function inc(uint by) public returns (uint) {
        uint t = x = x + by;
        x = t;
        assert(x < 100);

        return x;
    }
}