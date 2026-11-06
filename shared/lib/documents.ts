/**
 * Document business rules shared by the backend (server/) and the admin previews
 * (numbering per financial year, GST split, subsidy, payments). Kept separate from storage so
 * they are easy to unit-test; the backend applies them on every save.
 */
import type {
  BusinessSettings,
  CalculatorSettings,
  Company,
  Invoice,
  InvoiceInput,
  InvoiceSubsidy,
  Payment,
  Quotation,
} from '@/types';
import type { QuotationSave } from '@/types/api';
import { calculateSolar } from '@/lib/calculator';
import { computeSubsidy, CENTRAL_SCHEME } from '@/lib/subsidy';
import { computeTotals } from '@/lib/totals';
import { snapshotOf } from '@/lib/pricing';
import { stateCodeOf, stateName } from '@/lib/states';
import { addDaysISO, todayISO } from '@/lib/files';
import { ApiError } from '@/services/errors';

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Indian financial year (April–March): 2026-10-25 → "2026-27". */
export function financialYear(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function nextNumber(
  counters: Record<string, number>,
  type: 'invoice' | 'quotation' | 'proposal',
  prefix: string,
  date: string,
): string {
  const fy = financialYear(date);
  const key = `${type}:${fy}`;
  counters[key] = (counters[key] ?? 0) + 1;
  return `${prefix}/${fy}/${String(counters[key]).padStart(4, '0')}`;
}

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const isMobile = (v: string) => {
  let d = v.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d);
};
const isEmail = (v: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function fail(errors: Record<string, string>) {
  if (Object.keys(errors).length)
    throw new ApiError('Some fields need attention. Nothing was saved.', {
      code: 'validation',
      fieldErrors: errors,
    });
}

function itemErrors(items: QuotationSave['items'], e: Record<string, string>) {
  items.forEach((it, i) => {
    if (!it.name?.trim()) e[`items.${i}.name`] = 'Enter an item name.';
    if (!Number.isFinite(it.quantity) || !(it.quantity > 0))
      e[`items.${i}.quantity`] = 'Quantity must be a number more than 0.';
    if (!Number.isFinite(it.rate) || it.rate < 0)
      e[`items.${i}.rate`] = 'Rate must be a valid non-negative number.';
    if (!Number.isFinite(it.gstRate) || !(it.gstRate >= 0 && it.gstRate <= 28))
      e[`items.${i}.gstRate`] = 'GST must be 0–28%.';
    if (
      !Number.isFinite(it.discountPct) ||
      !(it.discountPct >= 0 && it.discountPct <= 100)
    )
      e[`items.${i}.discountPct`] = 'Line discount must be 0–100%.';
  });
}

const customerStateCode = (q: { gstin?: string; state?: string }) =>
  (q.gstin && /^\d{2}/.test(q.gstin) ? q.gstin.slice(0, 2) : '') ||
  stateCodeOf(q.state ?? '');

// ─── Quotations ───────────────────────────────────────────────────────────
export function deriveQuotation(
  input: QuotationSave,
  ctx: {
    business: BusinessSettings;
    calc: CalculatorSettings;
    companies: Company[];
    existing?: Quotation;
  },
) {
  const e: Record<string, string> = {};
  if (!input.customerName?.trim()) e.customerName = 'Enter the customer name.';
  if (!isMobile(input.phone ?? ''))
    e.phone = 'Enter a 10-digit Indian mobile number.';
  if (!isEmail(input.email ?? ''))
    e.email = 'Enter a valid email, like name@example.com.';
  if (input.gstin && !GSTIN.test(input.gstin))
    e.gstin = 'Enter a valid 15-character GSTIN.';
  if (!(input.capacityKw >= 0.5 && input.capacityKw <= 10000))
    e.capacityKw = 'Size must be at least 0.5 kW.';
  itemErrors(input.items ?? [], e);
  fail(e);

  const supplyType =
    !customerStateCode(input) ||
    customerStateCode(input) === ctx.business.stateCode
      ? ('intra' as const)
      : ('inter' as const);
  const totals = computeTotals(input.items, {
    supplyType,
    discountType: 'amount',
    discountValue: input.discount,
    roundOff: true,
  });
  if (
    input.items.length &&
    input.discount > totals.subtotal - totals.itemDiscount
  )
    fail({ discount: 'Discount cannot be more than the quotation value.' });

  const company = input.companyId
    ? ctx.companies.find((c) => c.id === input.companyId)
    : undefined;
  if (input.companyId && !company)
    fail({ companyId: 'The selected company no longer exists.' });
  const quality = input.quality ?? 'normal';
  const snapshot = company
    ? ctx.existing?.companyId === company.id &&
      ctx.existing.company?.quality === quality
      ? ctx.existing.company
      : snapshotOf(company, quality)
    : null;

  const estimate = calculateSolar(
    {
      monthlyBill: input.monthlyBill,
      tariff: 0, // CSPDCL slab tariff (only the cost estimate is used here)
      propertyType: input.propertyType,
      systemType: input.systemType,
      roofType: input.roofType ?? 'rcc',
      capacityOverride: input.capacityKw,
    },
    ctx.calc,
  );
  const estimatedCost = input.items.length
    ? totals.grandTotal
    : estimate.costMid;
  const rules = computeSubsidy(
    {
      capacityKw: input.capacityKw,
      propertyType: input.propertyType,
      systemType: input.systemType,
      stateCode: customerStateCode(input) || ctx.calc.subsidy.defaultStateCode,
      systemCost: Math.round(estimatedCost),
    },
    ctx.calc,
  );
  // null = automatic (from the subsidy rules). Manual amounts are kept, but never above the cost.
  const subsidy = Math.min(
    Math.max(0, Math.round(input.subsidy ?? rules.central)),
    Math.round(estimatedCost),
  );
  const stateSubsidy = Math.min(
    Math.max(0, Math.round(input.stateSubsidy ?? rules.state)),
    Math.max(0, Math.round(estimatedCost) - subsidy),
  );
  const subsidyAuto = input.subsidy === null && input.stateSubsidy === null;
  return {
    company: snapshot,
    supplyType,
    quality,
    subtotal: totals.subtotal,
    taxableAmount: totals.taxableAmount,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    taxTotal: totals.taxTotal,
    roundOff: totals.roundOff,
    grandTotal: totals.grandTotal,
    taxBreakup: totals.breakup,
    estimatedCost,
    subsidy,
    stateSubsidy,
    stateSubsidyScheme: stateSubsidy > 0 ? rules.stateScheme : null,
    subsidyAuto,
    netCost: Math.max(0, round2(estimatedCost - subsidy - stateSubsidy)),
    annualGenerationKwh: Math.round(
      input.annualGenerationKwh ??
        input.capacityKw * ctx.calc.unitsPerKwPerDay * 365,
    ),
  };
}

// ─── Invoices ─────────────────────────────────────────────────────────────
export function paymentState(grandTotal: number, payments: Payment[]) {
  const amountPaid = round2(payments.reduce((s, p) => s + p.amount, 0));
  const amountDue = round2(Math.max(0, grandTotal - amountPaid));
  const paymentStatus: Invoice['paymentStatus'] =
    grandTotal > 0 && amountDue <= 0
      ? 'paid'
      : amountPaid > 0
        ? 'partial'
        : 'unpaid';
  return { amountPaid, amountDue, paymentStatus };
}

export const isOverdue = (
  inv: Pick<Invoice, 'status' | 'amountDue' | 'dueDate'>,
) =>
  inv.status === 'issued' &&
  inv.amountDue > 0 &&
  !!inv.dueDate &&
  inv.dueDate < todayISO();

/** Subsidy information on an invoice. The invoice total is not reduced: the Government credits the subsidy to the customer. */
export function deriveInvoiceSubsidy(
  input: InvoiceInput,
  grandTotal: number,
  calc: CalculatorSettings | undefined,
): InvoiceSubsidy | null {
  const sub = input.subsidy;
  if (!sub || !calc) return null;
  const rules = computeSubsidy(
    {
      capacityKw: sub.capacityKw,
      propertyType: sub.propertyType,
      systemType: sub.systemType,
      stateCode: input.stateCode,
      systemCost: grandTotal,
    },
    calc,
  );
  const central = Math.min(
    Math.max(0, Math.round(sub.auto ? rules.central : (sub.central ?? 0))),
    Math.round(grandTotal),
  );
  const state = Math.min(
    Math.max(0, Math.round(sub.auto ? rules.state : (sub.state ?? 0))),
    Math.max(0, Math.round(grandTotal) - central),
  );
  return {
    show: sub.show,
    auto: sub.auto,
    capacityKw: sub.capacityKw,
    propertyType: sub.propertyType,
    systemType: sub.systemType,
    central,
    state,
    total: central + state,
    netCost: Math.max(0, round2(grandTotal - central - state)),
    centralScheme: CENTRAL_SCHEME,
    stateScheme: state > 0 ? rules.stateScheme : null,
  };
}

export function deriveInvoice(
  input: InvoiceInput,
  payments: Payment[],
  business: BusinessSettings,
  calc?: CalculatorSettings,
) {
  const e: Record<string, string> = {};
  if (!input.customerName?.trim()) e.customerName = 'Enter the customer name.';
  if (input.phone && !isMobile(input.phone))
    e.phone = 'Enter a 10-digit Indian mobile number.';
  if (!isEmail(input.email ?? ''))
    e.email = 'Enter a valid email, like name@example.com.';
  if (!/^\d{2}$/.test(input.stateCode ?? '')) e.stateCode = 'Choose the state.';
  if (input.gstin && !GSTIN.test(input.gstin))
    e.gstin = 'Enter a valid 15-character GSTIN.';
  else if (input.gstin && input.gstin.slice(0, 2) !== input.stateCode)
    e.gstin = 'GSTIN state code does not match the selected state.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDate ?? ''))
    e.invoiceDate = 'Choose the invoice date.';
  if (input.dueDate && input.dueDate < input.invoiceDate)
    e.dueDate = 'Due date cannot be before the invoice date.';
  if (!input.items?.length) e.items = 'Add at least one item.';
  itemErrors(input.items ?? [], e);
  if (input.subsidy) {
    const sub = input.subsidy;
    if (!(sub.capacityKw >= 0.5 && sub.capacityKw <= 10000))
      e['subsidy.capacityKw'] = 'Enter the system size (at least 0.5 kW).';
    if (!sub.auto) {
      if (!(Number(sub.central) >= 0))
        e['subsidy.central'] = 'Enter 0 or more.';
      if (!(Number(sub.state) >= 0)) e['subsidy.state'] = 'Enter 0 or more.';
    }
  }
  input.items?.forEach((item, i) => {
    if (Number.isFinite(item.rate) && item.rate <= 0)
      e[`items.${i}.rate`] =
        'Enter a selling price greater than 0; catalog items without prices cannot be invoiced.';
  });
  if (!Number.isFinite(input.discountValue) || input.discountValue < 0)
    e.discountValue = 'Discount must be a valid amount of 0 or more.';
  if (input.discountType === 'percent' && input.discountValue > 100)
    e.discountValue = 'Discount cannot exceed 100%.';
  fail(e);
  const supplyType =
    input.stateCode === business.stateCode
      ? ('intra' as const)
      : ('inter' as const);
  if (
    input.initialPayment &&
    (!Number.isFinite(input.initialPayment.amount) ||
      input.initialPayment.amount < 0)
  ) {
    fail({ initialPayment: 'Enter a valid payment amount.' });
  }
  const totals = computeTotals(input.items, {
    supplyType,
    discountType: input.discountType,
    discountValue: input.discountValue,
    roundOff: business.invoice.roundOff,
  });
  const pay = paymentState(totals.grandTotal, payments);
  if (pay.amountPaid > totals.grandTotal + 0.001) {
    throw new ApiError(
      `Payments received (₹${pay.amountPaid}) are more than the new invoice total (₹${totals.grandTotal}). Remove a payment first.`,
      { code: 'bad_request' },
    );
  }
  return {
    supplyType,
    placeOfSupply: `${stateName(input.stateCode) || input.state} (${input.stateCode})`,
    subtotal: totals.subtotal,
    itemDiscount: totals.itemDiscount,
    overallDiscount: totals.overallDiscount,
    taxableAmount: totals.taxableAmount,
    cgst: totals.cgst,
    sgst: totals.sgst,
    igst: totals.igst,
    taxTotal: totals.taxTotal,
    roundOff: totals.roundOff,
    grandTotal: totals.grandTotal,
    taxBreakup: totals.breakup,
    subsidy: deriveInvoiceSubsidy(input, totals.grandTotal, calc),
    ...pay,
  };
}

export const defaultDue = (date: string, business: BusinessSettings) =>
  addDaysISO(date, business.invoice.defaultDueDays);
