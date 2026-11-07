// Held frames: cc3dd7f6 refuses the frame with a neutral token, the candidate sends it unchanged. {T} is the token slot.
export const FRAMES = [
  'Paid $0,000.00. Service 01/01/2020-01/02/2020{T} $0,000.00',
  'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. {T}',
  '{T} Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00',
  'Seen 01/01/2020-150.00{T} in full.',
  'Seen 01/01/2020-150.00 Paid. {T}',
  '{T}\nSeen 01/01/2020-150.00Paid in full.',
  'Service 2020-01-01-150.00 Paid. {T}.',
  'Paid $0,000.00. Service 01/01/2020‒01/02/2020Paid $0,000.00 {T}',
  'Paid $0,000.00. Service 01/01/2020―01/02/2020Paid $0,000.00 {T}',
  'Paid $0,000.00. Service 01/01/2020‑01/02/2020Paid $0,000.00 {T}',
  'Billed $1,234.56. DOS March 3, 2020-150.00Allowed $0.00. {T}',
  'Re: {T}. Paid $0,000.00. Service 1/1/20-1/2/20Paid $0,000.00',
];
