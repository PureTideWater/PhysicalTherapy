import { type LogField, isAllowedLogField } from './fields';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogValue = string | number | boolean | bigint | null;
export type LogFields = Partial<Record<LogField, LogValue>>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** A logger whose lines all carry these fields. */
  child(fields: LogFields): Logger;
}

export interface LoggerOptions {
  /** Receives one JSON line per entry. Defaults to standard output. */
  sink?: (line: string) => void;
  /** Entries below this level are dropped. Defaults to info. */
  level?: LogLevel;
  /** Fields every line carries. */
  base?: LogFields;
  now?: () => Date;
}

function isLogValue(value: unknown): value is LogValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  );
}

/**
 * Keeps only allowlisted keys whose values are primitives. The types already refuse other keys;
 * this is the runtime fence for values that arrive through casts or untyped code.
 */
export function allowlistedFields(fields: Readonly<Record<string, unknown>>): Record<string, LogValue> {
  const kept: Record<string, LogValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (isAllowedLogField(key) && isLogValue(value)) {
      kept[key] = typeof value === 'bigint' ? value.toString() : value;
    }
  }
  return kept;
}

function writeStdout(line: string): void {
  process.stdout.write(`${line}\n`);
}

/** A structured JSON logger that can only emit allowlisted fields. */
export function createLogger(options: LoggerOptions = {}): Logger {
  const sink = options.sink ?? writeStdout;
  const threshold = LOG_LEVELS.indexOf(options.level ?? 'info');
  const now = options.now ?? (() => new Date());
  const base = allowlistedFields(options.base ?? {});

  const emit = (level: LogLevel, message: string, fields: LogFields = {}): void => {
    if (LOG_LEVELS.indexOf(level) < threshold) {
      return;
    }
    const entry = { ...base, ...allowlistedFields(fields), time: now().toISOString(), level, msg: message };
    sink(JSON.stringify(entry));
  };

  return {
    debug: (message, fields) => {
      emit('debug', message, fields);
    },
    info: (message, fields) => {
      emit('info', message, fields);
    },
    warn: (message, fields) => {
      emit('warn', message, fields);
    },
    error: (message, fields) => {
      emit('error', message, fields);
    },
    child: (fields) => {
      // Both halves are already filtered; the child's createLogger filters the merge again.
      const bound: LogFields = Object.assign({}, base, allowlistedFields(fields));
      return createLogger({ ...options, base: bound });
    },
  };
}
