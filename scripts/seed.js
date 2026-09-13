const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 1. Initial Site Configuration (Fully editable by Admin from live CMS!)
const initialSiteConfig = {
  brandName: "TRADING HUB",
  tagline: "High Probability Drawn Charts & Bilingual Telugu/English Analysis",
  introVideo: "/videos/intro/lv_0_20260901105849.mp4",
  autoPlayIntro: true,
  pricing: {
    price: 399,
    currencySymbol: "₹",
    originalPrice: 1999,
    discountBadge: "80% LIMITED LAUNCH OFFER",
    accessType: "LIFETIME UNLIMITED ACCESS",
    razorpayUrl: "https://rzp.io/rzp/2a3h6cU"
  },
  hero: {
    badge: "INSTAGRAM TRADING COMMUNITY • 24+ LESSONS",
    title: "Master Price Action & Institutional Trading with Drawn Charts",
    subtitle: "Step-by-step drawn technical charts with in-depth explained video breakdowns in Telugu and English. Master SMC, Liquidity Sweeps, Order Blocks, and Fake Breakouts.",
    ctaText: "Unlock Lifetime Access - ₹399",
    secondaryCtaText: "Explore Chart Setups"
  },
  features: [
    {
      icon: "chart-candlestick",
      title: "24+ Hand-Drawn Charts",
      desc: "Crystal-clear chart markings showing exact Entry, Stop Loss, Target, and Liquidity zones."
    },
    {
      icon: "languages",
      title: "Dual Language Video Player",
      desc: "Watch the breakdown of every single chart in your preferred language: Telugu (తెలుగు) or English."
    },
    {
      icon: "shield-check",
      title: "Institutional SMC & Liquidity",
      desc: "Learn why retail traders fail: Order Blocks, FVG Traps, Stop Loss Hunts, and BOS/CHoCH."
    },
    {
      icon: "infinity",
      title: "One-Time ₹399 Lifetime Access",
      desc: "Pay once, access forever. No monthly subscriptions, no hidden fees. Instant access right after payment."
    },
    {
      icon: "upload-cloud",
      title: "Daily New Setups",
      desc: "Get fresh daily market charts and bilingual breakdown videos updated directly by the mentor."
    },
    {
      icon: "smartphone",
      title: "Mobile & Desktop Optimized",
      desc: "Learn on the go directly from your smartphone, tablet, or desktop with instant video playback."
    }
  ],
  termsAndConditions: {
    heading: "Terms & Conditions and Non-Refundable Agreement",
    noRefundPolicy: "STRICT NO-REFUND POLICY: All sales are final. Due to the immediate digital delivery and non-tangible nature of our proprietary drawn trading charts, strategic setups, and educational video recordings, NO REFUNDS OR CANCELLATIONS WILL BE ISSUED under any circumstances once payment of ₹399 is completed.",
    disclaimer: "DISCLAIMER: Content provided is solely for educational and training purposes. Trading stocks, futures, options, and forex involves substantial risk of loss. Past performance of any chart setup or strategy is not indicative of future results. We are not SEBI registered advisors. Trade responsibly.",
    agreementNotice: "By clicking checkout or completing the ₹399 payment via Razorpay, you explicitly agree to these terms and confirm that you waive any rights to chargebacks or refund requests."
  },
  contact: {
    supportEmail: "support@tradinghub.in",
    instagramHandle: "@tradinghub",
    telegramHandle: "t.me/tradinghub"
  }
};

// 2. Initial Paired Charts & Videos
const initialCharts = [
  {
    id: "chart-01",
    reelNumber: 1,
    title: "Volume Secret - Institutional Confirmation Breakdown",
    category: "Volume & Price Action",
    summary: "Discover how big institutions use volume anomalies before initiating massive market rallies.",
    keyTakeaway: "High volume with narrow spread indicates absorption by Smart Money. Look for continuation on breakout.",
    teluguVideo: "/videos/telugu/reel-1(volume secret).mp4",
    englishVideo: "/videos/english/reel-1(volume secret).mp4",
    chartImage: "/assets/charts/chart-1.svg",
    dateAdded: "2026-09-01",
    views: 1420
  },
  {
    id: "chart-02",
    reelNumber: 2,
    title: "Fake Breakout Trap - Retail Liquidity Hunt",
    category: "Traps & Fakeouts",
    summary: "How market makers engineer false breakout wicks above resistance to trigger retail buy-stops.",
    keyTakeaway: "Never enter on the first breakout candle. Wait for re-entry inside the range to short the liquidity sweep.",
    teluguVideo: "/videos/telugu/reel-2(fake breakout).mp4",
    englishVideo: "/videos/english/reel-2(fake breakout).mp4",
    chartImage: "/assets/charts/chart-2.svg",
    dateAdded: "2026-09-02",
    views: 1890
  },
  {
    id: "chart-03",
    reelNumber: 3,
    title: "Support & Resistance - Key Supply & Demand Zones",
    category: "Price Action Core",
    summary: "How to draw true institutional supply and demand zones instead of weak retail single-line supports.",
    keyTakeaway: "Mark zone highs and lows using wick to body measurements on multi-timeframe charts.",
    teluguVideo: "/videos/telugu/reel-3(supportt&resistance).mp4",
    englishVideo: "/videos/english/reel-3(supportt&resistance).mp4",
    chartImage: "/assets/charts/chart-3.svg",
    dateAdded: "2026-09-03",
    views: 2150
  },
  {
    id: "chart-04",
    reelNumber: 4,
    title: "Trading Psychology - Emotional Discipline & Risk Management",
    category: "Mindset & Psychology",
    summary: "The mental framework required to eliminate revenge trading and maintain strict 1:3 risk-to-reward ratios.",
    keyTakeaway: "A 40% win-rate system with 1:3 RR beats an 80% win-rate system with poor risk management every time.",
    teluguVideo: "/videos/telugu/reel-4(trading psychology).mp4",
    englishVideo: "/videos/english/reel-4(trading psychology).mp4",
    chartImage: "/assets/charts/chart-4.svg",
    dateAdded: "2026-09-04",
    views: 1650
  },
  {
    id: "chart-05",
    reelNumber: 5,
    title: "Liquidity Masterclass - Locating Trapped Orders",
    category: "SMC & Liquidity",
    summary: "Understand internal and external range liquidity, buy-side liquidity (BSL) and sell-side liquidity (SSL).",
    keyTakeaway: "Prices move from one liquidity pool to the next. Identify where retail stops rest before executing.",
    teluguVideo: "/videos/telugu/reel-5(liquiduty).mp4",
    englishVideo: "/videos/english/reel-5(liquiduty).mp4",
    chartImage: "/assets/charts/chart-5.svg",
    dateAdded: "2026-09-05",
    views: 2430
  },
  {
    id: "chart-06",
    reelNumber: 6,
    title: "Order Block Strategy - Smart Money Entry Footprints",
    category: "SMC & Liquidity",
    summary: "How to identify valid bullish and bearish order blocks (OB) with displacement and imbalance.",
    keyTakeaway: "Valid OBs must be followed by an aggressive displacement candle that creates an FVG.",
    teluguVideo: "/videos/telugu/reel-6(order block).mp4",
    englishVideo: "/videos/english/reel-6(order block).mp4",
    chartImage: "/assets/charts/chart-6.svg",
    dateAdded: "2026-09-06",
    views: 3100
  },
  {
    id: "chart-07",
    reelNumber: 7,
    title: "Trendline Break & Retest Strategy",
    category: "Price Action Core",
    summary: "Stop entering bad trendline breaks. Learn the high probability institutional retest rule.",
    keyTakeaway: "Wait for price to break, retest the flip level, and show exhaustion before opening positions.",
    teluguVideo: "/videos/telugu/reel-7(trendline).mp4",
    englishVideo: "/videos/english/reel-7(trendline).mp4",
    chartImage: "/assets/charts/chart-7.svg",
    dateAdded: "2026-09-07",
    views: 1980
  },
  {
    id: "chart-08",
    reelNumber: 8,
    title: "Doji Candlestick Pattern - The Indecision Reversal",
    category: "Candlestick Patterns",
    summary: "How to trade Dragonfly Doji, Gravestone Doji, and Long-legged Doji at key market inflection points.",
    keyTakeaway: "A Doji in the middle of a range is noise. A Doji at a higher timeframe key level is gold.",
    teluguVideo: "/videos/telugu/reel-8 (doji).mp4",
    englishVideo: "/videos/english/reel-8 (doji).mp4",
    chartImage: "/assets/charts/chart-8.svg",
    dateAdded: "2026-09-08",
    views: 1540
  },
  {
    id: "chart-09",
    reelNumber: 9,
    title: "91% Accuracy High Probability Trading Setup",
    category: "Advanced Strategies",
    summary: "The flagship high-win-rate setup combining structure shift, liquidity sweep, and order block entry.",
    keyTakeaway: "Multi-factor confluence setup: 1. Higher TF Trend, 2. Lower TF Liquidity Sweep, 3. Entry at 50% Equilibrium.",
    teluguVideo: "/videos/telugu/reel-9(91% accurcy).mp4",
    englishVideo: "/videos/english/reel-9(91% accurcy).mp4",
    chartImage: "/assets/charts/chart-9.svg",
    dateAdded: "2026-09-09",
    views: 4500
  },
  {
    id: "chart-10",
    reelNumber: 10,
    title: "Trade with Liquidity - Institutional Flow Navigation",
    category: "SMC & Liquidity",
    summary: "Detailed guide to aligning your trades with the dominant market cycle and institutional momentum.",
    keyTakeaway: "Trade with the sweeps, not against them. If price sweeps equal highs, look for short triggers.",
    teluguVideo: "/videos/telugu/reel-10(trade with lqty).mp4",
    englishVideo: "/videos/english/reel-10(trade with lqty).mp4",
    chartImage: "/assets/charts/chart-10.svg",
    dateAdded: "2026-09-10",
    views: 2200
  },
  {
    id: "chart-11",
    reelNumber: 11,
    title: "BOS & CHoCH - Break of Structure & Change of Character",
    category: "SMC & Liquidity",
    summary: "Master the difference between a minor pull-back, a true Break of Structure (BOS), and a trend-reversing CHoCH.",
    keyTakeaway: "CHoCH signals the first sign of trend failure. Wait for the subsequent pullback to Order Block for entry.",
    teluguVideo: "/videos/telugu/reel-11(BOS&CHOCH).mp4",
    englishVideo: "/videos/english/reel-11(BOS&CHOCH).mp4",
    chartImage: "/assets/charts/chart-11.svg",
    dateAdded: "2026-09-11",
    views: 3800
  },
  {
    id: "chart-12",
    reelNumber: 12,
    title: "Bullish Candlestick Patterns Masterclass",
    category: "Candlestick Patterns",
    summary: "Hammer, Bullish Engulfing, Morning Star, and Piercing Line patterns broken down with volume confirmation.",
    keyTakeaway: "Pattern context matters more than the shape. Only trade bullish patterns at proven demand zones.",
    teluguVideo: "/videos/telugu/reel-12(BULLISH CANDLE PATTERN).mp4",
    englishVideo: "/videos/english/reel-12(BULLISH CANDLE PATTERN).mp4",
    chartImage: "/assets/charts/chart-12.svg",
    dateAdded: "2026-09-12",
    views: 2600
  },
  {
    id: "chart-13",
    reelNumber: 13,
    title: "Bearish Candlestick Patterns Masterclass",
    category: "Candlestick Patterns",
    summary: "Shooting Star, Bearish Engulfing, Evening Star, and Three Black Crows explained with institutional context.",
    keyTakeaway: "Confirm bearish patterns with volume expansion on the down candle.",
    teluguVideo: "/videos/telugu/reel-13(BEARISH CANDLE PATTERN).mp4",
    englishVideo: "/videos/english/reel-13(BEARISH CANDLE PATTERN).mp4",
    chartImage: "/assets/charts/chart-13.svg",
    dateAdded: "2026-09-13",
    views: 2400
  },
  {
    id: "chart-14",
    reelNumber: 14,
    title: "Nifty & Bank Nifty Options Scalping Strategy",
    category: "Index Strategies",
    summary: "High-speed 1-minute and 3-minute scalping framework tailored for Indian Index options trading.",
    keyTakeaway: "Use 9:20 AM and 1:30 PM opening momentum alongside VWAP and CPR pivot boundaries.",
    teluguVideo: "/videos/telugu/reel-14(nifty ststrategy).mp4",
    englishVideo: "/videos/english/reel-14(nifty ststrategy).mp4",
    chartImage: "/assets/charts/chart-14.svg",
    dateAdded: "2026-09-14",
    views: 5100
  },
  {
    id: "chart-15",
    reelNumber: 15,
    title: "Why FVG (Fair Value Gap) Fails - Hidden Traps",
    category: "SMC & Liquidity",
    summary: "Why do some FVGs give 100-point moves while others get sliced through like butter? Here is the secret.",
    keyTakeaway: "Never trade an FVG that has already been mitigated or sits below higher-timeframe discount pricing.",
    teluguVideo: "/videos/telugu/REEL-15(WHY FVG FAIL).mp4",
    englishVideo: "/videos/english/REEL-15(WHY FVG FAIL).mp4",
    chartImage: "/assets/charts/chart-15.svg",
    dateAdded: "2026-09-15",
    views: 3950
  },
  {
    id: "chart-16",
    reelNumber: 16,
    title: "Stop Loss Trap - How Big Players Hunt You",
    category: "Traps & Fakeouts",
    summary: "Uncover how market makers trigger stop cascades at obvious swing lows to fill their massive buy orders.",
    keyTakeaway: "Place your stop loss where retail traders place their entries. Protect your capital behind structural invalidation.",
    teluguVideo: "/videos/telugu/REEL-16(SL TRAP).mp4",
    englishVideo: "/videos/english/REEL-16(SL TRAP).mp4",
    chartImage: "/assets/charts/chart-16.svg",
    dateAdded: "2026-09-16",
    views: 4200
  },
  {
    id: "chart-17",
    reelNumber: 17,
    title: "Support & Resistance Confluence Strategy",
    category: "Price Action Core",
    summary: "Combining horizontal levels with fibonacci golden pockets and volume clusters for maximum edge.",
    keyTakeaway: "Multi-variable confluence gives 3x higher statistical edge than single-line chart reading.",
    teluguVideo: "/videos/telugu/REEL-17(SUPPORT AND RESISTANCE).mp4",
    englishVideo: "/videos/english/reel-3(supportt&resistance).mp4",
    chartImage: "/assets/charts/chart-17.svg",
    dateAdded: "2026-09-17",
    views: 1900
  },
  {
    id: "chart-18",
    reelNumber: 18,
    title: "Head and Shoulders - High Win-Rate Reversal Setup",
    category: "Chart Patterns",
    summary: "The definitive guide to identifying genuine Head and Shoulders vs fake retail necklines.",
    keyTakeaway: "Look for lower volume on the right shoulder and enter on the retest of the broken neckline.",
    teluguVideo: "/videos/telugu/REEL-18(HEAD AND SHOULDE).mp4",
    englishVideo: "/videos/english/REEL-18(HEAD AND SHOULDE).mp4",
    chartImage: "/assets/charts/chart-18.svg",
    dateAdded: "2026-09-18",
    views: 2750
  },
  {
    id: "chart-19",
    reelNumber: 19,
    title: "Liquidity Grab & Sweep - Sniper Reversal Entry",
    category: "SMC & Liquidity",
    summary: "Recognize the classic wick sweep that signals instant trend exhaustion and violent reverse expansion.",
    keyTakeaway: "Look for quick displacement back into the previous consolidation immediately after the sweep.",
    teluguVideo: "/videos/telugu/REEL-19(LQT GRAB AND SWEEP).mp4",
    englishVideo: "/videos/english/REEL-19(LQT GRAB AND SWEEP).mp4",
    chartImage: "/assets/charts/chart-19.svg",
    dateAdded: "2026-09-19",
    views: 3300
  },
  {
    id: "chart-20",
    reelNumber: 20,
    title: "Advanced Fake Breakout Identification",
    category: "Traps & Fakeouts",
    summary: "Advanced strategies to avoid getting trapped at range highs and turning losing trades into big winners.",
    keyTakeaway: "Watch delta and candle wicks. High volume wicks closing back inside the range confirm trap setups.",
    teluguVideo: "/videos/telugu/REEL-20(FAKE BREAKOUT).mp4",
    englishVideo: "/videos/english/REEL-20(FAKE BREAKOUT).mp4",
    chartImage: "/assets/charts/chart-20.svg",
    dateAdded: "2026-09-20",
    views: 2900
  },
  {
    id: "chart-21",
    reelNumber: 21,
    title: "Perfect Entry Timing & Sniper Execution",
    category: "Advanced Strategies",
    summary: "Master entry timing using the 3-step confirmation model: Sweep -> Shift -> Return to Discount.",
    keyTakeaway: "Patience pays. Never chase green candles; let price pull back to your calculated entry zone.",
    teluguVideo: "/videos/telugu/REEL-21(PERFECT ENTRY).mp4",
    englishVideo: "/videos/english/REEL-21(PERFECT ENTRY).mp4",
    chartImage: "/assets/charts/chart-21.svg",
    dateAdded: "2026-09-21",
    views: 4800
  },
  {
    id: "chart-22",
    reelNumber: 22,
    title: "Double Top M-Pattern - Bearish Confirmation Setup",
    category: "Chart Patterns",
    summary: "How to trade the M-Pattern like an institution: identify the liquidity sweep at the second peak.",
    keyTakeaway: "The second peak must sweep liquidity above the first peak without closing higher on the candle body.",
    teluguVideo: "/videos/telugu/REEL-22(DOUBLE TOP).mp4",
    englishVideo: "/videos/english/REEL-22(DOUBLE TOP).mp4",
    chartImage: "/assets/charts/chart-22.svg",
    dateAdded: "2026-09-22",
    views: 2600
  },
  {
    id: "chart-23",
    reelNumber: 23,
    title: "Double Bottom W-Pattern - Bullish Accumulation Setup",
    category: "Chart Patterns",
    summary: "How institutions accumulate inventory at the second bottom of a W-formation before launching.",
    keyTakeaway: "Second bottom sweep creates a spring (Wyckoff). Enter on the break of the intermediate high.",
    teluguVideo: "/videos/telugu/REEL-23(DOUBLE BOTTOM).mp4",
    englishVideo: "/videos/english/REEL-23(DOUBLE BOTTOM).mp4",
    chartImage: "/assets/charts/chart-23.svg",
    dateAdded: "2026-09-23",
    views: 2800
  },
  {
    id: "chart-24",
    reelNumber: 24,
    title: "High Probability Liquidity Setup Masterclass",
    category: "SMC & Liquidity",
    summary: "Complete blueprint linking market open, daily high/low sweeps, and precision trade management.",
    keyTakeaway: "Mark previous day high (PDH) and low (PDL). When one is swept, target the opposite.",
    teluguVideo: "/videos/telugu/REEL-24(LQT SETUP).mp4",
    englishVideo: "/videos/english/REE;-24(LQT SETUP).mp4",
    chartImage: "/assets/charts/chart-24.svg",
    dateAdded: "2026-09-24",
    views: 4600
  }
];

// 3. Initial Users & Admin Seed
const initialUsers = [
  {
    id: "admin-1",
    email: "admin@tradinghub.in",
    password: "adminpassword123", // In production hashed, for CMS simplicity clear/sha256
    name: "Master Trader (Admin)",
    role: "admin",
    hasPaid: true,
    paidAt: "2026-09-01T00:00:00.000Z",
    paymentId: "ADMIN_PROVISIONED"
  },
  {
    id: "demo-member-1",
    email: "student@tradinghub.in",
    password: "member123",
    name: "Ramesh Trader",
    role: "member",
    hasPaid: true,
    paidAt: "2026-09-10T12:00:00.000Z",
    paymentId: "pay_DEMO_VERIFIED_LIFETIME"
  }
];

fs.writeFileSync(path.join(dataDir, 'site-config.json'), JSON.stringify(initialSiteConfig, null, 2));
fs.writeFileSync(path.join(dataDir, 'charts.json'), JSON.stringify(initialCharts, null, 2));
fs.writeFileSync(path.join(dataDir, 'users.json'), JSON.stringify(initialUsers, null, 2));

console.log('Successfully seeded:');
console.log('- site-config.json');
console.log('- charts.json (' + initialCharts.length + ' lessons with paired Telugu & English videos)');
console.log('- users.json');
