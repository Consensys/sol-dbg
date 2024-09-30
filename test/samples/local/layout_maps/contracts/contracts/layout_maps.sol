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
    mapping(address => uint) balance;
    mapping(address => string) name;
    mapping(string => string) sMap;
    mapping(string => Foo) fMap;
    mapping(string => Foo) emptyFMap;
    mapping(uint => mapping(string => bytes)) nestedMap;
    mapping(int8 => int8)[] arrOfMaps;
    mapping(int8 => int8[]) mapOfArrs;

    mapping(bytes => int8) byteKeyMap;

    constructor() public {
        a = 1;
        b = 2;
        m1[1] = 42;
        m1[-1] = 4200;

        balance[0xAaaaAaAAaaaAAaAAaAaaaaAAAAAaAaaaAaAaaAA0] = 500;
        balance[0xAaAaaAAAaAaaAaAaAaaAAaAaAAAAAaAAAaaAaAa2] = 501;
        balance[0xafFEaFFEAFfeAfFEAffeaFfEAfFEaffeafFeAFfE] = 502;

        name[0xAaaaAaAAaaaAAaAAaAaaaaAAAAAaAaaaAaAaaAA0] = "foo";
        name[0xAaAaaAAAaAaaAaAaAaaAAaAaAAAAAaAAAaaAaAa2] = "barbarbar";

        sMap["boo"] = "baz";
        sMap["doo"] = "daz";

        fMap["goo"] = Foo(-1, 1000, "dy", new int[](1));
        fMap["goo"].fd[0] = 100;

        nestedMap[1]["boo"] = hex"deadbeef";
        nestedMap[42]["ow"] = hex"eeeeeeee";
        arrOfMaps.push();
        arrOfMaps.push();
        arrOfMaps[0][42] = 43;
        arrOfMaps[1][43] = 44;

        mapOfArrs[43] = new int8[](3);
        mapOfArrs[43][0] = 5;
        mapOfArrs[43][1] = 6;

        byteKeyMap[hex"01020304"] = 12;
    }

    function ping() public {}
}
