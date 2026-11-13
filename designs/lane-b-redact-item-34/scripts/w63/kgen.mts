// W63: the battery's k-gen-A letters the item's head refuses and a97d73e4 sends, by commit (which round refuses them).
import path from 'node:path'; import { pathToFileURL } from 'node:url';
const patient = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['ZZ7654321'] };
const claims = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const rows = ["SSN on file. Policy\t,\n\rID'\t202-555-01234567 150.00", "Fax: File  ~~~\t\n\r﻿:900 12 3456150.00\nThank you.",
  "SSN on file. Policy\t,\nID'\t202-555-01234567 150.00", "Fax: File  ~~~\t\n﻿:900 12 3456150.00\nThank you.", "Fax: File  ~~~\t\n\r﻿:900 12 3456 150.00\nThank you."];
for (const t of process.argv.slice(2)) { const H = await import(pathToFileURL(path.join(t, 'redact.ts')).href);
  console.log(path.basename(path.dirname(t)) + path.basename(t), rows.map((x) => { const r = H.redactLetterForScreen(x, patient, claims); return H.holdsIdentifier(r.text, patient, claims, H.checkWorkOf?.(r)) ? 'R' : r.text === x ? 'same' : 'changed'; }).join(' | ')); }
