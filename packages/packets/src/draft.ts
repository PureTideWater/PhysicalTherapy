import { dollars } from './assemble';
import { type FactCatalog, factCatalog } from './fact-catalog';
import { type PacketContent, VERIFIER_FORMAT, VERIFIER_FORMAT_V3, type VerifierFormat } from './format';
import { interestStated } from './interest';
import { factPlaceholder } from './placeholders';

/**
 * A deterministic draft of the pattern statement, built by code from the version's own facts (PRD 12:
 * what the contract requires, what the remittances show, the delta and the count). In v1, before the
 * model gateway (milestone 10), a person writes or edits the narrative; this draft is where they start.
 * Every figure it writes is one of the facts, each amount with the scope phrase right after it (docs/adr/0086, rule 1)
 * in a sentence that names no code or date of service, and every sentence carries its citation marker, so it passes the
 * verifier by construction (a property test holds it to that).
 * No model is involved.
 *
 * It is written for the payer (audit item #37 part 1; docs/adr/0061): it names no internal term, says nothing of
 * interest that could not be computed, and states the Medicare fee schedule a regulation's amount comes from by its
 * release.
 */

const plural = (count: number, one: string, many: string) => `${String(count)} ${count === 1 ? one : many}`;

function requirement(content: PacketContent): string[] {
  const { citation, pattern } = content;
  if (citation.kind === 'regulation') {
    const release = content.rule_releases.at(-1);
    return [
      `The plan is a Medicare Advantage plan the practice has no contract with, so it owes the amount Original Medicare would pay under ${citation.reference} [1].`,
      ...(release === undefined ? [] : [`The Medicare fee schedule in effect for those service dates (release ${String(release.release_no)}) sets that amount [2].`]),
    ];
  }
  const version = `The contract, version ${String(citation.version_no)},`;
  const codes = pattern.codes.map((code) => code.procedure_code);
  switch (citation.method) {
    case 'FIXED_SCHEDULE':
      return pattern.codes.map((code) =>
        code.contract_amount_cents === null ? `${version} sets the rate for ${code.procedure_code} in the clause cited on page ${String(citation.page)} [1].` : `${version} pays ${code.procedure_code} at ${dollars(code.contract_amount_cents)} per unit [1].`,
      );
    case 'PER_VISIT': {
      const amount = pattern.codes[0]?.contract_amount_cents ?? null;
      // The codes in a sentence of their own: a sentence that names a code names a part of the lines, so an amount in
      // it keeps no scope (docs/adr/0086, rule 1).
      return amount === null ? [`${version} pays a visit at the rate cited on page ${String(citation.page)} [1].`] : [`${version} pays ${dollars(amount)} per visit [1].`, `That rate is for ${codes.join(', ')} [1].`];
    }
    case 'PERCENT_OF_MEDICARE': {
      const percent = pattern.contract_percentages[0];
      const year = pattern.contract_years[0];
      const schedule = year === undefined ? 'the Medicare fee schedule' : `the ${String(year)} Medicare fee schedule`;
      return [percent === undefined ? `${version} pays a percentage of ${schedule} [1].` : `${version} pays ${percent}% of ${schedule} for ${codes.join(', ')} [1].`];
    }
    case 'LESSER_OF':
      return [`${version} pays the lesser of the billed charge and the schedule cited on page ${String(citation.page)} [1].`];
  }
}

/** What the draft is written for: the verifier format it passes. */
export interface DraftOptions {
  /**
   * tp-packet-verifier/2 (the default, every caller's today): figures written out, the text byte for byte as it always
   * was. tp-packet-verifier/3 (docs/adr/0089): every figure a fact token (draftTemplate()).
   */
  readonly format?: VerifierFormat;
}

/**
 * The draft at verifier format /3 (design lane-b-packet-figure-placeholders, section 2.1; docs/adr/0089): the same
 * statement with every figure a fact token ({{fact:<id>}}) of the version's catalog, which code renders with its role
 * and the lines it covers. Its free text holds no figure, number word or code, and it names a fact only where the
 * catalog holds it, so it passes /3 by construction (a property test holds it to that). ADR 0086's sentence splits
 * stay: the codes and the service dates are in sentences with no amount of all the lines, so no code token stands beside
 * a pattern total. Every fact it names is one a model may use too (no row-bound id).
 */
function draftTemplate(content: PacketContent): string {
  const catalog: FactCatalog = factCatalog(content);
  const has = (id: string) => catalog.byId.has(id);
  const fact = (id: string) => factPlaceholder(id);
  const { citation, pattern, interest } = content;
  const codes = pattern.codes.map((code) => `code.${code.procedure_code.toLowerCase()}`).filter(has);
  const listed = codes.map(fact).reduce((text, token, index) => (index === 0 ? token : `${text}${index === codes.length - 1 ? ' and ' : ', '}${token}`), '');
  const sentences: string[] = [];
  const version = has('citation.version') ? fact('citation.version') : 'The contract';
  const page = has('citation.page') ? ` on ${fact('citation.page')}` : '';
  if (citation.kind === 'regulation') {
    const reference = has('citation.reference') ? ` under ${fact('citation.reference')}` : '';
    sentences.push(`The plan is a Medicare Advantage plan the practice has no contract with, so it owes the amount Original Medicare would pay${reference} [1].`);
    const release = `release.no.${String(content.rule_releases.length)}`;
    if (has(release)) {
      sentences.push(`The Medicare fee schedule in effect for those service dates, ${fact(release)}, sets that amount [2].`);
    }
  } else if (citation.method === 'PERCENT_OF_MEDICARE') {
    sentences.push(has('contract.percent.1') ? `${version} sets ${fact('contract.percent.1')} of the Medicare fee schedule [1].` : `${version} pays a percentage of the Medicare fee schedule [1].`);
    if (has('contract.year.1')) {
      sentences.push(`That schedule is ${fact('contract.year.1')} [1].`);
    }
  } else if (citation.method === 'LESSER_OF') {
    sentences.push(`${version} pays the lesser of the billed charge and the schedule cited${page} [1].`);
  } else if (has('contract.rate')) {
    sentences.push(`${version} sets ${fact('contract.rate')} [1].`);
  } else {
    sentences.push(`${version} sets the rate in the clause cited${page} [1].`);
  }
  // The codes in a sentence of their own: a code token names part of the lines (section 4).
  if (citation.kind === 'contract' && codes.length > 0) {
    sentences.push(`That rate is for ${listed} [1].`);
  }
  // The service dates in a sentence with no amount.
  sentences.push(`The pattern is ${fact('pattern.lines')} on ${fact('pattern.claims')} with ${fact('pattern.service_dates')} [3].`);
  sentences.push(`The remittances show ${fact('pattern.allowed')} [3].`);
  sentences.push(
    citation.kind === 'contract'
      ? `Under the contract those lines come to ${fact('pattern.expected')}, and the difference is ${fact('pattern.variance')} [3].`
      : `At the Original Medicare amount those lines come to ${fact('pattern.expected')}, and the difference is ${fact('pattern.variance')} [3].`,
  );
  if (interest !== null && interestStated(interest) && has('interest.total')) {
    sentences.push(`This packet states ${fact('interest.total')} as its own line, and it is not part of the shortfall [4].`);
  }
  return sentences.join(' ');
}

/**
 * The code-written draft: at /2 (the default) the figures written out, as every caller has it; at /3, asked for by
 * `options.format`, a template of fact tokens (draftTemplate()).
 */
export function draftNarrative(content: PacketContent, options: DraftOptions = {}): string {
  const format = options.format ?? VERIFIER_FORMAT;
  if (format === VERIFIER_FORMAT_V3) {
    return draftTemplate(content);
  }
  const { pattern, interest } = content;
  const span =
    pattern.first_service_date === pattern.last_service_date ? `on ${pattern.first_service_date}` : `from ${pattern.first_service_date} to ${pattern.last_service_date}`;
  const sentences = [
    ...requirement(content),
    // The service dates in a sentence with no amount: a sentence that names a date of service names a part of the lines.
    `The pattern is ${plural(pattern.lines, 'line', 'lines')} on ${plural(pattern.claims, 'claim', 'claims')} with service dates ${span} [3].`,
    `The remittances allowed ${dollars(pattern.observed_cents)} in total for those lines [3].`,
    content.citation.kind === 'contract'
      ? `Under the contract those lines come to ${dollars(pattern.expected_cents)} in total, a shortfall of ${dollars(pattern.variance_cents)} in total [3].`
      : `At the Original Medicare amount those lines come to ${dollars(pattern.expected_cents)} in total, a shortfall of ${dollars(pattern.variance_cents)} in total [3].`,
  ];
  // Interest only where code computed it above zero (audit item #37 part 1, D9; the founder's ruling of 2026-10-20,
  // Q4 (a); interestStated()): nothing is said of interest no line computed, or of $0.00, so the letter never reads as
  // giving it up.
  if (interest !== null && interest.total_cents !== null && interestStated(interest)) {
    sentences.push(`Prompt-pay interest of ${dollars(interest.total_cents)} in total is stated as its own line and is not part of the shortfall [4].`);
  }
  return sentences.join(' ');
}
