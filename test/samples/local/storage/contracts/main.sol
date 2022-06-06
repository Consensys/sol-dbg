type T is uint24;

contract Storage {
    constructor() { n = 42; }

    uint n;

    struct TwoNums {
        uint x;
        uint y;
    }

    TwoNums s2Nums;

    struct TwoI16s {
        int16 a;
        int16 b;
    }

    function sumIsEven(TwoNums memory s) public {
        s2Nums = s;
        sumIsEvenStorage(s2Nums);
    }

    function sumIsEvenStorage(TwoNums storage s) internal {
        assert((s.x + s.y) % 2 == 0);
    }

    TwoI16s i16Nums;

    function sumIsEven16(TwoI16s memory s) public {
        i16Nums = s;
        sumIsEven16Storage(i16Nums);
    }

    function sumIsEven16Storage(TwoI16s storage s) internal {
        assert((s.a + s.b) % 2 == 0);
    }
    
    struct StrAndLen8 {
        uint8 i;
        string s;
    }

    StrAndLen8 sal8;

    function lenOk(StrAndLen8 memory x) public {
        sal8 = x;
        lenOkStorage(sal8);
    }

    function lenOkStorage(StrAndLen8 storage x) internal {
        assert(x.i == bytes(x.s).length);
    }

    struct Point {
        int24 x;
        uint16 y;
    }

    struct Line {
        Point start;
        Point end;    
    }

    Line sL;

    function checkStraight(Line memory l) public {
        sL = l;
        checkStraightStorage(sL);
    }

    function checkStraightStorage(Line storage l) internal {
        assert(l.start.x == l.end.x || l.start.y == l.end.y);
    }

    uint[] u256_nums;
    function allMoreThan1(uint[] memory nums) public {
        u256_nums = nums;
        allMoreThan1Storage(u256_nums);
    }

    function allMoreThan1Storage(uint[] storage nums) internal {
        for (uint i = 0; i < nums.length; i++) {
            assert(nums[i] > 1);
        }
    }

    uint56[] u56_nums;
    function allMoreThan1_u56(uint56[] memory nums) public {
        u56_nums = nums;
        allMoreThan1Storage_u56(u56_nums);
    }

    function allMoreThan1Storage_u56(uint56[] storage nums) internal {
        for (uint i = 0; i < nums.length; i++) {
            assert(nums[i] > 1);
        }
    }

    uint[][] u256_nums2d;
    function allMoreThan1_2d(uint[][] memory nums) public {
        u256_nums2d = nums;
        allMoreThan1Storage_2d(u256_nums2d);
    }

    function allMoreThan1Storage_2d(uint[][] storage nums) internal {
        for (uint i = 0; i < nums.length; i++) {
            for (uint j = 0; j < nums[i].length; j++) {
                assert(nums[i][j] > 1);
            }
        }
    }

    uint104[][] u104_nums2d;
    function allMoreThan1_u104_2d(uint104[][] memory nums) public {
        u104_nums2d = nums;
        allMoreThan1Storage_u104_2d(u104_nums2d);
    }

    function allMoreThan1Storage_u104_2d(uint104[][] storage nums) internal {
        for (uint i = 0; i < nums.length; i++) {
            for (uint j = 0; j < nums[i].length; j++) {
                assert(nums[i][j] > 1);
            }
        }
    }

    uint56[5] u56_nums_5;
    function allMoreThan1_u56_5(uint56[5] calldata nums) public {
        allMoreThan1_u56_5_memory(nums);
    }

    function allMoreThan1_u56_5_memory(uint56[5] memory nums) public {
        u56_nums_5 = nums;
        allMoreThan1Storage_u56_5(u56_nums_5);
    }


    function allMoreThan1Storage_u56_5(uint56[5] storage nums) internal {
        for (uint i = 0; i < nums.length; i++) {
            assert(nums[i] > 1);
        }
    }

    uint8[][5] u8arr_nums_5;
    function allMoreThan1_u8arr_5(uint8[][5] calldata nums) public {
        allMoreThan1_u8arr_5_memory(nums);
    }

    function allMoreThan1_u8arr_5_memory(uint8[][5] memory nums) public {
        u8arr_nums_5 = nums;
        allMoreThan1Storage_u8arr_5(u8arr_nums_5);
    }


    function allMoreThan1Storage_u8arr_5(uint8[][5] storage nums) internal {
        for (uint i = 0; i < nums.length; i++) {
            for (uint j = 0; j < nums[i].length; j++) {
                assert(nums[i][j] > 1);
            }
        }
    }

    enum E {
        A, B, C, D
    }

    struct AllPrimitiveTypes {
        int8 a;
        uint16 b;
        // New Word
        bytes29 nextWordBytes;
        bytes1 sameWord;
        // New Word
        address addr;
        E e;
        bool flag;
        T t;
    }

    AllPrimitiveTypes primTStruct;

    function checkPrimitiveStruct(AllPrimitiveTypes calldata arg) external {
        checkPrimitiveStruct_Memory(arg);
    }

    function checkPrimitiveStruct_Memory(AllPrimitiveTypes memory arg) internal {
        primTStruct = arg;
        checkPrimitiveStruct_Storage(primTStruct);
    }

    function checkPrimitiveStruct_Storage(AllPrimitiveTypes storage arg) internal {
        assert(arg.a == -42);
        assert(arg.b == 42);
        for (uint i = 0; i < 29; i++) {
            assert(arg.nextWordBytes[i] == 0x2a);
        }

        assert(arg.sameWord == 0x2b);
        assert(arg.addr == 0x0000000000000000000000000000000000000042);
        assert(arg.e == E.C);
        assert(arg.flag);
        assert(T.unwrap(arg.t) == 42);
    }
}