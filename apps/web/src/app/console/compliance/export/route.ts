import { downloadHandler } from '../../../../lib/http/handler';
import { exportEvidence } from '../../../../lib/routes/compliance';
import { services } from '../../../../lib/server/services';

/** The SOC 2 Type I evidence export, tp-compliance-evidence/1 (platform administrators; docs/adr/0053). */
export const GET = downloadHandler(exportEvidence, services);
