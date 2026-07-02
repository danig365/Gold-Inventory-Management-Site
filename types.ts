export enum TransactionType {
  BUY_GOLD = 'BUY_GOLD',
  SELL_GOLD = 'SELL_GOLD',
  BUY_SILVER = 'BUY_SILVER',
  SELL_SILVER = 'SELL_SILVER',
  BUY_COPPER = 'BUY_COPPER',
  SELL_COPPER = 'SELL_COPPER',
  CASH_PAYMENT = 'CASH_PAYMENT',
  GOLD_SETTLEMENT = 'GOLD_SETTLEMENT',
  SILVER_SETTLEMENT = 'SILVER_SETTLEMENT',
  COPPER_SETTLEMENT = 'COPPER_SETTLEMENT',
  BANK_ADJUSTMENT = 'BANK_ADJUSTMENT', // Internal bank adjustments
  LEDGER_TRANSFER = 'LEDGER_TRANSFER' // UI-only: generates a linked pair of CASH_PAYMENT entries between two customer ledgers
}

export enum PaymentMethod {
  CASH = 'CASH',
  BANK = 'BANK'
}

export enum TransferType {
  TF = 'TF',
  CHEQUE = 'CHEQUE'
}

export interface Bank {
  id: string;
  name: string;
  accountNumber: string;
  initialBalance: number;
}

export interface Transaction {
  id: string;
  customerId?: string; // Optional for bank-only transactions
  date: string;
  type: TransactionType;
  goldWeight?: number;
  silverWeight?: number;
  copperWeight?: number;
  rate?: number; 
  totalAmount?: number;
  cashIn?: number;
  cashOut?: number;
  goldIn?: number;
  goldOut?: number;
  silverIn?: number;
  silverOut?: number;
  copperIn?: number;
  copperOut?: number;
  remarks: string;
  rateMode?: 'GRAM' | 'TOLA';
  // Metal settlement details
  impureWeight?: number;
  point?: number;
  karat?: number;
  // Bank integration fields
  paymentMethod?: PaymentMethod;
  bankId?: string;
  transferType?: TransferType;
  referenceNo?: string;
  // Attached file/image
  attachmentId?: string;
  attachmentName?: string;
  // Timestamp of when the entry was created (used to display an entry "Time" alongside its Date)
  createdAt?: string;
}

export interface Customer {
  id: string;
  name: string;
  address?: string;
  phone?: string;
}

export interface AppState {
  customers: Customer[];
  transactions: Transaction[];
  banks: Bank[];
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  projectName: string;
  role: string;
  phone?: string;
}

export interface AdminUser {
  id: string;
  username: string;
  display_name: string;
  project_name: string;
  role: string;
  is_active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PresenceUser {
  id: string;
  username: string;
  display_name: string;
  role: string;
  is_active: boolean;
  last_seen: string | null;
  is_online: boolean;
}

export interface BackupEntry {
  id: string;
  createdAt: string;
  createdBy: string | null;
  note: string | null;
  size: number;
}

export interface RestoreResult {
  success: boolean;
  backupId: string;
  safetyBackupId: string;
  data: AppState;
}