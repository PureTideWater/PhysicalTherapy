import { downloadHandler } from '../../../../../../lib/http/handler';
import { monthlySummaryCsvRoute } from '../../../../../../lib/routes/monitoring';
import { services } from '../../../../../../lib/server/services';

/** The monthly variance summary as CSV: counts and totals by payer and stage, no line-level PHI. */
export const dynamic = 'force-dynamic';
export const GET = downloadHandler(monthlySummaryCsvRoute, services);
