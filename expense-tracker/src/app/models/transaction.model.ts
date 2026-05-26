export const TRANSACTION_CATEGORIES = [
  'Food',
  'Transport',
  'Shopping',
  'Entertainment',
  'Bills',
  'Travel',
  'Health',
  'Subscriptions',
  'Other',
] as const;

export type TransactionCategory = typeof TRANSACTION_CATEGORIES[number];

export interface Transaction {
  id: string;
  user_id: string;
  merchant: string | null;
  amount: number;
  currency: string;
  transaction_date: string; // ISO date YYYY-MM-DD
  category: TransactionCategory;
  is_subscription: boolean;
  source_email: string | null;
  source_subject: string | null;
  created_at: string;
}
