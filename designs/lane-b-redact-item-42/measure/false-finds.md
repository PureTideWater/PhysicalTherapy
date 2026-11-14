## (A) Digit strings a digits-only stored number would match on a real-shaped letter with no identifier in it
bodies 12, characters 6827

### any character, up to 1 inserted
| digits | strings matched, all bodies | a drawn number refused, per letter (mean) | examples |
|---|---|---|---|
| 3 | 13 | 1.20e-3 | "0.00" "9.68" "1.85" |
| 4 | 55 | 5.09e-4 | "09/14" "09/28" "31.42" |
| 5 | 35 | 3.24e-5 | "3, 2026" "125.68" "540.00" |
| 6 | 54 | 5.00e-6 | "14/2026" "28/2026" "97110 (4" |
| 7 | 16 | 1.48e-7 | "120.00   62" "1      75.00    38" "00    0.00     30" |
| 8 | 14 | 1.30e-8 | "14/2026 - 09" "2026 - 09/28" "2      120.00   62" |
| 9 | 1 | 9.26e-11 | "14   141.86   90" |
| 10 | 14 | 1.30e-10 | "757) 555-0142" "97014       1      30.00" "00   113.14   141" |
| 11 | 5 | 4.63e-12 | "02/2026 97110" "02/2026 97530" "02/2026 97014" |
| 12 | 2 | 1.85e-13 | "02/2026 97014       1" "97112 97140, 09" |

### any character, up to 2 inserted
| digits | strings matched, all bodies | a drawn number refused, per letter (mean) | examples |
|---|---|---|---|
| 3 | 15 | 1.39e-3 | "0.00" "9.68" "45 PR-2" |
| 4 | 64 | 5.93e-4 | "09/14" "09/28" "31.42" |
| 5 | 37 | 3.43e-5 | "3, 2026" "125.68" "540.00" |
| 6 | 63 | 5.83e-6 | "14/2026" "28/2026" "97110 (4" |
| 7 | 26 | 2.41e-7 | "120.00   62" "1      75.00    38" "30.00    0.00" |
| 8 | 51 | 4.72e-8 | "09/14/2026" "14/2026 - 09" "2026 - 09/28" |
| 9 | 15 | 1.39e-9 | "97110  GP   2      120" "120.00   62.84" "1      75.00    38.20" |
| 10 | 40 | 3.70e-10 | "09/14/2026 - 09" "14/2026 - 09/28" "757) 555-0142" |
| 11 | 15 | 1.39e-11 | "02/2026 97110" "120.00   62.84    57" "02/2026 97530" |
| 12 | 10 | 9.26e-13 | "2026 - 09/28/2026" "2      120.00   62.84    57" "00   62.84    57.16    50" |

### no . , / :, up to 1 inserted
| digits | strings matched, all bodies | a drawn number refused, per letter (mean) | examples |
|---|---|---|---|
| 3 | 2 | 1.85e-4 | "10; (4" "2 $80" |
| 4 | 2 | 1.85e-5 | "1 (800" "4 $160" |
| 5 | 3 | 2.78e-6 | "97 N130" "2026; (3" "2026 (8" |
| 6 | 7 | 6.48e-7 | "97110 (4" "97140 (2" "97112 x 2" |
| 7 | 2 | 1.85e-8 | "97 N130\n09" "00 (97161" |
| 8 | 4 | 3.70e-9 | "2026 G0283" "97161 $140" "00; 97110 x 4" |
| 9 | 0 | 0.00e+0 |  |
| 10 | 2 | 1.85e-11 | "757) 555-0142" "800) 555-0123" |
| 11 | 0 | 0.00e+0 |  |
| 12 | 0 | 0.00e+0 |  |

### no . , / :, up to 2 inserted
| digits | strings matched, all bodies | a drawn number refused, per letter (mean) | examples |
|---|---|---|---|
| 3 | 4 | 3.70e-4 | "45 PR-2" "10; (4" "2 $80" |
| 4 | 10 | 9.26e-5 | "90 on 10" "27   CO-45" "56   CO-45" |
| 5 | 4 | 3.70e-6 | "97 N130" "2026 at 2" "2026; (3" |
| 6 | 13 | 1.20e-6 | "97110 (4" "97140 (2" "97112 x 2" |
| 7 | 3 | 2.78e-8 | "97 N130\n09" "1 (800) 555" "00 (97161" |
| 8 | 6 | 5.56e-9 | "97530  GP   1      75" "2026 G0283" "97161 $140" |
| 9 | 3 | 2.78e-10 | "97110  GP   2      120" "555-0105 by 10" "97110 x 4 $160" |
| 10 | 6 | 5.56e-11 | "757) 555-0142" "2026 97110  GP   2" "2026 97530  GP   1" |
| 11 | 2 | 1.85e-12 | "1 (800) 555-0123" "00; 97110 x 4 $160" |
| 12 | 2 | 1.85e-13 | "2026 97530  GP   1      75" "410-555-0105 by 10" |

### no letter, up to 1 inserted
| digits | strings matched, all bodies | a drawn number refused, per letter (mean) | examples |
|---|---|---|---|
| 3 | 13 | 1.20e-3 | "0.00" "9.68" "1.85" |
| 4 | 55 | 5.09e-4 | "09/14" "09/28" "31.42" |
| 5 | 34 | 3.15e-5 | "3, 2026" "125.68" "540.00" |
| 6 | 51 | 4.72e-6 | "14/2026" "28/2026" "97110 (4" |
| 7 | 15 | 1.39e-7 | "120.00   62" "1      75.00    38" "00    0.00     30" |
| 8 | 11 | 1.02e-8 | "14/2026 - 09" "2026 - 09/28" "2      120.00   62" |
| 9 | 1 | 9.26e-11 | "14   141.86   90" |
| 10 | 14 | 1.30e-10 | "757) 555-0142" "97014       1      30.00" "00   113.14   141" |
| 11 | 5 | 4.63e-12 | "02/2026 97110" "02/2026 97530" "02/2026 97014" |
| 12 | 2 | 1.85e-13 | "02/2026 97014       1" "97112 97140, 09" |

### no letter, up to 2 inserted
| digits | strings matched, all bodies | a drawn number refused, per letter (mean) | examples |
|---|---|---|---|
| 3 | 13 | 1.20e-3 | "0.00" "9.68" "1.85" |
| 4 | 56 | 5.19e-4 | "09/14" "09/28" "31.42" |
| 5 | 35 | 3.24e-5 | "3, 2026" "125.68" "540.00" |
| 6 | 54 | 5.00e-6 | "14/2026" "28/2026" "97110 (4" |
| 7 | 25 | 2.31e-7 | "120.00   62" "1      75.00    38" "30.00    0.00" |
| 8 | 46 | 4.26e-8 | "09/14/2026" "14/2026 - 09" "2026 - 09/28" |
| 9 | 11 | 1.02e-9 | "120.00   62.84" "1      75.00    38.20" "30.00    0.00     30" |
| 10 | 36 | 3.33e-10 | "09/14/2026 - 09" "14/2026 - 09/28" "757) 555-0142" |
| 11 | 12 | 1.11e-11 | "02/2026 97110" "120.00   62.84    57" "02/2026 97530" |
| 12 | 8 | 7.41e-13 | "2026 - 09/28/2026" "2      120.00   62.84    57" "00   62.84    57.16    50" |

### no letter, no . , / :, up to 1 inserted
| digits | strings matched, all bodies | a drawn number refused, per letter (mean) | examples |
|---|---|---|---|
| 3 | 2 | 1.85e-4 | "10; (4" "2 $80" |
| 4 | 2 | 1.85e-5 | "1 (800" "4 $160" |
| 5 | 2 | 1.85e-6 | "2026; (3" "2026 (8" |
| 6 | 4 | 3.70e-7 | "97110 (4" "97140 (2" "757) 555" |
| 7 | 1 | 9.26e-9 | "00 (97161" |
| 8 | 1 | 9.26e-10 | "97161 $140" |
| 9 | 0 | 0.00e+0 |  |
| 10 | 2 | 1.85e-11 | "757) 555-0142" "800) 555-0123" |
| 11 | 0 | 0.00e+0 |  |
| 12 | 0 | 0.00e+0 |  |

### no letter, no . , / :, up to 2 inserted
| digits | strings matched, all bodies | a drawn number refused, per letter (mean) | examples |
|---|---|---|---|
| 3 | 2 | 1.85e-4 | "10; (4" "2 $80" |
| 4 | 3 | 2.78e-5 | "1 (800" "4 $160" "20 + $14" |
| 5 | 2 | 1.85e-6 | "2026; (3" "2026 (8" |
| 6 | 4 | 3.70e-7 | "97110 (4" "97140 (2" "757) 555" |
| 7 | 2 | 1.85e-8 | "1 (800) 555" "00 (97161" |
| 8 | 1 | 9.26e-10 | "97161 $140" |
| 9 | 0 | 0.00e+0 |  |
| 10 | 3 | 2.78e-11 | "757) 555-0142" "800) 555-0123" "00 (97161 $140" |
| 11 | 1 | 9.26e-13 | "1 (800) 555-0123" |
| 12 | 0 | 0.00e+0 |  |

### letters only, up to 1 inserted
| digits | strings matched, all bodies | a drawn number refused, per letter (mean) | examples |
|---|---|---|---|
| 3 | 0 | 0.00e+0 |  |
| 4 | 0 | 0.00e+0 |  |
| 5 | 1 | 9.26e-7 | "97 N130" |
| 6 | 3 | 2.78e-7 | "97112 x 2" "97110 x 4" "97140 x 2" |
| 7 | 1 | 9.26e-9 | "97 N130\n09" |
| 8 | 3 | 2.78e-9 | "2026 G0283" "00; 97110 x 4" "00; 97140 x 2" |
| 9 | 0 | 0.00e+0 |  |
| 10 | 0 | 0.00e+0 |  |
| 11 | 0 | 0.00e+0 |  |
| 12 | 0 | 0.00e+0 |  |

### letters only, up to 2 inserted
| digits | strings matched, all bodies | a drawn number refused, per letter (mean) | examples |
|---|---|---|---|
| 3 | 2 | 1.85e-4 | "45 PR-2" "05 at 9" |
| 4 | 7 | 6.48e-5 | "90 on 10" "27   CO-45" "56   CO-45" |
| 5 | 2 | 1.85e-6 | "97 N130" "2026 at 2" |
| 6 | 9 | 8.33e-7 | "97112 x 2" "97110  GP   2" "27   CO-45\n09" |
| 7 | 1 | 9.26e-9 | "97 N130\n09" |
| 8 | 4 | 3.70e-9 | "97530  GP   1      75" "2026 G0283" "00; 97110 x 4" |
| 9 | 2 | 1.85e-10 | "97110  GP   2      120" "555-0105 by 10" |
| 10 | 2 | 1.85e-11 | "2026 97110  GP   2" "2026 97530  GP   1" |
| 11 | 0 | 0.00e+0 |  |
| 12 | 2 | 1.85e-13 | "2026 97530  GP   1      75" "410-555-0105 by 10" |

## (B) Name words found in ordinary text that holds no name

### real-shaped bodies: 6849 characters; 154 name words

#### glued, any case
| letters in the name | names of that length | names with a find | finds | most frequent |
|---|---|---|---|---|
| 2 | 10 | 8 | 196 | LE in file (21); LE in billed (8); ED in billed (8); MA in may (5); ED in denied (4); LI in applied (3) |
| 3 | 29 | 9 | 57 | PAT in patient (11); DAY in days (7); PAT in Patient (7); PAY in payer (2); PAY in payment (2); PAT in PATIENT (2) |
| 4 | 62 | 16 | 38 | BILL in billed (8); UNIT in units (5); BILL in BILLED (2); ROSS in BlueCross (1); PAGE in pages (1); WEST in TriWest (1) |
| 5 | 37 | 6 | 17 | VISIT in visits (8); VISIT in VISITS (2); CROSS in BlueCross (1); SMART in HealthSmart (1); POINT in WellPoint (1); FIRST in HealthFirst (1) |
| 6 | 11 | 4 | 8 | SHIELD in BlueShield (1); SPRING in HealthSpring (1); CHOICE in BlueChoice (1); HEALTH in UnitedHealthcare (1); HEALTH in Healthcare (1); HEALTH in HealthSpring (1) |
| 7 | 3 | 2 | 7 | SERVICE in Services (2); SERVICE in services (2); SERVICE in SERVICES (1); BENEFIT in Benefits (1); BENEFIT in benefits (1) |
| 8 | 2 | 0 | 0 |  |

#### glued, case-aware
| letters in the name | names of that length | names with a find | finds | most frequent |
|---|---|---|---|---|
| 2 | 10 | 0 | 0 |  |
| 3 | 29 | 0 | 0 |  |
| 4 | 62 | 5 | 5 | WEST in TriWest (1); STAR in MedStar (1); LINK in HomeLink (1); CALL in OneCall (1); RISK in MedRisk (1) |
| 5 | 37 | 4 | 5 | CROSS in BlueCross (1); SMART in HealthSmart (1); POINT in WellPoint (1); FIRST in HealthFirst (1); FIRST in CareFirst (1) |
| 6 | 11 | 3 | 3 | SHIELD in BlueShield (1); SPRING in HealthSpring (1); CHOICE in BlueChoice (1) |
| 7 | 3 | 0 | 0 |  |
| 8 | 2 | 0 | 0 |  |

#### inserted, 1
| letters in the name | names of that length | names with a find | finds | most frequent |
|---|---|---|---|---|
| 2 | 10 | 2 | 2 | HO in HMO (1); AL in all (1) |
| 3 | 29 | 2 | 3 | PAT in part (2); MAE in made (1) |
| 4 | 62 | 0 | 0 |  |
| 5 | 37 | 0 | 0 |  |
| 6 | 11 | 0 | 0 |  |
| 7 | 3 | 0 | 0 |  |
| 8 | 2 | 0 | 0 |  |

#### inserted, 1 or 2
| letters in the name | names of that length | names with a find | finds | most frequent |
|---|---|---|---|---|
| 2 | 10 | 2 | 2 | HO in HMO (1); AL in all (1) |
| 3 | 29 | 4 | 5 | PAT in part (2); DAY in daily (1); SUE in Suite (1); MAE in made (1) |
| 4 | 62 | 2 | 6 | NOTE in notice (4); GRAY in Granby (1); NOTE in NOTICE (1) |
| 5 | 37 | 0 | 0 |  |
| 6 | 11 | 0 | 0 |  |
| 7 | 3 | 0 | 0 |  |
| 8 | 2 | 0 | 0 |  |

#### inserted, 1, no letter
| letters in the name | names of that length | names with a find | finds | most frequent |
|---|---|---|---|---|
| 2 | 10 | 0 | 0 |  |
| 3 | 29 | 0 | 0 |  |
| 4 | 62 | 0 | 0 |  |
| 5 | 37 | 0 | 0 |  |
| 6 | 11 | 0 | 0 |  |
| 7 | 3 | 0 | 0 |  |
| 8 | 2 | 0 | 0 |  |

#### inserted, 1 or 2, no letter
| letters in the name | names of that length | names with a find | finds | most frequent |
|---|---|---|---|---|
| 2 | 10 | 0 | 0 |  |
| 3 | 29 | 0 | 0 |  |
| 4 | 62 | 0 | 0 |  |
| 5 | 37 | 0 | 0 |  |
| 6 | 11 | 0 | 0 |  |
| 7 | 3 | 0 | 0 |  |
| 8 | 2 | 0 | 0 |  |

### repository prose: 4289749 characters, 124 files; 154 name words

#### glued, any case
| letters in the name | names of that length | names with a find | finds | most frequent |
|---|---|---|---|---|
| 2 | 10 | 10 | 132874 | LI in line (3008); NG in screening (1798); LE in release (1594); JO in job (1413); ED in refused (1250); LI in lines (1190) |
| 3 | 29 | 24 | 22416 | EVE in every (2800); EVE in never (1738); SAM in same (1278); TIM in time (1133); PAY in payer (1003); PAT in path (891) |
| 4 | 62 | 47 | 10229 | RULE in rules (535); RICE in priced (503); BILL in billing (467); CODE in codes (344); CASE in cases (342); CARR in carries (327) |
| 5 | 37 | 22 | 3060 | PRICE in priced (503); STONE in milestone (356); CROSS in across (224); CLAIM in claims (223); FIELD in fields (182); PRICE in prices (166) |
| 6 | 11 | 6 | 393 | MEMBER in membership (249); MEMBER in members (29); MEMBER in memberships (28); CHOICE in choices (23); MEMBER in remembered (12); MEMBER in remember (7) |
| 7 | 3 | 2 | 91 | SERVICE in services (70); SERVICE in Services (8); BENEFIT in benefits (3); SERVICE in ScanService (1); SERVICE in GuardDutyScanService (1); SERVICE in LocalScanService (1) |
| 8 | 2 | 1 | 84 | PROVIDER in providers (16); PROVIDER in ProviderSignOutNotDelivered (11); PROVIDER in ProviderSignOutsNotRunning (10); PROVIDER in PasswordResetProviderSignOutFailed (7); PROVIDER in MembershipEndProviderSignOutFailed (5); PROVIDER in AuthProvider (4) |

#### glued, case-aware
| letters in the name | names of that length | names with a find | finds | most frequent |
|---|---|---|---|---|
| 2 | 10 | 0 | 0 |  |
| 3 | 29 | 2 | 23 | KEY in GenerateDataKey (3); KEY in destroyPracticeDataKey (2); KEY in NoSuchKey (2); KEY in AttributeKey (2); KEY in generateDataKey (1); KEY in decryptDataKey (1) |
| 4 | 62 | 11 | 37 | CASH in reconciledToCash (6); LINK in DownloadLink (3); CODE in attemptErrorCode (3); CODE in errorCode (3); MARK in PaidWholeMark (3); PAGE in returnPage (2) |
| 5 | 37 | 3 | 15 | FIELD in SelectField (7); FIELD in reviewField (2); MARCH in 198014thMarch (1); FIELD in KindField (1); FIELD in PasswordField (1); CLAIM in allocatedFromClaim (1) |
| 6 | 11 | 0 | 0 |  |
| 7 | 3 | 1 | 6 | SERVICE in ScanService (1); SERVICE in GuardDutyScanService (1); SERVICE in LocalScanService (1); SERVICE in placeOfService (1); SERVICE in contractVersionCoversService (1); SERVICE in UpdateService (1) |
| 8 | 2 | 1 | 19 | PROVIDER in AuthProvider (4); PROVIDER in KeyProvider (1); PROVIDER in KmsKeyProvider (1); PROVIDER in LocalKeyProvider (1); PROVIDER in CognitoAuthProvider (1); PROVIDER in DevAuthProvider (1) |

#### inserted, 1
| letters in the name | names of that length | names with a find | finds | most frequent |
|---|---|---|---|---|
| 2 | 10 | 6 | 1198 | AL in all (493); ED in end (345); AL in ALL (131); MA in MFA (79); MA in mfa (47); ED in End (46) |
| 3 | 29 | 12 | 1537 | PAT in part (389); PAT in Part (224); PAT in past (221); FEE in free (200); MAE in made (179); MAE in make (115) |
| 4 | 62 | 10 | 470 | BOND in bound (240); CASE in cause (109); PATE in plate (37); BANK in blank (35); HEAD in heard (19); CASH in crash (10) |
| 5 | 37 | 1 | 7 | BANKS in blanks (6); BANKS in blank's (1) |
| 6 | 11 | 0 | 0 |  |
| 7 | 3 | 0 | 0 |  |
| 8 | 2 | 0 | 0 |  |

#### inserted, 1 or 2
| letters in the name | names of that length | names with a find | finds | most frequent |
|---|---|---|---|---|
| 2 | 10 | 6 | 4894 | LE in line (3008); AL in all (493); ED in end (345); LE in Lane (202); LE in live (185); AL in ALL (131) |
| 3 | 29 | 18 | 2342 | PAT in part (389); PAT in Part (224); PAT in past (221); FEE in free (200); MAE in made (179); ART in apart (144) |
| 4 | 62 | 23 | 1802 | NOTE in notice (727); BOND in bound (240); FORD in forced (132); CASE in cause (109); POPE in people (98); CASE in clause (61) |
| 5 | 37 | 6 | 55 | STARR in Starter (17); JONES in joiners (13); CROSS in crosses (10); BANKS in blanks (6); FIRST in f.first (5); STONE in site_one (2) |
| 6 | 11 | 0 | 0 |  |
| 7 | 3 | 0 | 0 |  |
| 8 | 2 | 0 | 0 |  |

#### inserted, 1, no letter
| letters in the name | names of that length | names with a find | finds | most frequent |
|---|---|---|---|---|
| 2 | 10 | 3 | 6 | HO in h/o (2); LE in L/E (2); DO in D/O (2) |
| 3 | 29 | 1 | 1 | ANN in An⏎n (1) |
| 4 | 62 | 1 | 1 | JUNE in jun;e (1) |
| 5 | 37 | 0 | 0 |  |
| 6 | 11 | 0 | 0 |  |
| 7 | 3 | 0 | 0 |  |
| 8 | 2 | 0 | 0 |  |

#### inserted, 1 or 2, no letter
| letters in the name | names of that length | names with a find | finds | most frequent |
|---|---|---|---|---|
| 2 | 10 | 3 | 6 | HO in h/o (2); LE in L/E (2); DO in D/O (2) |
| 3 | 29 | 1 | 1 | ANN in An⏎n (1) |
| 4 | 62 | 1 | 1 | JUNE in jun;e (1) |
| 5 | 37 | 0 | 0 |  |
| 6 | 11 | 0 | 0 |  |
| 7 | 3 | 0 | 0 |  |
| 8 | 2 | 0 | 0 |  |
