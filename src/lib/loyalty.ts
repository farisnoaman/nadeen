import { and, asc, eq } from 'drizzle-orm';
import { companies, loyaltyLevels, loyaltyPointLedger, loyaltyPrograms, rentals, vehicles } from '@/db/schema';

export const DEFAULT_LOYALTY_LEVELS = [
  { rank:0, name:'Bronze', pointsThreshold:0, discountPercentage:0 },
  { rank:1, name:'Silver', pointsThreshold:500, discountPercentage:3 },
  { rank:2, name:'Gold', pointsThreshold:1500, discountPercentage:5 },
  { rank:3, name:'Platinum', pointsThreshold:3000, discountPercentage:8 },
] as const;

const roundMoney = (value:number) => Math.round((value + Number.EPSILON) * 100) / 100;

export async function ensureLoyaltyProgram(db:any, companyId:number) {
  let [program] = await db.select().from(loyaltyPrograms)
    .where(eq(loyaltyPrograms.companyId, companyId)).limit(1);
  if (!program) {
    [program] = await db.insert(loyaltyPrograms).values({ companyId, enabled:false, pointsPerCurrency:1 })
      .onConflictDoNothing().returning();
    if (!program) [program] = await db.select().from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.companyId, companyId)).limit(1);
  }
  let levels = await db.select().from(loyaltyLevels)
    .where(eq(loyaltyLevels.programId, program.id)).orderBy(asc(loyaltyLevels.rank));
  if (!levels.length) {
    levels = await db.insert(loyaltyLevels).values(DEFAULT_LOYALTY_LEVELS.map(level => ({
      programId:program.id, ...level,
    }))).returning();
    levels.sort((a:any,b:any) => a.rank - b.rank);
  }
  return { program, levels };
}

async function programRecord(db:any, companyId:number) {
  const [program] = await db.select().from(loyaltyPrograms)
    .where(eq(loyaltyPrograms.companyId, companyId)).limit(1);
  if (!program) return null;
  const levels = await db.select().from(loyaltyLevels)
    .where(eq(loyaltyLevels.programId, program.id)).orderBy(asc(loyaltyLevels.rank));
  return { program, levels };
}

export async function loyaltyStatus(db:any, companyId:number, renterId:number) {
  const record = await programRecord(db, companyId);
  if (!record || !record.program.enabled || !record.levels.length) return { enabled:false } as any;
  const ledger = await db.select({ points:loyaltyPointLedger.points }).from(loyaltyPointLedger)
    .where(and(eq(loyaltyPointLedger.companyId, companyId), eq(loyaltyPointLedger.renterId, renterId)));
  const points = ledger.reduce((sum:number, entry:any) => sum + Number(entry.points || 0), 0);
  const levels = record.levels.slice().sort((a:any,b:any) => a.pointsThreshold - b.pointsThreshold);
  const reachedLevels = levels.filter((level:any) => level.pointsThreshold <= points);
  const currentLevel = reachedLevels[reachedLevels.length - 1] || levels[0];
  const nextLevel = levels.find((level:any) => level.pointsThreshold > points) || null;
  const progress = nextLevel
    ? Math.max(0, Math.min(100, Math.round((points - currentLevel.pointsThreshold) / Math.max(1, nextLevel.pointsThreshold - currentLevel.pointsThreshold) * 100)))
    : 100;
  return {
    enabled:true,
    programId:record.program.id,
    pointsPerCurrency:Number(record.program.pointsPerCurrency),
    points,
    levels,
    currentLevel,
    nextLevel,
    pointsToNext:nextLevel ? Math.max(0, nextLevel.pointsThreshold - points) : 0,
    progress,
  };
}

export async function loyaltyBookingTerms(db:any, companyId:number, renterId:number, subtotal:number, promotionDiscount:number) {
  const status = await loyaltyStatus(db, companyId, renterId);
  if (!status.enabled) return {
    enabled:false, levelId:null, levelName:null, discountPercentage:0,
    discount:0, pointsRate:0, points:0,
  };
  const discountPercentage = Math.max(0, Number(status.currentLevel.discountPercentage || 0));
  const discount = roundMoney(Math.min(
    Math.max(0, subtotal - promotionDiscount),
    subtotal * discountPercentage / 100,
  ));
  return {
    enabled:true,
    levelId:status.currentLevel.id,
    levelName:status.currentLevel.name,
    discountPercentage,
    discount,
    pointsRate:Number(status.pointsPerCurrency),
    points:status.points,
    nextLevel:status.nextLevel,
    pointsToNext:status.pointsToNext,
    progress:status.progress,
  };
}

export function pointsForCompletedRental(total:number, pointsRate:number) {
  return Math.max(0, Math.floor(Math.max(0, total) * Math.max(0, pointsRate)));
}

export async function companyLoyaltySettings(db:any, companyId:number) {
  const { program, levels } = await ensureLoyaltyProgram(db, companyId);
  const entries = await db.select({ renterId:loyaltyPointLedger.renterId, points:loyaltyPointLedger.points })
    .from(loyaltyPointLedger).where(eq(loyaltyPointLedger.companyId, companyId));
  return {
    id:program.id,
    enabled:program.enabled,
    pointsPerCurrency:Number(program.pointsPerCurrency),
    levels,
    stats:{
      members:new Set(entries.map((entry:any) => entry.renterId)).size,
      pointsIssued:entries.reduce((sum:number, entry:any) => sum + Number(entry.points || 0), 0),
      rewardedRentals:entries.length,
    },
  };
}

export async function saveCompanyLoyaltySettings(db:any, companyId:number, input:any) {
  const current = await ensureLoyaltyProgram(db, companyId);
  const enabled = input.enabled === true;
  const pointsPerCurrency = Number(input.pointsPerCurrency);
  if (!Number.isFinite(pointsPerCurrency) || pointsPerCurrency < 0.01 || pointsPerCurrency > 100) {
    throw new Error('Points per currency unit must be between 0.01 and 100.');
  }
  if (!Array.isArray(input.levels) || input.levels.length !== 4) throw new Error('Configure all four loyalty levels.');
  const levels = input.levels.map((level:any, index:number) => ({
    rank:index,
    name:String(level.name || '').trim(),
    pointsThreshold:Number(level.pointsThreshold),
    discountPercentage:Number(level.discountPercentage),
  }));
  if (levels.some((level:any) => level.name.length < 2 || level.name.length > 30)) throw new Error('Each loyalty level needs a name between 2 and 30 characters.');
  if (new Set(levels.map((level:any) => level.name.toLowerCase())).size !== levels.length) throw new Error('Loyalty level names must be unique.');
  if (levels[0].pointsThreshold !== 0) throw new Error('The first loyalty level must begin at 0 points.');
  if (levels.some((level:any) => !Number.isInteger(level.pointsThreshold) || level.pointsThreshold < 0 || level.pointsThreshold > 10_000_000)) throw new Error('Enter valid whole-number point thresholds.');
  if (levels.some((level:any, index:number) => index > 0 && level.pointsThreshold <= levels[index - 1].pointsThreshold)) throw new Error('Each loyalty threshold must be greater than the previous level.');
  if (levels.some((level:any) => !Number.isFinite(level.discountPercentage) || level.discountPercentage < 0 || level.discountPercentage > 50)) throw new Error('Level discounts must be between 0% and 50%.');

  await db.transaction(async (tx:any) => {
    await tx.update(loyaltyPrograms).set({ enabled, pointsPerCurrency, updatedAt:new Date() })
      .where(eq(loyaltyPrograms.id, current.program.id));
    // Temporary unique names allow administrators to swap two level names in one save.
    for (const level of current.levels) {
      await tx.update(loyaltyLevels).set({ name:`__level_${level.id}_${Date.now()}` })
        .where(eq(loyaltyLevels.id, level.id));
    }
    for (const level of levels) {
      await tx.update(loyaltyLevels).set({
        name:level.name,
        pointsThreshold:level.pointsThreshold,
        discountPercentage:level.discountPercentage,
        updatedAt:new Date(),
      }).where(and(eq(loyaltyLevels.programId, current.program.id), eq(loyaltyLevels.rank, level.rank)));
    }
  });
  return companyLoyaltySettings(db, companyId);
}

export async function renterLoyaltyMemberships(db:any, renterId:number) {
  const rentalCompanies = await db.select({ companyId:vehicles.companyId }).from(rentals)
    .innerJoin(vehicles, eq(rentals.vehicleId, vehicles.id))
    .where(eq(rentals.renterId, renterId));
  const companyIds = [...new Set(rentalCompanies.map((row:any) => row.companyId))];
  if (!companyIds.length) return [];
  const enabledPrograms = await db.select({ companyId:loyaltyPrograms.companyId, companyName:companies.name })
    .from(loyaltyPrograms).innerJoin(companies, eq(loyaltyPrograms.companyId, companies.id))
    .where(eq(loyaltyPrograms.enabled, true));
  const relevant = enabledPrograms.filter((program:any) => companyIds.includes(program.companyId));
  const memberships = [];
  for (const program of relevant) {
    const status = await loyaltyStatus(db, program.companyId, renterId);
    if (status.enabled) memberships.push({ companyId:program.companyId, companyName:program.companyName, ...status });
  }
  return memberships.sort((a:any,b:any) => b.points - a.points);
}
