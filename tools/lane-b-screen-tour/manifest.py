"""Writes manifest.json: the tour's screens in story order, each with what it shows in one plain sentence."""
import json
import os
import struct
import sys

S = os.environ['TOUR_DIR']  # the tour's working directory (README, Set-up)
ids = json.load(open(f'{S}/ids.json'))
shots = {os.path.basename(s['file']): s for s in json.load(open(f'{S}/shots.json'))['shots']}
contract = json.load(open(f'{S}/contract-shot.json')) if os.path.exists(f'{S}/contract-shot.json') else None


def size(name):
    head = open(f'{S}/png/{name}', 'rb').read(24)
    return struct.unpack('>II', head[16:24])


def path_of(name, fallback):
    return shots[name]['path'] if name in shots else fallback


L, P, G, M = ids['layout'], ids['packets'], ids['ledger'], ids['monitoring']
BM = 'billing manager'
entries = [
    ('01-sign-in.png', 'Sign in', 'Getting started', 'public', '/sign-in',
     'The sign-in page: email and password, then a six-digit code from an authenticator app, with PaidWhole staff required to use a hardware key instead.'),
    ('02-practice-home.png', 'Practice home', 'Getting started', f'{BM} (ledger-manager)', f'/p/{G}',
     'A practice’s home page: three headline numbers kept apart (actionable $0.00, payer approved $30.00, recovered as deposited cash $12.00), how fresh its data is, its work queues, and monitoring news such as a payer taking back $18.00.'),
    ('03-uploads.png', 'Uploading a remittance', 'Payments in', f'{BM} (pricing-manager)', f'/p/{L}/uploads',
     'Where a practice drops its 835 remittance files (one, a batch or a zip), each scanned for malware first; the receipts show two remittances loaded (32 claims and 3 claims) and a contract stored.'),
    ('04-remittances.png', 'Remittances', 'Payments in', f'{BM} (pricing-manager)', f'/p/{L}/remittances',
     'Every payment loaded from the 835s: two synthetic payers with their payment dates, trace numbers and amounts ($2,240.00 and $168.00), each checked as balanced.'),
    ('05-remittance.png', 'One remittance and its claims', 'Payments in', f'{BM} (pricing-manager)', path_of('05-remittance.png', ''),
     'One $168.00 payment from SYNTHETIC PAYER Q, with its three claims (synthetic patients), what was charged, what was paid and the patient’s share on each.'),
    ('06-contracts.png', 'Contracts', 'Contracts and pricing', f'{BM} (pricing-manager)', f'/p/{L}/contracts',
     'The practice’s payer contracts: one signed-off fixed-fee agreement that prices all of its plan’s lines, a calendar of contract dates, and where to upload new contracts and payer letters.'),
    ('07-contract-version.png', 'A contract version, its rates and their citations', 'Contracts and pricing', None, None, None),
    ('08-mapping.png', 'Payer and plan mapping', 'Contracts and pricing', f'{BM} (pricing-manager)', f'/p/{L}/mapping?view=all',
     'Each payer’s plan and the agreement it is paid under (shown with “All plans” chosen): Payer Q’s plan on its signed-off contract, Payer N’s as out of network, and no dollars left waiting on a mapping.'),
    ('09-pricing-runs.png', 'Pricing runs', 'Contracts and pricing', f'{BM} (pricing-manager)', f'/p/{L}/pricing-runs',
     'The pricing runs for March and April, each pinned to rule release 900001: March priced 3 of 3 lines and found $90.00 underpaid, while April’s 32 out-of-network lines have no contract to price them.'),
    ('10-pricing-run.png', 'One pricing run', 'Contracts and pricing', f'{BM} (pricing-manager)', path_of('10-pricing-run.png', ''),
     'The March run in detail: every line priced under the signed-off contract, $90.00 underpaid for one payer pattern, and each line’s expected $100.00 against the $70.00 the payer allowed.'),
    ('11-line-trace.png', 'A priced line’s explanation (its trace)', 'Contracts and pricing', f'{BM} (pricing-manager)', path_of('11-line-trace.png', ''),
     'One line’s full audit trail: the expected $100.00, every step the pricing engine took with the records it read (contract, units, rounding, dispute window), the line as the payer paid it, and its adjustment codes.'),
    ('12-anomalies.png', 'Anomalies by payer pattern', 'Disputes', f'{BM} (pricing-manager)', f'/p/{L}/anomalies',
     'Lines no contract prices, grouped by payer, plan, code and quarter: 4 of Payer N’s 32 lines were paid $60 to $80 against a usual $90.00, flagged for a look rather than counted as money owed.'),
    ('13-cases.png', 'Cases', 'Disputes', f'{BM} (pricing-manager)', f'/p/{L}/cases',
     'The case list: one open case for Payer Q, “paid below the contract rate”, 3 lines and $90.00 to pursue, with its deadline, plus the controls for triage and the dollar thresholds that open a case.'),
    ('14-case.png', 'One case', 'Disputes', f'{BM} (packet-approver)', path_of('14-case.png', ''),
     'A case taken all the way through: its packet approved by a second person and exported, submitted to the payer, the payer partly accepting with $60.00 approved, and a timeline of every step and who took it.'),
    ('15-packet-approve.png', 'A dispute packet at the approve step', 'Disputes', 'second billing manager (packet-approver)', path_of('15-packet-approve.png', ''),
     'A dispute packet waiting for a second person’s approval: the contract clause it cites, the three lines with patient details held back as placeholders, each line’s deadline and math, a checked narrative, and the Approve button.'),
    ('16-payer-copy.png', 'The payer’s copy', 'Disputes', f'{BM} (packet-approver)', path_of('16-payer-copy.png', '').replace('(page 1)', '(page 2)'),
     'The letter page of the PDF the payer receives: the contract clause quoted, the underpayment stated, the three lines with their (synthetic) claim, patient and member details filled in, and the dispute window.'),
    ('17-reconciliation.png', 'Reconciliation and the ledger', 'Recovery and reports', f'{BM} (ledger-manager)', f'/p/{G}/reconciliation',
     'The recovery ledger: $30.00 approved and deposited, $18.00 later taken back, so $12.00 recovered; each line matched from remittance to posting to bank deposit, one posting reversed with its reason, and every entry with its evidence.'),
    ('18-monitoring-digest.png', 'Monthly monitoring digest', 'Recovery and reports', f'{BM} (monitoring-manager)', path_of('18-monitoring-digest.png', ''),
     'The monthly monitoring digest for September 2026, in counts and dollar totals only: $90.00 of new underpayment from Payer Q, one case nearing its deadline, and every line priced.'),
    ('19-roi-statement.png', 'ROI statement with the Verified seal', 'Recovery and reports', f'{BM} (ledger-manager)', path_of('19-roi-statement.png', ''),
     'The return-on-investment statement for April to September 2026, carrying the Verified seal because its $12.00 recovered ties to deposited cash, with every figure recomputed from its ledger entries.'),
    ('20-screening.png', 'Free screening', 'Free screening', 'public', '/screening',
     'The public free-screening page, which asks for a practice’s details and a file of payment totals with no patient information, and explains how each kind of insurance is screened.'),
    ('21-screening-form.png', 'Free screening, file chosen', 'Free screening', 'public', '/screening',
     'The form filled in for a synthetic clinic with a file of totals: the browser has read it, will send 8 rows, and has already left out 2 rows too small to send safely and 1 row from a quarter not loaded.'),
    ('22-screening-result.png', 'Free screening result', 'Free screening', 'public (the emailed link)', '/screening/results/<one-time token>',
     'The emailed screening result: the file’s allowed amounts against Medicare figures by insurance type, the share that needs a contract to price, the codes paid well below Medicare, and an offer to request a full audit.'),
    ('23-console-home.png', 'Operator console home', 'Operator console', 'platform administrator (hardware key)', '/console/organizations',
     'The internal console where PaidWhole staff start: the organizations on the platform (two synthetic practice groups, a billing firm and the company) and a form to add one.'),
    ('24-console-rule-releases.png', 'Rule releases', 'Operator console', 'platform administrator (hardware key)', '/console/rule-releases',
     'The rule releases page: release 900001 in force with its 65 pricing records by type, and how many pricing runs at each practice are pinned to it.'),
    ('25-billing.png', 'Billing', 'Account', 'organization administrator (practice-admin)', path_of('25-billing.png', ''),
     'Billing for a practice group in test mode: the monthly monitoring plan active, a test bank account on file, and the first $500.00 invoice paid (the plan amounts are marked as placeholders).'),
    ('26-access-log.png', 'Access log', 'Account', 'practice administrator (other-admin)', f'/p/{P}/settings/access-log',
     'The practice’s access log: every read and change of its records, newest first, with who did it, through what access, and which record.'),
    ('27-phone-practice-home.png', 'Practice home on a phone', 'Getting started', f'{BM} (ledger-manager)', f'/p/{G}',
     'The same practice home at phone width, its headline numbers stacked one above another.'),
    ('28-phone-case.png', 'A case on a phone', 'Disputes', f'{BM} (packet-approver)', path_of('28-phone-case.png', ''),
     'The same case at phone width: its amounts, packet status, three lines and timeline in one column.'),
    ('29-phone-screening.png', 'Free screening on a phone', 'Free screening', 'public', '/screening',
     'The public screening page at phone width, its form and file template in one column.'),
    ('30-phone-roi-statement.png', 'ROI statement on a phone', 'Recovery and reports', f'{BM} (ledger-manager)', path_of('30-phone-roi-statement.png', ''),
     'The ROI statement at phone width with its Verified seal; the PDF’s long SHA-256 line does not wrap, so this page scrolls sideways (the image is 489 px wide).'),
]

if contract is not None:
    seven = (contract['role'], contract['path'],
             'A signed-off contract version, abstracted by hand from an uploaded synthetic agreement: the cited page’s text with its clause (“110% of the Medicare Physician Fee Schedule”) marked, each rate field approved by the contract specialist, and a red note that this contract’s dispute window, counted from the remittance date, is one the product cannot verify yet.')
else:
    seven = (f'{BM} (pricing-manager)', path_of('07-contract-version.png', f'/p/{L}/contracts/versions/'),
             'A signed-off contract version: its rate for 97110 ($50.00 a unit) cited to page 2 with the quoted clause, each field approved by the contract specialist, and the dispute window checked against page 1; the red “pages are still being read” notes appear because this test contract was entered by a setup script without its PDF stored.')

out = []
for name, title, area, role, path, what in entries:
    if name == '07-contract-version.png':
        role, path, what = seven
    out.append({'file': f'{S}/png/{name}', 'title': title, 'area': area, 'role': role, 'path': path, 'width': size(name)[0], 'what_it_shows': what})

json.dump(out, open(f'{S}/manifest.json', 'w'), indent=2, ensure_ascii=False)
print(len(out), 'entries;', 'contract retaken' if contract else 'contract from the layout practice')
sys.exit(0)
