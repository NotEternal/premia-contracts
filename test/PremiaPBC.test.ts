import { expect } from 'chai';
import { PremiaPBC, PremiaPBC__factory } from '../contractsTyped';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { getEthBalance, mineBlockUntil, resetHardhat } from './utils/evm';
import { BigNumber } from 'ethers';
import { deployContracts, IPremiaContracts } from '../scripts/deployContracts';
import { parseEther } from 'ethers/lib/utils';

let p: IPremiaContracts;
let premiaPBC: PremiaPBC;
let admin: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;
let user3: SignerWithAddress;
let treasury: SignerWithAddress;
const pbcAmount = parseEther('10000000'); // 10m

describe('PremiaPBC', () => {
  beforeEach(async () => {
    await resetHardhat();

    [admin, user1, user2, user3, treasury] = await ethers.getSigners();

    const pbcBlockStart = 0;
    const pbcBlockEnd = 100;

    p = await deployContracts(admin, treasury.address, true);

    premiaPBC = await new PremiaPBC__factory(admin).deploy(
      p.premia.address,
      pbcBlockStart,
      pbcBlockEnd,
      treasury.address,
    );

    await p.premia.mint(admin.address, pbcAmount);
    await p.premia.increaseAllowance(premiaPBC.address, pbcAmount);
    await premiaPBC.addPremia(pbcAmount);
  });

  it('should have added premia to the PBC', async () => {
    expect(await premiaPBC.premiaTotal()).to.eq(pbcAmount);
    expect(await p.premia.balanceOf(premiaPBC.address)).to.eq(pbcAmount);
  });

  it('should deposit successfully', async () => {
    await premiaPBC.connect(user1).contribute({ value: parseEther('1') });
    expect(await premiaPBC.ethTotal()).to.eq(parseEther('1'));
    expect(await getEthBalance(premiaPBC.address)).to.eq(parseEther('1'));
  });

  it('should fail depositing if PBC has ended', async () => {
    await mineBlockUntil(101);
    await expect(
      premiaPBC.connect(user1).contribute({ value: parseEther('1') }),
    ).to.be.revertedWith('PBC ended');
  });

  it('should calculate allocations correctly and withdraw successfully', async () => {
    await premiaPBC.connect(user1).contribute({ value: parseEther('10') });

    await premiaPBC.connect(user2).contribute({ value: parseEther('10') });

    await premiaPBC.connect(user2).contribute({ value: parseEther('20') });

    await premiaPBC.connect(user3).contribute({ value: parseEther('60') });

    await mineBlockUntil(101);

    await premiaPBC.connect(user1).collect();
    await premiaPBC.connect(user2).collect();
    await premiaPBC.connect(user3).collect();

    expect(await p.premia.balanceOf(user1.address)).to.eq(pbcAmount.div(10));
    expect(await p.premia.balanceOf(user2.address)).to.eq(
      pbcAmount.mul(3).div(10),
    );
    expect(await p.premia.balanceOf(user3.address)).to.eq(
      pbcAmount.mul(6).div(10),
    );
    expect(await p.premia.balanceOf(premiaPBC.address)).to.eq(0);
  });

  it('should fail collecting if address already did', async () => {
    await premiaPBC.connect(user1).contribute({ value: parseEther('10') });

    await premiaPBC.connect(user2).contribute({ value: parseEther('10') });

    await mineBlockUntil(101);

    await premiaPBC.connect(user1).collect();
    await expect(premiaPBC.connect(user1).collect()).to.be.revertedWith(
      'Address already collected its reward',
    );
  });

  it('should fail collecting if address did not contribute', async () => {
    await premiaPBC.connect(user1).contribute({ value: parseEther('10') });

    await mineBlockUntil(101);

    await expect(premiaPBC.connect(user2).collect()).to.be.revertedWith(
      'Address did not contribute',
    );
  });

  it('should allow owner to withdraw eth', async () => {
    await premiaPBC.connect(user1).contribute({ value: parseEther('1000') });

    const user2Eth = await getEthBalance(user2.address);

    await expect(
      premiaPBC.connect(user1).sendEthToTreasury(),
    ).to.be.revertedWith('Ownable: caller is not the owner');
    await premiaPBC.connect(admin).sendEthToTreasury();

    expect(await getEthBalance(premiaPBC.address)).to.eq(0);
    expect(await getEthBalance(treasury.address)).to.eq(
      user2Eth.add(parseEther('1000')),
    );
  });

  it('should calculate current premia price correctly', async () => {
    await premiaPBC.connect(user1).contribute({ value: parseEther('12') });

    expect(await premiaPBC.getPremiaPrice()).to.eq(
      BigNumber.from(parseEther('12')).mul(parseEther('1')).div(pbcAmount),
    );

    await premiaPBC.connect(user1).contribute({ value: parseEther('28') });

    expect(await premiaPBC.getPremiaPrice()).to.eq(
      BigNumber.from(parseEther('40')).mul(parseEther('1')).div(pbcAmount),
    );
  });

  it('should successfully contribute through fallback function', async () => {
    await user1.sendTransaction({
      to: premiaPBC.address,
      value: parseEther('1'),
    });
    expect(await premiaPBC.ethTotal()).to.eq(parseEther('1'));
    expect(await premiaPBC.amountDeposited(user1.address)).to.eq(
      parseEther('1'),
    );
    expect(await getEthBalance(premiaPBC.address)).to.eq(parseEther('1'));
  });
});
