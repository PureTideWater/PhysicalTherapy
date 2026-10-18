/** The interchange sender every synthetic file carries (ISA06). The fixture hook refuses others. */
export const SYNTH_SENDER_ID = 'SYNTHSENDER';

/** ISA06 is a fixed-width element of fifteen characters. */
export const SYNTH_ISA06 = SYNTH_SENDER_ID.padEnd(15, ' ');

/** The application sender code every synthetic functional group carries (GS02). */
export const SYNTH_GS02 = 'SYNTH';
