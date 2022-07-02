import "./B.sol";

contract A {
    function main(uint x) public {
        B b = new B(x);
    }
}
