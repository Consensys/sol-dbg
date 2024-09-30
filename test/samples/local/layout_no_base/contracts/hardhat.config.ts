import {  HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-ethers'

const config: HardhatUserConfig = {
  networks: {
    localhost: {
      url: 'http://127.0.0.1:8545',
      timeout: 1000000,
    },
  },
  solidity: {
    version: '0.8.21',
    settings: {
      viaIR: true,
      optimizer: {
        enabled: false,
      },
    },
  },
};

export default config
