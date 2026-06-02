// Mirror of expense-tracker/src/app/services/category-rules.ts kept here
// so the sync-gmail-narrow Edge Function applies the same categorization
// that PDF uploads do. Keep these in sync when adding new rules.

type Category =
  | 'Food'
  | 'Transport'
  | 'Shopping'
  | 'Entertainment'
  | 'Bills'
  | 'Travel'
  | 'Health'
  | 'Subscriptions'
  | 'Other';

interface Rule {
  pattern: RegExp;
  category: Category;
  isSubscription?: boolean;
}

const RULES: readonly Rule[] = [
  // Subscriptions
  { pattern: /\bapple\s+media\s+services\b/i, category: 'Subscriptions', isSubscription: true },
  { pattern: /\b(itunes|app\s?store\b|appstore)\b/i, category: 'Subscriptions', isSubscription: true },
  { pattern: /\bgoogle\s+(play|one)\b|play\s?store/i, category: 'Subscriptions', isSubscription: true },
  { pattern: /\b(netflix|prime\s?video|amazon\s?prime|hotstar|disney|jio\s?cinema|sony\s?liv|zee5|voot)\b/i, category: 'Subscriptions', isSubscription: true },
  { pattern: /\b(spotify|apple\s?music|youtube\s?premium|youtube\s?music|gaana|wynk|saavn)\b/i, category: 'Subscriptions', isSubscription: true },
  { pattern: /\b(chess\.com|coursera|udemy|skillshare|duolingo|membership|leetcode)\b/i, category: 'Subscriptions', isSubscription: true },
  { pattern: /\b(notion|figma|adobe|microsoft\s?365|office\s?365|github|gitlab|jetbrains|1password|dropbox|icloud)\b/i, category: 'Subscriptions', isSubscription: true },
  { pattern: /\b(canva|grammarly|chatgpt|claude\s?pro|gemini\s?advanced|openai|anthropic)\b/i, category: 'Subscriptions', isSubscription: true },

  // Food
  { pattern: /\bswiggy\b|swiggy[\s-]?instamart|swiggy[\s-]?genie/i, category: 'Food' },
  { pattern: /\bzomato\b|hyperpure/i, category: 'Food' },
  { pattern: /\b(blinkit|zepto|dunzo|bigbasket|big\s?basket|jiomart|grofers|natures\s?basket)\b/i, category: 'Food' },
  { pattern: /\b(dominos|domino'?s|pizza\s?hut|mcdonald'?s?|kfc|burger\s?king|subway|starbucks|haldiram'?s?|barbeque\s?nation|behrouz)\b/i, category: 'Food' },
  { pattern: /\b(eatfit|eatsure|faasos|box8|freshmenu|thalapakatt[iu]|thalappakatt[iu])\b/i, category: 'Food' },
  { pattern: /\b(biryani|briyani|biriyani|thali|tiffin|dosa|idli|sambar|chettinad|andhra|kerala|punjabi|south\s?indian|north\s?indian|chinese|mughlai)\b/i, category: 'Food' },
  { pattern: /\b(cafe|coffee|restaurant|baker[sy]|baker'?s|bakehouse|hotel|dhaba|mess|bhavan|sweets?|mithai|juice|ice\s?cream)\b/i, category: 'Food' },
  { pattern: /\btea\s?time\b|\bchai\b|\btea\s+stall\b/i, category: 'Food' },
  { pattern: /\b(nation|kitchen|spice|tandoor|grill|kebab|veg|non[\s-]?veg|biryanis?)\b/i, category: 'Food' },

  // Transport
  { pattern: /\b(uber|ola|rapido|namma\s?yatri|lyft)\b/i, category: 'Transport' },
  { pattern: /\b(irctc|indian\s?railways|redrail|redbus|abhibus)\b/i, category: 'Transport' },
  { pattern: /\b(mtc|bmtc|best|dtc|ksrtc|tsrtc|apsrtc|msrtc|tnstc)\b/i, category: 'Transport' },
  { pattern: /\b(metropolitan|state)\s+transport\s+corporation\b/i, category: 'Transport' },
  { pattern: /\b(metro|metro\s?rail|local\s?train|monorail|fastag|kapsch|paytm\s?fastag)\b/i, category: 'Transport' },
  { pattern: /\b(indian\s?oil|iocl|bharat\s?petroleum|bpcl|hp\s?petrol|hindustan\s?petroleum|shell|reliance\s?petrol|nayara|petrol\s?pump|fuel|diesel)\b/i, category: 'Transport' },
  { pattern: /\b(parking|toll|auto\s?rickshaw|rickshaw)\b/i, category: 'Transport' },

  // Travel
  { pattern: /\b(makemytrip|cleartrip|yatra|easemytrip|goibibo|booking\.com|airbnb|agoda|trivago|ixigo|abhibus)\b/i, category: 'Travel' },
  { pattern: /\b(indigo|spicejet|air\s?india|vistara|akasa|emirates|qatar\s?airways|lufthansa|singapore\s?airlines)\b/i, category: 'Travel' },
  { pattern: /\b(hotel\s?booking|resort|oyo|treebo|fabhotel|holiday|tour\s?package)\b/i, category: 'Travel' },

  // Bills
  { pattern: /\b(electricity|bescom|tneb|msedcl|adani\s?electricity|tata\s?power|reliance\s?energy|cesc)\b/i, category: 'Bills' },
  { pattern: /\b(airtel|jio|vodafone|vi\s|bsnl|recharge|postpaid|prepaid|mobile\s?bill)\b/i, category: 'Bills' },
  { pattern: /\b(act\s?broadband|hathway|excitel|airtel\s?xstream|jio\s?fiber|gas\s?bill|indane|hp\s?gas|water\s?bill)\b/i, category: 'Bills' },
  { pattern: /\b(rent|maintenance|society\s?maintenance|nobroker|housing\s?society)\b/i, category: 'Bills' },
  { pattern: /\b(insurance|premium|policy)\b/i, category: 'Bills' },

  // Health
  { pattern: /\b(salon|saloon|parlou?r|beauty\s?parlou?r|spa|barber)\b/i, category: 'Health' },
  { pattern: /\bnursing\s?home\b/i, category: 'Health' },
  { pattern: /\b(hospital|clinic|diagnostic|lab|pathology|polyclinic)\b/i, category: 'Health' },
  { pattern: /\bmedicals?|medical\s?store|\bpharmacy\b|\bchemists?|drugs?\s?store|drug\s?mart/i, category: 'Health' },
  { pattern: /\b(apollo|medplus|netmeds|pharmeasy|1mg|tata\s?1mg|practo|cult\.?fit|cultfit|wellbeing)\b/i, category: 'Health' },
  { pattern: /\bproteins?|\bsupplements?|\bnutrition|\bwhey|\bgym\b|\bfitness\b|\byoga\b|cross\s?fit/i, category: 'Health' },
  { pattern: /\b(dental|dentist|optic|optical|eye\s?care|ayurveda|homeopath)\b/i, category: 'Health' },

  // Shopping
  { pattern: /\b(super\s?market|supermarket|hyper\s?market|hypermarket|mall|department\s?store)\b/i, category: 'Shopping' },
  { pattern: /\b(amazon|flipkart|myntra|ajio|meesho|nykaa|tata\s?cliq|shoppers\s?stop|lifestyle|pantaloons|reliance\s?trends)\b/i, category: 'Shopping' },
  { pattern: /\b(croma|reliance\s?digital|vijay\s?sales|apple\s?store|samsung\s?store|poorvika|sangeetha)\b/i, category: 'Shopping' },
  { pattern: /\b(decathlon|firstcry|hopscotch|mamaearth|the\s?body\s?shop|chumbak|fabindia|westside|max)\b/i, category: 'Shopping' },
  { pattern: /\b(kirana|provisions?|general\s?store|stationary|stationery|hardware|book\s?store|saree|jewelle?ry|tailor)\b/i, category: 'Shopping' },

  // Entertainment
  { pattern: /\b(bookmyshow|paytm\s?insider|district)\b/i, category: 'Entertainment' },
  { pattern: /\b(pvr|inox|cinepolis|movie|cinema|theatre)\b/i, category: 'Entertainment' },
  { pattern: /\b(steam|playstation|psn|xbox|epic\s?games|nintendo|gaming)\b/i, category: 'Entertainment' },
];

export function categorize(
  merchant: string,
  fallbackCategory: Category = 'Other',
  fallbackIsSubscription = false,
): { category: Category; is_subscription: boolean } {
  if (!merchant) return { category: fallbackCategory, is_subscription: fallbackIsSubscription };
  for (const rule of RULES) {
    if (rule.pattern.test(merchant)) {
      return {
        category: rule.category,
        is_subscription: rule.isSubscription === true,
      };
    }
  }
  return { category: fallbackCategory, is_subscription: fallbackIsSubscription };
}
