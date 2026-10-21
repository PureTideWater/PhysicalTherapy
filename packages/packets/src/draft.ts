import { dollars } from './assemble';
import type { PacketContent } from './format';
import { interestStated } from './interest';

/**
 * A deterministic draft of the pattern statement, built by code from the version's own facts (PRD 12:
 * what the contract requires, what the remittances show, the delta and the count). In v1, before the
 * model gateway (milestone 10), a person writes or edits the narrative; this draft is where they start.
 * Every figure it writes is one of the facts and every sentence carries its citation marker, so it
 * passes the verifier by construction (a property test holds it to that). No model is involved.
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
      return [amount === null ? `${version} pays a visit at the rate cited on page ${String(citation.page)} [1].` : `${version} pays ${dollars(amount)} per visit for ${codes.join(', ')} [1].`];
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

export function draftNarrative(content: PacketContent): string {
  const { pattern, interest } = content;
  const span =
    pattern.first_service_date === pattern.last_service_date ? `on ${pattern.first_service_date}` : `from ${pattern.first_service_date} to ${pattern.last_service_date}`;
  const sentences = [
    ...requirement(content),
    `The remittances allowed ${dollars(pattern.observed_cents)} for ${plural(pattern.lines, 'line', 'lines')} on ${plural(pattern.claims, 'claim', 'claims')} with service dates ${span} [3].`,
    content.citation.kind === 'contract'
      ? `Under the contract those lines come to ${dollars(pattern.expected_cents)}, a shortfall of ${dollars(pattern.variance_cents)} [3].`
      : `At the Original Medicare amount those lines come to ${dollars(pattern.expected_cents)}, a shortfall of ${dollars(pattern.variance_cents)} [3].`,
  ];
  // Interest only where code computed it above zero (audit item #37 part 1, D9; the founder's ruling of 2026-10-20,
  // Q4 (a); interestStated()): nothing is said of interest no line computed, or of $0.00, so the letter never reads as
  // giving it up.
  if (interest !== null && interest.total_cents !== null && interestStated(interest)) {
    sentences.push(`Prompt-pay interest of ${dollars(interest.total_cents)} is stated as its own line and is not part of the shortfall [4].`);
  }
  return sentences.join(' ');
}
