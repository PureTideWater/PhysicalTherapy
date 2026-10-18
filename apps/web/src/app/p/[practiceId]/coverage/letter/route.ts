import { downloadHandler } from '../../../../../lib/http/handler';
import { payerLetter } from '../../../../../lib/routes/coverage';
import { services } from '../../../../../lib/server/services';

/** The request-to-payer letter for a missing fee schedule, as a text file (PRD 7, Coverage). */
export const dynamic = 'force-dynamic';
export const GET = downloadHandler(payerLetter, services);
