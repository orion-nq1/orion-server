import mongoose, { Document, Schema } from 'mongoose';

// Types
interface ReferralRecord {
  referredUser: string;
  date: Date;
  rewardClaimed: boolean;
  rewardAmount: number;
  claimedAt?: Date;
}

export interface PaymentRecord {
  transactionSignature: string;
  amount: number;
  currency: string;
  date: Date;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  referralPaid: boolean;
  referralAmount: number;
}

interface PeriodStats {
  count: number;
  totalAmount: number;
}

// User Interface
export interface IUser extends Document {
  // Basic Info
  walletAddress: string;
  createdAt: Date;
  lastLoginAt: Date;
  isActive: boolean;

  // Subscription
  subscriptionStatus: 'INACTIVE' | 'ACTIVE' | 'EXPIRED';
  subscriptionExpiresAt: Date | null;
  paymentHistory: PaymentRecord[];

  // Referral System
  referralCode: string;
  referredBy: string | null;
  referralCount: number;
  referralHistory: ReferralRecord[];
  
  // Rewards
  totalRewards: number;
  pendingRewards: number;
  claimedRewards: number;
  last24HoursRewards: number;
  last24HoursChange: {
    amount: number;
    percentage: number;
  };
  last24HoursUpdate: Date;

  // Methods
  update24HourRewards(): Promise<void>;
  processPayment(signature: string, amount: number): Promise<void>;
  isSubscriptionActive(): boolean;
  addReferral(referredUserWallet: string, amount: number): Promise<void>;

  periodReferrals: {
    [period: string]: PeriodStats;
  };

  currentPeriodReferrals: {
    count: number;
    totalAmount: number;
    claimed: boolean;
    claimedAt?: Date;
  };

  // Add these methods
  markPaymentPending(signature: string, amount: number): Promise<void>;
  markPaymentFailed(signature: string): Promise<void>;
  processPayment(signature: string, amount: number): Promise<void>;
}

// Schema Definition
const UserSchema = new Schema<IUser>({
  // Basic Info
  walletAddress: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },

  // Subscription
  subscriptionStatus: {
    type: String,
    enum: ['INACTIVE', 'ACTIVE', 'EXPIRED'],
    default: 'INACTIVE',
  },
  subscriptionExpiresAt: { type: Date, default: null },
  paymentHistory: [{
    transactionSignature: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USDC' },
    date: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'FAILED'],
      default: 'PENDING',
    },
    referralPaid: { type: Boolean, default: false },
    referralAmount: { type: Number, default: 0 },
  }],

  // Referral System
  referralCode: { type: String, required: true, unique: true },
  referredBy: { type: String, default: null },
  referralCount: { type: Number, default: 0 },
  referralHistory: [{
    referredUser: String,
    date: { type: Date, default: Date.now },
    rewardClaimed: { type: Boolean, default: false },
    rewardAmount: { type: Number, default: 0 },
    claimedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['PENDING', 'CLAIMED', 'EXPIRED'],
      default: 'PENDING',
    },
  }],

  // Rewards
  totalRewards: { type: Number, default: 0 },
  pendingRewards: { type: Number, default: 0 },
  claimedRewards: { type: Number, default: 0 },
  last24HoursRewards: { type: Number, default: 0 },
  last24HoursChange: {
    amount: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
  },
  last24HoursUpdate: { type: Date, default: Date.now },

  periodReferrals: {
    type: Map,
    of: {
      count: { type: Number, default: 0 },
      totalAmount: { type: Number, default: 0 }
    },
    default: {}
  },

  currentPeriodReferrals: {
    count: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    claimed: { type: Boolean, default: false },
    claimedAt: { type: Date }
  }
});

// Indexes
UserSchema.index({ walletAddress: 1, referralCode: 1 });

// Methods (unchanged)
UserSchema.methods.update24HourRewards = async function() { /* ... */ };
UserSchema.methods.isSubscriptionActive = function(): boolean {
  return (
    this.subscriptionStatus === 'ACTIVE' && 
    this.subscriptionExpiresAt && 
    new Date(this.subscriptionExpiresAt) > new Date()
  );
};
UserSchema.methods.processPayment = async function(signature: string, amount: number) { /* ... */ };

UserSchema.methods.addReferral = async function(referredUserWallet: string, amount: number) {
  this.currentPeriodReferrals.count += 1;
  this.currentPeriodReferrals.totalAmount += amount;
  this.referralCount += 1;

  this.referralHistory.push({
    referredUser: referredUserWallet,
    date: new Date(),
    rewardClaimed: false,
    rewardAmount: amount * 0.1
  });

  await this.save();
};

// Update the referral processing in processPayment
UserSchema.methods.processPayment = async function(signature: string, amount: number) {
  // Find and update existing pending payment if it exists
  const existingPayment = this.paymentHistory.find(
    (p: PaymentRecord) => p.transactionSignature === signature
  );

  if (existingPayment) {
    existingPayment.status = 'CONFIRMED';
  } else {
    // Add new payment record if none exists
    this.paymentHistory.push({
      transactionSignature: signature,
      amount,
      currency: 'USDC',
      date: new Date(),
      status: 'CONFIRMED',
      referralPaid: false,
      referralAmount: 0
    });
  }

  // Update subscription
  this.subscriptionStatus = 'ACTIVE';
  this.subscriptionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Process referral if user was referred
  if (this.referredBy) {
    const referrer = await User.findOne({ walletAddress: this.referredBy });
    if (referrer) {
      await referrer.addReferral(this.walletAddress, amount);
    }
  }

  await this.save();
};

UserSchema.methods.markPaymentPending = async function(signature: string, amount: number) {
  this.paymentHistory.push({
    transactionSignature: signature,
    amount,
    currency: 'USDC',
    date: new Date(),
    status: 'PENDING',
    referralPaid: false,
    referralAmount: 0
  });
  await this.save();
};

UserSchema.methods.markPaymentFailed = async function(signature: string) {
  const payment = this.paymentHistory.find((p: PaymentRecord) => p.transactionSignature === signature);
  if (payment) {
    payment.status = 'FAILED';
    await this.save();
  }
};

export const User = mongoose.model<IUser>('User', UserSchema);
