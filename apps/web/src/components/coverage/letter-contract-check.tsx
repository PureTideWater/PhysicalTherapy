'use client';

import { useEffect } from 'react';

/** The payer select, as the check reads it (an HTMLSelectElement; a test passes a fake). */
export interface PayerChoice extends EventTarget {
  readonly value: string;
}

/** The contract select, as the check reads and holds it: the payer of its chosen option (data-payer) and its validity. */
export interface ContractChoice extends EventTarget {
  readonly selectedOptions: ArrayLike<{ readonly dataset: Readonly<Record<string, string | undefined>> }>;
  setCustomValidity(message: string): void;
}

/**
 * Holds the chosen contract to the chosen payer, as the pattern holds the codes to the route's rule: a contract of
 * another payer makes the contract select invalid with the words its refusal would be marked with, so the browser stops
 * the letter before it is sent and says why there. None named, and a contract while no payer is chosen yet (the payer's
 * own required stops that letter), are never held. It checks at once (a value the browser restored, a refused letter's
 * kept pair) and on every change of either select, and returns the function that stops it.
 */
export function watchLetterContract(payer: PayerChoice, contract: ContractChoice, message: string): () => void {
  const check = () => {
    const owner = contract.selectedOptions[0]?.dataset['payer'];
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
 * watchLetterContract says. The route's check stays the rule: without script, its refusal comes back marked.
 * Renders nothing.
 */
export function LetterContractCheck({ payer, contract, message }: { readonly payer: string; readonly contract: string; readonly message: string }) {
  useEffect(() => {
    const payerSelect = document.getElementById(payer);
    const contractSelect = document.getElementById(contract);
    if (!(payerSelect instanceof HTMLSelectElement) || !(contractSelect instanceof HTMLSelectElement)) {
      return undefined;
    }
    return watchLetterContract(payerSelect, contractSelect, message);
  }, [payer, contract, message]);
  return null;
}
