pragma solidity 0.8.21;

struct Foo {
    int8 fa;
    int16 fb;
    string fc;
    int[] fd;
}

struct MapStruct {
    int8 msA;
    mapping(address => uint) b1;
}

contract Layout_map {
    uint8 a;
    mapping(int16 => uint32) m1;
    uint8 b;
    mapping(string => Foo) fMap;

    constructor() public {
        a = 1;
        b = 2;
        m1[1] = 42;

        fMap["goo"] = Foo(-1, 1000, "dy", new int[](1));
        fMap["goo"].fd[0] = 100;
    }

    function ping() public {
        a = 101;
        m1[2] = 43;
        fMap["goo"].fb = -1002; 
        revert();
        m1[1] = 10;
        fMap["goo"].fa = 11; 
    }
}
