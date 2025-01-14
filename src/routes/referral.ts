import { RequestHandler } from 'express';
import { User } from '../mongoose/models/User';
import { ReferralUtils } from '../utils/referral';

// Single endpoint to handle all signup scenarios
export const signup: RequestHandler = async (req, res, next): Promise<void> => {
  try {
    const walletAddress = res.locals.pubKey;

    // Check if user already exists
    const existingUser = await User.findOne({ walletAddress });
    if (existingUser) {
      res.status(400).json({ error: 'Wallet already registered' });
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
 
    const user = await User.findOne({ 
      walletAddress: { $regex: new RegExp(req.params.walletAddress, 'i') } 
    });
    
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      success: true,
      user: user
    });
  } catch (error) {
    next(error);
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
        referredBy: user.referredBy
      }
    });
    return;

  } catch (error) {
    next(error);
    return;
  }
};
