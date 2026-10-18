/**
 * The monthly digest as other apps read it (@tp/worker/digests): the web app's digest page reads a stored
 * digest's figures and shows the same sentences as the email, with the payers named. Pure; nothing here
 * reads or writes the database (docs/adr/0039).
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
