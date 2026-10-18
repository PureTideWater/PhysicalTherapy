import { findEraExportFormat } from '../formats';

/**
 * A SYNTHETIC WebPT Billing ERA export of `payments` payments of one line each, PAR-01's line with its own trace,
 * patient control number and payer claim number per payment: the normalizer's worst case for its size, since every
 * line is a payment, a claim and a plan of its own. Every row carries SYNTHSENDER in its sender column. The bytes
 * stay at or under `maxBytes` when it is given (payments are added while they fit).
 */
export function oneLinePaymentsExport(options: { readonly payments?: number; readonly maxBytes?: number }): { readonly bytes: Uint8Array; readonly payments: number } {
  const columns = findEraExportFormat('webpt_billing_era_v0')?.columns ?? [];
  const header = `${columns.map((column) => column.header).join(',')}\r\n`;
  const lineOf = (index: number): string => {
    const n = String(index).padStart(7, '0');
    const cells: Readonly<Record<string, string>> = {
      trace: `SYNEFTBND${n}`,
      payment_date: '04/06/2026',
      payment_amount: '88.00',
      payment_method: 'ACH',
      payer_name: 'SYNTHETIC PAYER A',
      sender_id: 'SYNTHSENDER',
      payee_id: '9900639797',
      patient_control_number: `SYNPCNBND${n}`,
      payer_claim_number: `SYNCCNBND${n}`,
      claim_status: '1',
      plan: 'SYNPLAN-COMM-01',
      service_date: '03/15/2026',
      place_of_service: '11',
      procedure_code: '97110',
      modifiers: 'GP',
      units: '2',
      charge: '160.00',
      allowed: '',
      paid: '88.00',
      patient_responsibility: '22.00',
      contractual_adjustment: '50.00',
      other_adjustment: '0.00',
      adjustment_codes: '"CO-45,PR-2"',
    };
    return `${columns.map((column) => cells[column.field] ?? '').join(',')}\r\n`;
  };
  const parts = [header];
  let size = Buffer.byteLength(header);
  let count = 0;
  while (options.payments === undefined || count < options.payments) {
    const line = lineOf(count);
    if (options.maxBytes !== undefined && size + line.length > options.maxBytes) {
      break;
    }
    parts.push(line);
    size += line.length;
    count += 1;
  }
  return { bytes: new Uint8Array(Buffer.from(parts.join(''), 'utf8')), payments: count };
}
