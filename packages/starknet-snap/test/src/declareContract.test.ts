import chai, { expect } from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { WalletMock } from '../wallet.mock.test';
import * as utils from '../../src/utils/starknetUtils';
import { declareContract } from '../../src/declareContract';
import { SnapState } from '../../src/types/snapState';
import {
  STARKNET_MAINNET_NETWORK,
  STARKNET_TESTNET_NETWORK,
  STARKNET_SEPOLIA_TESTNET_NETWORK,
} from '../../src/utils/constants';
import { createAccountProxyTxn, getBip44EntropyStub, account1 } from '../constants.test';
import { getAddressKeyDeriver } from '../../src/utils/keyPair';
import { Mutex } from 'async-mutex';
import { ApiParams, DeclareContractRequestParams } from '../../src/types/snapApi';

chai.use(sinonChai);
const sandbox = sinon.createSandbox();

describe('Test function: declareContract', function () {
  this.timeout(10000);
  const walletStub = new WalletMock();
  const state: SnapState = {
    accContracts: [],
    erc20Tokens: [],
    networks: [STARKNET_MAINNET_NETWORK, STARKNET_TESTNET_NETWORK, STARKNET_SEPOLIA_TESTNET_NETWORK],
    transactions: [],
  };
  const apiParams: ApiParams = {
    state,
    requestParams: {},
    wallet: walletStub,
    saveMutex: new Mutex(),
  };

  const requestObject: DeclareContractRequestParams = {
    chainId: STARKNET_MAINNET_NETWORK.chainId,
    senderAddress: account1.address,
    contractPayload: {
      contract: 'TestContract',
    },
    invocationsDetails: {
      maxFee: 100,
    },
  };

  beforeEach(async function () {
    walletStub.rpcStubs.snap_getBip44Entropy.callsFake(getBip44EntropyStub);
    apiParams.keyDeriver = await getAddressKeyDeriver(walletStub);
    apiParams.requestParams = requestObject;
    sandbox.useFakeTimers(createAccountProxyTxn.timestamp);
    walletStub.rpcStubs.snap_dialog.resolves(true);
    walletStub.rpcStubs.snap_manageState.resolves(state);
  });

  afterEach(function () {
    walletStub.reset();
    sandbox.restore();
  });

  it('should declareContract correctly', async function () {
    const declareContractStub = sandbox.stub(utils, 'declareContract').resolves({
      transaction_hash: 'transaction_hash',
      class_hash: 'class_hash',
    });
    const result = await declareContract(apiParams);
    const { privateKey } = await utils.getKeysFromAddress(
      apiParams.keyDeriver,
      STARKNET_MAINNET_NETWORK,
      state,
      account1.address,
    );

    expect(result).to.eql({
      transaction_hash: 'transaction_hash',
      class_hash: 'class_hash',
    });
    expect(declareContractStub).to.have.been.calledOnce;
    expect(declareContractStub).to.have.been.calledWith(
      STARKNET_MAINNET_NETWORK,
      account1.address,
      privateKey,
      { contract: 'TestContract' },
      { maxFee: 100 },
    );
  });

  it('should throw error if declareContract fail', async function () {
    const declareContractStub = sandbox.stub(utils, 'declareContract').rejects('error');
    const { privateKey } = await utils.getKeysFromAddress(
      apiParams.keyDeriver,
      STARKNET_MAINNET_NETWORK,
      state,
      account1.address,
    );
    let result;
    try {
      await declareContract(apiParams);
    } catch (e) {
      result = e;
    } finally {
      expect(result).to.be.an('Error');
      expect(declareContractStub).to.have.been.calledOnce;
      expect(declareContractStub).to.have.been.calledWith(
        STARKNET_MAINNET_NETWORK,
        account1.address,
        privateKey,
        { contract: 'TestContract' },
        { maxFee: 100 },
      );
    }
  });

  it('should return false if user rejected to sign the transaction', async function () {
    walletStub.rpcStubs.snap_dialog.resolves(false);
    const declareContractStub = sandbox.stub(utils, 'declareContract').resolves({
      transaction_hash: 'transaction_hash',
      class_hash: 'class_hash',
    });
    const result = await declareContract(apiParams);
    expect(result).to.equal(false);
    expect(declareContractStub).to.have.been.not.called;
  });
});
