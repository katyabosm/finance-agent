// Generates a FICTIONAL 6-month personal card statement -> data/statement.csv
// All merchants and data are made up. Run: node scripts/generate_statement.js
// Spec: specs/prd.md (v2: personal budget, income 2200, rent 1100, savings 135/month)
const fs = require('fs');
const path = require('path');

let seed = 20261119; // fixed seed: the same statement on every run
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const r = (a, b) => a + rnd() * (b - a);
const ri = (a, b) => Math.floor(r(a, b + 1));
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const pad = n => String(n).padStart(2, '0');

const INCOME = 2200;   // monthly salary, EUR
const RENT = 1100;     // monthly rent, EUR
const SAVINGS = 135;   // monthly transfer to the emergency fund, EUR

const ops = [];
const add = (y, m, d, amount, merchant, desc) =>
  ops.push({ date: `${y}-${pad(m)}-${pad(d)}`, amount: Math.round(amount * 100) / 100, merchant, desc });

const months = [5, 6, 7, 8, 9, 10].map(m => [2026, m]); // May–October 2026

for (const [y, m] of months) {
  const dim = new Date(y, m, 0).getDate();
  const day = () => ri(1, dim);
  const weekendDay = () => {
    for (let i = 0; i < 10; i++) { const d = day(); const wd = new Date(y, m - 1, d).getDay(); if (wd === 0 || wd >= 5 || rnd() < 0.3) return d; }
    return day();
  };

  // Recurring
  add(y, m, 5, INCOME, 'Example Ltd', 'Salary');
  add(y, m, 1, -RENT, 'Apartment Rent', 'Monthly rent');
  add(y, m, 6, -SAVINGS, 'Savings Account', 'Savings transfer');
  add(y, m, 10, -r(55, 90), 'City Utilities', 'Electricity, water, heating');
  add(y, m, 12, -24.9, 'NetPlus', 'Home internet');
  add(y, m, 15, -12, 'Wave Mobile', 'Mobile plan');
  add(y, m, 3, -9.99, 'MovieHome', 'Streaming subscription');
  add(y, m, 8, -2.99, 'Cloudy Storage', 'Cloud subscription');
  add(y, m, 2, -49, 'Transit Card', 'Transit pass top-up');

  // Groceries
  for (let i = 0; i < 18; i++) add(y, m, day(), -r(8, 22), pick(['Green Yard Grocery', 'Daisy Supermarket', 'Daisy Supermarket', 'Garden Street Market']), 'Groceries');
  for (let i = 0; i < 6; i++) add(y, m, day(), -r(2, 5), 'Golden Ear Bakery', 'Bread and pastries');

  // Cafes — limit 100 €; October goes over
  const cafes = 9 + (m === 10 ? 5 : 0);
  for (let i = 0; i < cafes; i++) add(y, m, weekendDay(), -r(4, 14), pick(['Bean Coffee', 'Plate Cafe', 'Luna Bistro']), pick(['Coffee', 'Lunch', 'Dinner']));

  // Transport
  for (let i = 0; i < 2; i++) add(y, m, day(), -r(6, 14), 'Checkers Taxi', 'Taxi ride');

  // Health
  for (let i = 0; i < 2; i++) add(y, m, day(), -r(4, 18), 'Wellness+ Pharmacy', 'Medicine');

  // Shopping — limit 300 €
  for (let i = 0; i < 3; i++) add(y, m, day(), -r(10, 40), 'Everything Marketplace', 'Order');
  if (m % 2 === 0) add(y, m, day(), -r(30, 70), 'Style Clothing', 'Clothes');

  // Entertainment — limit 50 €
  for (let i = 0; i < 2; i++) add(y, m, weekendDay(), -r(8, 13), 'Star Cinema', 'Movie tickets');
}

// One-off events (designed to break a limit once or twice)
add(2026, 7, 18, -45, 'TicketsOnline', 'Concert');               // entertainment over 50 in July
add(2026, 8, 22, -260, 'Style Clothing', 'Summer clothes sale'); // shopping over 300 in August
add(2026, 9, 27, 18, 'Everything Marketplace', 'Order refund');

ops.sort((a, b) => a.date.localeCompare(b.date));

const q = s => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
const csv = ['date,amount,merchant,description', ...ops.map(o => [o.date, o.amount.toFixed(2), q(o.merchant), q(o.desc)].join(','))].join('\n') + '\n';

const out = path.join(__dirname, '..', 'data', 'statement.csv');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, csv);
console.log(`Statement: ${ops.length} transactions -> data/statement.csv`);
