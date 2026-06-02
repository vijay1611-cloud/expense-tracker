import { TransactionCategory } from '../models/transaction.model';

/**
 * Rules engine for assigning a category based on the merchant name (and
 * optionally a free-form note). Rules are matched in order; the first regex
 * that hits wins. Anything that doesn't match falls through to 'Other'.
 *
 * Curated for common Indian merchants. Add more as new patterns surface in
 * real data — this is the single source of truth for categorization.
 */

interface Rule {
  pattern: RegExp;
  category: TransactionCategory;
  isSubscription?: boolean;
}

const RULES: readonly Rule[] = [
  // Food & dining
  { pattern: /\bswiggy\b|swiggy[\s-]?instamart|swiggy[\s-]?genie/i, category: 'Food' },
  { pattern: /\bzomato\b|hyperpure/i, category: 'Food' },
  { pattern: /\b(dominos|domino's|pizza\s?hut|mcdonald|kfc|burger\s?king|subway|starbucks|haldiram|barbeque\s?nation|behrouz)\b/i, category: 'Food' },
  { pattern: /\b(eatfit|eatsure|faasos|box8|freshmenu)\b/i, category: 'Food' },
  { pattern: /\b(cafe|coffee|restaurant|bakery|biryani|chai)\b/i, category: 'Food' },
  { pattern: /\b(blinkit|zepto|dunzo|bigbasket|big\s?basket|jiomart|grofers)\b/i, category: 'Food' },

  // Transport
  { pattern: /\b(uber|ola|rapido|namma\s?yatri|lyft)\b/i, category: 'Transport' },
  { pattern: /\b(irctc|indian\s?railways|redrail|redbus|abhibus)\b/i, category: 'Transport' },
  { pattern: /\b(metro|bmtc|best|dtc|fastag|paytm\s?fastag|kapsch)\b/i, category: 'Transport' },
  { pattern: /\b(indian\s?oil|bharat\s?petroleum|hp\s?petrol|shell|reliance\s?petrol|fuel|petrol\s?pump)\b/i, category: 'Transport' },
  { pattern: /\b(parking|toll)\b/i, category: 'Transport' },

  // Travel
  { pattern: /\b(makemytrip|cleartrip|yatra|easemytrip|goibibo|booking\.com|airbnb|agoda|trivago|ixigo)\b/i, category: 'Travel' },
  { pattern: /\b(indigo|spicejet|air\s?india|vistara|akasa|emirates|qatar\s?airways|lufthansa)\b/i, category: 'Travel' },
  { pattern: /\b(hotel|resort|stay|oyo|treebo|fabhotel)\b/i, category: 'Travel' },

  // Subscriptions (also set is_subscription)
  { pattern: /\b(netflix|prime\s?video|amazon\s?prime|hotstar|disney|jio\s?cinema|sony\s?liv|zee5|voot)\b/i, category: 'Subscriptions', isSubscription: true },
  { pattern: /\b(spotify|apple\s?music|youtube\s?premium|youtube\s?music|gaana|wynk|saavn)\b/i, category: 'Subscriptions', isSubscription: true },
  { pattern: /\b(chess\.com|coursera|udemy|skillshare|duolingo|memberhip|leetcode\s?premium)\b/i, category: 'Subscriptions', isSubscription: true },
  { pattern: /\b(notion|figma|adobe|microsoft\s?365|office\s?365|github|gitlab|jetbrains|1password|dropbox|google\s?one|icloud)\b/i, category: 'Subscriptions', isSubscription: true },
  { pattern: /\b(canva|grammarly|chatgpt\s?plus|claude\s?pro|gemini\s?advanced|openai)\b/i, category: 'Subscriptions', isSubscription: true },

  // Bills / utilities
  { pattern: /\b(electricity|bescom|tneb|msedcl|adani\s?electricity|tata\s?power|reliance\s?energy)\b/i, category: 'Bills' },
  { pattern: /\b(airtel|jio|vodafone|vi\s|bsnl|recharge|postpaid|prepaid)\b/i, category: 'Bills' },
  { pattern: /\b(act\s?broadband|hathway|excitel|airtel\s?xstream|jio\s?fiber|gas\s?bill|indane|hp\s?gas)\b/i, category: 'Bills' },
  { pattern: /\b(rent|maintenance|society\s?maintenance|nobroker)\b/i, category: 'Bills' },

  // Shopping
  { pattern: /\b(amazon|flipkart|myntra|ajio|meesho|nykaa|tata\s?cliq|shoppers\s?stop|lifestyle|pantaloons)\b/i, category: 'Shopping' },
  { pattern: /\b(croma|reliance\s?digital|vijay\s?sales|apple\s?store|samsung\s?store)\b/i, category: 'Shopping' },
  { pattern: /\b(decathlon|firstcry|hopscotch|mamaearth|the\s?body\s?shop|chumbak|fabindia)\b/i, category: 'Shopping' },

  // Entertainment
  { pattern: /\b(bookmyshow|paytm\s?insider|district)\b/i, category: 'Entertainment' },
  { pattern: /\b(pvr|inox|cinepolis|movie)\b/i, category: 'Entertainment' },
  { pattern: /\b(steam|playstation|xbox|epic\s?games|nintendo)\b/i, category: 'Entertainment' },

  // Health
  { pattern: /\b(apollo|medplus|netmeds|pharmeasy|1mg|tata\s?1mg|practo|cult\.?fit|cultfit)\b/i, category: 'Health' },
  { pattern: /\b(hospital|clinic|diagnostic|lab|pharmacy|chemist)\b/i, category: 'Health' },
  { pattern: /\b(gym|fitness|yoga)\b/i, category: 'Health' },
];

export function categorize(
  merchant: string,
  fallback: TransactionCategory = 'Other',
): { category: TransactionCategory; is_subscription: boolean } {
  if (!merchant) return { category: fallback, is_subscription: false };
  for (const rule of RULES) {
    if (rule.pattern.test(merchant)) {
      return {
        category: rule.category,
        is_subscription: rule.isSubscription === true,
      };
    }
  }
  return { category: fallback, is_subscription: false };
}
