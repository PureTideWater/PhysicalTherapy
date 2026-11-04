/**
 * The worker as a library (@tp/worker/runtime), for the end-to-end suite, which runs it beside the web
 * app against the same local document directory and database, and for the web app's database tests:
 * the worker loop, the intake job, the parse_835 job (the parser and the loader), the monitoring chain
 * (monitor, price, triage, reconcile), the digest job, the audit report job, the ROI statement job and the report document job as they run in
 * production, wired to their local implementations; and the mail record's (docs/adr/0065): the local sender and its
 * simulator-shaped events, the platform's handlers with the mail_events job's local source and SES control in memory.
 */
export { type IntakeConfig, type NotificationConfig, readIntakeConfig, readNotificationConfig } from './config';
export { type DigestServices, digestHandler, digestLink, digestMessage, prepareDigest } from './digest/job';
export { DIGEST_QUERIES, digestFigures } from './digest/figures';
export { type LocalMailOptions, LocalMailSender, type MailContent, type MailMessage, type MailSender, MemoryMailSender, type SentMail } from './mail/mail';
export { type MailEventRecord, type MailQueueEntry, parseMailQueueMessage, simulatorOutcome } from './mail/events';
export { MAIL_LOG_CODES, MAIL_PROBE_RECIPIENTS, MAIL_TAGS, type MailIdentity, configurationSetName } from './mail/streams';
export {
  LocalMailEventSource,
  type MailControl,
  type MailEventSource,
  type MailEventsOptions,
  type MailEventsResult,
  MemoryMailControl,
  expireMail,
  runMailEvents,
} from './platform/mail-events';
export { type SupportNoticeOptions, type SupportNoticeResult, sendSupportGrantNotices } from './platform/support-notices';
export { type MailEventsDependencies, type PlatformDependencies, type PlatformHandlers, createPlatformHandlers } from './jobs/platform';
export { createdByMonitoring, notifyRun, runFigures } from './monitor/chain';
export { monitorHandler } from './monitor/job';
export { BATCH_WINDOW_MINUTES, MONITOR_DELAY_SECONDS, type MonitorPlan, planMonitoring } from './monitor/plan';
export { reconcileHandler } from './reconcile/job';
export { type PrintOutcome, type StatementPrintServices, printRoiStatement, roiStatementHandler } from './reconcile/print';
export { type JobContext, type JobHandlers, placeholderHandlers } from './jobs/handlers';
export { type PacketExportServices, packetExportHandler } from './packets/export';
export { type JobRunEnd, type JobRunRecorder, type JobRunStart, databaseJobRuns } from './jobs/runs';
export { type IntakeServices, intakeHandler } from './intake/intake';
export { intakeServices } from './intake/wiring';
export { DocumentIntegrityError, type ParseServices, parseHandler } from './parse/job';
export { type LoadContext, type TransactionLoad, type TransactionReview, loadTransaction } from './parse/loader';
export { type ParseReportRow, type ReportedError, type ReportedTransaction, type TransactionResult } from './parse/report';
export { ZIP_LIMITS, type ZipLimits } from './intake/zip';
export { ERA_EXPORT_HELD_REASONS, ERA_EXPORT_MAX_BYTES } from './parse/era/normalize';
export { ENGINE_ERRORS_MESSAGE, type ExecuteOptions, type ExecuteOutcome, type PricingJobContext, executePricingRun } from './price/execute';
export { priceHandler } from './price/job';
export { type ReportOptions, type ReportOutcome, type ReportServices, auditReportHandler, generateAuditReport } from './report/generate';
export { ChromiumPdfRenderer, type PdfRenderer } from './report/pdf';
export { type DocumentPrintOutcome, type DocumentPrintServices, printReportDocument, reportDocumentHandler } from './report/print-document';
export { type TriageJobContext, type TriageOptions, type TriageOutcome, executeTriage, todayUtc } from './triage/execute';
export { triageHandler } from './triage/job';
export { type QueueClient, type RunningWorker, startWorker } from './worker';
export {
  type ResendResult,
  SCREENING_BATCH,
  SCREENING_MAIL_PAUSED_CODE,
  SCREENING_STALE_SECONDS,
  SCREENING_WAIT_CODES,
  type ScreeningJobDependencies,
  type ScreeningPriceOutcome,
  type SweepOptions,
  type SweepResult,
  failScreeningRun,
  forgetScreeningReleases,
  priceScreeningRun,
  resendScreeningRuns,
  sweepScreeningRuns,
} from './screening/job';
export { type ScreeningConfig, readScreeningConfig } from './config';
export { type ScreeningConsumerOptions, startScreeningConsumer } from './screening/consumer';
export { type ScreeningJobs, createScreeningHandlers } from './jobs/screening';
export {
  SCREENING_MAIN_HEAP_FLAG,
  SCREENING_MAIN_HEAP_MB,
  SCREENING_THREAD_HEAP_MB,
  SCREENING_THREADS,
  ScreeningThreadError,
  ScreeningThreadPool,
  screeningHeapMib,
} from './screening/threads';
export { type ExpiryDependencies, type ExpiryResult, expireScreenings } from './screening/expiry';
export type { OperatorPool as ScreeningOperatorPool } from './screening/operator';
