import { z } from 'zod';

/**
 * The license allowlist gate (PRD section 16, dependency and image hygiene): every production
 * dependency's license must be on the allowlist, or the package must have a named exception with
 * its reason. Input is the JSON `pnpm licenses list --prod --json` prints (license to packages).
 */

export const policySchema = z.strictObject({
  /** SPDX identifiers any package may carry. */
  licenses: z.array(z.string().min(1)).min(1),
  /** One package allowed one license outside the list, with the reason written down. */
  exceptions: z.array(z.strictObject({ package: z.string().min(1), license: z.string().min(1), reason: z.string().min(20) })),
});
export type LicensePolicy = z.infer<typeof policySchema>;

export const pnpmLicensesSchema = z.record(z.string(), z.array(z.looseObject({ name: z.string(), versions: z.array(z.string()) })));
export type PnpmLicenses = z.infer<typeof pnpmLicensesSchema>;

/**
 * True when an SPDX expression is satisfied by the allowed identifiers: "A OR B" needs either,
 * "A AND B" needs both, parentheses group. An identifier is compared exactly; "Unknown" and anything
 * unparseable are never allowed.
 */
export function expressionAllowed(expression: string, allowed: ReadonlySet<string>): boolean {
  const tokens = expression.replace(/[()]/g, (paren) => ` ${paren} `).trim().split(/\s+/);
  let at = 0;
  const parseOr = (): boolean => {
    let result = parseAnd();
    while (tokens[at] === 'OR') {
      at += 1;
      const right = parseAnd();
      result = result || right;
    }
    return result;
  };
  const parseAnd = (): boolean => {
    let result = parseAtom();
    while (tokens[at] === 'AND') {
      at += 1;
      const right = parseAtom();
      result = result && right;
    }
    return result;
  };
  const parseAtom = (): boolean => {
    const token = tokens[at];
    at += 1;
    if (token === '(') {
      const inner = parseOr();
      if (tokens[at] !== ')') {
        throw new SyntaxError(`unbalanced parentheses in ${JSON.stringify(expression)}`);
      }
      at += 1;
      return inner;
    }
    if (token === undefined || token === ')' || token === 'OR' || token === 'AND') {
      throw new SyntaxError(`cannot read the license expression ${JSON.stringify(expression)}`);
    }
    return allowed.has(token.replace(/\+$/, ''));
  };
  try {
    const result = parseOr();
    return at === tokens.length && result;
  } catch {
    return false;
  }
}

/** One line per production package whose license the policy does not allow; empty when all pass. */
export function licenseProblems(listed: PnpmLicenses, policy: LicensePolicy): string[] {
  const allowed = new Set(policy.licenses);
  const problems: string[] = [];
  for (const [license, packages] of Object.entries(listed)) {
    for (const item of packages) {
      const excepted = policy.exceptions.some((exception) => exception.package === item.name && exception.license === license);
      if (!excepted && !expressionAllowed(license, allowed)) {
        problems.push(`${item.name}@${item.versions.join(',')}: ${license} is not on the license allowlist (tools/check-licenses/allowlist.json)`);
      }
    }
  }
  const used = new Set(Object.entries(listed).flatMap(([license, packages]) => packages.map((item) => `${item.name} ${license}`)));
  for (const exception of policy.exceptions) {
    if (!used.has(`${exception.package} ${exception.license}`)) {
      problems.push(`the exception for ${exception.package} (${exception.license}) matches no production dependency; remove it`);
    }
  }
  return problems.sort();
}
