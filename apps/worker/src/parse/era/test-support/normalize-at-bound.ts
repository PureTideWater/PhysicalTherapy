import { ERA_EXPORT_MAX_BYTES, normalizeEraExport } from '../normalize';
import { oneLinePaymentsExport } from './one-line-payments';

/**
 * Normalizes the worst case export of ERA_EXPORT_MAX_BYTES (one line per payment) and prints what it read, as
 * JSON on one line. era-export.large.db.test.ts runs it in a child process whose heap is limited, so the whole
 * read, which is synchronous, is held to the bound: past it, V8 stops the process.
 */
const { bytes, payments } = oneLinePaymentsExport({ maxBytes: ERA_EXPORT_MAX_BYTES });
const result = normalizeEraExport({ bytes, formatId: 'webpt_billing_era_v0', codeLists: { release: null, has: () => true } });
const loadable = result.kind === 'payments' ? result.payments.filter((payment) => payment.kind === 'loadable').length : 0;
process.stdout.write(`${JSON.stringify({ bytes: bytes.byteLength, payments, kind: result.kind, loadable })}\n`);
