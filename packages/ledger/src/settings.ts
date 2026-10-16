import { DEFAULT_PROOF_LEVEL, LedgerError, type ProofLevel, isProofLevel } from './stages';
import { BUILT_IN_POSTING_TEMPLATES, DATE_FORMATS, type DateFormat, POSTING_FIELDS, type PostingTemplate, REQUIRED_POSTING_FIELDS, templateProblems } from './templates';

/**
 * The ledger's practice settings (Data dictionary, practice.settings: "proof level"; PRD 13, Matching
 * step 3: "practices that cannot supply deposit data set their proof level to posted and the ROI
 * statement says so"; PRD 20). They live in practice.settings beside the pricing and triage settings:
 *
 * | Key | Meaning | Default |
 * | --- | --- | --- |
 * | proof_level | the stage that proves recovery: "posted" or "deposited" | "posted" (PRD 20) |
 * | posting_export_template | the practice's posting-export template, mapped once at onboarding: {"template": "<built-in ID>"}, or {"system", "columns" (field to header), "date_format"} | none: a posting export waits for its mapping |
 *
 * A malformed setting is refused (LedgerSettingsError names the key), never replaced by a default.
 */

export const PROOF_LEVEL_KEY = 'proof_level';
export const POSTING_TEMPLATE_KEY = 'posting_export_template';

export interface LedgerSettings {
  readonly proofLevel: ProofLevel;
  readonly postingTemplate: PostingTemplate | null;
}

export class LedgerSettingsError extends LedgerError {
  override readonly name = 'LedgerSettingsError';

  constructor(readonly key: string) {
    super(`the practice setting ${key} is malformed`);
  }
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A posting template from its stored form, or why not. */
export function postingTemplateOf(stored: unknown): PostingTemplate {
  if (!isObject(stored)) {
    throw new LedgerSettingsError(POSTING_TEMPLATE_KEY);
  }
  if (Object.keys(stored).length === 1 && typeof stored.template === 'string') {
    const builtIn = BUILT_IN_POSTING_TEMPLATES.find((template) => template.id === stored.template);
    if (builtIn === undefined) {
      throw new LedgerSettingsError(POSTING_TEMPLATE_KEY);
    }
    return builtIn;
  }
  const keys = Object.keys(stored).sort();
  const { system, columns, date_format: dateFormat } = stored;
  if (keys.join(',') !== 'columns,date_format,system' || typeof system !== 'string' || !isObject(columns) || !(DATE_FORMATS as readonly unknown[]).includes(dateFormat)) {
    throw new LedgerSettingsError(POSTING_TEMPLATE_KEY);
  }
  const template: PostingTemplate = { id: 'practice', system, columns, dateFormat: dateFormat as DateFormat };
  if (templateProblems(template, POSTING_FIELDS, REQUIRED_POSTING_FIELDS).length > 0) {
    throw new LedgerSettingsError(POSTING_TEMPLATE_KEY);
  }
  return template;
}

/** The stored form of a posting template: a built-in one by its ID, a practice's own by its mapping. */
export function postingTemplateSetting(template: PostingTemplate): Readonly<Record<string, unknown>> {
  if (BUILT_IN_POSTING_TEMPLATES.some((builtIn) => builtIn === template)) {
    return { template: template.id };
  }
  return { system: template.system, columns: template.columns, date_format: template.dateFormat };
}

/** The ledger settings of a practice.settings document (any other keys are left to their readers). */
export function ledgerSettings(stored: unknown): LedgerSettings {
  const document = isObject(stored) ? stored : {};
  const level = document[PROOF_LEVEL_KEY];
  if (level !== undefined && !isProofLevel(level)) {
    throw new LedgerSettingsError(PROOF_LEVEL_KEY);
  }
  const template = document[POSTING_TEMPLATE_KEY];
  return { proofLevel: level ?? DEFAULT_PROOF_LEVEL, postingTemplate: template === undefined ? null : postingTemplateOf(template) };
}
