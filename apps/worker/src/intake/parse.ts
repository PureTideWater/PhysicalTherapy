import type { JobHandler } from '../jobs/handlers';

/**
 * The parse_835 job until the parser and the loader arrive (milestone 3, next part): it marks the
 * scanned 835 queued for parse, which the Uploads screen shows, and parses nothing. Its payload is the
 * practice and the document (the job's idempotency subject; one job per practice and document is
 * queued or active at a time). Replaying it changes nothing more.
 */
export const parseQueuedHandler: JobHandler<'parse_835'> = async (payload, context) => {
  const marked = await context.transaction(
    async (scope) => (await scope.client.query("UPDATE source_document SET status = 'parse_queued' WHERE id = $1 AND kind = 'x12_835' AND status = 'scanned'", [payload.document_id])).rowCount,
  );
  if (marked === 1) {
    context.logger.info('document queued for parse', { document_id: payload.document_id });
  } else {
    context.logger.info('document was not waiting to be queued for parse', { document_id: payload.document_id });
  }
};
