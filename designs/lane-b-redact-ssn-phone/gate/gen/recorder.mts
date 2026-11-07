// Stands in for any redact*.ts a harness imports: real helpers from a fixed snapshot, and the redaction entry points
// recording their input and answering "sent unchanged, not refused" so every branch of the harness runs.
export * from './snap/redact-3fcb9359.ts';
import { record } from './rec-sink.mts';
const sent = (text: unknown) => (typeof text === 'string' ? text.normalize('NFKC') : '');
export function redactLetterForScreen(text: string, patient: unknown, claims: unknown) { record('screen', text, patient, claims); return { text: sent(text), claims: new Map(), replaced: 0, candidates: [] as string[] }; }
export function redactLetter(text: string, patient: unknown, claims: unknown) { record('redact', text, patient, claims); return { text: sent(text), claims: new Map(), replaced: 0 }; }
export function redactionSpans(text: string, patient: unknown, claims: unknown) { record('spans', text, patient, claims); return { text: sent(text), spans: [] as { start: number; end: number; placeholder: string }[] }; }
export function holdsIdentifier(text: string, patient: unknown, claims: unknown) { record('holds', text, patient, claims); return false; }
