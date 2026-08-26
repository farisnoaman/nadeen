export type RentalDocumentStage = 'quotation' | 'issued' | 'paid';

type RentalDocumentRecord = {
  status?: string | null;
  pickupOdometer?: number | null;
  invoiceIssuedAt?: Date | string | null;
  paidAt?: Date | string | null;
};

/**
 * Commercial document state is deliberately independent from the operational
 * rental status. A cancelled rental therefore keeps the last document it had:
 * a quotation if it never left the branch, or an issued invoice after pickup.
 */
export function rentalDocumentStage(rental:RentalDocumentRecord):RentalDocumentStage {
  if (rental.paidAt || rental.status === 'completed') return 'paid';
  if (rental.invoiceIssuedAt || rental.pickupOdometer != null) return 'issued';
  return 'quotation';
}

export const rentalDocumentTitle = (stage:RentalDocumentStage) => stage === 'quotation'
  ? 'Rental proposal'
  : stage === 'issued'
    ? 'Rental sales invoice'
    : 'Final rental waybill';

export const roundMoney = (value:number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
