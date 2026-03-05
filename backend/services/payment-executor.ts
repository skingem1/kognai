import { ethers } from 'ethers';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';
const USDC_CONTRACT_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const TREASURY_ADDRESS = '0x9E0e342e4E2Df813B27F078AD0119eD6c289643f';

const USDC_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

/**
 * Submits a payment to the Base blockchain as a USDC transfer
 * @param paymentId - The ID of the payment to submit
 * @returns The transaction hash of the submission
 * @throws Error if payment not found or transaction fails
 */
export async function submitPaymentToChain(paymentId: string): Promise<{ tx_hash: string }> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  
  if (!payment) {
    throw new Error(`Payment not found: ${paymentId}`);
  }

  if (payment.status === 'submitted' || payment.status === 'completed') {
    throw new Error(`Payment ${paymentId} already submitted or completed`);
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const privateKey = process.env.TREASURY_PRIVATE_KEY;
  
  if (!privateKey) {
    throw new Error('TREASURY_PRIVATE_KEY environment variable not set');
  }

  const wallet = new ethers.Wallet(privateKey, provider);
  const usdc = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, wallet);
  
  const amount = ethers.parseUnits(payment.amount.toString(), 6);
  const tx = await usdc.transfer(payment.recipientAddress, amount);
  const receipt = await tx.wait();

  await prisma.payment.update({
    where: { id: paymentId },
    data: { tx_hash: receipt.hash, status: 'submitted' },
  });

  return { tx_hash: receipt.hash };
}
