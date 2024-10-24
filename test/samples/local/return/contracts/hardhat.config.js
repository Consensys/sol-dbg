require("@nomicfoundation/hardhat-ethers");
/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: "0.8.21",
  networks: {
	  localhost: {
		  url: "http://localhost:7545"
	  }
  }
};
