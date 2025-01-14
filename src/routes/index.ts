import { Router } from 'express';
import { web3Auth } from '../middleware/web3Auth';
import { signup, getUserInfo, login } from './referral';
import { createPaymentIntent, verifyPayment, getStatus } from './subscription';

const router = Router();

// POST endpoints
router.post('/signup', web3Auth({ action: 'signup' }), signup);
router.post('/login', web3Auth({ action: 'login' }), login);
router.post('/subscription/intent', createPaymentIntent);
router.post('/subscription/verify', verifyPayment);

// GET endpoints
router.get('/user/:walletAddress', getUserInfo);
router.get('/subscription/status/:walletAddress', getStatus);

export default router;