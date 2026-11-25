import { validateWeight, weightAmount } from './formulation-weighing.ts';

export type BrandPortion = { name: string; actual_quantity: number; lot: string | null; expiry_date: string | null };
export type BrandDraft = { name: string; quantity: string; lot: string; expiry: string };

export function brandDraft(name = '', quantity = '', lot = '', expiry = ''): BrandDraft {
 return { name, quantity, lot, expiry };
}

export function brandTotal(rows: BrandDraft[]): number {
 return rows.reduce((micros, row) => micros + Math.round(weightAmount(row.quantity) * 1e6), 0) / 1e6;
}

export function brandWeight(rows: BrandDraft[]) {
 const brands: BrandPortion[] = rows.map((row, index) => {
  const name = row.name.trim(), lot = row.lot.trim() || null, expiry = row.expiry || null;
  if (!name || name.length > 160) throw new Error(`Ingresá la marca de la fila ${index + 1}.`);
  if (!lot || !expiry) throw new Error(`Completá el lote y el vencimiento de ${name}.`);
  const quantity = weightAmount(row.quantity);
  return { name, actual_quantity: quantity, lot, expiry_date: expiry };
 });
 const total = brandTotal(rows);
 const weight = { brands, actual_quantity: total, lot: brands.length === 1 ? brands[0].lot : null,
  expiry_date: brands.length === 1 ? brands[0].expiry_date : null };
 validateWeight(total, weight.lot, weight.expiry_date, brands);
 return weight;
}
