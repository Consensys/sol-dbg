contract Misc {
    constructor() {
        delete staticStructs;
    }

    uint16[3][4] fixed_arr_2d;
    function allMoreThan1(uint16[3][4] calldata arr) external {
        allMoreThan1_memory(arr);
    }

    function allMoreThan1_memory(uint16[3][4] memory arr) internal {
        fixed_arr_2d = arr;
        allMoreThan1_storage(fixed_arr_2d);
    }

    function allMoreThan1_storage(uint16[3][4] storage arr) internal {
        for (uint i = 0; i < arr.length; i++) {
            for (uint j = 0; j < arr[i].length; j++) {
                assert(arr[i][j] > 1);
            }

        }
    }

    struct BigStaticStruct {
        bool flag; // 1 byte
        int16 i16; // 3 bytes
        uint24 u24; // 6 bytes
        address addr; // 26 bytes
        bytes7 b7; // next word - 7 bytes
    }

    function checkStaticStructArr(BigStaticStruct[] calldata arr) external {
        checkStaticStructArr_memory(arr);
    }

    BigStaticStruct[] staticStructs;
    function checkStaticStructArr_memory(BigStaticStruct[] memory arr) internal {
        for (uint i = 0; i < arr.length; i++) {
            staticStructs.push(arr[i]);
        }
        checkStaticStructArr_storage(staticStructs);
    }

    function checkStaticStructArr_storage(BigStaticStruct[] storage arr) internal {
        for (uint i = 0; i < arr.length; i++) {
            assert(arr[i].flag);
        }
    }

    struct StructWithPackedArrs {
        uint8 len1;
        string middle;
        uint16 len2;
    }

    function checkLens(StructWithPackedArrs[] calldata arr) external {
        checkLens_memory(arr);
    }

    function checkLens_memory(StructWithPackedArrs[] memory arr) internal {
        for (uint i = 0; i < arr.length; i++) {
            swpa_arr.push(arr[i]);
        }
        checkLens_storage(swpa_arr);
    }

    StructWithPackedArrs[] swpa_arr;

    function checkLens_storage(StructWithPackedArrs[] storage arr) internal {
        for (uint i = 0; i < arr.length; i++) {
            assert(arr[i].len1 == arr[i].len2);
            assert(arr[i].len1 == bytes(arr[i].middle).length);
        }
    }

    struct StructWithArrays {
        uint8 lenStr;
        string str;
        uint16 arrLen;
        uint24[] arr;
        uint32 arrLen2;
    }

    function checkLens2(StructWithArrays[] calldata arr) external {
        checkLens_memory(arr);
    }

    function checkLens_memory(StructWithArrays[] memory arr) internal {
        for (uint i = 0; i < arr.length; i++) {
            swa_arr.push(arr[i]);
        }
        checkLens_storage(swa_arr);
    }

    StructWithArrays[] swa_arr;

    function checkLens_storage(StructWithArrays[] storage arr) internal {
        for (uint i = 0; i < arr.length; i++) {
            assert(arr[i].lenStr == bytes(arr[i].str).length);
            assert(arr[i].arrLen == arr[i].arrLen2);
            assert(arr[i].arrLen == arr[i].arr.length);
        }
    }

}