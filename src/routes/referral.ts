import { RequestHandler } from 'express';
import { User } from '../mongoose/models/User';
import { ReferralUtils } from '../utils/referral';

// Single endpoint to handle all signup scenarios
export const signup: RequestHandler = async (req, res, next): Promise<void> => {
  try {
    const walletAddress = res.locals.pubKey;
    const { referralCode } = req.body; // Optional

    // Check if user already exists
    const existingUser = await User.findOne({ walletAddress });
    if (existingUser) {
      res.status(400).json({ error: 'Wallet already registered' });
      return;
    }

    // If referral code provided, validate and process it
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (!referrer) {
        res.status(404).json({ error: 'Invalid referral code' });
        return;
      }

      if (!referrer.isActive) {
        res.status(400).json({ error: 'This referral code is inactive' });
        return;
      }

      // Create new user with referral
      const newUser = new User({
        walletAddress,
        referralCode: await ReferralUtils.generateReferralCode(),
        referredBy: referrer.walletAddress
      });
      await newUser.save();

      // Update referrer's stats
      const rewardAmount = ReferralUtils.calculateReward(referrer.tier);
      await User.findOneAndUpdate(
        { walletAddress: referrer.walletAddress },
        {
          $inc: { 
            referralCount: 1,
            totalRewards: rewardAmount,
            pendingRewards: rewardAmount 
          },
          $push: {
            referralHistory: {
              referredUser: walletAddress,
              rewardAmount,
              date: new Date(),
              rewardClaimed: false,
              status: 'PENDING'
            }
          }
        }
      );

      res.json({ 
        success: true, 
        referralCode: newUser.referralCode,
        referredBy: referrer.walletAddress 
      });
      return;
    }

    // Simple signup without referral
    const newUser = new User({
      walletAddress,
      referralCode: await ReferralUtils.generateReferralCode()
    });
    await newUser.save();

    res.json({ 
      success: true, 
      referralCode: newUser.referralCode 
    });
    return;

  } catch (error) {
    next(error);
    return;
  }
};

// Get user's referral information
export const getUserInfo: RequestHandler = async (req, res, next): Promise<void> => {
  try {
    const { walletAddress } = req.params; // Get from URL params

    const user = await User.findOne({ walletAddress: walletAddress });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      user: user
    });
    return;

  } catch (error) {
    next(error);
    return;
  }
};

// Login for existing users
export const login: RequestHandler = async (req, res, next): Promise<void> => {
  try {
    const walletAddress = res.locals.pubKey;

    const user = await User.findOne({ walletAddress });
    if (!user) {
      res.status(404).json({ error: 'User not found. Please sign up first.' });
      return;
    }

    // Update last login time
    await User.findByIdAndUpdate(user._id, {
      lastLoginAt: new Date()
    });

    res.json({
      success: true,
      user: {
        walletAddress: user.walletAddress,
        referralCode: user.referralCode,
        referralCount: user.referralCount,
        totalRewards: user.totalRewards,
        pendingRewards: user.pendingRewards,
        tier: user.tier,
        referredBy: user.referredBy
      }
    });
    return;

  } catch (error) {
    next(error);
    return;
  }
};
