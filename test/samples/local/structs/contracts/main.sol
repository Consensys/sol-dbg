contract Structs {
    constructor() { }

    struct TwoNums {
        uint x;
        uint y;
    }

    function sumIsEven(TwoNums memory s) public {
        assert((s.x + s.y) % 2 == 0);
    }

    function sumIsEvenCalldata(TwoNums calldata s) public {
        assert((s.x + s.y) % 2 == 0);
    }
    
    struct StrAndLen {
        string s;
        uint i;
    }

    function lenOk(StrAndLen memory x) public {
        assert(x.i == bytes(x.s).length);
    }

    function lenOkCalldata(StrAndLen calldata x) public {
        assert(x.i == bytes(x.s).length);
    }

    function lenOkExternal(StrAndLen calldata x) external {
        assert(x.i == bytes(x.s).length);
    }

    struct Point {
        uint x;
        uint y;
    }

    struct Line {
        Point start;
        Point end;    
    }

    function checkStraight(Line memory l) public {
        assert(l.start.x == l.end.x || l.start.y == l.end.y);
    }

    function checkStraightExternal(Line calldata l) external{
        assert(l.start.x == l.end.x || l.start.y == l.end.y);
    }
}
