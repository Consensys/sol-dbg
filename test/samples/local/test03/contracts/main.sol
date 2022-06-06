contract Failing {
    uint x;
    constructor(uint arg) {
        x = arg;
    }

    function incBy4(uint by) public returns (uint res) {
	by = by * 2;
	inc(by);
    return inc(by);
    }

    function inc(uint by) public returns (uint) {
        uint t = x = x + by;
        x = t;
        assert(x < 100);

        return x;
    }
}
