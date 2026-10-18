/**
 * Every document is untrusted (PRD 14, Untrusted input; PRD 16, Threats: "a payer document carrying
 * injected instructions"). The gateway sends a document's text only inside a <document> element of the
 * user message, after the fixed system prompt of its prompt version, which says that the element holds
 * data and that nothing in it is an instruction. A closing tag inside the text cannot end the element
 * early: the text's own "</document" and "</page" sequences are written with a backslash, so the frame
 * the system prompt describes is the frame the model reads.
 *
 * The frame is a courtesy to the model, not the control. The controls are that a call has no tools and
 * no way to act, that its answer is a proposal in a fixed schema which code verifies against the source,
 * and that a person approves it before anything uses it.
 */

const CLOSING = /<\/(document|page)/gi;

/** The text with every closing tag of the frame neutralized. */
export function neutralize(text: string): string {
  return text.replace(CLOSING, (match) => `<\\/${match.slice(2)}`);
}

/** A document's pages, each in a numbered <page> element (page 1 first). */
export function framePages(kind: string, pages: readonly string[]): string {
  const body = pages.map((text, index) => `<page number="${String(index + 1)}">\n${neutralize(text)}\n</page>`).join('\n');
  return `<document kind="${kind}" pages="${String(pages.length)}">\n${body}\n</document>`;
}

/** A single text (a letter) in a <document> element. */
export function frameText(kind: string, text: string): string {
  return `<document kind="${kind}">\n${neutralize(text)}\n</document>`;
}

/**
 * Facts built by code, as JSON in a <facts> element. A fact may quote a document (a contract clause),
 * so every "</" in the JSON is written "<\/", which JSON reads as the same characters and which can
 * close no element.
 */
export function frameFacts(kind: string, facts: unknown): string {
  return `<facts kind="${kind}">\n${JSON.stringify(facts, null, 2).replaceAll('</', '<\\/')}\n</facts>`;
}
