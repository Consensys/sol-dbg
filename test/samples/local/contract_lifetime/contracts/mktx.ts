import { ethers } from "hardhat";

(async function main() {
    const FailingConstructor = await ethers.getContractFactory("FailingConstructor");

    const tx = await FailingConstructor.getDeployTransaction();
    console.error("FailingConstructor bytecode:", tx.data);

    // Failing constructor
    try {
        const t = await FailingConstructor.deploy();
        await t.wait();
    } catch (e) {
        console.error(`Failed as expected`);
    }

    // Working constructor
    const Killable = await ethers.getContractFactory("Killable");
    const killable = await Killable.deploy();

    console.error("Killable bytecode:", await Killable.getDeployTransaction());
    console.error(`Deployed Killable at `, await killable.getAddress());

    // Self-destruct
    const t = await killable.die();
    console.error(`Die tx: `, t);

    // Nested creation
    const NestedCreation = await ethers.getContractFactory("NestedCreation");
    const nestedCreation = await NestedCreation.deploy();

    console.error("NestedCreation bytecode:", await NestedCreation.getDeployTransaction());
    console.error(`Deployed nested creation at `, await nestedCreation.getAddress());
    // Nested creation with failure
    const NestedCreationFail = await ethers.getContractFactory("NestedCreationFail");
    const nestedCreationFail = await NestedCreationFail.deploy();

    console.error("NestedCreationFail bytecode:", await NestedCreationFail.getDeployTransaction());
    console.error(`Deployed nested creation fail at `, await nestedCreationFail.getAddress());
})();
