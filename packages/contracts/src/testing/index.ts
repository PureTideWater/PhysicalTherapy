/** Test support for @tp/contracts and its callers: synthetic PDFs and workbooks, record builders, and a Textract client that answers from a recording. Synthetic data only. */
export { type SyntheticPage, syntheticPdf } from './synthetic-pdf';
export { type SyntheticCell, type SyntheticSheet, syntheticXlsx, zipParts } from './synthetic-xlsx';
export { fixedTerms, mapping, rate, version } from './records';
export { type RecordedTextractOptions, TEXTRACT_PAGE_SIZE, recordedTextractClient } from './recorded-textract';
