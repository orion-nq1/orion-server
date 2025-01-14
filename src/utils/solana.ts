import { Connection } from '@solana/web3.js';

export const createConnection = (): Connection => {
  const endpoint = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || ""}`;
  return new Connection(endpoint);
};