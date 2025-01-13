import crypto from 'crypto';
import { User } from '../mongoose/models/User';

export class ReferralUtils {
  // Generate a unique referral code
  static async generateReferralCode(length: number = 8): Promise<string> {
    const generateCode = () => {
      return crypto.randomBytes(length)
        .toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, length)
        .toUpperCase();
    };

    let code = generateCode();
    // Ensure code is unique
    while (await User.findOne({ referralCode: code })) {
      code = generateCode();
    }
    return code;
  }

  // Calculate reward amount based on tier
  static calculateReward(userTier: 'BASIC' | 'PREMIUM' | 'PRO'): number {
    const rewardRates = {
      'BASIC': 10,
      'PREMIUM': 15,
      'PRO': 20
    };
    return rewardRates[userTier];
  }

  // Validate a referral code
  static async validateReferralCode(code: string): Promise<boolean> {
    const referrer = await User.findOne({ referralCode: code });
    return !!referrer && referrer.isActive;
  }
} 