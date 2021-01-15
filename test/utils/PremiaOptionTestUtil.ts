import { PremiaOption, TestErc20, WETH9 } from '../../contractsTyped';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';
import { BigNumberish, BigNumber } from 'ethers';
import { ONE_WEEK, ZERO_ADDRESS } from './constants';
import { parseEther } from 'ethers/lib/utils';

interface WriteOptionArgs {
  address?: string;
  expiration?: number;
  strikePrice?: BigNumberish;
  isCall?: boolean;
  amount?: BigNumber;
  referrer?: string;
}

interface PremiaOptionTestUtilProps {
  weth: WETH9;
  dai: TestErc20;
  premiaOption: PremiaOption;
  admin: SignerWithAddress;
  writer1: SignerWithAddress;
  writer2: SignerWithAddress;
  user1: SignerWithAddress;
  feeRecipient: SignerWithAddress;
  tax: number;
}

export class PremiaOptionTestUtil {
  weth: WETH9;
  dai: TestErc20;
  premiaOption: PremiaOption;
  admin: SignerWithAddress;
  writer1: SignerWithAddress;
  writer2: SignerWithAddress;
  user1: SignerWithAddress;
  feeRecipient: SignerWithAddress;
  tax: number;

  constructor(props: PremiaOptionTestUtilProps) {
    this.weth = props.weth;
    this.dai = props.dai;
    this.premiaOption = props.premiaOption;
    this.admin = props.admin;
    this.writer1 = props.writer1;
    this.writer2 = props.writer2;
    this.user1 = props.user1;
    this.feeRecipient = props.feeRecipient;
    this.tax = props.tax;
  }

  getNextExpiration() {
    const now = new Date();
    const baseExpiration = 172799; // Offset to add to Unix timestamp to make it Fri 23:59:59 UTC
    return (
      ONE_WEEK *
        (Math.floor((now.getTime() / 1000 - baseExpiration) / ONE_WEEK) + 1) +
      baseExpiration
    );
  }

  getOptionDefaults() {
    return {
      address: this.weth.address,
      expiration: this.getNextExpiration(),
      strikePrice: parseEther('10'),
      isCall: true,
      amount: parseEther('1'),
    };
  }

  async addEth() {
    return this.premiaOption.setToken(
      this.weth.address,
      parseEther('10'),
      false,
    );
  }

  async writeOption(user: SignerWithAddress, args?: WriteOptionArgs) {
    const defaults = this.getOptionDefaults();

    return this.premiaOption.connect(user).writeOption(
      {
        token: args?.address ?? defaults.address,
        expiration: args?.expiration ?? defaults.expiration,
        strikePrice: args?.strikePrice ?? defaults.strikePrice,
        isCall: args?.isCall == undefined ? defaults.isCall : args.isCall,
        amount: args?.amount == undefined ? defaults.amount : args?.amount,
      },
      args?.referrer ?? ZERO_ADDRESS,
    );
  }

  async mintAndWriteOption(
    user: SignerWithAddress,
    amount: BigNumber,
    isCall = true,
    referrer?: string,
  ) {
    if (isCall) {
      const amountWithFee = amount.add(amount.mul(this.tax).div(1e4));
      await this.weth.connect(user).deposit({ value: amountWithFee });
      await this.weth
        .connect(user)
        .approve(this.premiaOption.address, amountWithFee);
    } else {
      const baseAmount = amount.mul(10);
      const amountWithFee = baseAmount.add(baseAmount.mul(this.tax).div(1e4));
      await this.dai.mint(user.address, amountWithFee);
      await this.dai
        .connect(user)
        .increaseAllowance(this.premiaOption.address, amountWithFee);
    }

    await this.writeOption(user, { amount, isCall, referrer });
    // const tx = await this.writeOption(user, { amount, isCall, referrer });
    // console.log(tx.gasLimit.toString());
  }

  async addEthAndWriteOptions(
    amount: BigNumber,
    isCall = true,
    referrer?: string,
  ) {
    await this.addEth();
    await this.mintAndWriteOption(this.writer1, amount, isCall, referrer);
  }

  async transferOptionToUser1(
    from: SignerWithAddress,
    amount?: BigNumber,
    optionId?: number,
  ) {
    await this.premiaOption
      .connect(from)
      .safeTransferFrom(
        from.address,
        this.user1.address,
        optionId ?? 1,
        amount ?? parseEther('1'),
        '0x00',
      );
  }

  async exerciseOption(
    isCall: boolean,
    amountToExercise: BigNumber,
    referrer?: string,
    optionId?: number,
  ) {
    if (isCall) {
      const baseAmount = amountToExercise.mul(10);
      const amount = baseAmount.add(baseAmount.mul(this.tax).div(1e4));
      await this.dai.mint(this.user1.address, amount);
      await this.dai
        .connect(this.user1)
        .increaseAllowance(this.premiaOption.address, amount);
    } else {
      const amount = amountToExercise.add(
        amountToExercise.mul(this.tax).div(1e4),
      );

      await this.weth.connect(this.user1).deposit({ value: amount });
      await this.weth
        .connect(this.user1)
        .approve(this.premiaOption.address, amount);
    }

    return this.premiaOption
      .connect(this.user1)
      .exerciseOption(
        optionId ?? 1,
        amountToExercise,
        referrer ?? ZERO_ADDRESS,
      );
  }

  async addEthAndWriteOptionsAndExercise(
    isCall: boolean,
    amountToWrite: BigNumber,
    amountToExercise: BigNumber,
    referrer?: string,
  ) {
    await this.addEthAndWriteOptions(amountToWrite, isCall);
    await this.transferOptionToUser1(this.writer1, amountToWrite);
    await this.exerciseOption(isCall, amountToExercise, referrer);
  }
}
