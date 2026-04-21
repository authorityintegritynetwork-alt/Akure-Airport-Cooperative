import xlsx from 'xlsx';
import { parseSheet, summarizeSheets } from './src/lib/excelParser.ts';
import { NameMatcher } from './src/lib/nameMatcher.ts';

const data = [
  ['AKURE AIRPORT STAFF COOPERATIVE'],
  ['APRIL 2026 NAMA DEDUCTION'],
  [],
  [],
  ['N/S', 'NAME', 'SAVINGS', 'REAL LOAN', 'PROV', 'ELECT', 'F/VENT', 'EMER LOAN', 'XMASS', 'COMM', 'S/ELECT', 'G/H&L/FORM', 'TOTAL'],
  [1, 'ADEMUYIWA .I', 5000, 10000, 2000, 0, 0, 0, 1000, 500, 0, 0, 18500],
  [2, 'OYEDEPO J.O', 3000, 0, 1000, 500, 0, 0, 1000, 0, 0, 0, 5500],
  [3, 'TOTAL', 8000, 10000, 3000, 500, 0, 0, 2000, 500, 0, 0, 24000],
];
const ws = xlsx.utils.aoa_to_sheet(data);
const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, 'CABIN');
xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([['empty']]), 'BLANK');
const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

const wb2 = xlsx.read(buf, { type: 'buffer' });
console.log('Sheets:', JSON.stringify(summarizeSheets(wb2)));
const sheet = parseSheet(wb2, 'CABIN');
console.log('Detected cols:', sheet.detectedColumns);
for (const r of sheet.rows) {
  console.log(`Row ${r.rowNumber} ${r.rawName}: total=${r.total} computed=${r.computedTotal} mismatch=${r.totalMismatch}`);
  console.log('  amounts:', JSON.stringify(r.amounts));
}

const matcher = new NameMatcher([
  { id: 1, fullName: 'Ibrahim Ademuyiwa' },
  { id: 2, fullName: 'John Olaniyi Oyedepo' },
  { id: 3, fullName: 'Some Other Person' },
]);
console.log('Match ADEMUYIWA .I:', matcher.match('ADEMUYIWA .I'));
console.log('Match OYEDEPO J.O:', matcher.match('OYEDEPO J.O'));
console.log('Match Unknown:', matcher.match('Unknown Person'));
