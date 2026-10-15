import type { JobContext } from '../jobs/handlers';
import { MONITOR_DELAY_SECONDS } from './plan';

/**
 * Queues the monitoring chain's planning step once an 835 of an upload batch is done (loaded, a
 * duplicate, held, or failed on its last attempt): monitor, keyed by the document, after a short wait so
 * the rest of its batch can land (docs/adr/0039). A failure to queue it is logged and never fails the
 * parse that is done: the daily schedule plans the practice again, as it does a batch whose last
 * document intake held after its last parse had planned.
 */
export async function queueMonitoring(context: JobContext, practiceId: string, documentId: string): Promise<void> {
  try {
    await context.enqueue('monitor', { practice_id: practiceId, document_id: documentId }, { startAfterSeconds: MONITOR_DELAY_SECONDS });
  } catch {
    context.logger.warn('monitoring not queued after the document; the daily schedule plans it', { document_id: documentId, error_code: 'MONITOR_NOT_QUEUED' });
  }
}
