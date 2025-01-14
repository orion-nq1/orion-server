import { Queue, Worker, QueueEvents } from 'bullmq';
import { PublicKey } from '@solana/web3.js';
import { User } from '../mongoose/models/User';
import { createConnection } from '../utils/solana';

const redisURL = new URL(process.env.REDIS_URL!);
const paymentQueue = new Queue('payment-verification', {
    connection: {
        family: 0,
        host: redisURL.hostname,
        port: parseInt(redisURL.port),
        username: redisURL.username,
        password: redisURL.password
    }
});

interface VerifyPaymentJob {
  signature: string;
  walletAddress: string;
  amount: number;
}

export const worker = new Worker('payment-verification', async (job) => {
  const { signature, walletAddress, amount } = job.data as VerifyPaymentJob;
  const connection = createConnection();
  
  try {
    // Mark payment as pending at start
    const user = await User.findOne({ walletAddress });
    if (!user) {
      throw new Error('Transaction failed: User not found');
    }
    await user.markPaymentPending(signature, amount);

    console.log('Verifying transaction:', { signature, walletAddress, amount });
    
    // Add delay and retry logic for transaction lookup
    let transaction = null;
    let attempts = 0;
    while (!transaction && attempts < 120) { // Try for 2 minutes
      transaction = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });
      
      if (!transaction) {
        console.log(`Transaction not found, attempt ${attempts + 1}/120`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        attempts++;
      }
    }

    if (!transaction) {
      throw new Error('Transaction failed: Transaction not found after 2 minutes');
    }

    if (transaction.meta?.err) {
      console.error('Transaction error:', transaction.meta.err);
      throw new Error(`Transaction failed: ${transaction.meta.err}`);
    }

    // Verify amount for USDC transfer
    const merchantWallet = new PublicKey(process.env.MERCHANT_WALLET!);
    const postBalances = transaction.meta?.postTokenBalances;
    const preBalances = transaction.meta?.preTokenBalances;
    
    console.log('Transaction balances:', {
      pre: preBalances,
      post: postBalances,
      merchantWallet: merchantWallet.toString()
    });

    const merchantPostBalance = postBalances?.find(b => b.owner === merchantWallet.toString());
    const merchantPreBalance = preBalances?.find(b => b.owner === merchantWallet.toString());

    if (!merchantPostBalance || !merchantPreBalance) {
      console.error('Merchant balance not found:', {
        foundPost: !!merchantPostBalance,
        foundPre: !!merchantPreBalance,
        availableOwners: {
          pre: preBalances?.map(b => b.owner),
          post: postBalances?.map(b => b.owner)
        }
      });
      throw new Error('Transaction failed: Merchant balance not found');
    }

    const received = Number(merchantPostBalance.uiTokenAmount.amount) - 
                    Number(merchantPreBalance.uiTokenAmount.amount);
    
    console.log('Payment amount check:', {
      received,
      expected: amount * 1_000_000,
      preBalance: merchantPreBalance.uiTokenAmount.amount,
      postBalance: merchantPostBalance.uiTokenAmount.amount
    });

    if (received < amount * 1_000_000) { // USDC has 6 decimals
      throw new Error(`Transaction failed: Invalid payment amount (received ${received}, expected ${amount * 1_000_000})`);
    }

    console.log('Processing payment for user:', {
      walletAddress,
      signature,
      amount
    });

    await user.processPayment(signature, amount);
    
    // Send webhook if configured
    if (process.env.WEBHOOK_URL) {
      await fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'payment.success',
          signature,
          walletAddress,
          amount,
          timestamp: new Date().toISOString()
        })
      });
    }

    return { success: true };
  } catch (error) {
    // Mark payment as failed on error
    const user = await User.findOne({ walletAddress });
    if (user) {
      await user.markPaymentFailed(signature);
    }
    
    console.error('Payment verification failed:', error);
    
    // Send webhook for failures too
    if (process.env.WEBHOOK_URL) {
      await fetch(process.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'payment.failed',
          signature,
          walletAddress,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        })
      });
    }
    
    throw error;
  }
}, {
  connection: {
    url: process.env.REDIS_URL!
  }
});

// Add queue monitoring
worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed successfully`);
});

worker.on('failed', (job, error) => {
  console.error(`Job ${job?.id || 'unknown'} failed:`, error);
});

worker.on('error', (error) => {
  console.error('Worker error:', error);
});

// Add queue metrics
let processedCount = 0;
let failedCount = 0;

worker.on('completed', () => processedCount++);
worker.on('failed', () => failedCount++);

// Expose metrics endpoint
export const getQueueMetrics = async () => ({
  processed: processedCount,
  failed: failedCount,
  active: await paymentQueue.getActiveCount(),
  waiting: await paymentQueue.getWaitingCount(),
  delayed: await paymentQueue.getDelayedCount(),
  failedJobs: await paymentQueue.getFailedCount(),
});

export const queuePaymentVerification = async (data: VerifyPaymentJob) => {
  const job = await paymentQueue.add('verify-payment', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000
    },
    removeOnComplete: true,
    removeOnFail: false
  });

  const result = await job.waitUntilFinished(new QueueEvents(paymentQueue.name));
  return result as { success: boolean };
}; 