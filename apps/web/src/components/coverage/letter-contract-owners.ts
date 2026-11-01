/** Each listed contract's payer, by the contract's ID: what the letter's contract check holds the chosen contract to. */
export type ContractOwners = Readonly<Record<string, string>>;

/**
 * The payer of each contract the letter's select lists, by the contract's ID (opaque IDs only, never a name). Its own
 * module, without 'use client', because the letter (a server component) builds it for LetterContractCheck (a client
 * component): a function a 'use client' module exports is only a reference on the server, and calling it there throws
 * on every render (client-boundary.test.ts).
 */
export function contractOwners(contracts: readonly { readonly id: string; readonly payerId: string }[]): ContractOwners {
  return Object.fromEntries(contracts.map((contract) => [contract.id, contract.payerId]));
}
