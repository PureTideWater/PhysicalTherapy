/**
 * The job contract other apps produce work against (@tp/worker/jobs): the web app queues intake when
 * an upload completes. The types, payload schemas, singleton keys and queue settings are the worker's,
 * so a producer cannot drift from the consumer (docs/adr/0026).
 */
export { type EnqueueOptions, type JobSender, enqueue } from './enqueue';
export { JOB_PAYLOADS, JOB_TYPES, type JobPayload, type JobType, QUEUE_OPTIONS, parsePayload, queueOptions, singletonKey } from './registry';
