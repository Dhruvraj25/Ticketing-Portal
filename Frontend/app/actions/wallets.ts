// Backward-compatible re-export barrel file.
// New imports should use '@/app/actions/wallet' directly.
// This file exists so existing imports from '@/app/actions/wallets' continue to work.

export {
  // Queries
  getWallets,
  getWalletById,
  getWalletDashboardStats,
  getLowBalanceWallets,
  getWalletByProject,
  // Transactions
  getWalletTransactions,
  getWalletTicketConsumption,
  getWalletRechargesThisMonth,
  // Alerts
  getWalletAlerts,
  getActiveWalletAlerts,
  resolveWalletAlert,
  generateAlertsForWallet,
  // Renewals
  getClientRenewalStatus,
  logRenewalReminderActivity,
  checkClientCanCreateTicket,
  recalculateWallet,
  // Assign hours
  addWalletHours,
  deductWalletHours,
  reserveWalletHours,
  releaseReservedHours,
  adjustWalletHours,
  autoCreateWalletForClient,
  autoCreateWalletForProject,
  // New orchestrators
  getWalletPageData,
  getWalletDetailPageData,
  invalidateWalletCaches,
} from './wallet'
