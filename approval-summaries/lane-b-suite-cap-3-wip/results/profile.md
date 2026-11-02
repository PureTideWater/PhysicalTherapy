## Overview

| run | N | pass s | statements | SQL s | TS between s | heap peak MiB | live after MiB | advisory locks/backend (peak) | decrypts | error |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| cap3_a_2000_a_7b-7b | 2,000 | 247.2 | 32,035 | 239.8 | 7.4 | 100.7 | 37.2 | 5,996 | 182,000 |  |
| cap3_a_2000_c_7b-7b | 2,000 | 183.6 | 32,035 | 177.2 | 6.4 | 106.6 | 37.2 | 1 | 182,000 |  |
| cap3_a_6000_c_7b-7b | 6,000 | 1501.6 | 96,035 | 1473.3 | 28.3 | 122.8 | 37.3 | 1 | 1,146,000 |  |
| cap3_r_2000_a_7b-7b | 2,000 | 262.5 | 32,035 | 255.0 | 7.5 | 100.2 | 37.2 | 5,999 | 146,000 |  |
| cap3_r_6000_a_7b-7b | 6,000 | 1653.3 | 96,035 | 1628.0 | 25.3 | 110.9 | 37.3 | 17,997 | 438,000 |  |
| cap3_r_2000_a_p-P | 2,000 | 52.2 | 18,035 | 48.2 | 3.9 | 104.1 | 37.1 | 6,001 | 114,000 |  |
| cap3_r_6000_a_p-P | 6,000 | 264.7 | 54,035 | 252.7 | 11.9 | 123.8 | 37 | 17,997 | 342,000 |  |
| cap3_r_2000_a_p-pre | 2,000 | 179.2 | 18,033 | 174.9 | 4.2 | 94.7 | 36.8 | 3,987 | 64,000 |  |
| cap3_r_2000_b_7b-7b | 2,000 | 224.2 | 32,035 | 216.7 | 7.5 | 108.7 | 37.2 | 5,995 | 146,000 |  |
| cap3_r_2000_b_p-P | 2,000 | 65.5 | 18,035 | 61.3 | 4.2 | 107.7 | 37.2 | 5,995 | 114,000 |  |
| cap3_r_2000_b_p-pre | 2,000 | 143.8 | 18,033 | 139.6 | 4.1 | 95.2 | 36.8 | 3,993 | 64,000 |  |
| cap3_r_6000_b_p-pre | 6,000 | 924.0 | 54,033 | 908.3 | 15.7 | 107.8 | 36.8 | 12,001 | 192,000 |  |
| cap3_r_2000_c_7b-7b | 2,000 | 208.4 | 32,035 | 201.4 | 7.0 | 99 | 37.4 | 1 | 146,000 |  |
| cap3_r_2000_c_7bf-7b | 2,000 | 144.5 | 32,035 | 138.8 | 5.7 | 99.9 | 37.2 | 1 | 146,000 |  |
| cap3_r_2000_c_7bs-7b | 2,000 | 143.8 | 32,035 | 138.0 | 5.8 | 98.9 | 37.2 | 1 | 146,000 |  |
| cap3_r_6000_c_7b-7b | 6,000 | 1486.4 | 96,035 | 1459.7 | 26.7 | 123.6 | 37.3 | 1 | 438,000 |  |
| cap3_r_6000_c_7bf-7b | 6,000 | 1033.7 | 96,035 | 1011.6 | 22.0 | 114 | 37.2 | 1 | 438,000 |  |
| cap3_r_6000_c_7bs-7b | 6,000 | 1035.3 | 96,035 | 1013.4 | 21.8 | 113.2 | 37.2 | 1 | 438,000 |  |
| cap3_r_10000_c_7b-7b | 10,000 | 3412.1 | 160,035 | 3366.3 | 45.7 | 172.1 | 37.4 | 1 | 730,000 |  |
| cap3_r_2000_c_p-P | 2,000 | 66.4 | 18,035 | 62.2 | 4.2 | 104 | 37.2 | 1 | 114,000 |  |
| cap3_r_6000_c_p-P | 6,000 | 265.1 | 54,035 | 251.1 | 13.9 | 123.6 | 37.1 | 1 | 342,000 |  |
| cap3_r_2000_c_p-pre | 2,000 | 136.5 | 18,033 | 132.3 | 4.2 | 95.1 | 36.8 | 1 | 64,000 |  |

## Fits (k between the two largest N; t ~ N^k)


**spread A, state (c), pass 7b**: N = 2,000, 6,000; pass s = 183.6, 1501.6; k(pass) = 1.91

| phase/family | s @2,000 | s @6,000 | share @2,000 | share @6,000 | k time | k count | k ms/call |
|---|---:|---:|---:|---:|---:|---:|---:|
| settle/insert.entry | 37.4 | 351.9 | 20% | 23% | 2.04 | 1.00 | 1.04 |
| remittances/candidates.byPatient | 33.1 | 312.3 | 18% | 21% | 2.04 | 1.00 | 1.04 |
| remittances/claimLines | 38.3 | 293.0 | 21% | 20% | 1.85 | 1.00 | 0.85 |
| stages/stages.insert | 29.4 | 263.9 | 16% | 18% | 2.00 | 1.00 | 1.00 |
| remittances/candidates.byControl | 25.9 | 204.2 | 14% | 14% | 1.88 | 1.00 | 0.88 |
| (TypeScript between statements) | 6.4 | 28.3 | 4% | 2% | 1.35 | | |

**spread R, state (a), pass 7b**: N = 2,000, 6,000; pass s = 262.5, 1653.3; k(pass) = 1.68

| phase/family | s @2,000 | s @6,000 | share @2,000 | share @6,000 | k time | k count | k ms/call |
|---|---:|---:|---:|---:|---:|---:|---:|
| remittances/claimLines | 86.8 | 586.3 | 33% | 35% | 1.74 | 1.00 | 0.74 |
| settle/insert.entry | 51.9 | 376.6 | 20% | 23% | 1.80 | 1.00 | 0.80 |
| stages/stages.insert | 38.2 | 307.4 | 15% | 19% | 1.90 | 1.00 | 0.90 |
| remittances/candidates.byControl | 31.6 | 208.8 | 12% | 13% | 1.72 | 1.00 | 0.72 |
| remittances/candidates.byPatient | 30.1 | 84.9 | 11% | 5% | 0.94 | 1.00 | -0.06 |
| (TypeScript between statements) | 7.5 | 25.3 | 3% | 2% | 1.11 | | |

**spread R, state (a), pass P**: N = 2,000, 6,000; pass s = 52.2, 264.7; k(pass) = 1.48

| phase/family | s @2,000 | s @6,000 | share @2,000 | share @6,000 | k time | k count | k ms/call |
|---|---:|---:|---:|---:|---:|---:|---:|
| stages/stages.insert | 20.0 | 145.1 | 38% | 55% | 1.80 | 1.00 | 0.80 |
| remittances/candidates.byControl | 5.7 | 30.3 | 11% | 11% | 1.53 | 1.00 | 0.53 |
| remittances/claimLines | 2.9 | 21.1 | 6% | 8% | 1.81 | 0.00 | 1.81 |
| remittances/candidates.byPatient | 8.5 | 19.5 | 16% | 7% | 0.76 | 1.00 | -0.24 |
| settle/claimLines | 1.4 | 10.4 | 3% | 4% | 1.84 | 0.00 | 1.84 |
| settle/insert.entry | 2.6 | 7.8 | 5% | 3% | 0.99 | 1.00 | -0.01 |
| postings/insert.match | 1.8 | 5.0 | 3% | 2% | 0.92 | 1.00 | -0.08 |
| cipher/exports | 1.4 | 3.4 | 3% | 1% | 0.80 | 1.00 | -0.20 |
| postings/postings.refClaims | 1.1 | 3.0 | 2% | 1% | 0.89 | 1.00 | -0.11 |
| postings/postings.remittancesOf | 1.1 | 3.0 | 2% | 1% | 0.93 | 1.00 | -0.07 |
| postings/postings.refLines | 1.1 | 2.8 | 2% | 1% | 0.88 | 1.00 | -0.12 |
| (TypeScript between statements) | 3.9 | 11.9 | 7% | 5% | 1.02 | | |

**spread R, state (b), pass pre**: N = 2,000, 6,000; pass s = 143.8, 924.0; k(pass) = 1.69

| phase/family | s @2,000 | s @6,000 | share @2,000 | share @6,000 | k time | k count | k ms/call |
|---|---:|---:|---:|---:|---:|---:|---:|
| remittances/claimLines | 47.8 | 366.4 | 33% | 40% | 1.85 | 1.00 | 0.85 |
| remittances/candidates.byControl | 32.2 | 255.9 | 22% | 28% | 1.89 | 1.00 | 0.89 |
| stages/stages.insert | 20.9 | 150.6 | 15% | 16% | 1.80 | 1.00 | 0.80 |
| remittances/candidates.byPatient | 30.8 | 103.0 | 21% | 11% | 1.10 | 1.00 | 0.10 |
| remittances/insert.entry | 4.0 | 22.5 | 3% | 2% | 1.57 | 1.00 | 0.57 |
| (TypeScript between statements) | 4.1 | 15.7 | 3% | 2% | 1.21 | | |

**spread R, state (c), pass 7b**: N = 2,000, 6,000, 10,000; pass s = 208.4, 1486.4, 3412.1; k(pass) = 1.79, 1.63

| phase/family | s @2,000 | s @6,000 | s @10,000 | share @2,000 | share @6,000 | share @10,000 | k time | k count | k ms/call |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| settle/insert.entry | 47.6 | 382.1 | 979.5 | 23% | 26% | 29% | 1.84 | 1.00 | 0.84 |
| remittances/claimLines | 44.5 | 360.0 | 824.3 | 21% | 24% | 24% | 1.62 | 1.00 | 0.62 |
| stages/stages.insert | 36.8 | 315.2 | 754.8 | 18% | 21% | 22% | 1.71 | 1.00 | 0.71 |
| remittances/candidates.byControl | 29.7 | 252.0 | 570.7 | 14% | 17% | 17% | 1.60 | 1.00 | 0.60 |
| remittances/candidates.byPatient | 28.9 | 98.5 | 143.0 | 14% | 7% | 4% | 0.73 | 1.00 | -0.27 |
| (TypeScript between statements) | 7.0 | 26.7 | 45.7 | 3% | 2% | 1% | 1.06 | | |

**spread R, state (c), pass 7bf**: N = 2,000, 6,000; pass s = 144.5, 1033.7; k(pass) = 1.79

| phase/family | s @2,000 | s @6,000 | share @2,000 | share @6,000 | k time | k count | k ms/call |
|---|---:|---:|---:|---:|---:|---:|---:|
| stages/stages.insert | 32.6 | 307.4 | 23% | 30% | 2.04 | 1.00 | 1.04 |
| remittances/claimLines | 36.7 | 299.1 | 25% | 29% | 1.91 | 1.00 | 0.91 |
| remittances/candidates.byControl | 24.8 | 209.2 | 17% | 20% | 1.94 | 1.00 | 0.94 |
| remittances/candidates.byPatient | 24.4 | 85.2 | 17% | 8% | 1.14 | 1.00 | 0.14 |
| settle/insert.entry | 6.6 | 48.7 | 5% | 5% | 1.81 | 1.00 | 0.81 |
| remittances/insert.entry | 3.7 | 22.1 | 3% | 2% | 1.62 | 1.00 | 0.62 |
| (TypeScript between statements) | 5.7 | 22.0 | 4% | 2% | 1.23 | | |

**spread R, state (c), pass 7bs**: N = 2,000, 6,000; pass s = 143.8, 1035.3; k(pass) = 1.80

| phase/family | s @2,000 | s @6,000 | share @2,000 | share @6,000 | k time | k count | k ms/call |
|---|---:|---:|---:|---:|---:|---:|---:|
| remittances/claimLines | 38.1 | 279.8 | 27% | 27% | 1.81 | 1.00 | 0.81 |
| stages/stages.insert | 29.7 | 257.6 | 21% | 25% | 1.97 | 1.00 | 0.97 |
| remittances/candidates.byControl | 25.5 | 195.3 | 18% | 19% | 1.85 | 1.00 | 0.85 |
| settle/insert.entry | 19.9 | 191.9 | 14% | 19% | 2.06 | 1.00 | 1.06 |
| remittances/candidates.byPatient | 13.0 | 43.0 | 9% | 4% | 1.09 | 1.00 | 0.09 |
| remittances/insert.entry | 3.5 | 18.3 | 2% | 2% | 1.50 | 1.00 | 0.50 |
| (TypeScript between statements) | 5.8 | 21.8 | 4% | 2% | 1.21 | | |

**spread R, state (c), pass P**: N = 2,000, 6,000; pass s = 66.4, 265.1; k(pass) = 1.26

| phase/family | s @2,000 | s @6,000 | share @2,000 | share @6,000 | k time | k count | k ms/call |
|---|---:|---:|---:|---:|---:|---:|---:|
| stages/stages.insert | 20.4 | 165.3 | 31% | 62% | 1.91 | 1.00 | 0.91 |
| remittances/candidates.byControl | 5.9 | 33.7 | 9% | 13% | 1.59 | 1.00 | 0.59 |
| remittances/candidates.byPatient | 20.7 | 21.7 | 31% | 8% | 0.04 | 1.00 | -0.96 |
| settle/insert.entry | 7.0 | 7.5 | 11% | 3% | 0.07 | 1.00 | -0.93 |
| postings/insert.match | 1.9 | 5.9 | 3% | 2% | 1.04 | 1.00 | 0.04 |
| cipher/exports | 1.6 | 4.2 | 2% | 2% | 0.91 | 1.00 | -0.09 |
| (TypeScript between statements) | 4.2 | 13.9 | 6% | 5% | 1.09 | | |

## Projections (each family a*N + b*N^2)


**spread A, state (c), pass 7b** (fit over N = 2,000, 6,000)

| phase/family | ms per line (linear) | ms per line per 1,000 lines (quadratic) | projected s @10,000 | projected s @20,000 | quadratic share @10,000 | quadratic share @20,000 |
|---|---:|---:|---:|---:|---:|---:|
| settle/insert.entry | -1.311 | 9.9929 | 986 | 3971 | 101% | 101% |
| remittances/candidates.byPatient | -1.220 | 8.8795 | 876 | 3527 | 101% | 101% |
| remittances/claimLines | 4.324 | 7.4175 | 785 | 3053 | 94% | 97% |
| stages/stages.insert | 0.044 | 7.3244 | 733 | 2931 | 100% | 100% |
| remittances/candidates.byControl | 2.369 | 5.2780 | 551 | 2159 | 96% | 98% |
| (everything else, TS included) | 8.371 | 0.7211 | 156 | 456 | 46% | 63% |
| **pass** | | | **4087** | **16097** |  | |

**spread R, state (a), pass 7b** (fit over N = 2,000, 6,000)

| phase/family | ms per line (linear) | ms per line per 1,000 lines (quadratic) | projected s @10,000 | projected s @20,000 | quadratic share @10,000 | quadratic share @20,000 |
|---|---:|---:|---:|---:|---:|---:|
| remittances/claimLines | 16.254 | 13.5779 | 1520 | 5756 | 89% | 94% |
| settle/insert.entry | 7.528 | 9.2061 | 996 | 3833 | 92% | 96% |
| stages/stages.insert | 3.057 | 8.0288 | 833 | 3273 | 96% | 98% |
| remittances/candidates.byControl | 6.316 | 4.7468 | 538 | 2025 | 88% | 94% |
| (everything else, TS included) | 10.385 | 0.7524 | 179 | 509 | 42% | 59% |
| remittances/candidates.byPatient | 15.536 | -0.2317 | 132 | 218 | -18% | -42% |
| **pass** | | | **4199** | **15614** |  | |

**spread R, state (a), pass P** (fit over N = 2,000, 6,000)

| phase/family | ms per line (linear) | ms per line per 1,000 lines (quadratic) | projected s @10,000 | projected s @20,000 | quadratic share @10,000 | quadratic share @20,000 |
|---|---:|---:|---:|---:|---:|---:|
| stages/stages.insert | 2.898 | 3.5471 | 384 | 1477 | 92% | 96% |
| remittances/candidates.byControl | 1.718 | 0.5553 | 73 | 256 | 76% | 87% |
| remittances/claimLines | 0.408 | 0.5189 | 56 | 216 | 93% | 96% |
| settle/claimLines | 0.169 | 0.2599 | 28 | 107 | 94% | 97% |
| (everything else, TS included) | 2.346 | -0.0219 | 21 | 38 | -10% | -23% |
| settle/insert.entry | 1.314 | -0.0033 | 13 | 25 | -3% | -5% |
| postings/insert.match | 0.950 | -0.0194 | 8 | 11 | -26% | -69% |
| postings/postings.remittancesOf | 0.556 | -0.0104 | 5 | 7 | -23% | -59% |
| postings/postings.refClaims | 0.598 | -0.0166 | 4 | 5 | -38% | -124% |
| postings/postings.refLines | 0.576 | -0.0170 | 4 | 5 | -42% | -145% |
| cipher/exports | 0.789 | -0.0357 | 4 | 2 | -83% | -944% |
| remittances/candidates.byPatient | 4.749 | -0.2505 | 22 | -5 | -112% |  |
| **pass** | | | **621** | **2144** |  | |

**spread R, state (b), pass pre** (fit over N = 2,000, 6,000)

| phase/family | ms per line (linear) | ms per line per 1,000 lines (quadratic) | projected s @10,000 | projected s @20,000 | quadratic share @10,000 | quadratic share @20,000 |
|---|---:|---:|---:|---:|---:|---:|
| remittances/claimLines | 5.352 | 9.2859 | 982 | 3821 | 95% | 97% |
| remittances/candidates.byControl | 2.836 | 6.6347 | 692 | 2711 | 96% | 98% |
| stages/stages.insert | 3.129 | 3.6627 | 398 | 1528 | 92% | 96% |
| remittances/candidates.byPatient | 14.484 | 0.4472 | 190 | 469 | 24% | 38% |
| remittances/insert.entry | 1.119 | 0.4372 | 55 | 197 | 80% | 89% |
| (everything else, TS included) | 3.939 | 0.0555 | 45 | 101 | 12% | 22% |
| **pass** | | | **2361** | **8827** |  | |

**spread R, state (c), pass 7b** (fit over N = 2,000, 6,000, 10,000)

| phase/family | ms per line (linear) | ms per line per 1,000 lines (quadratic) | projected s @10,000 | projected s @20,000 | quadratic share @10,000 | quadratic share @20,000 |
|---|---:|---:|---:|---:|---:|---:|
| settle/insert.entry | 9.954 | 8.8146 | 981 | 3725 | 90% | 95% |
| remittances/claimLines | 20.026 | 6.2815 | 828 | 2913 | 76% | 86% |
| stages/stages.insert | 13.482 | 6.2300 | 758 | 2762 | 82% | 90% |
| remittances/candidates.byControl | 14.391 | 4.3007 | 574 | 2008 | 75% | 86% |
| (everything else, TS included) | 11.014 | 0.3014 | 140 | 341 | 21% | 35% |
| remittances/candidates.byPatient | 17.885 | -0.3474 | 144 | 219 | -24% | -64% |
| **pass** | | | **3426** | **11967** |  | |

**spread R, state (c), pass 7bf** (fit over N = 2,000, 6,000)

| phase/family | ms per line (linear) | ms per line per 1,000 lines (quadratic) | projected s @10,000 | projected s @20,000 | quadratic share @10,000 | quadratic share @20,000 |
|---|---:|---:|---:|---:|---:|---:|
| stages/stages.insert | -1.138 | 8.7281 | 861 | 3468 | 101% | 101% |
| remittances/claimLines | 2.605 | 7.8754 | 814 | 3202 | 97% | 98% |
| remittances/candidates.byControl | 1.190 | 5.6123 | 573 | 2269 | 98% | 99% |
| settle/insert.entry | 0.932 | 1.1967 | 129 | 497 | 93% | 96% |
| remittances/candidates.byPatient | 11.227 | 0.4944 | 162 | 422 | 31% | 47% |
| (everything else, TS included) | 6.472 | 0.6432 | 129 | 387 | 50% | 67% |
| remittances/insert.entry | 0.966 | 0.4537 | 55 | 201 | 82% | 90% |
| **pass** | | | **2723** | **10447** |  | |

**spread R, state (c), pass 7bs** (fit over N = 2,000, 6,000)

| phase/family | ms per line (linear) | ms per line per 1,000 lines (quadratic) | projected s @10,000 | projected s @20,000 | quadratic share @10,000 | quadratic share @20,000 |
|---|---:|---:|---:|---:|---:|---:|
| remittances/claimLines | 5.283 | 6.8926 | 742 | 2863 | 93% | 96% |
| stages/stages.insert | 0.785 | 7.0245 | 710 | 2826 | 99% | 99% |
| settle/insert.entry | -1.101 | 5.5150 | 540 | 2184 | 102% | 101% |
| remittances/candidates.byControl | 2.834 | 4.9532 | 524 | 2038 | 95% | 97% |
| (everything else, TS included) | 6.489 | 0.2890 | 94 | 245 | 31% | 47% |
| remittances/candidates.byPatient | 6.155 | 0.1683 | 78 | 190 | 21% | 35% |
| remittances/insert.entry | 1.124 | 0.3197 | 43 | 150 | 74% | 85% |
| **pass** | | | **2732** | **10496** |  | |

**spread R, state (c), pass P** (fit over N = 2,000, 6,000)

| phase/family | ms per line (linear) | ms per line per 1,000 lines (quadratic) | projected s @10,000 | projected s @20,000 | quadratic share @10,000 | quadratic share @20,000 |
|---|---:|---:|---:|---:|---:|---:|
| stages/stages.insert | 1.490 | 4.3423 | 449 | 1767 | 97% | 98% |
| remittances/candidates.byControl | 1.589 | 0.6719 | 83 | 301 | 81% | 89% |
| (everything else, TS included) | 4.550 | -0.0159 | 44 | 85 | -4% | -8% |
| postings/insert.match | 0.923 | 0.0100 | 10 | 22 | 10% | 18% |
| cipher/exports | 0.818 | -0.0186 | 6 | 9 | -29% | -84% |
| settle/insert.entry | 4.622 | -0.5608 | -10 | -132 |  |  |
| remittances/candidates.byPatient | 13.742 | -1.6882 | -31 | -400 |  |  |
| **pass** | | | **551** | **1651** |  | |

## States side by side


**spread A, N 2,000, pass 7b**: pass s (a) 247.2, (c) 183.6

| phase/family | (a) s | (c) s | (a) ms/call | (c) ms/call |
|---|---:|---:|---:|---:|
| remittances/claimLines | 77.6 | 38.3 | 19.38 | 9.57 |
| settle/insert.entry | 47.4 | 37.4 | 23.70 | 18.68 |
| stages/stages.insert | 36.0 | 29.4 | 9.01 | 7.35 |
| remittances/candidates.byPatient | 35.4 | 33.1 | 8.84 | 8.27 |
| remittances/candidates.byControl | 27.7 | 25.9 | 6.93 | 6.46 |
| (TypeScript between statements) | 7.4 | 6.4 | | |
| advisory locks per backend (peak) | 5,996 | 1 | | |

**spread R, N 2,000, pass 7b**: pass s (a) 262.5, (b) 224.2, (c) 208.4

| phase/family | (a) s | (b) s | (c) s | (a) ms/call | (b) ms/call | (c) ms/call |
|---|---:|---:|---:|---:|---:|---:|
| remittances/claimLines | 86.8 | 47.5 | 44.5 | 21.69 | 11.88 | 11.13 |
| settle/insert.entry | 51.9 | 52.3 | 47.6 | 25.94 | 26.15 | 23.78 |
| stages/stages.insert | 38.2 | 38.3 | 36.8 | 9.56 | 9.56 | 9.19 |
| remittances/candidates.byControl | 31.6 | 32.2 | 29.7 | 7.90 | 8.05 | 7.42 |
| remittances/candidates.byPatient | 30.1 | 30.9 | 28.9 | 7.54 | 7.73 | 7.22 |
| (TypeScript between statements) | 7.5 | 7.5 | 7.0 | | | |
| advisory locks per backend (peak) | 5,999 | 5,995 | 1 | | | |

**spread R, N 2,000, pass P**: pass s (a) 52.2, (b) 65.5, (c) 66.4

| phase/family | (a) s | (b) s | (c) s | (a) ms/call | (b) ms/call | (c) ms/call |
|---|---:|---:|---:|---:|---:|---:|
| stages/stages.insert | 20.0 | 21.0 | 20.4 | 9.99 | 10.49 | 10.18 |
| remittances/candidates.byPatient | 8.5 | 21.0 | 20.7 | 4.25 | 10.51 | 10.37 |
| remittances/candidates.byControl | 5.7 | 5.9 | 5.9 | 2.83 | 2.96 | 2.93 |
| remittances/claimLines | 2.9 | 0.1 | 0.1 | 1446.03 | 73.20 | 57.16 |
| settle/insert.entry | 2.6 | 5.0 | 7.0 | 1.31 | 2.49 | 3.50 |
| postings/insert.match | 1.8 | 1.9 | 1.9 | 0.91 | 0.96 | 0.94 |
| cipher/exports | 1.4 | 1.5 | 1.6 | 0.72 | 0.74 | 0.78 |
| settle/claimLines | 1.4 | 0.1 | 0.1 | 1377.81 | 83.07 | 81.55 |
| postings/postings.refClaims | 1.1 | 1.2 | 1.2 | 0.57 | 0.60 | 0.59 |
| postings/postings.refLines | 1.1 | 1.1 | 1.1 | 0.54 | 0.55 | 0.56 |
| postings/postings.remittancesOf | 1.1 | 1.1 | 1.1 | 0.54 | 0.56 | 0.56 |
| (TypeScript between statements) | 3.9 | 4.2 | 4.2 | | | |
| advisory locks per backend (peak) | 6,001 | 5,995 | 1 | | | |

**spread R, N 2,000, pass pre**: pass s (a) 179.2, (b) 143.8, (c) 136.5

| phase/family | (a) s | (b) s | (c) s | (a) ms/call | (b) ms/call | (c) ms/call |
|---|---:|---:|---:|---:|---:|---:|
| remittances/claimLines | 87.4 | 47.8 | 45.5 | 21.84 | 11.96 | 11.38 |
| remittances/candidates.byControl | 31.2 | 32.2 | 30.7 | 7.79 | 8.05 | 7.67 |
| remittances/candidates.byPatient | 29.8 | 30.8 | 29.7 | 7.45 | 7.69 | 7.43 |
| stages/stages.insert | 17.7 | 20.9 | 19.0 | 8.85 | 10.45 | 9.50 |
| remittances/insert.entry | 4.0 | 4.0 | 3.8 | 2.01 | 1.99 | 1.90 |
| (TypeScript between statements) | 4.2 | 4.1 | 4.2 | | | |
| advisory locks per backend (peak) | 3,987 | 3,993 | 1 | | | |

**spread R, N 6,000, pass 7b**: pass s (a) 1653.3, (c) 1486.4

| phase/family | (a) s | (c) s | (a) ms/call | (c) ms/call |
|---|---:|---:|---:|---:|
| remittances/claimLines | 586.3 | 360.0 | 48.85 | 30.00 |
| settle/insert.entry | 376.6 | 382.1 | 62.76 | 63.69 |
| stages/stages.insert | 307.4 | 315.2 | 25.61 | 26.27 |
| remittances/candidates.byControl | 208.8 | 252.0 | 17.40 | 21.00 |
| remittances/candidates.byPatient | 84.9 | 98.5 | 7.07 | 8.21 |
| (TypeScript between statements) | 25.3 | 26.7 | | |
| advisory locks per backend (peak) | 17,997 | 1 | | |

**spread R, N 6,000, pass P**: pass s (a) 264.7, (c) 265.1

| phase/family | (a) s | (c) s | (a) ms/call | (c) ms/call |
|---|---:|---:|---:|---:|
| stages/stages.insert | 145.1 | 165.3 | 24.18 | 27.54 |
| remittances/candidates.byControl | 30.3 | 33.7 | 5.05 | 5.62 |
| remittances/claimLines | 21.1 | 0.4 | 10564.44 | 218.24 |
| remittances/candidates.byPatient | 19.5 | 21.7 | 3.25 | 3.61 |
| settle/claimLines | 10.4 | 0.2 | 10371.88 | 192.03 |
| settle/insert.entry | 7.8 | 7.5 | 1.29 | 1.26 |
| postings/insert.match | 5.0 | 5.9 | 0.83 | 0.98 |
| (TypeScript between statements) | 11.9 | 13.9 | | |
| advisory locks per backend (peak) | 17,997 | 1 | | |

## Families per pass


**cap3_a_2000_a_7b-7b** (pass 247.2 s; TS between statements by phase: cipher 0.4 s, remittances 4.0 s, postings 1.7 s, settle 0.9 s, stages 0.5 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| remittances/claimLines | 4,002 | 77.6 | 31% | 19.38 |
| settle/insert.entry | 2,000 | 47.4 | 19% | 23.70 |
| stages/stages.insert | 4,000 | 36.0 | 15% | 9.01 |
| remittances/candidates.byPatient | 4,000 | 35.4 | 14% | 8.84 |
| remittances/candidates.byControl | 4,000 | 27.7 | 11% | 6.93 |
| remittances/insert.entry | 2,000 | 4.0 | 2% | 1.98 |
| remittances/insert.match | 2,000 | 2.3 | 1% | 1.15 |
| postings/insert.match | 2,000 | 2.2 | 1% | 1.09 |
| postings/postings.refLines | 2,000 | 1.8 | 1% | 0.88 |
| settle/claimLines | 1 | 1.3 | 1% | 1347.25 |
| postings/postings.remittancesOf | 2,000 | 1.2 | 0% | 0.61 |
| cipher/exports | 2,002 | 1.2 | 0% | 0.59 |
| postings/postings.refClaims | 2,000 | 1.2 | 0% | 0.58 |
| stages/stages.select | 1 | 0.3 | 0% | 280.64 |

**cap3_a_2000_c_7b-7b** (pass 183.6 s; TS between statements by phase: cipher 0.5 s, remittances 3.5 s, postings 1.5 s, settle 0.6 s, stages 0.5 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| remittances/claimLines | 4,002 | 38.3 | 21% | 9.57 |
| settle/insert.entry | 2,000 | 37.4 | 20% | 18.68 |
| remittances/candidates.byPatient | 4,000 | 33.1 | 18% | 8.27 |
| stages/stages.insert | 4,000 | 29.4 | 16% | 7.35 |
| remittances/candidates.byControl | 4,000 | 25.9 | 14% | 6.46 |
| remittances/insert.entry | 2,000 | 3.5 | 2% | 1.74 |
| remittances/insert.match | 2,000 | 2.1 | 1% | 1.03 |
| postings/insert.match | 2,000 | 2.0 | 1% | 1.01 |
| postings/postings.refLines | 2,000 | 1.6 | 1% | 0.78 |
| cipher/exports | 2,002 | 1.4 | 1% | 0.70 |
| postings/postings.refClaims | 2,000 | 1.1 | 1% | 0.53 |
| postings/postings.remittancesOf | 2,000 | 1.0 | 1% | 0.50 |
| stages/stages.select | 1 | 0.2 | 0% | 202.48 |
| settle/settle.amounts | 1 | 0.1 | 0% | 58.98 |

**cap3_a_6000_c_7b-7b** (pass 1501.6 s; TS between statements by phase: cipher 1.1 s, remittances 15.9 s, postings 4.4 s, settle 5.0 s, stages 1.9 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| settle/insert.entry | 6,000 | 351.9 | 23% | 58.65 |
| remittances/candidates.byPatient | 12,000 | 312.3 | 21% | 26.03 |
| remittances/claimLines | 12,002 | 293.0 | 20% | 24.41 |
| stages/stages.insert | 12,000 | 263.9 | 18% | 22.00 |
| remittances/candidates.byControl | 12,000 | 204.2 | 14% | 17.02 |
| remittances/insert.entry | 6,000 | 18.8 | 1% | 3.14 |
| remittances/insert.match | 6,000 | 7.0 | 0% | 1.16 |
| postings/insert.match | 6,000 | 6.1 | 0% | 1.02 |
| postings/postings.refLines | 6,000 | 4.8 | 0% | 0.80 |
| cipher/exports | 6,002 | 3.6 | 0% | 0.60 |
| postings/postings.refClaims | 6,000 | 3.1 | 0% | 0.51 |
| postings/postings.remittancesOf | 6,000 | 3.1 | 0% | 0.51 |
| stages/stages.select | 1 | 0.7 | 0% | 695.73 |
| settle/claimLines | 1 | 0.2 | 0% | 183.10 |

**cap3_r_2000_a_7b-7b** (pass 262.5 s; TS between statements by phase: cipher 0.5 s, remittances 4.0 s, postings 1.6 s, settle 0.9 s, stages 0.5 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| remittances/claimLines | 4,002 | 86.8 | 33% | 21.69 |
| settle/insert.entry | 2,000 | 51.9 | 20% | 25.94 |
| stages/stages.insert | 4,000 | 38.2 | 15% | 9.56 |
| remittances/candidates.byControl | 4,000 | 31.6 | 12% | 7.90 |
| remittances/candidates.byPatient | 4,000 | 30.1 | 11% | 7.54 |
| remittances/insert.entry | 2,000 | 4.4 | 2% | 2.20 |
| remittances/insert.match | 2,000 | 2.6 | 1% | 1.28 |
| postings/insert.match | 2,000 | 2.2 | 1% | 1.11 |
| cipher/exports | 2,002 | 1.5 | 1% | 0.75 |
| settle/claimLines | 1 | 1.4 | 1% | 1397.00 |
| postings/postings.remittancesOf | 2,000 | 1.3 | 0% | 0.64 |
| postings/postings.refClaims | 2,000 | 1.2 | 0% | 0.59 |
| postings/postings.refLines | 2,000 | 1.1 | 0% | 0.56 |
| stages/stages.select | 1 | 0.2 | 0% | 248.80 |

**cap3_r_6000_a_7b-7b** (pass 1653.3 s; TS between statements by phase: cipher 1.0 s, remittances 12.4 s, postings 4.7 s, settle 4.8 s, stages 2.3 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| remittances/claimLines | 12,002 | 586.3 | 35% | 48.85 |
| settle/insert.entry | 6,000 | 376.6 | 23% | 62.76 |
| stages/stages.insert | 12,000 | 307.4 | 19% | 25.61 |
| remittances/candidates.byControl | 12,000 | 208.8 | 13% | 17.40 |
| remittances/candidates.byPatient | 12,000 | 84.9 | 5% | 7.07 |
| remittances/insert.entry | 6,000 | 20.9 | 1% | 3.48 |
| settle/claimLines | 1 | 12.2 | 1% | 12225.33 |
| remittances/insert.match | 6,000 | 7.5 | 0% | 1.25 |
| postings/insert.match | 6,000 | 6.9 | 0% | 1.15 |
| postings/postings.remittancesOf | 6,000 | 4.8 | 0% | 0.80 |
| postings/postings.refClaims | 6,000 | 3.7 | 0% | 0.61 |
| postings/postings.refLines | 6,000 | 3.4 | 0% | 0.56 |
| cipher/exports | 6,002 | 3.3 | 0% | 0.55 |
| stages/stages.select | 1 | 0.8 | 0% | 763.03 |

**cap3_r_2000_a_p-P** (pass 52.2 s; TS between statements by phase: cipher 0.4 s, remittances 1.2 s, postings 1.6 s, settle 0.5 s, stages 0.3 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| stages/stages.insert | 2,000 | 20.0 | 38% | 9.99 |
| remittances/candidates.byPatient | 2,000 | 8.5 | 16% | 4.25 |
| remittances/candidates.byControl | 2,000 | 5.7 | 11% | 2.83 |
| remittances/claimLines | 2 | 2.9 | 6% | 1446.03 |
| settle/insert.entry | 2,000 | 2.6 | 5% | 1.31 |
| postings/insert.match | 2,000 | 1.8 | 3% | 0.91 |
| cipher/exports | 2,002 | 1.4 | 3% | 0.72 |
| settle/claimLines | 1 | 1.4 | 3% | 1377.81 |
| postings/postings.refClaims | 2,000 | 1.1 | 2% | 0.57 |
| postings/postings.refLines | 2,000 | 1.1 | 2% | 0.54 |
| postings/postings.remittancesOf | 2,000 | 1.1 | 2% | 0.54 |
| stages/stages.select | 1 | 0.3 | 1% | 323.64 |
| remittances/chain.order | 2 | 0.1 | 0% | 31.64 |
| remittances/ledger.matches | 5 | 0.0 | 0% | 9.73 |

**cap3_r_6000_a_p-P** (pass 264.7 s; TS between statements by phase: cipher 1.0 s, remittances 3.7 s, postings 4.1 s, settle 2.2 s, stages 1.0 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| stages/stages.insert | 6,000 | 145.1 | 55% | 24.18 |
| remittances/candidates.byControl | 6,000 | 30.3 | 11% | 5.05 |
| remittances/claimLines | 2 | 21.1 | 8% | 10564.44 |
| remittances/candidates.byPatient | 6,000 | 19.5 | 7% | 3.25 |
| settle/claimLines | 1 | 10.4 | 4% | 10371.88 |
| settle/insert.entry | 6,000 | 7.8 | 3% | 1.29 |
| postings/insert.match | 6,000 | 5.0 | 2% | 0.83 |
| cipher/exports | 6,002 | 3.4 | 1% | 0.57 |
| postings/postings.refClaims | 6,000 | 3.0 | 1% | 0.50 |
| postings/postings.remittancesOf | 6,000 | 3.0 | 1% | 0.49 |
| postings/postings.refLines | 6,000 | 2.8 | 1% | 0.47 |
| stages/stages.select | 1 | 0.6 | 0% | 587.40 |
| remittances/ledger.matches | 5 | 0.1 | 0% | 24.65 |
| remittances/remit.caseLines | 1 | 0.1 | 0% | 81.08 |

**cap3_r_2000_a_p-pre** (pass 179.2 s; TS between statements by phase: remittances 3.8 s, settle 0.1 s, stages 0.3 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| remittances/claimLines | 4,002 | 87.4 | 49% | 21.84 |
| remittances/candidates.byControl | 4,000 | 31.2 | 17% | 7.79 |
| remittances/candidates.byPatient | 4,000 | 29.8 | 17% | 7.45 |
| stages/stages.insert | 2,000 | 17.7 | 10% | 8.85 |
| remittances/insert.entry | 2,000 | 4.0 | 2% | 2.01 |
| remittances/insert.match | 2,000 | 2.4 | 1% | 1.21 |
| settle/claimLines | 1 | 1.2 | 1% | 1203.40 |
| stages/stages.select | 1 | 0.9 | 1% | 901.14 |
| settle/chain.order | 1 | 0.1 | 0% | 66.41 |
| remittances/chain.order | 2 | 0.0 | 0% | 24.75 |
| remittances/ledger.matches | 5 | 0.0 | 0% | 7.26 |
| remittances/remit.caseLines | 1 | 0.0 | 0% | 34.27 |
| remittances/chain.reversals | 2 | 0.0 | 0% | 10.69 |
| settle/settle.caseLines | 1 | 0.0 | 0% | 15.69 |

**cap3_r_2000_b_7b-7b** (pass 224.2 s; TS between statements by phase: cipher 0.5 s, remittances 3.9 s, postings 1.6 s, settle 0.9 s, stages 0.5 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| settle/insert.entry | 2,000 | 52.3 | 23% | 26.15 |
| remittances/claimLines | 4,002 | 47.5 | 21% | 11.88 |
| stages/stages.insert | 4,000 | 38.3 | 17% | 9.56 |
| remittances/candidates.byControl | 4,000 | 32.2 | 14% | 8.05 |
| remittances/candidates.byPatient | 4,000 | 30.9 | 14% | 7.73 |
| remittances/insert.entry | 2,000 | 4.4 | 2% | 2.22 |
| remittances/insert.match | 2,000 | 2.6 | 1% | 1.29 |
| postings/insert.match | 2,000 | 2.4 | 1% | 1.19 |
| cipher/exports | 2,002 | 1.6 | 1% | 0.79 |
| postings/postings.remittancesOf | 2,000 | 1.3 | 1% | 0.66 |
| postings/postings.refClaims | 2,000 | 1.2 | 1% | 0.62 |
| postings/postings.refLines | 2,000 | 1.2 | 1% | 0.60 |
| stages/stages.select | 1 | 0.3 | 0% | 336.61 |
| settle/claimLines | 1 | 0.1 | 0% | 78.50 |

**cap3_r_2000_b_p-P** (pass 65.5 s; TS between statements by phase: cipher 0.5 s, remittances 1.3 s, postings 1.6 s, settle 0.5 s, stages 0.3 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| remittances/candidates.byPatient | 2,000 | 21.0 | 32% | 10.51 |
| stages/stages.insert | 2,000 | 21.0 | 32% | 10.49 |
| remittances/candidates.byControl | 2,000 | 5.9 | 9% | 2.96 |
| settle/insert.entry | 2,000 | 5.0 | 8% | 2.49 |
| postings/insert.match | 2,000 | 1.9 | 3% | 0.96 |
| cipher/exports | 2,002 | 1.5 | 2% | 0.74 |
| postings/postings.refClaims | 2,000 | 1.2 | 2% | 0.60 |
| postings/postings.remittancesOf | 2,000 | 1.1 | 2% | 0.56 |
| postings/postings.refLines | 2,000 | 1.1 | 2% | 0.55 |
| postings/postings.rows | 1 | 0.7 | 1% | 651.15 |
| stages/stages.select | 1 | 0.2 | 0% | 224.21 |
| remittances/claimLines | 2 | 0.1 | 0% | 73.20 |
| remittances/chain.order | 2 | 0.1 | 0% | 59.50 |
| settle/claimLines | 1 | 0.1 | 0% | 83.07 |

**cap3_r_2000_b_p-pre** (pass 143.8 s; TS between statements by phase: remittances 3.8 s, settle 0.1 s, stages 0.3 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| remittances/claimLines | 4,002 | 47.8 | 33% | 11.96 |
| remittances/candidates.byControl | 4,000 | 32.2 | 22% | 8.05 |
| remittances/candidates.byPatient | 4,000 | 30.8 | 21% | 7.69 |
| stages/stages.insert | 2,000 | 20.9 | 15% | 10.45 |
| remittances/insert.entry | 2,000 | 4.0 | 3% | 1.99 |
| remittances/insert.match | 2,000 | 2.5 | 2% | 1.24 |
| stages/stages.select | 1 | 1.1 | 1% | 1083.79 |
| settle/chain.order | 1 | 0.1 | 0% | 68.15 |
| settle/claimLines | 1 | 0.1 | 0% | 61.39 |
| remittances/chain.order | 2 | 0.1 | 0% | 26.44 |
| remittances/remit.caseLines | 1 | 0.0 | 0% | 38.39 |
| remittances/ledger.matches | 5 | 0.0 | 0% | 5.21 |
| remittances/chain.reversals | 2 | 0.0 | 0% | 10.75 |
| settle/settle.caseLines | 1 | 0.0 | 0% | 16.67 |

**cap3_r_6000_b_p-pre** (pass 924.0 s; TS between statements by phase: remittances 13.5 s, settle 1.0 s, stages 1.2 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| remittances/claimLines | 12,002 | 366.4 | 40% | 30.53 |
| remittances/candidates.byControl | 12,000 | 255.9 | 28% | 21.32 |
| stages/stages.insert | 6,000 | 150.6 | 16% | 25.11 |
| remittances/candidates.byPatient | 12,000 | 103.0 | 11% | 8.58 |
| remittances/insert.entry | 6,000 | 22.5 | 2% | 3.74 |
| remittances/insert.match | 6,000 | 8.3 | 1% | 1.38 |
| stages/stages.select | 1 | 0.8 | 0% | 827.20 |
| settle/claimLines | 1 | 0.3 | 0% | 266.38 |
| remittances/remit.caseLines | 1 | 0.1 | 0% | 105.97 |
| remittances/ledger.matches | 5 | 0.1 | 0% | 16.97 |
| remittances/chain.order | 2 | 0.1 | 0% | 29.91 |
| settle/chain.order | 1 | 0.1 | 0% | 55.30 |
| remittances/chain.reversals | 2 | 0.1 | 0% | 25.41 |
| settle/settle.caseLines | 1 | 0.0 | 0% | 28.88 |

**cap3_r_2000_c_7b-7b** (pass 208.4 s; TS between statements by phase: cipher 0.4 s, remittances 3.7 s, postings 1.5 s, settle 0.8 s, stages 0.5 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| settle/insert.entry | 2,000 | 47.6 | 23% | 23.78 |
| remittances/claimLines | 4,002 | 44.5 | 21% | 11.13 |
| stages/stages.insert | 4,000 | 36.8 | 18% | 9.19 |
| remittances/candidates.byControl | 4,000 | 29.7 | 14% | 7.42 |
| remittances/candidates.byPatient | 4,000 | 28.9 | 14% | 7.22 |
| remittances/insert.entry | 2,000 | 4.0 | 2% | 2.00 |
| remittances/insert.match | 2,000 | 2.4 | 1% | 1.18 |
| postings/insert.match | 2,000 | 2.2 | 1% | 1.10 |
| cipher/exports | 2,002 | 1.4 | 1% | 0.71 |
| postings/postings.refClaims | 2,000 | 1.2 | 1% | 0.59 |
| postings/postings.refLines | 2,000 | 1.1 | 1% | 0.55 |
| postings/postings.remittancesOf | 2,000 | 1.1 | 1% | 0.55 |
| stages/stages.select | 1 | 0.2 | 0% | 223.91 |
| settle/chain.order | 1 | 0.1 | 0% | 73.72 |

**cap3_r_2000_c_7bf-7b** (pass 144.5 s; TS between statements by phase: cipher 0.4 s, remittances 3.1 s, postings 1.3 s, settle 0.5 s, stages 0.5 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| remittances/claimLines | 4,002 | 36.7 | 25% | 9.17 |
| stages/stages.insert | 4,000 | 32.6 | 23% | 8.16 |
| remittances/candidates.byControl | 4,000 | 24.8 | 17% | 6.21 |
| remittances/candidates.byPatient | 4,000 | 24.4 | 17% | 6.11 |
| settle/insert.entry | 2,000 | 6.6 | 5% | 3.32 |
| remittances/insert.entry | 2,000 | 3.7 | 3% | 1.87 |
| remittances/insert.match | 2,000 | 2.0 | 1% | 0.99 |
| postings/insert.match | 2,000 | 1.9 | 1% | 0.95 |
| cipher/exports | 2,002 | 1.4 | 1% | 0.69 |
| stages/stages.select | 1 | 1.4 | 1% | 1351.22 |
| postings/postings.refClaims | 2,000 | 1.0 | 1% | 0.48 |
| postings/postings.remittancesOf | 2,000 | 0.9 | 1% | 0.47 |
| postings/postings.refLines | 2,000 | 0.9 | 1% | 0.47 |
| settle/claimLines | 1 | 0.1 | 0% | 65.57 |

**cap3_r_2000_c_7bs-7b** (pass 143.8 s; TS between statements by phase: cipher 0.4 s, remittances 3.1 s, postings 1.3 s, settle 0.5 s, stages 0.4 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| remittances/claimLines | 4,002 | 38.1 | 27% | 9.53 |
| stages/stages.insert | 4,000 | 29.7 | 21% | 7.42 |
| remittances/candidates.byControl | 4,000 | 25.5 | 18% | 6.37 |
| settle/insert.entry | 2,000 | 19.9 | 14% | 9.93 |
| remittances/candidates.byPatient | 4,000 | 13.0 | 9% | 3.25 |
| remittances/insert.entry | 2,000 | 3.5 | 2% | 1.76 |
| remittances/insert.match | 2,000 | 2.0 | 1% | 1.01 |
| postings/insert.match | 2,000 | 1.8 | 1% | 0.91 |
| cipher/exports | 2,002 | 1.3 | 1% | 0.67 |
| postings/postings.refClaims | 2,000 | 0.9 | 1% | 0.45 |
| postings/postings.remittancesOf | 2,000 | 0.9 | 1% | 0.45 |
| postings/postings.refLines | 2,000 | 0.9 | 1% | 0.44 |
| stages/stages.select | 1 | 0.2 | 0% | 190.78 |
| settle/claimLines | 1 | 0.0 | 0% | 49.07 |

**cap3_r_6000_c_7b-7b** (pass 1486.4 s; TS between statements by phase: cipher 1.2 s, remittances 13.0 s, postings 4.7 s, settle 5.1 s, stages 2.6 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| settle/insert.entry | 6,000 | 382.1 | 26% | 63.69 |
| remittances/claimLines | 12,002 | 360.0 | 24% | 30.00 |
| stages/stages.insert | 12,000 | 315.2 | 21% | 26.27 |
| remittances/candidates.byControl | 12,000 | 252.0 | 17% | 21.00 |
| remittances/candidates.byPatient | 12,000 | 98.5 | 7% | 8.21 |
| remittances/insert.entry | 6,000 | 21.2 | 1% | 3.54 |
| remittances/insert.match | 6,000 | 7.9 | 1% | 1.31 |
| postings/insert.match | 6,000 | 6.7 | 0% | 1.12 |
| cipher/exports | 6,002 | 4.1 | 0% | 0.69 |
| postings/postings.refClaims | 6,000 | 3.6 | 0% | 0.60 |
| postings/postings.remittancesOf | 6,000 | 3.5 | 0% | 0.58 |
| postings/postings.refLines | 6,000 | 3.3 | 0% | 0.55 |
| stages/stages.select | 1 | 0.7 | 0% | 661.20 |
| settle/claimLines | 1 | 0.2 | 0% | 173.88 |

**cap3_r_6000_c_7bf-7b** (pass 1033.7 s; TS between statements by phase: cipher 1.0 s, remittances 11.2 s, postings 4.6 s, settle 3.0 s, stages 2.2 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| stages/stages.insert | 12,000 | 307.4 | 30% | 25.62 |
| remittances/claimLines | 12,002 | 299.1 | 29% | 24.92 |
| remittances/candidates.byControl | 12,000 | 209.2 | 20% | 17.43 |
| remittances/candidates.byPatient | 12,000 | 85.2 | 8% | 7.10 |
| settle/insert.entry | 6,000 | 48.7 | 5% | 8.11 |
| remittances/insert.entry | 6,000 | 22.1 | 2% | 3.69 |
| stages/stages.select | 1 | 11.9 | 1% | 11931.46 |
| remittances/insert.match | 6,000 | 6.8 | 1% | 1.14 |
| postings/insert.match | 6,000 | 6.7 | 1% | 1.11 |
| postings/postings.refClaims | 6,000 | 3.5 | 0% | 0.58 |
| postings/postings.remittancesOf | 6,000 | 3.4 | 0% | 0.57 |
| postings/postings.refLines | 6,000 | 3.4 | 0% | 0.56 |
| cipher/exports | 6,002 | 3.3 | 0% | 0.55 |
| settle/claimLines | 1 | 0.3 | 0% | 254.66 |

**cap3_r_6000_c_7bs-7b** (pass 1035.3 s; TS between statements by phase: cipher 0.9 s, remittances 10.1 s, postings 4.5 s, settle 4.4 s, stages 1.8 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| remittances/claimLines | 12,002 | 279.8 | 27% | 23.32 |
| stages/stages.insert | 12,000 | 257.6 | 25% | 21.47 |
| remittances/candidates.byControl | 12,000 | 195.3 | 19% | 16.28 |
| settle/insert.entry | 6,000 | 191.9 | 19% | 31.99 |
| remittances/candidates.byPatient | 12,000 | 43.0 | 4% | 3.58 |
| remittances/insert.entry | 6,000 | 18.3 | 2% | 3.04 |
| postings/insert.match | 6,000 | 6.5 | 1% | 1.08 |
| remittances/insert.match | 6,000 | 6.2 | 1% | 1.04 |
| postings/postings.refClaims | 6,000 | 3.4 | 0% | 0.57 |
| postings/postings.remittancesOf | 6,000 | 3.4 | 0% | 0.56 |
| postings/postings.refLines | 6,000 | 3.3 | 0% | 0.55 |
| cipher/exports | 6,002 | 3.2 | 0% | 0.53 |
| stages/stages.select | 1 | 0.7 | 0% | 747.27 |
| settle/claimLines | 1 | 0.2 | 0% | 185.44 |

**cap3_r_10000_c_7b-7b** (pass 3412.1 s; TS between statements by phase: cipher 2.1 s, remittances 19.8 s, postings 7.1 s, settle 12.5 s, stages 4.3 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| settle/insert.entry | 10,000 | 979.5 | 29% | 97.95 |
| remittances/claimLines | 20,002 | 824.3 | 24% | 41.21 |
| stages/stages.insert | 20,000 | 754.8 | 22% | 37.74 |
| remittances/candidates.byControl | 20,000 | 570.7 | 17% | 28.54 |
| remittances/candidates.byPatient | 20,000 | 143.0 | 4% | 7.15 |
| remittances/insert.entry | 10,000 | 46.2 | 1% | 4.62 |
| remittances/insert.match | 10,000 | 12.3 | 0% | 1.23 |
| postings/insert.match | 10,000 | 10.3 | 0% | 1.03 |
| cipher/exports | 10,002 | 7.1 | 0% | 0.71 |
| postings/postings.refClaims | 10,000 | 5.3 | 0% | 0.53 |
| postings/postings.remittancesOf | 10,000 | 5.1 | 0% | 0.51 |
| postings/postings.refLines | 10,000 | 5.1 | 0% | 0.51 |
| stages/stages.select | 1 | 1.2 | 0% | 1155.48 |
| settle/claimLines | 1 | 0.3 | 0% | 345.52 |

**cap3_r_2000_c_p-P** (pass 66.4 s; TS between statements by phase: cipher 0.5 s, remittances 1.3 s, postings 1.6 s, settle 0.5 s, stages 0.3 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| remittances/candidates.byPatient | 2,000 | 20.7 | 31% | 10.37 |
| stages/stages.insert | 2,000 | 20.4 | 31% | 10.18 |
| settle/insert.entry | 2,000 | 7.0 | 11% | 3.50 |
| remittances/candidates.byControl | 2,000 | 5.9 | 9% | 2.93 |
| postings/insert.match | 2,000 | 1.9 | 3% | 0.94 |
| cipher/exports | 2,002 | 1.6 | 2% | 0.78 |
| postings/postings.refClaims | 2,000 | 1.2 | 2% | 0.59 |
| postings/postings.refLines | 2,000 | 1.1 | 2% | 0.56 |
| postings/postings.remittancesOf | 2,000 | 1.1 | 2% | 0.56 |
| postings/postings.rows | 1 | 0.6 | 1% | 574.16 |
| stages/stages.select | 1 | 0.2 | 0% | 240.14 |
| remittances/claimLines | 2 | 0.1 | 0% | 57.16 |
| remittances/chain.order | 2 | 0.1 | 0% | 46.56 |
| settle/claimLines | 1 | 0.1 | 0% | 81.55 |

**cap3_r_6000_c_p-P** (pass 265.1 s; TS between statements by phase: cipher 1.3 s, remittances 4.0 s, postings 4.7 s, settle 2.7 s, stages 1.2 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| stages/stages.insert | 6,000 | 165.3 | 62% | 27.54 |
| remittances/candidates.byControl | 6,000 | 33.7 | 13% | 5.62 |
| remittances/candidates.byPatient | 6,000 | 21.7 | 8% | 3.61 |
| settle/insert.entry | 6,000 | 7.5 | 3% | 1.26 |
| postings/insert.match | 6,000 | 5.9 | 2% | 0.98 |
| cipher/exports | 6,002 | 4.2 | 2% | 0.71 |
| postings/postings.refClaims | 6,000 | 3.6 | 1% | 0.59 |
| postings/postings.remittancesOf | 6,000 | 3.5 | 1% | 0.58 |
| postings/postings.refLines | 6,000 | 3.4 | 1% | 0.57 |
| stages/stages.select | 1 | 0.8 | 0% | 813.64 |
| remittances/claimLines | 2 | 0.4 | 0% | 218.24 |
| settle/claimLines | 1 | 0.2 | 0% | 192.03 |
| remittances/ledger.matches | 5 | 0.1 | 0% | 29.66 |
| remittances/chain.order | 2 | 0.1 | 0% | 49.83 |

**cap3_r_2000_c_p-pre** (pass 136.5 s; TS between statements by phase: remittances 3.8 s, settle 0.1 s, stages 0.3 s)

| phase/family | count | total s | share | ms/call |
|---|---:|---:|---:|---:|
| remittances/claimLines | 4,002 | 45.5 | 33% | 11.38 |
| remittances/candidates.byControl | 4,000 | 30.7 | 22% | 7.67 |
| remittances/candidates.byPatient | 4,000 | 29.7 | 22% | 7.43 |
| stages/stages.insert | 2,000 | 19.0 | 14% | 9.50 |
| remittances/insert.entry | 2,000 | 3.8 | 3% | 1.90 |
| remittances/insert.match | 2,000 | 2.4 | 2% | 1.21 |
| stages/stages.select | 1 | 0.8 | 1% | 792.75 |
| settle/claimLines | 1 | 0.1 | 0% | 78.26 |
| settle/chain.order | 1 | 0.1 | 0% | 63.68 |
| remittances/chain.order | 2 | 0.1 | 0% | 25.59 |
| remittances/remit.caseLines | 1 | 0.1 | 0% | 50.29 |
| remittances/ledger.matches | 5 | 0.0 | 0% | 6.35 |
| remittances/chain.reversals | 2 | 0.0 | 0% | 9.66 |
| settle/settle.caseLines | 1 | 0.0 | 0% | 12.37 |
