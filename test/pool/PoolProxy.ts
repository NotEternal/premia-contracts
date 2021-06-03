import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

const { deployMockContract } = require('@ethereum-waffle/mock-contract');
import { ethers } from 'hardhat';
import {
  ERC20Mock__factory,
  ManagedProxyOwnable,
  ManagedProxyOwnable__factory,
  Premia,
  Premia__factory,
  PoolMock,
  PoolMock__factory,
  ProxyManager__factory,
} from '../../typechain';

import { describeBehaviorOfManagedProxyOwnable } from '@solidstate/spec';
import { describeBehaviorOfPool } from './Pool.behavior';
import { BigNumber } from 'ethers';

const SYMBOL_BASE = 'SYMBOL_BASE';
const SYMBOL_UNDERLYING = 'SYMBOL_UNDERLYING';

describe('PoolProxy', function () {
  let owner: SignerWithAddress;

  let premia: Premia;
  let instanceProxy: ManagedProxyOwnable;
  let instancePool: PoolMock;

  before(async function () {
    [owner] = await ethers.getSigners();

    const pool = await new PoolMock__factory(owner).deploy();

    const facetCuts = [await new ProxyManager__factory(owner).deploy()].map(
      function (f) {
        return {
          target: f.address,
          action: 0,
          selectors: Object.keys(f.interface.functions).map((fn) =>
            f.interface.getSighash(fn),
          ),
        };
      },
    );

    console.log(facetCuts);

    premia = await new Premia__factory(owner).deploy(pool.address);

    const tx = await premia.diamondCut(
      facetCuts,
      ethers.constants.AddressZero,
      '0x',
    );
    await tx.wait(1);
  });

  beforeEach(async function () {
    const manager = ProxyManager__factory.connect(premia.address, owner);

    const erc20Factory = new ERC20Mock__factory(owner);

    const token0 = await erc20Factory.deploy(SYMBOL_BASE);
    await token0.deployed();
    const token1 = await erc20Factory.deploy(SYMBOL_UNDERLYING);
    await token1.deployed();

    const oracle0 = await deployMockContract(owner, [
      'function latestRoundData () external view returns (uint80, int, uint, uint, uint80)',
      'function decimals () external view returns (uint8)',
    ]);

    const oracle1 = await deployMockContract(owner, [
      'function latestRoundData () external view returns (uint80, int, uint, uint, uint80)',
      'function decimals () external view returns (uint8)',
    ]);

    await oracle0.mock.decimals.returns(8);
    await oracle1.mock.decimals.returns(8);

    const tx = await manager.deployPools(
      token0.address,
      token1.address,
      oracle0.address,
      oracle1.address,
    );

    const poolAddress = (await tx.wait()).events![0].args!.pool0;

    console.log('Premia', premia.address);
    console.log('Premia', premia.address);
    console.log(poolAddress);
    console.log(await PoolMock__factory.connect(poolAddress, owner).getBase());
    console.log(
      await PoolMock__factory.connect(poolAddress, owner).getUnderlying(),
    );

    instanceProxy = ManagedProxyOwnable__factory.connect(poolAddress, owner);
    instancePool = PoolMock__factory.connect(poolAddress, owner);
  });

  describeBehaviorOfManagedProxyOwnable({
    deploy: async () => instanceProxy,
    implementationFunction: 'getBase()',
    implementationFunctionArgs: [],
  });

  describeBehaviorOfPool(
    {
      deploy: async () => instancePool,
      supply: BigNumber.from(0),
      name: `Premia Liquidity: ${SYMBOL_UNDERLYING}/${SYMBOL_BASE}`,
      symbol: `PREMIA-${SYMBOL_UNDERLYING}${SYMBOL_BASE}`,
      decimals: 18,
      mintERC20: async (address, amount) =>
        instancePool['mint(address,uint256)'](address, amount),
      burnERC20: async (address, amount) =>
        instancePool['burn(address,uint256)'](address, amount),
      mintERC1155: undefined as any,
      burnERC1155: undefined as any,
    },
    ['::ERC1155Enumerable', '#transfer', '#transferFrom'],
  );
});
