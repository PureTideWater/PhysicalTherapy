/**
 * Reading a text for a person's identifiers (docs/adr/0054): the letter reader's redaction and the checks after it,
 * the contract screen's runs, and the narrative's reading, which the gateway's drafter and the packet verifier
 * (@tp/packets) share. One module with no import, so both the gateway and the verifier read with the same code.
 */
export * from './redact';
