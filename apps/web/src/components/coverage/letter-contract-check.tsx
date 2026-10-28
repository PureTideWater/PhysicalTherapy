'use client';

import { useEffect } from 'react';

/** The payer select, as the check reads it (an HTMLSelectElement; a test passes a fake). */
export interface PayerChoice extends EventTarget {
  readonly value: string;
}

/**
 * The contract select, as the check reads and holds it: its value (a contract's ID, or '' for None named) and its
 * validity.
 */
export interface ContractChoice extends EventTarget {
  readonly value: string;
  setCustomValidity(message: string): void;
}

/** Each listed contract's payer, by the contract's ID: what the check holds the chosen contract to. */
export type ContractOwners = Readonly<Record<string, string>>;

/** The payer of each contract the select lists, by the contract's ID (opaque IDs only, never a name). */
export function contractOwners(contracts: readonly { readonly id: string; readonly payerId: string }[]): ContractOwners {
  return Object.fromEntries(contracts.map((contract) => [contract.id, contract.payerId]));
}

/**
 * Holds the chosen contract to the chosen payer, as the pattern holds the codes to the route's rule: a contract of
 * another payer (owners names each listed contract's) makes the contract select invalid with the words its refusal
 * would be marked with, so the browser stops the letter before it is sent and says why there. None named, a value the
 * list does not name, and a contract while no payer is chosen yet (the payer's own required stops that letter), are
 * never held. It checks at once (a value the browser restored, a refused letter's kept pair) and on every change of
 * either select, and returns the function that stops it.
 */
export function watchLetterContract(payer: PayerChoice, contract: ContractChoice, owners: ContractOwners, message: string): () => void {
  const check = () => {
    const owner = Object.hasOwn(owners, contract.value) ? owners[contract.value] : undefined;
    contract.setCustomValidity(owner !== undefined && payer.value !== '' && owner !== payer.value ? message : '');
  };
  check();
  payer.addEventListener('change', check);
  contract.addEventListener('change', check);
  return () => {
    payer.removeEventListener('change', check);
    contract.removeEventListener('change', check);
  };
}

/**
 * Coverage's letter, its contract held to its payer before it is sent (docs/adr/0079): the contract select lists every
 * payer's contracts, and the route refuses a pair whose contract is not the payer's (letterParties), so without this an
 * ordinary choice would cost a round trip and a page. It finds the two selects by their ids and holds them as
 * watchLetterContract says, each contract's payer given by the page (owners; the shared SelectField writes no
 * attribute on an option). The route's check stays the rule: without script, its refusal comes back marked.
 * Renders nothing.
 */
export function LetterContractCheck({
  payer,
  contract,
  owners,
  message,
}: {
  readonly payer: string;
  readonly contract: string;
  readonly owners: ContractOwners;
  readonly message: string;
}) {
  useEffect(() => {
    const payerSelect = document.getElementById(payer);
    const contractSelect = document.getElementById(contract);
    if (!(payerSelect instanceof HTMLSelectElement) || !(contractSelect instanceof HTMLSelectElement)) {
      return undefined;
    }
    return watchLetterContract(payerSelect, contractSelect, owners, message);
  }, [payer, contract, owners, message]);
  return null;
}
