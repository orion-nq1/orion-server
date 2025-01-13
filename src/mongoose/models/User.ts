import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  walletAddress: string;
  referralCode: string;
  referredBy: string | null;
  referralCount: number;
  totalRewards: number;
  pendingRewards: number;
  claimedRewards: number;
  last24HoursRewards: number;
  last24HoursChange: {
    amount: number;     // Absolute change (e.g., 1234.34)
    percentage: number; // Percentage change (e.g., 5.44)
  };
  last24HoursUpdate: Date;
  createdAt: Date;
  lastLoginAt: Date;
  isActive: boolean;
  tier: 'BASIC' | 'PREMIUM' | 'PRO';
  referralHistory: {
    referredUser: string;
    date: Date;
    rewardClaimed: boolean;
    rewardAmount: number;
    claimedAt?: Date;
    status: 'PENDING' | 'CLAIMED' | 'EXPIRED';
  }[];
  update24HourRewards(): Promise<void>;
}

const UserSchema = new Schema<IUser>({
  walletAddress: {
    type: String,
    required: true,
    unique: true,
  },
  referralCode: {
    type: String,
    required: true,
    unique: true,
  },
  referredBy: {
    type: String,
    default: null,
  },
  referralCount: {
    type: Number,
    default: 0,
  },
  totalRewards: {
    type: Number,
    default: 0,
  },
  pendingRewards: {
    type: Number,
    default: 0,
  },
  claimedRewards: {
    type: Number,
    default: 0,
  },
  last24HoursRewards: {
    type: Number,
    default: 0,
  },
  last24HoursChange: {
    amount: {
      type: Number,
      default: 0,
    },
    percentage: {
      type: Number,
      default: 0,
    },
  },
  last24HoursUpdate: {
    type: Date,
    default: Date.now,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastLoginAt: {
    type: Date,
    default: Date.now,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  tier: {
    type: String,
    enum: ['BASIC', 'PREMIUM', 'PRO'],
    default: 'BASIC',
  },
  referralHistory: [{
    referredUser: String,
    date: {
      type: Date,
      default: Date.now,
    },
    rewardClaimed: {
      type: Boolean,
      default: false,
    },
    rewardAmount: {
      type: Number,
      default: 0,
    },
    claimedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['PENDING', 'CLAIMED', 'EXPIRED'],
      default: 'PENDING',
    },
  }],
});

// Index for faster queries
UserSchema.index({ walletAddress: 1, referralCode: 1 });

// Remove lowercase conversion for Solana addresses
UserSchema.pre('save', function(next) {
  next();
});

// Method to update 24h rewards
UserSchema.methods.update24HourRewards = async function() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  // Calculate rewards from last 24 hours
  const recent = this.referralHistory.filter(
    (ref: { date: Date }) => ref.date >= oneDayAgo
  );
  
  this.last24HoursRewards = recent.reduce(
    (sum: number, ref: { rewardAmount: number }) => sum + ref.rewardAmount,
    0
  );
  
  this.last24HoursUpdate = new Date();
  await this.save();
};

// Add this method to your UserSchema.methods
UserSchema.methods.getLast24HourRewards = async function() {
  const timeSinceLastUpdate = Date.now() - this.last24HoursUpdate.getTime();
  
  // If more than 1 hour has passed since last update, refresh the data
  if (timeSinceLastUpdate > 3600000) { // 1 hour in milliseconds
    await this.update24HourRewards();
  }
  
  return this.last24HoursRewards;
};

export const User = mongoose.model<IUser>('User', UserSchema);
