export enum TransactionType {
  BUY_GOLD = 'BUY_GOLD',
  SELL_GOLD = 'SELL_GOLD',
  BUY_SILVER = 'BUY_SILVER',
  SELL_SILVER = 'SELL_SILVER',
  CASH_PAYMENT = 'CASH_PAYMENT',
  GOLD_SETTLEMENT = 'GOLD_SETTLEMENT',
  SILVER_SETTLEMENT = 'SILVER_SETTLEMENT',
  BANK_ADJUSTMENT = 'BANK_ADJUSTMENT' // Internal bank adjustments
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
  rate?: number; 
  totalAmount?: number;
  cashIn?: number;
  cashOut?: number;
  goldIn?: number;
  goldOut?: number;
  silverIn?: number;
  silverOut?: number;
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