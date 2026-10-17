/**
 * The monthly digest as other apps read it (@tp/worker/digests): the web app's digest page reads a stored
 * digest's figures and shows the same sentences as the email, with the payers named; the dashboard,
 * Coverage and the coverage report read coverage with the digest's own statement (COVERAGE_IN_EFFECT,
 * a SQL text). Nothing here reads or writes the database itself (docs/adr/0039).
 */
export {
  CONTRACT_EXPIRY_DAYS,
  DEADLINE_DAYS,
  type DigestCounts,
  type DigestFigures,
  type DigestTotals,
  coverageSentence,
  digestCountsSchema,
  digestSentences,
  digestTotalsSchema,
  monthName,
  parseDigestFigures,
  previousMonth,
  share,
  validatedByPayer,
} from './view';
export { COVERAGE_IN_EFFECT } from './figures';
