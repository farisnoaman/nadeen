import { and, eq, isNull, sql } from 'drizzle-orm';
import { companies } from '@/db/schema';

const CODE_MAX = 3;

/** Short uppercase booking prefix derived from the company name (e.g. "EcoMotion EV" -> "ECO"). */
export function deriveCompanyCode(name: string): string {
  const letters = String(name || '').toUpperCase().replace(/[^A-Z]/g, '');
  return letters.slice(0, CODE_MAX) || 'CO';
}

/** Returns the company's stable booking prefix, allocating one on first use. */
export async function ensureCompanyBookingCode(db: any, companyId: number): Promise<string> {
  const [company] = await db.select({ id: companies.id, name: companies.name, code: companies.bookingCode })
    .from(companies).where(eq(companies.id, companyId)).limit(1);
  if (!company) throw new Error('Company not found.');
  if (company.code) return company.code;

  const base = deriveCompanyCode(company.name);
  const taken = new Set(
    (await db.select({ code: companies.bookingCode }).from(companies))
      .map((row: any) => row.code)
      .filter(Boolean),
  );
  // Conditional update keeps concurrent allocations safe; the unique index is the backstop.
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${attempt + 1}`;
    if (taken.has(candidate)) continue;
    const [updated] = await db.update(companies)
      .set({ bookingCode: candidate })
      .where(and(eq(companies.id, companyId), isNull(companies.bookingCode)))
      .returning({ code: companies.bookingCode });
    if (updated) return candidate;
    taken.add(candidate);
  }
  throw new Error('Could not allocate a booking code for this company.');
}

/** Atomic per-company counter → e.g. "ECO-0001". Call inside the booking transaction. */
export async function assignBookingNumber(db: any, companyId: number): Promise<string> {
  const code = await ensureCompanyBookingCode(db, companyId);
  const [row] = await db.update(companies)
    .set({ bookingSeq: sql`${companies.bookingSeq} + 1` })
    .where(eq(companies.id, companyId))
    .returning({ seq: companies.bookingSeq });
  return `${code}-${String(row.seq).padStart(4, '0')}`;
}
