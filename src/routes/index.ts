import { Router } from 'express';
import { web3Auth } from '../middleware/web3Auth';
import { signup, getUserInfo, login } from './referral';

const router = Router();

// POST endpoints
router.post('/signup', web3Auth({ action: 'signup' }), signup);
router.post('/login', web3Auth({ action: 'login' }), login);

// GET endpoints
router.get('/user/:walletAddress', getUserInfo);

export default router;