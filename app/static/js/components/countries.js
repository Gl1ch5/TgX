/** Country list for the phone login. */

import { locale } from '../i18n.js';
/** [ISO code, dial code, extra prefixes] — names and flags are produced for the interface language. */
const DATA = [
  ['RU', '7'],
  ['KZ', '7', ['76', '77']],
  ['UA', '380'],
  ['BY', '375'],
  ['UZ', '998'],
  ['KG', '996'],
  ['TJ', '992'],
  ['TM', '993'],
  ['AZ', '994'],
  ['AM', '374'],
  ['GE', '995'],
  ['MD', '373'],
  ['LT', '370'],
  ['LV', '371'],
  ['EE', '372'],
  ['PL', '48'],
  ['DE', '49'],
  ['FR', '33'],
  ['IT', '39'],
  ['ES', '34'],
  ['PT', '351'],
  ['GB', '44'],
  ['IE', '353'],
  ['NL', '31'],
  ['BE', '32'],
  ['LU', '352'],
  ['CH', '41'],
  ['AT', '43'],
  ['SE', '46'],
  ['NO', '47'],
  ['DK', '45'],
  ['FI', '358'],
  ['IS', '354'],
  ['CZ', '420'],
  ['SK', '421'],
  ['HU', '36'],
  ['RO', '40'],
  ['BG', '359'],
  ['GR', '30'],
  ['CY', '357'],
  ['RS', '381'],
  ['HR', '385'],
  ['SI', '386'],
  ['BA', '387'],
  ['ME', '382'],
  ['AL', '355'],
  ['MK', '389'],
  ['TR', '90'],
  ['IL', '972'],
  ['AE', '971'],
  ['SA', '966'],
  ['QA', '974'],
  ['IR', '98'],
  ['IQ', '964'],
  ['JO', '962'],
  ['EG', '20'],
  ['MA', '212'],
  ['TN', '216'],
  ['DZ', '213'],
  ['NG', '234'],
  ['ZA', '27'],
  ['KE', '254'],
  ['IN', '91'],
  ['PK', '92'],
  ['BD', '880'],
  ['CN', '86'],
  ['JP', '81'],
  ['KR', '82'],
  ['VN', '84'],
  ['TH', '66'],
  ['ID', '62'],
  ['MY', '60'],
  ['SG', '65'],
  ['PH', '63'],
  ['MN', '976'],
  ['AF', '93'],
  ['US', '1'],
  ['CA', '1', ['1204', '1226', '1236', '1249', '1250', '1289', '1306', '1343', '1365', '1403', '1416', '1418', '1431', '1437', '1438', '1450', '1506', '1514', '1519', '1579', '1581', '1587', '1604', '1613', '1647', '1672', '1705', '1709', '1778', '1780', '1807', '1819', '1825', '1867', '1873', '1902', '1905']],
  ['MX', '52'],
  ['BR', '55'],
  ['AR', '54'],
  ['CL', '56'],
  ['CO', '57'],
  ['PE', '51'],
  ['VE', '58'],
  ['CU', '53'],
  ['AU', '61'],
  ['NZ', '64'],
];

const flagOf = (iso) => String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
let names = null;
try { names = new Intl.DisplayNames([locale()], { type: 'region' }); } catch {}

/** [flag, localized name, dial code, extra prefixes] */
export const COUNTRIES = DATA.map(([iso, code, extra]) => [flagOf(iso), (names && names.of(iso)) || iso, code, extra]);

/** Country for a typed dial code (the longest matching prefix wins). */
export function countryByCode(digits) {
  let best = null;
  let bestLen = 0;
  for (const c of COUNTRIES) {
    for (const p of [c[2], ...(c[3] || [])]) {
      if (digits.startsWith(p) && p.length > bestLen) { best = c; bestLen = p.length; }
    }
  }
  return best;
}

/** Telegram-like grouping of the national part: +7 (950) 745-12-38, others in threes. */
export function formatNational(code, digits) {
  const d = digits.slice(0, 15);
  if (code === '7' || code === '1') {
    const a = d.slice(0, 3), b = d.slice(3, 6), rest = d.slice(6);
    let out = a ? `(${a}` : '';
    if (a.length === 3) out += ')';
    if (b) out += ` ${b}`;
    if (rest) out += code === '7' ? `-${rest.slice(0, 2)}${rest.length > 2 ? `-${rest.slice(2, 4)}` : ''}` : `-${rest.slice(0, 4)}`;
    return out.trim();
  }
  return d.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

/** "+79507451238" → "+7 (950) 745-12-38" for the "code sent to…" text. */
export function prettyPhone(full) {
  const digits = String(full || '').replace(/\D/g, '');
  const c = countryByCode(digits);
  if (!c) return `+${digits}`;
  return `+${c[2]} ${formatNational(c[2], digits.slice(c[2].length))}`;
}
