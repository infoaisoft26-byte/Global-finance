export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  referralCode: string; // e.g. "GF152551"
  sponsorId?: string; // Referral code of the sponsor
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  isSuspended?: boolean;
  kycStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  panNumber?: string;
  bankAccount?: string;
  bankName?: string;
  ifscCode?: string;
  upiId?: string;
  directTeamCount?: number;
  totalTeamCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WalletData {
  userId: string;
  fundWallet: number; // Available Fund (₹)
  incomeWallet: number; // Available Balance (₹)
  basicPackageActive: number; // Basic Package Active Value (₹)
  fdPackageActive: number; // FD Package Active Value (₹)
  totalIncome: number;
  totalWithdrawal: number;
  directTeamCount: number;
  totalTeamCount: number;
  updatedAt?: string;
}

export type TransactionType = 
  | 'recharge' 
  | 'p2p_transfer' 
  | 'income_to_fund' 
  | 'withdrawal' 
  | 'roi_daily' 
  | 'referral_bonus' 
  | 'level_bonus' 
  | 'package_activation' 
  | 'admin_adjustment';

export interface TransactionLedger {
  id: string;
  userId: string;
  type: TransactionType;
  category: 'fund_wallet' | 'income_wallet';
  flow: 'credit' | 'debit';
  amount: number; // rupees
  fee: number;
  netAmount: number;
  description: string;
  referenceId: string;
  status: 'completed' | 'pending' | 'failed';
  metadata?: Record<string, any>;
  createdAt: string;
}

export type TransactionRequestType = 'recharge' | 'p2p_transfer' | 'income_to_fund' | 'withdrawal';

export type TransactionRequestStatus = 
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'processing'
  | 'completed'
  | 'rejected'
  | 'failed'
  | 'cancelled';

export interface TransactionRequest {
  id: string;
  reference: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  userReferralCode?: string;
  requestType: TransactionRequestType;
  sourceWalletType: 'fund_wallet' | 'income_wallet';
  destinationWalletType: 'fund_wallet' | 'income_wallet' | 'external_bank' | 'external_upi' | 'peer_user';
  beneficiaryUserId?: string;
  beneficiaryReferralCode?: string;
  beneficiaryName?: string;
  amountPaise: number; // Stored in integer paise (e.g. 50000 = ₹500.00)
  amountRupees: number;
  feePaise: number;
  feeRupees: number;
  netAmountPaise: number;
  netAmountRupees: number;
  status: TransactionRequestStatus;
  providerName?: string;
  providerReference?: string;
  userNote?: string;
  adminNote?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  completedAt?: string;
  failureReason?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface PackageActivationRecord {
  id: string;
  userId: string;
  packageType: 'basic' | 'fd';
  packageName: string;
  amount: number;
  roiDailyRate: number; // in percentage e.g. 0.8%
  durationDays: number;
  totalEarned: number;
  status: 'active' | 'matured' | 'cancelled';
  activatedAt: string;
  expiresAt: string;
}

export type PackageActivationStatus = 
  | 'pending' 
  | 'under_review' 
  | 'approved' 
  | 'active' 
  | 'matured' 
  | 'rejected' 
  | 'cancelled';

export interface PackageActivationRequest {
  id: string;
  reference: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  userReferralCode?: string;
  packageId: string;
  packageName: string;
  packageType: 'basic' | 'fd';
  amountPaise: number;
  amountRupees: number;
  fundingSource: 'fund_wallet';
  status: PackageActivationStatus;
  adminNote?: string;
  approvedBy?: string;
  approvedAt?: string;
  activatedAt?: string;
  rejectedAt?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface PackageDefinition {
  id: string;
  name: string;
  code: string;
  type: 'basic' | 'fd';
  minAmount: number; // rupees
  maxAmount: number;
  roiRate: number; // Daily percentage (for reference/rules)
  durationDays: number;
  description: string;
  terms: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DownlineMember {
  id: string;
  userId: string;
  sponsorId: string; // Sponsor's referral code
  referralCode: string;
  name: string;
  email: string;
  phone?: string;
  level: number;
  joinDate: string;
  activePackage: number;
  status: 'active' | 'inactive';
}

export interface KycSubmission {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  legalName: string;
  documentType: 'aadhaar' | 'pan' | 'passport' | 'driving_license';
  documentLast4: string;
  idDocName: string;
  idDocStorageId?: string; // Reference to private_kyc_storage
  idDocDataUrl?: string; // Private encrypted/storage base64 data
  addressDocName: string;
  addressDocStorageId?: string; // Reference to private_kyc_storage
  addressDocDataUrl?: string;
  status: 'pending' | 'in_review' | 'verified' | 'rejected';
  adminNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketMessage {
  id: string;
  senderId: string;
  senderRole: 'user' | 'admin';
  senderName: string;
  message: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userEmail: string;
  userName?: string;
  subject: string;
  category: 'deposit' | 'withdrawal' | 'package' | 'downline' | 'technical' | 'general';
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  messages?: TicketMessage[];
  adminReply?: string;
  assignedAdmin?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  actorUserId: string;
  actorEmail?: string;
  action: string;
  entityType: 'user' | 'kyc' | 'ticket' | 'package' | 'ledger' | 'settings' | 'transaction_request' | 'package_activation';
  entityId: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export type NotificationCategory = 'system' | 'transaction' | 'package' | 'kyc' | 'support' | 'security' | 'admin';

export interface AppNotification {
  id: string;
  userId: string;
  category: NotificationCategory;
  title: string;
  message: string;
  actionUrl?: string;
  isRead: boolean;
  metadata?: Record<string, any>;
  createdAt: string;
  readAt?: string;
}

export interface SystemSettings {
  // General
  platformName: string;
  tagline: string;
  supportEmail: string;
  maintenanceMode: boolean;

  // Transactions
  rechargeEnabled: boolean;
  p2pEnabled: boolean;
  incomeToFundEnabled: boolean;
  withdrawalEnabled: boolean;

  minRecharge: number; // in rupees
  maxRecharge: number;

  minP2p: number;
  maxP2p: number;

  minIncomeTransfer: number;
  maxIncomeTransfer: number;

  minWithdrawal: number;
  maxWithdrawal: number;
  withdrawalFeePercent: number;

  // Package Controls
  basicPackageEnabled: boolean;
  fdPackageEnabled: boolean;
  packageActivationApprovalRequired: boolean;

  // KYC rules
  requireKycForWithdrawal: boolean;
  requireKycForP2p: boolean;
  requireKycForPackageActivation: boolean;

  // Support
  supportTicketsEnabled: boolean;

  updatedAt: string;
  updatedBy?: string;
}

export type ActivePage = 
  | 'dashboard'
  | 'recharge'
  | 'basic-package'
  | 'fd-package'
  | 'direct-team'
  | 'team-list'
  | 'basic-roi'
  | 'basic-referral'
  | 'basic-level'
  | 'fd-roi'
  | 'fd-referral'
  | 'fd-level'
  | 'rd-level'
  | 'salary-income'
  | 'p2p-transfer'
  | 'transfer-income-fund'
  | 'fund-withdrawal'
  | 'daily-income-report'
  | 'monthly-income-report'
  | 'fund-wallet-summary'
  | 'income-wallet-summary'
  | 'support-tickets'
  | 'kyc'
  | 'notifications'
  | 'transactions'
  | 'package-activations'
  | 'packages'
  // Admin routes
  | 'admin-dashboard'
  | 'admin-users'
  | 'admin-user-detail'
  | 'admin-kyc'
  | 'admin-tickets'
  | 'admin-reports'
  | 'admin-packages'
  | 'admin-package-activations'
  | 'admin-transactions'
  | 'admin-test-buys'
  | 'admin-audit'
  | 'admin-settings';
