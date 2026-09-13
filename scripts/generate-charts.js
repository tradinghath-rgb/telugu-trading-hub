const fs = require('fs');
const path = require('path');

const targetDir = path.join(__dirname, '..', 'public', 'assets', 'charts');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Helper to generate realistic trading chart SVGs
function createTradingChartSVG(number, title, type, patternDetails) {
  const width = 800;
  const height = 480;

  // Generate pattern specific elements
  let patternGraphics = '';
  
  if (type === 'ob_fvg' || type === 'smc') {
    patternGraphics = `
      <!-- Order Block Zone -->
      <rect x="220" y="240" width="160" height="70" fill="rgba(0, 242, 152, 0.15)" stroke="#00f298" stroke-dasharray="4,4" stroke-width="1.5" rx="4"/>
      <text x="230" y="260" fill="#00f298" font-family="'Inter', sans-serif" font-size="12" font-weight="bold">INSTITUTIONAL ORDER BLOCK (OB)</text>
      <text x="230" y="278" fill="#a0aec0" font-family="'Inter', sans-serif" font-size="11">Smart Money Accumulation</text>

      <!-- FVG Zone -->
      <rect x="390" y="170" width="120" height="60" fill="rgba(0, 210, 255, 0.15)" stroke="#00d2ff" stroke-dasharray="3,3" stroke-width="1" rx="3"/>
      <text x="400" y="190" fill="#00d2ff" font-family="'Inter', sans-serif" font-size="11" font-weight="bold">FVG IMBALANCE</text>

      <!-- Mitigation Arrow -->
      <path d="M 520 180 Q 560 250 480 255" fill="none" stroke="#ffd700" stroke-width="2" stroke-dasharray="5,3" marker-end="url(#arrow-gold)"/>
      <text x="540" y="235" fill="#ffd700" font-family="'Inter', sans-serif" font-size="11" font-weight="bold">PULLBACK &amp; TAP</text>

      <!-- Target & Entry lines -->
      <line x1="100" y1="250" x2="740" y2="250" stroke="#00f298" stroke-width="1.5" stroke-dasharray="4,4"/>
      <text x="630" y="245" fill="#00f298" font-family="'Inter', sans-serif" font-size="11" font-weight="bold">ENTRY: 24,850.00</text>

      <line x1="100" y1="315" x2="740" y2="315" stroke="#ff3b57" stroke-width="1.5" stroke-dasharray="4,4"/>
      <text x="630" y="310" fill="#ff3b57" font-family="'Inter', sans-serif" font-size="11" font-weight="bold">STOP LOSS: 24,780.00</text>

      <line x1="100" y1="120" x2="740" y2="120" stroke="#00d2ff" stroke-width="1.5" stroke-dasharray="4,4"/>
      <text x="630" y="115" fill="#00d2ff" font-family="'Inter', sans-serif" font-size="11" font-weight="bold">TARGET: 25,200.00 (1:5 RR)</text>
    `;
  } else if (type === 'liquidity_sweep') {
    patternGraphics = `
      <!-- Equal Highs Liquidity Line -->
      <line x1="140" y1="170" x2="520" y2="170" stroke="#ff3b57" stroke-width="2" stroke-dasharray="6,4"/>
      <text x="160" y="160" fill="#ff3b57" font-family="'Inter', sans-serif" font-size="12" font-weight="bold">BUY-SIDE LIQUIDITY (EQUAL HIGHS)</text>
      
      <!-- Sweep Wick Circle -->
      <circle cx="460" cy="140" r="18" fill="none" stroke="#ffd700" stroke-width="2" stroke-dasharray="3,3"/>
      <text x="490" y="135" fill="#ffd700" font-family="'Inter', sans-serif" font-size="12" font-weight="bold">LIQUIDITY SWEEP &amp; REVERSAL WICK</text>
      <path d="M 460 140 L 460 190" stroke="#ff3b57" stroke-width="3"/>

      <!-- BOS Shift -->
      <path d="M 460 190 L 520 280 L 570 240 L 650 360" fill="none" stroke="#ff3b57" stroke-width="2.5"/>
      <text x="560" y="320" fill="#ff3b57" font-family="'Inter', sans-serif" font-size="12" font-weight="bold">CHoCH / BOS SHIFT</text>
      
      <line x1="100" y1="210" x2="740" y2="210" stroke="#00f298" stroke-width="1.5" stroke-dasharray="4,4"/>
      <text x="630" y="205" fill="#00f298" font-family="'Inter', sans-serif" font-size="11" font-weight="bold">SHORT ENTRY: 25,120</text>

      <line x1="100" y1="135" x2="740" y2="135" stroke="#ff3b57" stroke-width="1.5" stroke-dasharray="4,4"/>
      <text x="630" y="130" fill="#ff3b57" font-family="'Inter', sans-serif" font-size="11" font-weight="bold">STOP LOSS: 25,160</text>
      
      <line x1="100" y1="360" x2="740" y2="360" stroke="#00d2ff" stroke-width="1.5" stroke-dasharray="4,4"/>
      <text x="630" y="355" fill="#00d2ff" font-family="'Inter', sans-serif" font-size="11" font-weight="bold">TARGET: 24,700 (1:4.5 RR)</text>
    `;
  } else if (type === 'reversal') {
    patternGraphics = `
      <!-- Double Bottom / Head & Shoulders Shape -->
      <path d="M 160 220 L 260 350 L 340 260 L 420 355 L 520 210" fill="none" stroke="#00f298" stroke-width="3"/>
      <!-- Neckline -->
      <line x1="180" y1="260" x2="580" y2="260" stroke="#ffd700" stroke-width="2" stroke-dasharray="5,4"/>
      <text x="270" y="250" fill="#ffd700" font-family="'Inter', sans-serif" font-size="12" font-weight="bold">CONFIRMATION NECKLINE</text>

      <!-- Break & Retest -->
      <path d="M 520 210 Q 560 260 610 200" fill="none" stroke="#00d2ff" stroke-width="2.5"/>
      <text x="540" y="280" fill="#00d2ff" font-family="'Inter', sans-serif" font-size="11" font-weight="bold">RETEST &amp; GO ENTRY</text>

      <line x1="100" y1="260" x2="740" y2="260" stroke="#00f298" stroke-width="1.5" stroke-dasharray="4,4"/>
      <text x="630" y="255" fill="#00f298" font-family="'Inter', sans-serif" font-size="11" font-weight="bold">BUY: 24,900</text>
      <line x1="100" y1="365" x2="740" y2="365" stroke="#ff3b57" stroke-width="1.5" stroke-dasharray="4,4"/>
      <text x="630" y="360" fill="#ff3b57" font-family="'Inter', sans-serif" font-size="11" font-weight="bold">SL: 24,750</text>
      <line x1="100" y1="150" x2="740" y2="150" stroke="#00d2ff" stroke-width="1.5" stroke-dasharray="4,4"/>
      <text x="630" y="145" fill="#00d2ff" font-family="'Inter', sans-serif" font-size="11" font-weight="bold">TARGET: 25,350 (1:3 RR)</text>
    `;
  } else {
    patternGraphics = `
      <!-- Trendline Dynamic Support -->
      <line x1="120" y1="380" x2="650" y2="160" stroke="#ffd700" stroke-width="2.5"/>
      <text x="320" y="295" fill="#ffd700" font-family="'Inter', sans-serif" font-size="12" font-weight="bold" transform="rotate(-23 320 295)">INSTITUTIONAL TRENDLINE ACCUMULATION</text>
      
      <!-- Entry Confirmation Point -->
      <circle cx="530" cy="210" r="14" fill="none" stroke="#00f298" stroke-width="2.5"/>
      <text x="555" y="210" fill="#00f298" font-family="'Inter', sans-serif" font-size="12" font-weight="bold">PULLBACK ENTRY BOUNCE</text>
      
      <line x1="100" y1="210" x2="740" y2="210" stroke="#00f298" stroke-width="1.5" stroke-dasharray="4,4"/>
      <text x="630" y="205" fill="#00f298" font-family="'Inter', sans-serif" font-size="11" font-weight="bold">LONG: 24,950</text>
      <line x1="100" y1="260" x2="740" y2="260" stroke="#ff3b57" stroke-width="1.5" stroke-dasharray="4,4"/>
      <text x="630" y="255" fill="#ff3b57" font-family="'Inter', sans-serif" font-size="11" font-weight="bold">SL: 24,880</text>
      <line x1="100" y1="120" x2="740" y2="120" stroke="#00d2ff" stroke-width="1.5" stroke-dasharray="4,4"/>
      <text x="630" y="115" fill="#00d2ff" font-family="'Inter', sans-serif" font-size="11" font-weight="bold">TARGET: 25,400</text>
    `;
  }

  // Generate candlesticks
  let candles = '';
  const candleConfigs = [
    { x: 120, o: 320, c: 290, h: 280, l: 330, bull: true },
    { x: 145, o: 290, c: 310, h: 285, l: 320, bull: false },
    { x: 170, o: 310, c: 270, h: 260, l: 315, bull: true },
    { x: 195, o: 270, c: 285, h: 265, l: 295, bull: false },
    { x: 220, o: 285, c: 245, h: 240, l: 290, bull: true },
    { x: 245, o: 245, c: 250, h: 235, l: 260, bull: false },
    { x: 270, o: 250, c: 220, h: 210, l: 255, bull: true },
    { x: 295, o: 220, c: 235, h: 215, l: 240, bull: false },
    { x: 320, o: 235, c: 200, h: 190, l: 240, bull: true },
    { x: 345, o: 200, c: 215, h: 195, l: 225, bull: false },
    { x: 370, o: 215, c: 175, h: 165, l: 220, bull: true },
    { x: 395, o: 175, c: 190, h: 170, l: 205, bull: false },
    { x: 420, o: 190, c: 160, h: 150, l: 195, bull: true },
    { x: 445, o: 160, c: 140, h: 125, l: 165, bull: true },
    { x: 470, o: 140, c: 175, h: 130, l: 180, bull: false },
    { x: 495, o: 175, c: 200, h: 170, l: 210, bull: false },
    { x: 520, o: 200, c: 190, h: 180, l: 215, bull: true },
    { x: 545, o: 190, c: 220, h: 185, l: 225, bull: false },
    { x: 570, o: 220, c: 250, h: 215, l: 260, bull: false },
    { x: 595, o: 250, c: 235, h: 230, l: 265, bull: true },
    { x: 620, o: 235, c: 210, h: 200, l: 240, bull: true },
    { x: 645, o: 210, c: 170, h: 160, l: 215, bull: true }
  ];

  candleConfigs.forEach(c => {
    const color = c.bull ? '#00f298' : '#ff3b57';
    const top = Math.min(c.o, c.c);
    const bodyHeight = Math.max(Math.abs(c.o - c.c), 4);
    candles += `
      <!-- Candle at ${c.x} -->
      <line x1="${c.x}" y1="${c.h}" x2="${c.x}" y2="${c.l}" stroke="${color}" stroke-width="1.8"/>
      <rect x="${c.x - 7}" y="${top}" width="14" height="${bodyHeight}" fill="${color}" rx="1"/>
    `;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%">
  <defs>
    <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0e17"/>
      <stop offset="100%" stop-color="#121824"/>
    </linearGradient>
    <linearGradient id="header-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="rgba(0, 242, 152, 0.1)"/>
      <stop offset="100%" stop-color="rgba(0, 210, 255, 0.05)"/>
    </linearGradient>
    <marker id="arrow-gold" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 8 5 L 0 9 z" fill="#ffd700"/>
    </marker>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bg-gradient)"/>

  <!-- Grid Lines -->
  <g stroke="rgba(255, 255, 255, 0.05)" stroke-width="1">
    <line x1="80" y1="80" x2="750" y2="80"/>
    <line x1="80" y1="140" x2="750" y2="140"/>
    <line x1="80" y1="200" x2="750" y2="200"/>
    <line x1="80" y1="260" x2="750" y2="260"/>
    <line x1="80" y1="320" x2="750" y2="320"/>
    <line x1="80" y1="380" x2="750" y2="380"/>
    <line x1="80" y1="440" x2="750" y2="440"/>

    <line x1="140" y1="60" x2="140" y2="440"/>
    <line x1="240" y1="60" x2="240" y2="440"/>
    <line x1="340" y1="60" x2="340" y2="440"/>
    <line x1="440" y1="60" x2="440" y2="440"/>
    <line x1="540" y1="60" x2="540" y2="440"/>
    <line x1="640" y1="60" x2="640" y2="440"/>
  </g>

  <!-- Price Scale on Right -->
  <g fill="#718096" font-family="'Roboto Mono', monospace" font-size="11" text-anchor="end">
    <text x="785" y="84">25,400.00</text>
    <text x="785" y="144">25,200.00</text>
    <text x="785" y="204">25,000.00</text>
    <text x="785" y="264">24,800.00</text>
    <text x="785" y="324">24,600.00</text>
    <text x="785" y="384">24,400.00</text>
  </g>

  <!-- Header Info Bar -->
  <rect x="0" y="0" width="${width}" height="52" fill="url(#header-gradient)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="24" y="28" fill="#ffffff" font-family="'Inter', sans-serif" font-size="14" font-weight="700">CHART #${number} • ${title.toUpperCase()}</text>
  <text x="24" y="44" fill="#a0aec0" font-family="'Inter', sans-serif" font-size="11">NIFTY / BANKNIFTY 5M • TELUGU &amp; ENGLISH VIDEO BREAKDOWN INCLUDED</text>

  <!-- Watermark -->
  <text x="${width / 2}" y="${height / 2 + 30}" fill="rgba(255,255,255,0.03)" font-family="'Inter', sans-serif" font-size="64" font-weight="900" text-anchor="middle">TRADING HUB</text>

  <!-- Technical Pattern Markings -->
  ${patternGraphics}

  <!-- Candlesticks Layer -->
  ${candles}

  <!-- Volume Sub-Panel at Bottom -->
  <g opacity="0.6">
    <rect x="80" y="415" width="${width - 120}" height="45" fill="rgba(0,0,0,0.2)"/>
    <rect x="115" y="430" width="10" height="30" fill="#00f298"/>
    <rect x="140" y="440" width="10" height="20" fill="#ff3b57"/>
    <rect x="165" y="420" width="10" height="40" fill="#00f298"/>
    <rect x="190" y="435" width="10" height="25" fill="#ff3b57"/>
    <rect x="215" y="415" width="10" height="45" fill="#00f298"/>
    <rect x="240" y="438" width="10" height="22" fill="#ff3b57"/>
    <rect x="265" y="425" width="10" height="35" fill="#00f298"/>
    <rect x="290" y="432" width="10" height="28" fill="#ff3b57"/>
    <rect x="315" y="418" width="10" height="42" fill="#00f298"/>
    <rect x="340" y="436" width="10" height="24" fill="#ff3b57"/>
    <rect x="365" y="412" width="10" height="48" fill="#00f298"/>
    <rect x="390" y="430" width="10" height="30" fill="#ff3b57"/>
    <rect x="415" y="416" width="10" height="44" fill="#00f298"/>
    <rect x="440" y="410" width="10" height="50" fill="#00f298"/>
    <rect x="465" y="420" width="10" height="40" fill="#ff3b57"/>
    <rect x="490" y="415" width="10" height="45" fill="#ff3b57"/>
    <rect x="515" y="428" width="10" height="32" fill="#00f298"/>
    <rect x="540" y="422" width="10" height="38" fill="#ff3b57"/>
    <rect x="565" y="418" width="10" height="42" fill="#ff3b57"/>
    <rect x="590" y="426" width="10" height="34" fill="#00f298"/>
    <rect x="615" y="420" width="10" height="40" fill="#00f298"/>
    <rect x="640" y="412" width="10" height="48" fill="#00f298"/>
  </g>
</svg>`;
}

const titles = [
  { t: "Volume Secret", type: "ob_fvg" },
  { t: "Fake Breakout Trap", type: "liquidity_sweep" },
  { t: "Support & Resistance", type: "trendline" },
  { t: "Trading Psychology", type: "reversal" },
  { t: "Liquidity Masterclass", type: "liquidity_sweep" },
  { t: "Order Block Strategy", type: "ob_fvg" },
  { t: "Trendline Break & Retest", type: "trendline" },
  { t: "Doji Candlestick Pattern", type: "reversal" },
  { t: "91% Accuracy Setup", type: "ob_fvg" },
  { t: "Trade with Liquidity", type: "liquidity_sweep" },
  { t: "BOS & CHoCH Shift", type: "ob_fvg" },
  { t: "Bullish Candlestick", type: "reversal" },
  { t: "Bearish Candlestick", type: "reversal" },
  { t: "Nifty Scalping Strategy", type: "ob_fvg" },
  { t: "Why FVG Fails", type: "ob_fvg" },
  { t: "Stop Loss Trap", type: "liquidity_sweep" },
  { t: "Support & Resistance Confluence", type: "trendline" },
  { t: "Head and Shoulders", type: "reversal" },
  { t: "Liquidity Grab and Sweep", type: "liquidity_sweep" },
  { t: "Advanced Fake Breakout", type: "liquidity_sweep" },
  { t: "Perfect Entry Timing", type: "ob_fvg" },
  { t: "Double Top M-Pattern", type: "reversal" },
  { t: "Double Bottom W-Pattern", type: "reversal" },
  { t: "Liquidity Setup Masterclass", type: "liquidity_sweep" }
];

titles.forEach((item, index) => {
  const chartNumber = index + 1;
  const svg = createTradingChartSVG(chartNumber, item.t, item.type);
  fs.writeFileSync(path.join(targetDir, `chart-${chartNumber}.svg`), svg);
});

console.log(`Successfully generated 24 high-res SVG drawn charts into public/assets/charts/`);
