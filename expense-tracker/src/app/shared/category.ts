import { TransactionCategory } from '../models/transaction.model';

export interface CategoryStyle {
  bgClass: string;
  textClass: string;
  barClass: string;
  iconBgClass: string;
  iconTextClass: string;
}

// Class strings are written literally so Tailwind's content scanner picks
// them up. Keep them as full names — don't compose at runtime.
export const CATEGORY_STYLES: Record<TransactionCategory, CategoryStyle> = {
  Food: {
    bgClass: 'bg-orange-50',
    textClass: 'text-orange-700',
    barClass: 'bg-orange-500',
    iconBgClass: 'bg-orange-100',
    iconTextClass: 'text-orange-700',
  },
  Transport: {
    bgClass: 'bg-blue-50',
    textClass: 'text-blue-700',
    barClass: 'bg-blue-500',
    iconBgClass: 'bg-blue-100',
    iconTextClass: 'text-blue-700',
  },
  Shopping: {
    bgClass: 'bg-pink-50',
    textClass: 'text-pink-700',
    barClass: 'bg-pink-500',
    iconBgClass: 'bg-pink-100',
    iconTextClass: 'text-pink-700',
  },
  Entertainment: {
    bgClass: 'bg-purple-50',
    textClass: 'text-purple-700',
    barClass: 'bg-purple-500',
    iconBgClass: 'bg-purple-100',
    iconTextClass: 'text-purple-700',
  },
  Bills: {
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-700',
    barClass: 'bg-amber-500',
    iconBgClass: 'bg-amber-100',
    iconTextClass: 'text-amber-700',
  },
  Travel: {
    bgClass: 'bg-sky-50',
    textClass: 'text-sky-700',
    barClass: 'bg-sky-500',
    iconBgClass: 'bg-sky-100',
    iconTextClass: 'text-sky-700',
  },
  Health: {
    bgClass: 'bg-rose-50',
    textClass: 'text-rose-700',
    barClass: 'bg-rose-500',
    iconBgClass: 'bg-rose-100',
    iconTextClass: 'text-rose-700',
  },
  Subscriptions: {
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-700',
    barClass: 'bg-emerald-500',
    iconBgClass: 'bg-emerald-100',
    iconTextClass: 'text-emerald-700',
  },
  Other: {
    bgClass: 'bg-zinc-50',
    textClass: 'text-zinc-700',
    barClass: 'bg-zinc-500',
    iconBgClass: 'bg-zinc-100',
    iconTextClass: 'text-zinc-700',
  },
};
