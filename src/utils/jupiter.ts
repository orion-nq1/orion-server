import { 
  Connection, 
  PublicKey, 
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  TransactionInstruction,
  AddressLookupTableAccount,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction } from '@solana/spl-token';

const USDC_MINT = new PublicKey(process.env.USDC_MINT_ADDRESS!);
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

export async function createSubscriptionTransaction(
  connection: Connection,
  userWallet: PublicKey,
  amount: number,
  payWithSol: boolean = false
): Promise<{ transaction: string, swapAmount?: number }> {
  try {
    if (payWithSol) {
      // First, get a quote for USDC output amount
      const quoteResponse = await fetch(
        `https://quote-api.jup.ag/v6/quote?` + 
        `inputMint=${SOL_MINT.toString()}&` +
        `outputMint=${USDC_MINT.toString()}&` +
        `amount=${amount * 1_000_000}&` + // USDC has 6 decimals
        `swapMode=ExactOut&` + 
        `slippageBps=50`
      );
      
      const quoteData = await quoteResponse.json();
      if (quoteData.error) {
        throw new Error(`Jupiter quote error: ${quoteData.error}`);
      }

      // Get swap instructions
      const swapRequestBody = {
        quoteResponse: quoteData,
        userPublicKey: userWallet.toString(),
        wrapAndUnwrapSol: true,
      };

      const instructionsResponse = await fetch('https://quote-api.jup.ag/v6/swap-instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(swapRequestBody),
      });

      const instructions = await instructionsResponse.json();
      if (instructions.error) {
        throw new Error(`Jupiter instructions error: ${instructions.error}`);
      }

      const {
        computeBudgetInstructions,
        setupInstructions,
        swapInstruction,
        cleanupInstruction,
        addressLookupTableAddresses,
      } = instructions;

      // Helper to deserialize instructions
      const deserializeInstruction = (instruction: any): TransactionInstruction => {
        return new TransactionInstruction({
          programId: new PublicKey(instruction.programId),
          keys: instruction.accounts.map((key: any) => ({
            pubkey: new PublicKey(key.pubkey),
            isSigner: key.isSigner,
            isWritable: key.isWritable,
          })),
          data: Buffer.from(instruction.data, 'base64'),
        });
      };

      // Get address lookup table accounts
      const getAddressLookupTableAccounts = async (
        keys: string[]
      ): Promise<AddressLookupTableAccount[]> => {
        const addressLookupTableAccountInfos = await connection.getMultipleAccountsInfo(
          keys.map((key) => new PublicKey(key))
        );

        return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
          const addressLookupTableAddress = keys[index];
          if (accountInfo) {
            const addressLookupTableAccount = new AddressLookupTableAccount({
              key: new PublicKey(addressLookupTableAddress),
              state: AddressLookupTableAccount.deserialize(accountInfo.data),
            });
            acc.push(addressLookupTableAccount);
          }
          return acc;
        }, new Array<AddressLookupTableAccount>());
      };

      // Create transfer instruction
      const merchantWallet = new PublicKey(process.env.MERCHANT_WALLET!);
      const userTokenAccount = await getAssociatedTokenAddress(USDC_MINT, userWallet);
      const merchantTokenAccount = await getAssociatedTokenAddress(USDC_MINT, merchantWallet);

      const transferInstruction = createTransferInstruction(
        userTokenAccount,
        merchantTokenAccount,
        userWallet,
        amount * 1_000_000, // USDC decimals
      );

      // Get lookup tables
      const addressLookupTableAccounts = await getAddressLookupTableAccounts(
        addressLookupTableAddresses
      );

      // Create transaction
      const { blockhash } = await connection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: userWallet,
        recentBlockhash: blockhash,
        instructions: [
          ...computeBudgetInstructions.map(deserializeInstruction),
          ...setupInstructions.map(deserializeInstruction),
          deserializeInstruction(swapInstruction),
          transferInstruction,
          ...(cleanupInstruction ? [deserializeInstruction(cleanupInstruction)] : []),
        ],
      }).compileToV0Message(addressLookupTableAccounts);

      const transaction = new VersionedTransaction(messageV0);

      return {
        transaction: Buffer.from(transaction.serialize()).toString('base64'),
        swapAmount: quoteData.inputAmount / LAMPORTS_PER_SOL
      };
    } else {
      // Direct USDC transfer
      const merchantWallet = new PublicKey(process.env.MERCHANT_WALLET!);
      const userTokenAccount = await getAssociatedTokenAddress(USDC_MINT, userWallet);
      const merchantTokenAccount = await getAssociatedTokenAddress(USDC_MINT, merchantWallet);
      console.log(userTokenAccount, merchantTokenAccount, userWallet, amount * 1_000_000);
      const transferInstruction = createTransferInstruction(
        userTokenAccount,
        merchantTokenAccount,
        userWallet,
        amount * 1_000_000, // USDC decimals
      );
    
      const transaction = new Transaction().add(transferInstruction);
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = userWallet;
      console.log(transaction);
      return {
        transaction: Buffer.from(transaction.serialize({ requireAllSignatures: false })).toString('base64')
      };
    }
  } catch (error) {
    console.error('Error creating transaction:', error);
    throw error;
  }
} 