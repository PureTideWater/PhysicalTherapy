import { type PacketContent, type VerifierReport, dollars, narrativeFacts, verifyNarrative } from '@tp/packets';
import { z } from 'zod';

import { InputRefusedError } from '../errors';
import { type RoleMismatch, roleMismatches } from './narrative-roles';
import { jsonSha256 } from '../hash';
import { PROMPTS } from '../prompts';
import { holdsNameOrNumber } from '../redact';
import type { PurposeSpec, Verified } from '../spec';
import { frameFacts } from '../untrusted';

/**
 * draftPacketNarrative (PRD 14; PRD 5, J9: "the pattern narrative (model-drafted in v1 from the
 * approved records, verified field by field by code)"). In: the approved pattern statement's inputs
 * only, built here from the packet version's content: the contract clause quoted (or the regulation),
 * the rule releases, the counts, totals, codes and service-date range, interest's total, the requested
 * action and the numbered sources. No identifiers at all: no patient, member, claim or line appears, and
 * the call is refused if any of the case's identifiers would be in what is sent. Amounts are given as
 * code writes them ($1234.50) so the narrative can repeat them exactly.
 *
 * Out: paragraphs with a citation marker on every sentence. The verifier is the packets verifier
 * itself (@tp/packets verifyNarrative): any number, date, code or count not among the version's inputs,
 * a sentence without a citation, a marker naming no source, a hidden character, or an identifier of
 * the case fails it, and a version whose narrative fails it cannot be approved (CAS-08). It holds
 * every figure to the role its own words give it (docs/adr/0086): a narrative that states the payer's
 * amount as the contract's, or the claim count as the line count, fails it, and ./narrative-roles.ts
 * names the role each such figure was read in, so the notice says it is misstated.
 */

export const narrativeOutput = z.strictObject({ paragraphs: z.array(z.string().min(1).max(4000)).min(1).max(20) });
export type NarrativeOutput = z.output<typeof narrativeOutput>;

export interface NarrativeInput {
  /** The packet version's content (identifiers are placeholders in it). */
  readonly content: PacketContent;
  /**
   * The case's own identifiers (the schedule rows' patient names, member IDs and claim numbers), read
   * by the server from the canonical records: never sent, only checked.
   */
  readonly identifiers: readonly string[];
  /**
   * Which of the identifiers are names (the patients' and insureds' last and first names), so the
   * check before the call reads each as a name and the rest as member IDs and claim numbers. Absent, a
   * value with no digit is read as a name.
   */
  readonly names?: readonly string[];
}

export interface NarrativeProposal {
  /** The paragraphs joined by blank lines, for a person to edit and approve. */
  readonly narrative: string;
  /** The packets verifier's report, as a version would store it. */
  readonly report: VerifierReport;
  /**
   * Figures the packets verifier failed because their own words give them a role whose inputs do not
   * hold them, though another role's do (./narrative-roles.ts): a model's draft with any is not written
   * as a version.
   */
  readonly roles: readonly RoleMismatch[];
}

const money = (cents: string | null) => (cents === null ? null : dollars(cents));

/** The pattern statement's inputs, as the model is given them: pattern-level facts, no identifiers. */
export function narrativeInputs(content: PacketContent) {
  const { citation, pattern, interest } = content;
  return {
    citation:
      citation.kind === 'contract'
        ? { kind: citation.kind, version_no: citation.version_no, page: citation.page, quote: citation.quote, method: citation.method, effective_from: citation.effective_from, effective_to: citation.effective_to }
        : { kind: citation.kind, reference: citation.reference, statement: citation.statement },
    rule_releases: content.rule_releases.map((release) => release.release_no),
    dispute_level: content.dispute_level,
    pattern: {
      behavior: pattern.behavior,
      method: pattern.method,
      contract_percentages: pattern.contract_percentages,
      contract_years: pattern.contract_years,
      codes: pattern.codes.map((code) => ({
        procedure_code: code.procedure_code,
        lines: code.lines,
        units: code.units,
        expected: money(code.expected_cents),
        observed: money(code.observed_cents),
        variance: money(code.variance_cents),
        contract_amount: money(code.contract_amount_cents),
      })),
      lines: pattern.lines,
      claims: pattern.claims,
      patients: pattern.patients,
      units: pattern.units,
      expected: money(pattern.expected_cents),
      observed: money(pattern.observed_cents),
      variance: money(pattern.variance_cents),
      first_service_date: pattern.first_service_date,
      last_service_date: pattern.last_service_date,
    },
    interest: interest === null ? null : { computed: interest.computed, total: money(interest.total_cents) },
    requested_action: content.requested_action,
    sources: content.sources.map((source) => ({ marker: source.marker, kind: source.kind })),
  };
}

/** The case's identifiers as names and numbers (member IDs and claim numbers), as the check before the call reads them. */
export function identifierKinds(input: Pick<NarrativeInput, 'identifiers' | 'names'>): { readonly names: readonly string[]; readonly numbers: readonly string[] } {
  const names = new Set(input.names ?? input.identifiers.filter((value) => !/\p{N}/u.test(value)));
  return { names: [...names], numbers: input.identifiers.filter((value) => !names.has(value)) };
}

/**
 * Whether any of the identifiers is in the text in a form the letter reader's redaction reads
 * (../redact.ts): a name with its case, marks, dashes and apostrophes written any way, a number with
 * its spaces, dashes, invisible characters, or a period, underscore, slash or colon next to a letter.
 * Every number is read as a member ID is, never as an amount ("$12345678" is number 12345678). A period
 * never joins digits, and a date written with its dashes that a calendar holds is a date, so the facts'
 * "$1234.50" and "2026-03-05" never read as a claim's 123450 or 20260305.
 */
export function mentionsIdentifier(text: string, identifiers: { readonly names: readonly string[]; readonly numbers: readonly string[] }): boolean {
  return holdsNameOrNumber(text, identifiers);
}

export const narrativeSpec: PurposeSpec<NarrativeInput, NarrativeOutput, NarrativeProposal> = {
  purpose: 'draftPacketNarrative',
  prompt: PROMPTS.draftPacketNarrative,
  output: narrativeOutput,
  prepare(input) {
    const facts = narrativeInputs(input.content);
    const user = `Draft the pattern statement's narrative from the facts below, in the JSON the schema describes.\n\n${frameFacts('pattern_statement', facts)}`;
    if (mentionsIdentifier(user, identifierKinds(input))) {
      throw new InputRefusedError('identifier_in_input', 'a narrative is drafted from pattern-level facts with no identifiers; one of the case’s identifiers is in them');
    }
    return { user, inputHashes: [jsonSha256(facts)], variant: 'default', context: undefined };
  },
  verify(input, output): Verified<NarrativeProposal> {
    const narrative = output.paragraphs.join('\n\n');
    const report = verifyNarrative(narrative, narrativeFacts(input.content), input.identifiers);
    const roles = roleMismatches(narrative, input.content);
    const markers = [...new Set([...narrative.matchAll(/\[(\d{1,4})\]/g)].map((match) => Number.parseInt(match[1] ?? '', 10)))].filter((marker) => marker >= 1).sort((a, b) => a - b);
    return { proposal: { narrative, report, roles }, passed: report.passed && roles.length === 0, citations: markers.map((marker) => ({ marker })) };
  },
};
