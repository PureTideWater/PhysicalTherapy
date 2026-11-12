/**
 * Letters and digits of other scripts, and Latin letters outside ASCII, that read as one ASCII letter or digit: what the
 * letter reader's fold reads them as (docs/adr/0054, the amendment of co-001/redact-ssn-phone-leaks), so a name or a
 * number written with a look-alike is read as the name or the number ("ZЕРНYRА" with Cyrillic letters, "ΖΕΡΗΥRΑ" with
 * Greek ones, "ᴢᴇᴘʜʏʀᴀ" in small capitals).
 *
 * TR39 holds every entry of the Unicode security mechanisms' confusables data (UTS #39, confusables.txt, version
 * 10.0.0) whose source is one letter or number that NFKC leaves as it is, that is not ASCII once its marks are dropped,
 * and whose prototype is one ASCII letter or digit. The prototype is kept as the data gives it, but the data's "l", which
 * stands for every upright stroke (I, l and 1): a lower-case letter keeps "l" and every other source is "I". SMALL_CAPITALS
 * adds the letters Unicode names LATIN LETTER SMALL CAPITAL that the data maps to no ASCII letter, each as its letter.
 * Each entry is the source's code point in hexadecimal and then what it reads as. The data is not fetched at build time:
 * to move to a later version, regenerate both lists from that version's confusables.txt by the same rule and update the
 * count and the hash that confusables.test.ts pins.
 *
 * Unicode data: Copyright © 1991-2017 Unicode, Inc. All rights reserved. Distributed under the Terms of Use in
 * https://www.unicode.org/copyright.html. Permission is hereby granted, free of charge, to any person obtaining a copy of
 * the Unicode data files and any associated documentation (the "Data Files") to deal in the Data Files without
 * restriction, provided that this copyright and permission notice appear with all copies of the Data Files.
 */
const TR39 = [
  '0131i 0184b 018Dg 0196I 01A6R 01A72 01B73 01BC5 01BDs 01C0I 021C3 02228 02238 0251a 0261g 0263y 0269i 026Ai 026Fw',
  '028Bu 028Fy 037FJ 0391A 0392B 0395E 0396Z 0397H 0399I 039AK 039CM 039DN 039FO 03A1P 03A4T 03A5Y 03A7X 03B1a 03B3y',
  '03B9i 03BDv 03BFo 03C1p 03C3o 03C5u 03DCF 03E82 03F3j 03FAM 0405S 0406I 0408J 0410A 0412B 0415E 04173 041AK 041CM',
  '041DH 041EO 0420P 0421C 0422T 0423Y 0425X 042Cb 0430a 04316 0433r 0435e 043Eo 0440p 0441c 0443y 0445x 0455s 0456i',
  '0458j 0461w 0474V 0475v 04AEY 04AFy 04BBh 04BDe 04C0I 04CFi 04E03 0501d 050CG 051Bq 051CW 051Dw 054DU 054FS 0555O',
  '0561w 0563q 0566q 0570h 0578n 057Cn 057Du 0581g 0584f 0585o 05D5I 05D8v 05DFI 05E1o 0627I 0647o 0661I 0665o 0667V',
  '06BEo 06C1o 06D5o 06F1I 06F5o 06F7V 07C0O 07CAI 0966o 09E6O 09EA8 09ED9 0A66o 0A679 0A6A8 0AE6o 0B20O 0B66O 0B689',
  '0BE6o 0C66o 0CE6o 0D20o 0D66o 0D6D9 0E50o 0ED0o 101Do 1040o 10E7y 10FFo 1200U 12D0O 13A0D 13A1R 13A2T 13A5i 13A9Y',
  '13AAA 13ABJ 13ACE 13B3W 13B7M 13BBH 13BDY 13C0G 13C2h 13C3Z 13CE4 13CFb 13D2R 13D4W 13D5S 13D9V 13DAS 13DEL 13DFC',
  '13E2P 13E6K 13E7d 13EE6 13F3G 13F4B 142FV 144CU 146DP 146Fd 148DJ 14AAL 14BF2 1541x 157CH 157Dx 1587R 15AFb 15B4F',
  '15C5A 15DED 15EAD 15F0M 15F7B 16B7X 16C1I 16D5K 16D6M 1D04c 1D0Fo 1D11o 1D1Cu 1D20v 1D21w 1D22z 1D26r 1D83g 1D8Cy',
  '1E9Df 1EFFy 2C85r 2C8EH 2C92I 2C94K 2C98M 2C9AN 2C9EO 2C9Fo 2CA2P 2CA3p 2CA4C 2CA5c 2CA6T 2CA8Y 2CACX 2CCA9 2CCC3',
  '2CD0L 2CD26 2D38V 2D39E 2D4FI 2D54O 2D55Q 2D5DX 3007O A4D0B A4D1P A4D2d A4D3D A4D4T A4D6G A4D7K A4D9J A4DAC A4DCZ',
  'A4DDF A4DFM A4E0N A4E1L A4E2S A4E3R A4E6V A4E7H A4EAW A4EBX A4ECY A4EEA A4F0E A4F2I A4F3O A4F4U A6442 A647i A6DFV',
  'A6EF2 A731s A75A2 A76A3 A76E9 A798F A799f A79Fu A7AB3 A7B2J A7B3X A7B4B AB32e AB35f AB3Do AB47r AB48r AB4Eu AB52u',
  'AB5Ay AB75i AB81r AB83w AB93z ABA9v ABAAs ABAFc 10282B 10286E 10287F 1028AI 10290X 10292O 10295P 10296S 10297T 102A0A',
  '102A1B 102A2C 102A5F 102ABO 102B0M 102B1T 102B2Y 102B4X 102CFH 102F5Z 10301B 10302C 10309I 10311M 10315T 10317X 1031A8',
  '10320I 10322X 10404O 10415C 1041BL 10420S 1042Co 1043Dc 10448s 104B4R 104C2O 104CEU 104D27 104EAo 104F6u 10513N 10516O',
  '10518K 1051CC 1051DV 10525F 10526L 10527X 114D0O 11706v 1170Aw 1170Ew 1170Fw 118A0V 118A2F 118A3L 118A4Y 118A6E 118A9Z',
  '118AC9 118AEE 118AF4 118B2L 118B5O 118B8U 118BB5 118BCT 118C0v 118C1s 118C2F 118C3i 118C4z 118C67 118C8o 118CA3 118CC9',
  '118D56 118D69 118D7o 118D8u 118DCy 118E0O 118E5Z 118E6W 118E9C 118ECX 118EFW 118F2C 16F08V 16F0AT 16F16L 16F28I 16F35R',
  '16F3AS 16F3B3 16F40A 16F42U 16F43Y 1E8C7I 1E8CB8',
].join(' ');

const SMALL_CAPITALS = '0262G 0274N 0280R 0299B 029CH 029FL 1D00A 1D05D 1D07E 1D0AJ 1D0BK 1D0DM 1D18P 1D1BT A730F A7AFQ';

const entries = (list: string): [string, string][] => list.split(' ').map((entry) => [String.fromCodePoint(Number.parseInt(entry.slice(0, -1), 16)), entry.slice(-1)]);

/** Each look-alike code point and the ASCII letter or digit it reads as, its case as the data gives it. */
export const LOOK_ALIKES: ReadonlyMap<string, string> = new Map([...entries(TR39), ...entries(SMALL_CAPITALS)]);
