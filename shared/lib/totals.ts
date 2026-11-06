import type { LineItem, TaxBreakup } from '@/types';

/**
 * Live GST totals for the quotation and invoice editors — the same algorithm the server
 * uses (backend src/lib/totals.ts). The server recomputes on save, so what is stored and
 * printed is always the server's result.
 */
const toPaise = (r: number) => Math.round(r * 100);
const toRupees = (p: number) => Math.round(p) / 100;
const finite = (value: number, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

export interface LineTotals {
  taxable: number;
  tax: number;
  total: number;
  discount: number;
}
export interface Totals {
  subtotal: number;
  itemDiscount: number;
  overallDiscount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxTotal: number;
  roundOff: number;
  grandTotal: number;
  breakup: TaxBreakup[];
  lines: LineTotals[];
}

export function computeTotals(
  items: LineItem[],
  opts: {
    supplyType: 'intra' | 'inter';
    discountType?: 'amount' | 'percent';
    discountValue?: number;
    roundOff?: boolean;
  },
): Totals {
  const nets = items.map((it) => {
    const quantity = Math.max(0, finite(Number(it.quantity)));
    const ratePaise = Math.max(
      0,
      toPaise(Math.max(0, finite(Number(it.rate)))),
    );
    const gross = Math.round(quantity * ratePaise);
    const discountPct = Math.min(
      100,
      Math.max(0, finite(Number(it.discountPct))),
    );
    const discount = Math.round((gross * discountPct) / 100);
    return { gross, discount, net: gross - discount };
  });
  const netSum = nets.reduce((s, n) => s + n.net, 0);
  const discountValue = Math.max(0, finite(Number(opts.discountValue ?? 0)));
  const raw =
    opts.discountType === 'percent'
      ? Math.round((netSum * Math.min(100, discountValue)) / 100)
      : toPaise(discountValue);
  const overall = Math.min(raw, netSum);
  let remaining = overall;
  let cgst = 0,
    sgst = 0,
    igst = 0,
    taxable = 0;
  const byRate = new Map<number, TaxBreakup>();
  const lines: LineTotals[] = items.map((it, i) => {
    const n = nets[i];
    const share =
      i === items.length - 1
        ? remaining
        : netSum > 0
          ? Math.round((overall * n.net) / netSum)
          : 0;
    remaining -= share;
    const t = n.net - share;
    const gstRate = Math.max(0, finite(Number(it.gstRate)));
    const tax = Math.round((t * gstRate) / 100);
    const c = opts.supplyType === 'intra' ? Math.floor(tax / 2) : 0;
    const sg = opts.supplyType === 'intra' ? tax - c : 0;
    const ig = opts.supplyType === 'inter' ? tax : 0;
    cgst += c;
    sgst += sg;
    igst += ig;
    taxable += t;
    const b = byRate.get(gstRate) ?? {
      gstRate,
      taxable: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
    };
    b.taxable += t;
    b.cgst += c;
    b.sgst += sg;
    b.igst += ig;
    byRate.set(gstRate, b);
    return {
      taxable: toRupees(t),
      tax: toRupees(tax),
      total: toRupees(t + tax),
      discount: toRupees(n.discount + share),
    };
  });
  const before = taxable + cgst + sgst + igst;
  const rounded = opts.roundOff ? Math.round(before / 100) * 100 : before;
  return {
    subtotal: toRupees(nets.reduce((s, n) => s + n.gross, 0)),
    itemDiscount: toRupees(nets.reduce((s, n) => s + n.discount, 0)),
    overallDiscount: toRupees(overall),
    taxableAmount: toRupees(taxable),
    cgst: toRupees(cgst),
    sgst: toRupees(sgst),
    igst: toRupees(igst),
    taxTotal: toRupees(cgst + sgst + igst),
    roundOff: toRupees(rounded - before),
    grandTotal: toRupees(rounded),
    breakup: [...byRate.values()]
      .sort((a, b) => a.gstRate - b.gstRate)
      .map((b) => ({
        gstRate: b.gstRate,
        taxable: toRupees(b.taxable),
        cgst: toRupees(b.cgst),
        sgst: toRupees(b.sgst),
        igst: toRupees(b.igst),
      })),
    lines,
  };
}

/** ₹ with paise, for documents. */
const inr2 = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const formatINR2 = (n: number) => inr2.format(n);

export const GST_RATE_OPTIONS = [
  { value: '0', label: '0%' },
  { value: '5', label: '5% (modules, inverters)' },
  { value: '8.9', label: '8.9% (EPC 70:30)' },
  { value: '12', label: '12%' },
  { value: '18', label: '18% (structure, BOS, services)' },
  { value: '28', label: '28%' },
];
