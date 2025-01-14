import e, { RequestHandler } from 'express';
import { User, PaymentRecord } from '../mongoose/models/User';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createConnection } from '../utils/solana';
import { createSubscriptionTransaction } from '../utils/jupiter';
import { queuePaymentVerification } from '../queues/paymentQueue';

export const SUBSCRIPTION_PRICE_USDC = parseInt(process.env.SUBSCRIPTION_PRICE_USDC!);
export const MERCHANT_WALLET = process.env.MERCHANT_WALLET!;

// Create payment intent
export const createPaymentIntent: RequestHandler = async (req, res, next): Promise<void> => {
  try {
    const { referralCode, payWithSol = false, walletAddress } = req.body;
    
    const user = await User.findOne({ walletAddress });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check if subscription is already active
    if (user.isSubscriptionActive()) {
      res.status(400).json({ 
        error: 'Subscription already active',
        expiresAt: user.subscriptionExpiresAt
      });
      return;
    }

    // Handle referral code
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer && !user.referredBy) {
        user.referredBy = referrer.walletAddress;
        await user.save();
      }
    }

    // Create transaction (either USDC transfer or SOL swap)
    const connection = createConnection();
    const { transaction, swapAmount } = await createSubscriptionTransaction(
      connection,
      new PublicKey(walletAddress),
      SUBSCRIPTION_PRICE_USDC,
      payWithSol
    );
    console.log(transaction);
    res.json({
      success: true,
      amount: SUBSCRIPTION_PRICE_USDC,
      ...(payWithSol && { solAmount: swapAmount }),
      merchantWallet: MERCHANT_WALLET,
      reference: walletAddress,
      referralApplied: !!user.referredBy,
      transaction: transaction
    });
  } catch (error) {
    next(error);
  }
};

// Verify payment
export const verifyPayment: RequestHandler = async (req, res, next): Promise<void> => {
  try {
    const { signature, walletAddress } = req.body;

    if (!signature) {
      res.status(400).json({ error: 'Transaction signature required' });
      return;
    }

    // Validate signature format
    if (!/^[A-Za-z0-9]{87,88}$/.test(signature)) {
      res.status(400).json({ error: 'Invalid transaction signature format' });
      return;
    }

    const user = await User.findOne({ walletAddress });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Mark as pending first
    await user.markPaymentPending(signature, SUBSCRIPTION_PRICE_USDC);

    // Queue verification
    await queuePaymentVerification({
      signature: signature.trim(),
      walletAddress,
      amount: SUBSCRIPTION_PRICE_USDC
    });

    res.json({
      success: true,
      message: 'Payment verification queued',
      signature,
      status: 'PENDING'
    });
  } catch (error) {
    next(error);
  }
};

// Get subscription status
export const getStatus: RequestHandler = async (req, res, next): Promise<void> => {
  try {
    const { walletAddress } = req.params;
    
    const user = await User.findOne({ walletAddress });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      isActive: user.isSubscriptionActive(),
      status: user.subscriptionStatus,
      expiresAt: user.subscriptionExpiresAt,
      paymentHistory: user.paymentHistory,
    });
  } catch (error) {
    next(error);
  }
};
