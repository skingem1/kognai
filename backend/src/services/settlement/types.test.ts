import {
  EvmTxHash,
  EvmAddress,
  SettlementMatch,
  EvmTransactionReceipt,
  EvmLog,
  EvmErc20TransferLog,
  EvmSettlementDetectorConfig,
  InvoiceSettledEvent,
} from './types';

describe('Settlement Types', () => {
  it('should create a valid SettlementMatch', () => {
    const match: SettlementMatch = {
      invoiceId: 'INV-001',
      txHash: '0xabc123' as EvmTxHash,
      amount: '100.00',
      from: '0x742d35Cc6634C0532925a3b844Bc9e7595f' as EvmAddress,
      to: '0x9B3a54D092fF8F74aEF2fE4b2c1b3D4e5f6g7h8i' as EvmAddress,
      blockNumber: 18500000n,
      timestamp: 1699900000,
      chain: 'ethereum',
    };
    expect(match.invoiceId).toBe('INV-001');
  });

  it('should parse EvmTransactionReceipt correctly', () => {
    const receipt: EvmTransactionReceipt = {
      transactionHash: '0xtxhash' as EvmTxHash,
      blockNumber: '0x11e1a30',
      blockHash: '0xblockhash' as EvmTxHash,
      status: '0x1',
      logs: [],
      from: '0xfromaddr' as EvmAddress,
      to: '0xtoaddr' as EvmAddress,
      cumulativeGasUsed: '0x0',
      gasUsed: '0x0',
    };
    expect(receipt.status).toBe('0x1');
  });

  it('should handle EvmErc20TransferLog', () => {
    const transfer: EvmErc20TransferLog = {
      from: '0xsender' as EvmAddress,
      to: '0xreceiver' as EvmAddress,
      value: '0x0',
      token: '0xtoken' as EvmAddress,
    };
    expect(transfer.value).toBeDefined();
  });

  it('should allow bigint for blockNumber', () => {
    const match: SettlementMatch = {
      invoiceId: 'INV-002',
      txHash: '0xhash' as EvmTxHash,
      amount: '50.00',
      from: '0xfrom' as EvmAddress,
      to: '0xto' as EvmAddress,
      blockNumber: 18500000n,
      timestamp: 1699900000,
      chain: 'polygon',
    };
    expect(typeof match.blockNumber).toBe('bigint');
  });
});