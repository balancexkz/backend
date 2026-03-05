import { ApiV3PoolInfoConcentratedItem, TickUtils, PoolUtils } from '@raydium-io/raydium-sdk-v2';
import Decimal from 'decimal.js';

export const isValidClmm = (programId: string): boolean => {
  return programId === 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK' || programId === 'DEVwAR8A7D4RGG8h3tP5vVvQ6pNqwzX2RoXj9vYqHy'; // Mainnet и devnet program IDs
};
