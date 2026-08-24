// Shared constants for the wallet module.
// NO 'use server' — this file only exports plain values, not server actions.

export const WALLET_CACHE_TAGS = {
  LIST: 'wallet-list',
  STATS: 'wallet-stats',
  LOW_BALANCE: 'wallet-low-balance',
  WALLET_DETAIL: (id: number) => `wallet-detail-${id}`,
  TRANSACTIONS: (id: number) => `wallet-txns-${id}`,
  RENEWAL: 'wallet-renewal',
} as const
