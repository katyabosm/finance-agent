// Reads data/statement.csv and builds dashboard.html (v2, spec: specs/prd.md)
// Run: node scripts/build_dashboard.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

// ---------- Settings ----------
const LIMITS = { 'Cafes & restaurants': 100, 'Shopping': 300, 'Entertainment': 50 }; // EUR per month
const FUND = { start: 12000, goal: 20000, deadline: '2031-10' };                       // emergency fund

// ---------- Palette: Swiss lakes ----------
const C = { turquoise: '#2BB3B1', glacier: '#8FD3E8', deep: '#0E5A6B', alpine: '#5E9C6A', snow: '#F5FAFB', stone: '#6B7A80', sunset: '#E07A5F', sand: '#D9A441', ink: '#163A44' };

// ---------- Category rules (keyword in merchant name or description) ----------
const RULES = [
  { cat: 'Savings', color: C.deep, words: ['savings transfer'] },
  { cat: 'Subscriptions', color: '#7FA7C9', words: ['subscription'] },
  { cat: 'Housing & utilities', color: C.deep, words: ['rent', 'utilities', 'internet', 'mobile plan'] },
  { cat: 'Groceries', color: C.alpine, words: ['grocery', 'groceries', 'supermarket', 'street market', 'bakery'] },
  { cat: 'Cafes & restaurants', color: C.sunset, words: ['coffee', 'cafe', 'bistro', 'food delivery'] },
  { cat: 'Transport', color: C.sand, words: ['taxi', 'transit', 'fuel'] },
  { cat: 'Health', color: '#B98BB0', words: ['pharmacy', 'clinic', 'doctor'] },
  { cat: 'Shopping', color: C.turquoise, words: ['marketplace', 'clothing', 'clothes', 'electronics'] },
  { cat: 'Entertainment', color: C.glacier, words: ['cinema', 'concert', 'tickets'] },
];
const OTHER = { cat: 'Other', color: '#A9B4B8' };
const INCOME = 'Income';

function categorize(op) {
  if (op.amount > 0) return INCOME;
  const text = (op.merchant + ' ' + op.desc).toLowerCase();
  const rule = RULES.find(r => r.words.some(w => text.includes(w)));
  return rule ? rule.cat : OTHER.cat;
}

// ---------- CSV ----------
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const rows = parseCSV(fs.readFileSync(path.join(root, 'data', 'statement.csv'), 'utf8')).slice(1).filter(r => r.length >= 4);
const ops = rows.map(([date, amount, merchant, desc]) => ({ date, amount: parseFloat(amount), merchant, desc }));
ops.forEach(o => { o.cat = categorize(o); o.month = o.date.slice(0, 7); });

// ---------- Numbers ----------
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = ym => MONTHS[parseInt(ym.slice(5), 10) - 1];
const short = ym => monthName(ym).slice(0, 3);
const money = n => (n < 0 ? '−' : '') + '€' + Math.round(Math.abs(n)).toLocaleString('en-US');
const money2 = n => '€' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = d => { const [y, m, dd] = d.split('-'); return `${MONTHS[+m - 1].slice(0, 3)} ${+dd}, ${y}`; };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sum = arr => arr.reduce((s, o) => s + o.amount, 0);

const months = [...new Set(ops.map(o => o.month))].sort();
const [prevM, lastM] = months.slice(-2);
const income = sum(ops.filter(o => o.amount > 0));
const expenses = ops.filter(o => o.amount < 0 && o.cat !== 'Savings');   // savings are not spending
const savingsOps = ops.filter(o => o.cat === 'Savings');
const spent = -sum(expenses);
const saved = -sum(savingsOps);
const net = income - spent - saved;

// Limits
const catMonth = (cat, m) => -sum(expenses.filter(o => o.cat === cat && o.month === m));
const limitCards = Object.entries(LIMITS).map(([cat, lim]) => {
  const s = catMonth(cat, lastM), pct = s / lim;
  const state = pct > 1 ? 'over' : pct >= 0.8 ? 'near' : 'ok';
  return { cat, lim, s, pct, state, left: lim - s };
});
const history = months.map(m => ({ m, cells: Object.entries(LIMITS).map(([cat, lim]) => ({ cat, lim, s: catMonth(cat, m) })) }));
const overCount = history.reduce((n, h) => n + h.cells.filter(c => c.s > c.lim).length, 0);

// Emergency fund
const fundNow = FUND.start + saved;
const avgSave = saved / months.length;
const monthsBetween = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5) - +a.slice(5));
const monthsLeft = monthsBetween(lastM, FUND.deadline);
const needed = Math.max(0, (FUND.goal - fundNow) / monthsLeft);
const onTrack = avgSave >= needed - 0.005;
const etaMonths = avgSave > 0 ? Math.ceil((FUND.goal - fundNow) / avgSave) : Infinity;
const addMonths = (ym, n) => { const t = +ym.slice(0, 4) * 12 + (+ym.slice(5) - 1) + n; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; };
const eta = etaMonths === Infinity ? null : addMonths(lastM, etaMonths);
const fundPct = fundNow / FUND.goal;

// Categories, months, top, compare
const byCat = [...RULES.filter(r => r.cat !== 'Savings'), OTHER].map(c => ({ ...c, sum: -sum(expenses.filter(o => o.cat === c.cat)) }))
  .filter(c => c.sum > 0).sort((a, b) => b.sum - a.sum);
const colorOf = cat => (RULES.find(r => r.cat === cat) || OTHER).color;
const byMonth = months.map(m => ({ m, sum: -sum(expenses.filter(o => o.month === m)) }));
const top10 = [...expenses].sort((a, b) => a.amount - b.amount).slice(0, 10);
const compare = byCat.map(c => ({ cat: c.cat, color: c.color, a: catMonth(c.cat, prevM), b: catMonth(c.cat, lastM) }))
  .map(x => ({ ...x, d: x.b - x.a })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
const totalPrev = byMonth.find(x => x.m === prevM).sum, totalLast = byMonth.find(x => x.m === lastM).sum;

// ---------- SVG pieces ----------
const R = 70, CIRC = 2 * Math.PI * R;
let off = 0;
const donut = byCat.map(c => {
  const len = c.sum / spent * CIRC, l = Math.max(len - 1.5, 0);
  const seg = `<circle cx="90" cy="90" r="${R}" fill="none" stroke="${c.color}" stroke-width="24" stroke-dasharray="${l.toFixed(2)} ${(CIRC - l).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 90 90)"><title>${esc(c.cat)}: ${money(c.sum)}</title></circle>`;
  off += len; return seg;
}).join('');

const FR = 62, FC = 2 * Math.PI * FR;
const fundRing = `<svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Emergency fund ${Math.round(fundPct * 100)} percent">
  <circle cx="80" cy="80" r="${FR}" fill="none" stroke="${C.glacier}" stroke-opacity=".35" stroke-width="14"/>
  <circle cx="80" cy="80" r="${FR}" fill="none" stroke="${C.turquoise}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(fundPct * FC).toFixed(2)} ${FC.toFixed(2)}" transform="rotate(-90 80 80)"/>
  <text x="80" y="78" text-anchor="middle" font-size="26" font-weight="700" fill="${C.ink}">${Math.round(fundPct * 100)}%</text>
  <text x="80" y="98" text-anchor="middle" font-size="11" fill="${C.stone}">of ${money(FUND.goal)}</text></svg>`;

const maxM = Math.max(...byMonth.map(x => x.sum));
const BW = 54, GAP = 20, H = 170, barsW = 20 + byMonth.length * (BW + GAP);
const avgY = H - (spent / months.length) / maxM * (H - 30);
const bars = byMonth.map((x, i) => {
  const h = x.sum / maxM * (H - 30), X = 10 + i * (BW + GAP), Y = H - h;
  return `<rect x="${X}" y="${Y.toFixed(1)}" width="${BW}" height="${h.toFixed(1)}" rx="6" fill="${x.m === lastM ? C.turquoise : C.glacier}"><title>${monthName(x.m)}: ${money(x.sum)}</title></rect>
    <text x="${X + BW / 2}" y="${(Y - 6).toFixed(1)}" text-anchor="middle" class="bv">${money(x.sum)}</text>
    <text x="${X + BW / 2}" y="${H + 16}" text-anchor="middle" class="bl">${short(x.m)}</text>`;
}).join('') + `<line x1="4" x2="${barsW - 4}" y1="${avgY.toFixed(1)}" y2="${avgY.toFixed(1)}" stroke="${C.deep}" stroke-dasharray="4 4"/>`;

const pct = n => (n * 100).toFixed(0) + '%';
const delta = d => d > 0.5 ? `<span class="chip up">▲ +${money(d)}</span>` : d < -0.5 ? `<span class="chip down">▼ ${money(d)}</span>` : '<span class="chip flat">no change</span>';
const stateLabel = { ok: 'On track', near: 'Close to limit', over: 'Over limit' };

const limitHTML = limitCards.map(l => `
      <div class="limit ${l.state}">
        <div class="lim-top"><span class="lim-name">${esc(l.cat)}</span><span class="badge ${l.state}">${stateLabel[l.state]}</span></div>
        <div class="lim-num"><b>${money(l.s)}</b> <span>/ ${money(l.lim)}</span></div>
        <div class="bar"><i style="width:${Math.min(l.pct, 1) * 100}%"></i></div>
        <div class="lim-left">${l.left >= 0 ? `${money(l.left)} left` : `Over by ${money(-l.left)}`}</div>
      </div>`).join('');

const historyHTML = `<table>
        <tr><th>Month</th>${Object.entries(LIMITS).map(([c, l]) => `<th class="num">${esc(c)}<br><small>limit ${money(l)}</small></th>`).join('')}</tr>
        ${history.map(h => `<tr><td>${monthName(h.m)}</td>${h.cells.map(c => c.s > c.lim
          ? `<td class="num over-cell">${money(c.s)} <span class="flag">over by ${money(c.s - c.lim)}</span></td>`
          : `<td class="num">${money(c.s)}</td>`).join('')}</tr>`).join('')}
      </table>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>My Finance Dashboard</title>
<style>
  :root { --snow:${C.snow}; --card:#fff; --ink:${C.ink}; --stone:${C.stone}; --deep:${C.deep}; --turq:${C.turquoise}; --glacier:${C.glacier}; --alpine:${C.alpine}; --sunset:${C.sunset}; --sand:${C.sand}; --line:#E1ECEF; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--snow); color:var(--ink); font:14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
  .hero { position:relative; background: linear-gradient(160deg, ${C.deep} 0%, #13798A 55%, ${C.turquoise} 100%); color:#fff; padding: 22px 16px 64px; overflow:hidden; }
  .hero svg.mtn { position:absolute; left:0; right:0; bottom:0; width:100%; height:70px; }
  .hero .in, .wrap { max-width: 1180px; margin: 0 auto; position:relative; }
  .eyebrow { text-transform: uppercase; letter-spacing: .1em; font-size: 11px; color: #CDEFF2; }
  h1 { margin: 4px 0 2px; font-size: 26px; }
  .hero .sub { color:#DDF4F6; }
  .wrap { padding: 0 16px 40px; margin-top: -40px; }
  .card { background:var(--card); border-radius:16px; padding:16px 20px; min-width:0; box-shadow: 0 1px 2px rgba(14,90,107,.06), 0 6px 18px rgba(14,90,107,.08); }
  .card h2 { margin:0 0 12px; font-size:15px; color:var(--deep); }
  .first { display:grid; grid-template-columns: 1.6fr 1fr; gap:14px; margin-bottom:14px; }
  .limits { display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; }
  .limit { border:1px solid var(--line); border-radius:12px; padding:12px 14px; }
  .lim-top { display:flex; justify-content:space-between; align-items:center; gap:6px; }
  .lim-name { font-weight:600; font-size:13px; }
  .badge { font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px; white-space:nowrap; }
  .badge.ok { background:#E6F2E8; color:#3F7A4C; } .badge.near { background:#FBF0D9; color:#8A6514; } .badge.over { background:#FBE6E0; color:#B24A30; }
  .lim-num { margin:10px 0 6px; } .lim-num b { font-size:24px; } .lim-num span { color:var(--stone); }
  .bar { height:8px; background:#E7F3F6; border-radius:99px; overflow:hidden; }
  .bar i { display:block; height:100%; border-radius:99px; background:var(--alpine); }
  .near .bar i { background:var(--sand); } .over .bar i { background:var(--sunset); }
  .lim-left { margin-top:6px; font-size:12px; color:var(--stone); } .over .lim-left { color:#B24A30; font-weight:600; }
  .fund { display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
  .fund dl { margin:0; flex:1; min-width:190px; display:grid; grid-template-columns: auto auto; gap:4px 12px; font-size:13px; }
  .fund dt { color:var(--stone); } .fund dd { margin:0; text-align:right; font-weight:600; font-variant-numeric: tabular-nums; }
  .status { margin-top:10px; font-weight:700; font-size:13px; padding:6px 10px; border-radius:8px; display:inline-block; }
  .status.yes { background:#E6F2E8; color:#3F7A4C; } .status.no { background:#FBE6E0; color:#B24A30; }
  .kpis { display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; margin-bottom:14px; }
  .kpi span { color:var(--stone); font-size:12px; text-transform:uppercase; letter-spacing:.05em; } .kpi b { display:block; font-size:22px; margin-top:4px; }
  .grid { display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-bottom:14px; }
  .cats { display:flex; gap:20px; align-items:center; flex-wrap:wrap; }
  .legend { flex:1; min-width:220px; margin:0; padding:0; list-style:none; }
  .legend li { display:grid; grid-template-columns: 12px 1fr auto 40px; gap:8px; align-items:center; padding:5px 0; border-top:1px solid var(--line); }
  .legend li:first-child { border-top:0; }
  .dot { width:10px; height:10px; border-radius:50%; display:inline-block; }
  .legend .v { font-weight:600; font-variant-numeric: tabular-nums; } .legend .p { color:var(--stone); text-align:right; }
  svg text.bv { font-size:11px; fill:${C.ink}; font-weight:600; } svg text.bl { font-size:12px; fill:${C.stone}; }
  .hint { color:var(--stone); font-size:12px; margin-top:4px; }
  .scroll { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; font-variant-numeric: tabular-nums; }
  th, td { text-align:left; padding:7px 6px; border-top:1px solid var(--line); }
  th { color:var(--stone); font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.04em; border-top:0; vertical-align:bottom; }
  th small { text-transform:none; letter-spacing:0; font-weight:400; }
  td.num, th.num { text-align:right; white-space:nowrap; }
  .over-cell { background:#FDF1EC; color:#B24A30; font-weight:700; }
  .flag { display:block; font-size:11px; font-weight:600; }
  td .cat { display:inline-flex; align-items:center; gap:6px; }
  .chip { display:inline-block; padding:1px 8px; border-radius:999px; font-weight:600; font-size:12px; }
  .chip.up { color:#B24A30; background:#FBE6E0; } .chip.down { color:#3F7A4C; background:#E6F2E8; } .chip.flat { color:var(--stone); background:#EEF3F4; }
  tr.total td { font-weight:700; border-top:2px solid var(--line); }
  details summary { cursor:pointer; font-weight:600; color:var(--deep); }
  .note { color:var(--stone); font-size:12px; margin-top:16px; text-align:center; }
  @media (max-width: 900px) { .first, .grid { grid-template-columns: 1fr; } }
  @media (max-width: 600px) { .limits { grid-template-columns: 1fr; } .kpis { grid-template-columns: 1fr 1fr; } h1 { font-size: 22px; } }
</style>
</head>
<body>
<header class="hero">
  <svg class="mtn" viewBox="0 0 1200 70" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 70 L0 46 L120 22 L210 40 L330 8 L430 36 L520 20 L640 44 L760 14 L860 34 L980 18 L1100 40 L1200 26 L1200 70 Z" fill="#fff" fill-opacity=".12"/>
    <path d="M0 70 L0 56 L160 38 L280 52 L420 30 L560 54 L700 36 L840 52 L1000 34 L1200 50 L1200 70 Z" fill="#fff" fill-opacity=".18"/>
  </svg>
  <div class="in">
    <div class="eyebrow">Finance agent · v2</div>
    <h1>My Finance Dashboard</h1>
    <div class="sub">${monthName(months[0])} – ${monthName(lastM)} 2026 · ${ops.length} transactions · sample data</div>
  </div>
</header>

<div class="wrap">
  <div class="first">
    <section class="card">
      <h2>Limits — ${monthName(lastM)} 2026</h2>
      <div class="limits">${limitHTML}</div>
    </section>
    <section class="card">
      <h2>Emergency fund</h2>
      <div class="fund">
        ${fundRing}
        <dl>
          <dt>Saved now</dt><dd>${money(fundNow)}</dd>
          <dt>Goal</dt><dd>${money(FUND.goal)} by ${monthName(FUND.deadline)} ${FUND.deadline.slice(0, 4)}</dd>
          <dt>Saving per month</dt><dd>${money2(avgSave)}</dd>
          <dt>Needed per month</dt><dd>${money2(needed)}</dd>
          <dt>Reached at this pace</dt><dd>${eta ? `${monthName(eta)} ${eta.slice(0, 4)}` : 'never'}</dd>
        </dl>
      </div>
      <div class="status ${onTrack ? 'yes' : 'no'}">${onTrack ? '✓ On track for the goal' : '✗ Not on track — save more per month'}</div>
    </section>
  </div>

  <section class="kpis">
    <div class="card kpi"><span>Income</span><b>${money(income)}</b></div>
    <div class="card kpi"><span>Spending</span><b>${money(spent)}</b></div>
    <div class="card kpi"><span>Saved</span><b>${money(saved)}</b></div>
    <div class="card kpi"><span>Left over</span><b style="color:${net < 0 ? C.sunset : C.alpine}">${net < 0 ? '' : '+'}${money(net)}</b></div>
  </section>

  <section class="card" style="margin-bottom:14px">
    <h2>Limits history <small style="color:var(--stone);font-weight:400">· ${overCount} time${overCount === 1 ? '' : 's'} over limit</small></h2>
    <div class="scroll">${historyHTML}</div>
  </section>

  <div class="grid">
    <section class="card">
      <h2>Spending by category</h2>
      <div class="cats">
        <svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label="Spending by category">${donut}
          <text x="90" y="85" text-anchor="middle" font-size="11" fill="${C.stone}">TOTAL</text>
          <text x="90" y="104" text-anchor="middle" font-size="17" font-weight="700" fill="${C.ink}">${money(spent)}</text></svg>
        <ul class="legend">${byCat.map(c => `<li><span class="dot" style="background:${c.color}"></span><span>${esc(c.cat)}</span><span class="v">${money(c.sum)}</span><span class="p">${pct(c.sum / spent)}</span></li>`).join('')}</ul>
      </div>
      <div class="hint">Savings transfers are not counted as spending.</div>
    </section>

    <section class="card">
      <h2>Monthly spending</h2>
      <div class="scroll"><svg width="${barsW}" height="${H + 24}" viewBox="0 0 ${barsW} ${H + 24}" role="img" aria-label="Monthly spending">${bars}</svg></div>
      <div class="hint">Dashed line — monthly average (${money(spent / months.length)}). Turquoise — latest month.</div>
    </section>

    <section class="card">
      <h2>Top 10 expenses</h2>
      <div class="scroll"><table>
        <tr><th>Date</th><th>Merchant</th><th>Category</th><th class="num">Amount</th></tr>
        ${top10.map(o => `<tr><td>${fmtDate(o.date)}</td><td>${esc(o.merchant)}</td><td><span class="cat"><span class="dot" style="background:${colorOf(o.cat)}"></span>${esc(o.cat)}</span></td><td class="num">${money2(-o.amount)}</td></tr>`).join('')}
      </table></div>
    </section>

    <section class="card">
      <h2>${monthName(prevM)} vs ${monthName(lastM)}</h2>
      <div class="scroll"><table>
        <tr><th>Category</th><th class="num">${short(prevM)}</th><th class="num">${short(lastM)}</th><th class="num">Change</th></tr>
        ${compare.map(x => `<tr><td><span class="cat"><span class="dot" style="background:${x.color}"></span>${esc(x.cat)}</span></td><td class="num">${money(x.a)}</td><td class="num">${money(x.b)}</td><td class="num">${delta(x.d)}</td></tr>`).join('')}
        <tr class="total"><td>Total</td><td class="num">${money(totalPrev)}</td><td class="num">${money(totalLast)}</td><td class="num">${delta(totalLast - totalPrev)}</td></tr>
      </table></div>
    </section>
  </div>

  <details class="card">
    <summary>Category rules</summary>
    <p class="hint" style="margin:8px 0">A transaction goes to the first category whose keyword appears in the merchant name or description. All incoming payments are “${INCOME}”. Monthly limits: ${Object.entries(LIMITS).map(([c, l]) => `${esc(c)} ${money(l)}`).join(', ')}.</p>
    <table>
      <tr><th>Category</th><th>Keywords</th></tr>
      ${RULES.map(r => `<tr><td><span class="cat"><span class="dot" style="background:${r.color}"></span>${esc(r.cat)}</span></td><td>${r.words.map(esc).join(', ')}</td></tr>`).join('')}
      <tr><td>${OTHER.cat}</td><td>anything else</td></tr>
    </table>
  </details>

  <p class="note">AI Sandbox Lab learning project. All data is fictional — no real people, cards or accounts.</p>
</div>
</body>
</html>
`;

fs.writeFileSync(path.join(root, 'dashboard.html'), html);
console.log(`Income ${money(income)} | spending ${money(spent)} | saved ${money(saved)} | left ${money(net)} | other: ${expenses.filter(o => o.cat === OTHER.cat).length}`);
console.log(`Limits ${monthName(lastM)}: ` + limitCards.map(l => `${l.cat} ${money(l.s)}/${money(l.lim)} ${l.state}`).join('; '));
console.log(`Over-limit cells: ${overCount} -> ` + history.flatMap(h => h.cells.filter(c => c.s > c.lim).map(c => `${short(h.m)} ${c.cat} ${money(c.s)}`)).join(', '));
console.log(`Fund: now ${money(fundNow)}, avg ${money2(avgSave)}/mo, needed ${money2(needed)}/mo, months left ${monthsLeft}, on track ${onTrack}, ETA ${eta}`);
console.log('Monthly net: ' + months.map(m => `${short(m)} ${money(sum(ops.filter(o => o.month === m)))}`).join(', '));
