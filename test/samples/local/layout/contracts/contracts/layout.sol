pragma solidity 0.8.21;

struct Foo {
    int8 fa;
    int16 fb;
    string fc;
    int[] fd;
}

contract Layout {
    uint8 a;
    int8 b;
    uint24 c;
    int32 d;
    // Next one overflows to next slot
    int192 e;
    // Next one should be in fresh slot too
    int[] f;
    // Next two should be in a single slot
    int8[3] g;
    uint8[3] h;
    string i;
    bytes j;
    uint8 k;
    bytes4 l;
    string m;
    int8 n;

    uint separator0;
    int8 o;
    Foo p;
    int separator1;
    int8 q;
    Foo[] r;

    constructor() public {
        a = 8;
        b = -7;
        c = 16777215;
        d = -2147483648;
        e = 3138550867693340381917894711603833208051177722232017256447;

        f = [int(42), 43, -44, -45];

        g = [-5, -6, -7];

        h = [8, 9, 10];

        i = "Hello world";

        j = hex"0102030405060708090a";

        k = 5;
        l = 0x01020304;

        m = "ab";

        n = -1;

        o = -2;

        p = Foo(-100, -101, "hi", new int[](2));
        p.fd[0] = 10;
        p.fd[1] = 9;

        q = -3;

        r.push(Foo(-120, -201, "ho", new int[](0)));
        r.push(Foo(-128, -301, "hu", new int[](1)));

        r[1].fd[0] = 8;
    }

    function addF(int x) public {
        f.push(x);
    }
}
