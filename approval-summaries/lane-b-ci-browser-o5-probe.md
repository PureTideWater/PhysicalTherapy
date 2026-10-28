# O5 probe: screening capacity on ubuntu-26.04 against the release's ubuntu-24.04

Commit `ecebdc9015b279af7014b957c8d62dc6adf19fee` (the merge of pull request 77), measured twice:

- **24.04 (push)**: [run 40593100143](https://github.com/PureTideWater/PhysicalTherapy/actions/runs/40593100143) (run number 127, event `push`), capacity job [122502147024](https://github.com/PureTideWater/PhysicalTherapy/actions/runs/40593100143/job/122502147024), label `ubuntu-24.04`. The run's other jobs (changes, gate, notify) carry `ubuntu-26.04`; only `capacity` ran on 24.04.
- **26.04 (O5 probe)**: [run 40593230221](https://github.com/PureTideWater/PhysicalTherapy/actions/runs/40593230221) (run number 128, event `workflow_dispatch`, input `runner: ubuntu-26.04`), capacity job [122508644171](https://github.com/PureTideWater/PhysicalTherapy/actions/runs/40593230221/job/122508644171), label `ubuntu-26.04`.

Both whole job logs were read end to end (push job 3,941 lines, probe job 2,116 lines). Quoted lines below are verbatim from those logs with their timestamps; only the ANSI colour codes on echoed script lines are removed. Step times come from the jobs' step lists (list_workflow_jobs).

## Facts

### Times side by side

All times are "to email" in seconds, as the harness printed them (its "logged" figure is in the quoted lines further down). Ratio is 26.04 over 24.04.

| Measure | 24.04, run 40593100143 | 26.04, run 40593230221 | Ratio |
|---|---:|---:|---:|
| Release 900100 load (2,247,791 records) | 182.9 | 274.6 | 1.50 |
| S1-1 (worst, alone) | 15.2 | 26.3 | 1.73 |
| S1-2 (small, behind it) | 0.5 | 0.7 | 1.40 |
| S2-1 (practice, fresh consumer) | 4.0 | 7.3 | 1.82 |
| S3-1 (practice, same consumer) | 3.6 | 6.8 | 1.89 |
| S4#1 S4-1 (worst) | 27.8 | 52.4 | 1.88 |
| S4#1 S4-2 (worst) | 28.9 | 48.4 | 1.67 |
| S4#1 S4-3 (worst) | 27.9 | 50.5 | 1.81 |
| S4#1 S4-4 (small) | 20.4 | 37.7 | 1.85 |
| S4#2 S4-1 (worst) | 26.6 | 53.9 | 2.03 |
| S4#2 S4-2 (worst) | 26.1 | 54.0 | 2.07 |
| S4#2 S4-3 (worst) | 26.3 | 54.2 | 2.06 |
| S4#2 S4-4 (small) | 20.1 | 42.8 | 2.13 |
| S4#3 S4-1 (worst) | 29.3 | 51.5 | 1.76 |
| S4#3 S4-2 (worst) | 28.3 | 48.9 | 1.73 |
| S4#3 S4-3 (worst) | 27.6 | 51.9 | 1.88 |
| S4#3 S4-4 (small) | 20.6 | 38.6 | 1.87 |
| S4 middle run (by each run's worst upload) | S4#1, 28.9 | S4#1, 52.4 | 1.81 |
| S5-1 (practice) | 11.5 | 16.9 | 1.47 |
| S5-2 (practice) | 10.9 | 17.3 | 1.59 |
| S5-3 (practice) | 11.5 | 16.4 | 1.43 |
| S5-4 (small) | 3.4 | 6.8 | 2.00 |
| Verdict | pass (time advisory) | pass (time advisory) | |
| Time warnings | none | 3 (S4#1 S4-1, S4-2, S4-3 above 48 s) | |
| Sizing question (O9, above 44 s) | not raised | raised (52.4 s) | |
| "Measure under production limits" step | 22:17:26 to 22:27:20, 9 min 54 s | 22:29:17 to 22:43:28, 14 min 11 s | 1.43 |
| Large uploads' jobs queued after (S1; S4#1, #2, #3; S5) | 2.6; 7.2, 5.9, 6.8; 7.3 | 4.1; 10.5, 10.8, 10.0; 9.3 | |
| Oracle comparison (from "comparing" to the S4 summary) | 104 s | 146 s | 1.40 |

Every scenario time and the release load on 26.04 is 1.40 to 2.13 times its 24.04 counterpart; the queue delays are 1.27 to 1.83 times. The S4 worst-upload ordering: 24.04 runs' worsts are 28.9, 26.6 and 29.3 s (middle S4#1, 28.9 s); 26.04 runs' worsts are 52.4, 54.2 and 51.9 s (middle S4#1, 52.4 s). On 26.04 the worst upload of every S4 run, not only the middle one, is above 48 s.

### Same images in both runs

Both jobs built the same image config and manifest digests, so the two measurements ran byte-identical web and worker images. The push job built them (with `cache-to`), the probe took every layer from that cache (every Dockerfile step `CACHED`, no `cache-to` in its inputs).

24.04 web, then worker:

```
2026-10-27T22:15:13.4393726Z #24 exporting manifest sha256:058ab8e5d1f38f29eb82b056a3c2e1e9612210cb3d6f91f200386f6a3f20cd8b done
2026-10-27T22:15:13.4401410Z #24 exporting config sha256:e67d7782108442e38a11fd7e03aa6c27bb34ece6fa40fa30cdbde282042e3343 done
2026-10-27T22:15:18.4004573Z ##[group]ImageID
2026-10-27T22:15:18.4004927Z sha256:e67d7782108442e38a11fd7e03aa6c27bb34ece6fa40fa30cdbde282042e3343
2026-10-27T22:15:18.4005443Z ##[endgroup]
2026-10-27T22:15:18.4005748Z ##[group]Digest
2026-10-27T22:15:18.4006019Z sha256:058ab8e5d1f38f29eb82b056a3c2e1e9612210cb3d6f91f200386f6a3f20cd8b
2026-10-27T22:15:18.4007572Z ##[endgroup]
2026-10-27T22:16:03.9708890Z #24 exporting manifest sha256:5e2a883bc90c5852c2a0e2f9c50ea957d2b5e4d68d427c2a5cba238217ac89d7 done
2026-10-27T22:16:03.9710096Z #24 exporting config sha256:1ef77a5c4ac3c8c68311ed6e56190a3519778d60d5966236d32d1e816303af21 done
2026-10-27T22:16:26.8525380Z ##[group]ImageID
2026-10-27T22:16:26.8525638Z sha256:1ef77a5c4ac3c8c68311ed6e56190a3519778d60d5966236d32d1e816303af21
2026-10-27T22:16:26.8526218Z ##[endgroup]
2026-10-27T22:16:26.8526489Z ##[group]Digest
2026-10-27T22:16:26.8526740Z sha256:5e2a883bc90c5852c2a0e2f9c50ea957d2b5e4d68d427c2a5cba238217ac89d7
2026-10-27T22:16:26.8527244Z ##[endgroup]
```

26.04 web, then worker:

```
2026-10-27T22:28:13.3590691Z #24 exporting manifest sha256:058ab8e5d1f38f29eb82b056a3c2e1e9612210cb3d6f91f200386f6a3f20cd8b done
2026-10-27T22:28:13.3591996Z #24 exporting config sha256:e67d7782108442e38a11fd7e03aa6c27bb34ece6fa40fa30cdbde282042e3343 done
2026-10-27T22:28:14.5305316Z ##[group]ImageID
2026-10-27T22:28:14.5305980Z sha256:e67d7782108442e38a11fd7e03aa6c27bb34ece6fa40fa30cdbde282042e3343
2026-10-27T22:28:14.5307479Z ##[endgroup]
2026-10-27T22:28:14.5308352Z ##[group]Digest
2026-10-27T22:28:14.5308910Z sha256:058ab8e5d1f38f29eb82b056a3c2e1e9612210cb3d6f91f200386f6a3f20cd8b
2026-10-27T22:28:14.5310285Z ##[endgroup]
2026-10-27T22:28:15.8058815Z #24 exporting manifest sha256:5e2a883bc90c5852c2a0e2f9c50ea957d2b5e4d68d427c2a5cba238217ac89d7 done
2026-10-27T22:28:15.8059710Z #24 exporting config sha256:1ef77a5c4ac3c8c68311ed6e56190a3519778d60d5966236d32d1e816303af21 done
2026-10-27T22:28:25.5962945Z ##[group]ImageID
2026-10-27T22:28:25.5963666Z sha256:1ef77a5c4ac3c8c68311ed6e56190a3519778d60d5966236d32d1e816303af21
2026-10-27T22:28:25.5964772Z ##[endgroup]
2026-10-27T22:28:25.5965422Z ##[group]Digest
2026-10-27T22:28:25.5966160Z sha256:5e2a883bc90c5852c2a0e2f9c50ea957d2b5e4d68d427c2a5cba238217ac89d7
2026-10-27T22:28:25.5967513Z ##[endgroup]
```

### Runner image

"Set up job", 24.04:

```
2026-10-27T22:13:57.9267313Z Current runner version: '2.338.0'
2026-10-27T22:13:57.9286152Z ##[group]Runner Image Provisioner
2026-10-27T22:13:57.9286692Z Hosted Compute Agent
2026-10-27T22:13:57.9287121Z Version: 20261021.618
2026-10-27T22:13:57.9287527Z Commit: 21505ad2541d5be6135ed84fc33697146cf75b8e
2026-10-27T22:13:57.9287942Z Build Date: 2026-10-21T00:45:21Z
2026-10-27T22:13:57.9288421Z Worker ID: {62acbfd4-608d-4fdf-a55f-82c9414544be}
2026-10-27T22:13:57.9288836Z Region: centralus
2026-10-27T22:13:57.9289230Z Cloud: Azure
2026-10-27T22:13:57.9289556Z ##[endgroup]
2026-10-27T22:13:57.9290339Z ##[group]Operating System
2026-10-27T22:13:57.9290746Z Ubuntu
2026-10-27T22:13:57.9291060Z 24.04.5
2026-10-27T22:13:57.9291392Z LTS
2026-10-27T22:13:57.9291742Z ##[endgroup]
2026-10-27T22:13:57.9292074Z ##[group]Runner Image
2026-10-27T22:13:57.9292484Z Image: ubuntu-24.04
2026-10-27T22:13:57.9292821Z Version: 20261012.334.1
2026-10-27T22:13:57.9293765Z Included Software: https://github.com/actions/runner-images/blob/ubuntu24/20261012.334/images/ubuntu/Ubuntu2404-Readme.md
2026-10-27T22:13:57.9294651Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu24%2F20261012.334
2026-10-27T22:13:57.9295266Z ##[endgroup]
```

"Set up job", 26.04:

```
2026-10-27T22:28:01.4584644Z Current runner version: '2.338.0'
2026-10-27T22:28:01.4620672Z ##[group]Runner Image Provisioner
2026-10-27T22:28:01.4622046Z Hosted Compute Agent
2026-10-27T22:28:01.4623169Z Version: 20261021.618
2026-10-27T22:28:01.4624237Z Commit: 21505ad2541d5be6135ed84fc33697146cf75b8e
2026-10-27T22:28:01.4625658Z Build Date: 2026-10-21T00:45:21Z
2026-10-27T22:28:01.4626880Z Worker ID: {563ee1be-770d-42b1-bd47-727682dc4404}
2026-10-27T22:28:01.4628431Z Region: eastus
2026-10-27T22:28:01.4629566Z Cloud: Azure
2026-10-27T22:28:01.4630502Z ##[endgroup]
2026-10-27T22:28:01.4633729Z ##[group]Operating System
2026-10-27T22:28:01.4634861Z Ubuntu
2026-10-27T22:28:01.4635944Z 26.04.1
2026-10-27T22:28:01.4636881Z LTS
2026-10-27T22:28:01.4638263Z ##[endgroup]
2026-10-27T22:28:01.4639379Z ##[group]Runner Image
2026-10-27T22:28:01.4640581Z Image: ubuntu-26.04
2026-10-27T22:28:01.4641768Z Version: 20261025.179.1
2026-10-27T22:28:01.4644119Z Included Software: https://github.com/actions/runner-images/blob/ubuntu26/20261025.179/images/ubuntu/Ubuntu2604-Readme.md
2026-10-27T22:28:01.4647383Z Image Release: https://github.com/actions/runner-images/releases/tag/ubuntu26%2F20261025.179
2026-10-27T22:28:01.4649380Z ##[endgroup]
```

"The runner image" step prints nothing of its own: it writes `key=$ImageOS-$ImageVersion` and `os=$ImageOS` to `$GITHUB_OUTPUT`. Its script and the key it produced, as the next step's cache key shows it:

24.04:

```
2026-10-27T22:16:56.9797710Z ##[group]Run if [ -z "${ImageOS:-}" ] || [ -z "${ImageVersion:-}" ]; then
2026-10-27T22:16:56.9797984Z if [ -z "${ImageOS:-}" ] || [ -z "${ImageVersion:-}" ]; then
2026-10-27T22:16:56.9798315Z   echo "::error title=The runner image::the runner names no ImageOS or ImageVersion, so the system packages' cache has no key"
2026-10-27T22:16:56.9798604Z   exit 1
2026-10-27T22:16:56.9798716Z fi
2026-10-27T22:16:56.9798864Z echo "key=$ImageOS-$ImageVersion" >> "$GITHUB_OUTPUT"
2026-10-27T22:16:56.9799064Z echo "os=$ImageOS" >> "$GITHUB_OUTPUT"
2026-10-27T22:16:57.0435184Z   key: apt-v1-ubuntu24-20261023.334.3-3cf66136bc3815daf17f0f16fa0c6eee18dd41d29cdcd95cf2dd7b89fb69e639
2026-10-27T22:16:57.0435510Z   restore-keys: apt-v1-ubuntu24-20261023.334.3-
apt-v1-ubuntu24-
```

26.04:

```
2026-10-27T22:28:53.2893673Z ##[group]Run if [ -z "${ImageOS:-}" ] || [ -z "${ImageVersion:-}" ]; then
2026-10-27T22:28:53.2894595Z if [ -z "${ImageOS:-}" ] || [ -z "${ImageVersion:-}" ]; then
2026-10-27T22:28:53.2895823Z   echo "::error title=The runner image::the runner names no ImageOS or ImageVersion, so the system packages' cache has no key"
2026-10-27T22:28:53.2896902Z   exit 1
2026-10-27T22:28:53.2897637Z fi
2026-10-27T22:28:53.2898157Z echo "key=$ImageOS-$ImageVersion" >> "$GITHUB_OUTPUT"
2026-10-27T22:28:53.2898861Z echo "os=$ImageOS" >> "$GITHUB_OUTPUT"
2026-10-27T22:28:53.3916697Z   key: apt-v1-ubuntu26-20261026.180.1-3cf66136bc3815daf17f0f16fa0c6eee18dd41d29cdcd95cf2dd7b89fb69e639
2026-10-27T22:28:53.3917986Z   restore-keys: apt-v1-ubuntu26-20261026.180.1-
apt-v1-ubuntu26-
```

The ImageVersion the runner exposes differs from the "Set up job" header's Version in both jobs (24.04: header `20261012.334.1`, ImageVersion `20261023.334.3`; 26.04: header `20261025.179.1`, ImageVersion `20261026.180.1`). The build metadata shows the same ImageVersion values:

```
2026-10-27T22:15:18.4199709Z         "github_runner_image_os": "ubuntu24",
2026-10-27T22:15:18.4199885Z         "github_runner_image_version": "20261023.334.3",
2026-10-27T22:28:14.5412274Z         "github_runner_image_os": "ubuntu26",
2026-10-27T22:28:14.5412814Z         "github_runner_image_version": "20261026.180.1",
```

Other host differences visible in the logs: region (centralus against eastus, in the provisioner block above), kernel (`6.17.0-1022-azure` against `7.0.0-1017-azure`, below), git (2.55.0 against 2.56.0), Node from the tool cache (24.21.0 against 24.22.1), and BuildKit's platform list, which names `linux/amd64/v4` on 24.04 and not on 26.04:

```
2026-10-27T22:14:01.3587395Z git version 2.55.0
2026-10-27T22:16:30.1190914Z Found in cache @ /opt/hostedtoolcache/node/24.21.0/x64
2026-10-27T22:14:11.0909454Z Platforms:             linux/amd64, linux/amd64/v2, linux/amd64/v3, linux/amd64/v4, linux/386
2026-10-27T22:28:03.6994058Z git version 2.56.0
2026-10-27T22:28:30.4604882Z Found in cache @ /opt/hostedtoolcache/node/24.22.1/x64
2026-10-27T22:28:11.0504511Z Platforms:             linux/amd64, linux/amd64/v2, linux/amd64/v3, linux/386
```

### Docker

24.04, `docker version` and the relevant `docker info` lines (setup-buildx's "Docker info" group; the same values repeat in each build step's group):

```
2026-10-27T22:14:03.4424000Z [command]/usr/bin/docker version
2026-10-27T22:14:03.5304149Z Client: Docker Engine - Community
2026-10-27T22:14:03.5304758Z  Version:           28.0.4
2026-10-27T22:14:03.5305585Z  API version:       1.48
2026-10-27T22:14:03.5306531Z  Go version:        go1.23.7
2026-10-27T22:14:03.5306930Z  Git commit:        b8034c0
2026-10-27T22:14:03.5307414Z  Built:             Tue Mar 25 15:07:16 2025
2026-10-27T22:14:03.5307822Z  OS/Arch:           linux/amd64
2026-10-27T22:14:03.5308176Z  Context:           default
2026-10-27T22:14:03.5308535Z 
2026-10-27T22:14:03.5308773Z Server: Docker Engine - Community
2026-10-27T22:14:03.5309134Z  Engine:
2026-10-27T22:14:03.5309445Z   Version:          28.0.4
2026-10-27T22:14:03.5309835Z   API version:      1.48 (minimum version 1.24)
2026-10-27T22:14:03.5310243Z   Go version:       go1.23.7
2026-10-27T22:14:03.5310597Z   Git commit:       6430e49
2026-10-27T22:14:03.5310954Z   Built:            Tue Mar 25 15:07:16 2025
2026-10-27T22:14:03.5311337Z   OS/Arch:          linux/amd64
2026-10-27T22:14:03.5311696Z   Experimental:     false
2026-10-27T22:14:03.5312073Z  containerd:
2026-10-27T22:14:03.5312401Z   Version:          v2.4.1
2026-10-27T22:14:03.5312801Z   GitCommit:        f2551031d7276a770f65f98c9b52e57e7dad07e8
2026-10-27T22:14:03.5313407Z  runc:
2026-10-27T22:14:03.5313715Z   Version:          1.5.2
2026-10-27T22:14:03.5314064Z   GitCommit:        v1.5.2-0-g29dd3dc2
2026-10-27T22:14:03.5314799Z  docker-init:
2026-10-27T22:14:03.5315104Z   Version:          0.19.0
2026-10-27T22:14:03.5315429Z   GitCommit:        de40ad0
2026-10-27T22:14:03.5348181Z [command]/usr/bin/docker info
2026-10-27T22:14:06.0476886Z Server:
2026-10-27T22:14:06.0476991Z  Containers: 0
2026-10-27T22:14:06.0477138Z   Running: 0
2026-10-27T22:14:06.0477426Z   Paused: 0
2026-10-27T22:14:06.0477549Z   Stopped: 0
2026-10-27T22:14:06.0477651Z  Images: 6
2026-10-27T22:14:06.0477757Z  Server Version: 28.0.4
2026-10-27T22:14:06.0477882Z  Storage Driver: overlay2
2026-10-27T22:14:06.0478013Z   Backing Filesystem: extfs
2026-10-27T22:14:06.0478149Z   Supports d_type: true
2026-10-27T22:14:06.0478273Z   Using metacopy: false
2026-10-27T22:14:06.0478398Z   Native Overlay Diff: false
2026-10-27T22:14:06.0478527Z   userxattr: false
2026-10-27T22:14:06.0478644Z  Logging Driver: json-file
2026-10-27T22:14:06.0478772Z  Cgroup Driver: systemd
2026-10-27T22:14:06.0478889Z  Cgroup Version: 2
2026-10-27T22:14:06.0480631Z  containerd version: f2551031d7276a770f65f98c9b52e57e7dad07e8
2026-10-27T22:14:06.0482032Z  Kernel Version: 6.17.0-1022-azure
2026-10-27T22:14:06.0482183Z  Operating System: Ubuntu 24.04.5 LTS
2026-10-27T22:14:06.0482321Z  OSType: linux
2026-10-27T22:14:06.0482493Z  Architecture: x86_64
2026-10-27T22:14:06.0482618Z  CPUs: 4
2026-10-27T22:14:06.0482722Z  Total Memory: 15.61GiB
2026-10-27T22:14:06.1617637Z github.com/docker/buildx v0.38.0 0dbe87f36ed472fe36b6796c3f70b4210a731fc5
```

26.04, the same:

```
2026-10-27T22:28:05.9823537Z [command]/usr/bin/docker version
2026-10-27T22:28:06.1174002Z Client: Docker Engine - Community
2026-10-27T22:28:06.1174666Z  Version:           29.4.2
2026-10-27T22:28:06.1175201Z  API version:       1.54
2026-10-27T22:28:06.1175664Z  Go version:        go1.26.2
2026-10-27T22:28:06.1176131Z  Git commit:        055a478
2026-10-27T22:28:06.1176725Z  Built:             Fri May  1 10:24:04 2026
2026-10-27T22:28:06.1177596Z  OS/Arch:           linux/amd64
2026-10-27T22:28:06.1178078Z  Context:           default
2026-10-27T22:28:06.1178356Z 
2026-10-27T22:28:06.1178529Z Server: Docker Engine - Community
2026-10-27T22:28:06.1178953Z  Engine:
2026-10-27T22:28:06.1179286Z   Version:          29.4.2
2026-10-27T22:28:06.1179756Z   API version:      1.54 (minimum version 1.40)
2026-10-27T22:28:06.1180295Z   Go version:       go1.26.2
2026-10-27T22:28:06.1180765Z   Git commit:       d329809
2026-10-27T22:28:06.1181250Z   Built:            Fri May  1 10:24:04 2026
2026-10-27T22:28:06.1181794Z   OS/Arch:          linux/amd64
2026-10-27T22:28:06.1182260Z   Experimental:     false
2026-10-27T22:28:06.1182691Z  containerd:
2026-10-27T22:28:06.1183055Z   Version:          v2.4.2
2026-10-27T22:28:06.1183595Z   GitCommit:        b7a25261e029d68978bbf290df0a62fc819b3c51
2026-10-27T22:28:06.1184210Z  runc:
2026-10-27T22:28:06.1184541Z   Version:          1.5.2
2026-10-27T22:28:06.1185045Z   GitCommit:        v1.5.2-0-g29dd3dc2
2026-10-27T22:28:06.1185928Z  docker-init:
2026-10-27T22:28:06.1186249Z   Version:          0.19.0
2026-10-27T22:28:06.1186624Z   GitCommit:        de40ad0
2026-10-27T22:28:06.1235817Z [command]/usr/bin/docker info
2026-10-27T22:28:07.2468397Z Server:
2026-10-27T22:28:07.2468716Z  Containers: 0
2026-10-27T22:28:07.2469092Z   Running: 0
2026-10-27T22:28:07.2469444Z   Paused: 0
2026-10-27T22:28:07.2469787Z   Stopped: 0
2026-10-27T22:28:07.2470118Z  Images: 6
2026-10-27T22:28:07.2470461Z  Server Version: 29.4.2
2026-10-27T22:28:07.2470878Z  Storage Driver: overlayfs
2026-10-27T22:28:07.2471351Z   driver-type: io.containerd.snapshotter.v1
2026-10-27T22:28:07.2471861Z  Logging Driver: json-file
2026-10-27T22:28:07.2472244Z  Cgroup Driver: systemd
2026-10-27T22:28:07.2472919Z  Cgroup Version: 2
2026-10-27T22:28:07.2479955Z  containerd version: b7a25261e029d68978bbf290df0a62fc819b3c51
2026-10-27T22:28:07.2484384Z  Kernel Version: 7.0.0-1017-azure
2026-10-27T22:28:07.2484804Z  Operating System: Ubuntu 26.04.1 LTS
2026-10-27T22:28:07.2485232Z  OSType: linux
2026-10-27T22:28:07.2485462Z  Architecture: x86_64
2026-10-27T22:28:07.2485698Z  CPUs: 4
2026-10-27T22:28:07.2486121Z  Total Memory: 15.61GiB
2026-10-27T22:28:07.5272037Z github.com/docker/buildx v0.38.1 0dbe87f36ed472fe36b6796c3f70b4210a731fc5
```

So 24.04 runs Docker Engine 28.0.4 (API 1.48, containerd v2.4.1) on `overlay2`, the classic image store; 26.04 runs Docker Engine 29.4.2 (API 1.54, containerd v2.4.2) on `overlayfs` with `driver-type: io.containerd.snapshotter.v1`, the containerd image store. Both use cgroup v2 and runc 1.5.2.

The load step reads the store from `driver-type` and compares `.Id` with the archive's config on the classic store and with its target (manifest digest) on the containerd store. Its script (the same in both jobs) and its results:

```
2026-10-27T22:28:37.2812285Z ##[group]Run store=classic
2026-10-27T22:28:37.2812630Z store=classic
2026-10-27T22:28:37.2813300Z if [ "$(docker info --format '{{range .DriverStatus}}{{if eq (index . 0) "driver-type"}}{{index . 1}}{{end}}{{end}}')" = io.containerd.snapshotter.v1 ]; then
2026-10-27T22:28:37.2813995Z   store=containerd
2026-10-27T22:28:37.2814240Z fi
2026-10-27T22:28:37.2814463Z for image in web worker; do
2026-10-27T22:28:37.2814960Z   identity="$(node tools/screening-capacity/image-id.ts "$RUNNER_TEMP/image/$image.tar")"
2026-10-27T22:28:37.2815512Z   config="$(jq -r '.config' <<< "$identity")"
2026-10-27T22:28:37.2815916Z   target="$(jq -r '.target // empty' <<< "$identity")"
2026-10-27T22:28:37.2816337Z   docker load --input "$RUNNER_TEMP/image/$image.tar"
2026-10-27T22:28:37.2816813Z   if [ "$store" = containerd ]; then want="$target"; else want="$config"; fi
2026-10-27T22:28:37.2817679Z   id="$(docker image inspect -f '{{.Id}}' "tp-$image:capacity")"
2026-10-27T22:28:37.2818123Z   if [ -z "$want" ] || [ "$id" != "$want" ]; then
2026-10-27T22:28:37.2818770Z     echo "::error title=$image::tp-$image:capacity loaded as $id on the $store image store, not its archive's ${want:-digest for it}"
2026-10-27T22:28:37.2819362Z     exit 1
2026-10-27T22:28:37.2819581Z   fi
2026-10-27T22:28:37.2819921Z   echo "$image: config $config, loaded as $id on the $store image store"
2026-10-27T22:28:37.2820318Z done
```

24.04:

```
2026-10-27T22:16:46.0696429Z Loaded image: tp-web:capacity
2026-10-27T22:16:46.0940122Z web: config sha256:e67d7782108442e38a11fd7e03aa6c27bb34ece6fa40fa30cdbde282042e3343, loaded as sha256:e67d7782108442e38a11fd7e03aa6c27bb34ece6fa40fa30cdbde282042e3343 on the classic image store
2026-10-27T22:16:54.4067089Z Loaded image: tp-worker:capacity
2026-10-27T22:16:54.4554676Z worker: config sha256:1ef77a5c4ac3c8c68311ed6e56190a3519778d60d5966236d32d1e816303af21, loaded as sha256:1ef77a5c4ac3c8c68311ed6e56190a3519778d60d5966236d32d1e816303af21 on the classic image store
```

26.04:

```
2026-10-27T22:28:40.8951074Z Loaded image: tp-web:capacity
2026-10-27T22:28:40.9416909Z web: config sha256:e67d7782108442e38a11fd7e03aa6c27bb34ece6fa40fa30cdbde282042e3343, loaded as sha256:058ab8e5d1f38f29eb82b056a3c2e1e9612210cb3d6f91f200386f6a3f20cd8b on the containerd image store
2026-10-27T22:28:46.8742365Z Loaded image: tp-worker:capacity
2026-10-27T22:28:46.9167397Z worker: config sha256:1ef77a5c4ac3c8c68311ed6e56190a3519778d60d5966236d32d1e816303af21, loaded as sha256:5e2a883bc90c5852c2a0e2f9c50ea957d2b5e4d68d427c2a5cba238217ac89d7 on the containerd image store
```

### "Load the images as built" and the browser checks

"Load the images as built" passed in both: 22:16:34 to 22:16:54 (20 s) on 24.04, 22:28:37 to 22:28:46 (9 s) on 26.04, with the result lines quoted just above.

"Check the worker image's headless shell against browser.json" (`--image`) passed in both: 22:16:54 to 22:16:55 on 24.04, 22:28:46 to 22:28:50 on 26.04.

24.04:

```
2026-10-27T22:16:54.4580092Z ##[group]Run node tools/ci/browser-build.ts --image tp-worker:capacity
2026-10-27T22:16:55.0402044Z The headless shell: Google Chrome for Testing 156.0.8078.4
2026-10-27T22:16:55.0404512Z The headless shell: revision 1248, 156.0.8078.4, 287 files under tp-worker:capacity: $PLAYWRIGHT_BROWSERS_PATH/chromium_headless_shell-1248, tree SHA-256 333985b325984894be390c5275ab467ff9ee99ef55414ba6abe2222b2454172e, binary SHA-256 4fa61f0ba0b4f89b7bec242c32ca16d3bccf69dbfef0651924a9ba8fede5f9d6
2026-10-27T22:16:55.0405312Z The headless shell: equal to browser.json in every file
```

26.04:

```
2026-10-27T22:28:46.9202245Z ##[group]Run node tools/ci/browser-build.ts --image tp-worker:capacity
2026-10-27T22:28:50.1018962Z The headless shell: Google Chrome for Testing 156.0.8078.4
2026-10-27T22:28:50.1041633Z The headless shell: revision 1248, 156.0.8078.4, 287 files under tp-worker:capacity: $PLAYWRIGHT_BROWSERS_PATH/chromium_headless_shell-1248, tree SHA-256 333985b325984894be390c5275ab467ff9ee99ef55414ba6abe2222b2454172e, binary SHA-256 4fa61f0ba0b4f89b7bec242c32ca16d3bccf69dbfef0651924a9ba8fede5f9d6
2026-10-27T22:28:50.1048975Z The headless shell: equal to browser.json in every file
```

"Check the browser builds against browser.json" (the runner's own browsers) passed in both, with the same hashes:

24.04:

```
2026-10-27T22:17:18.2791355Z playwright-core 1.64.1 at /home/runner/work/PhysicalTherapy/PhysicalTherapy/node_modules/.pnpm/playwright-core@1.64.1/node_modules/playwright-core; browsers under /home/runner/.cache/ms-playwright
2026-10-27T22:17:18.7917230Z The headless shell: Google Chrome for Testing 156.0.8078.4
2026-10-27T22:17:18.7918270Z The headless shell: revision 1248, 156.0.8078.4, 287 files under /home/runner/.cache/ms-playwright/chromium_headless_shell-1248, tree SHA-256 333985b325984894be390c5275ab467ff9ee99ef55414ba6abe2222b2454172e, binary SHA-256 4fa61f0ba0b4f89b7bec242c32ca16d3bccf69dbfef0651924a9ba8fede5f9d6
2026-10-27T22:17:18.7919289Z The headless shell: equal to browser.json in every file
2026-10-27T22:17:18.7920135Z Chromium: Google Chrome for Testing 156.0.8078.4
2026-10-27T22:17:18.7921526Z Chromium: revision 1248, 156.0.8078.4, 301 files under /home/runner/.cache/ms-playwright/chromium-1248, tree SHA-256 2f991090d91aec41a37cbe49da4d6b3a03cd575dbd9d3daa6a1f36440d129545, binary SHA-256 377a9fc07b495c3b8d0ab8ec1fdfd153641759f9756fea34d8dfce4de82f5025
2026-10-27T22:17:18.7922623Z Chromium: equal to browser.json in every file
```

26.04:

```
2026-10-27T22:29:12.8550650Z playwright-core 1.64.1 at /home/runner/work/PhysicalTherapy/PhysicalTherapy/node_modules/.pnpm/playwright-core@1.64.1/node_modules/playwright-core; browsers under /home/runner/.cache/ms-playwright
2026-10-27T22:29:14.0862748Z The headless shell: Google Chrome for Testing 156.0.8078.4
2026-10-27T22:29:14.0866002Z The headless shell: revision 1248, 156.0.8078.4, 287 files under /home/runner/.cache/ms-playwright/chromium_headless_shell-1248, tree SHA-256 333985b325984894be390c5275ab467ff9ee99ef55414ba6abe2222b2454172e, binary SHA-256 4fa61f0ba0b4f89b7bec242c32ca16d3bccf69dbfef0651924a9ba8fede5f9d6
2026-10-27T22:29:14.0869035Z The headless shell: equal to browser.json in every file
2026-10-27T22:29:14.0869859Z Chromium: Google Chrome for Testing 156.0.8078.4
2026-10-27T22:29:14.0872308Z Chromium: revision 1248, 156.0.8078.4, 301 files under /home/runner/.cache/ms-playwright/chromium-1248, tree SHA-256 2f991090d91aec41a37cbe49da4d6b3a03cd575dbd9d3daa6a1f36440d129545, binary SHA-256 377a9fc07b495c3b8d0ab8ec1fdfd153641759f9756fea34d8dfce4de82f5025
2026-10-27T22:29:14.0874356Z Chromium: equal to browser.json in every file
```

### The measurement

Both restored the scale release from the same cache key ("Build the scale release" and "Save the scale release" skipped in both):

```
2026-10-27T22:17:21.7875373Z Cache hit for: screening-scale-release-3739e6dfe894f49dcbfcee22bcb45191bb7622e0c75fa174b449ea504b00f791
2026-10-27T22:29:15.2569830Z Cache hit for: screening-scale-release-3739e6dfe894f49dcbfcee22bcb45191bb7622e0c75fa174b449ea504b00f791
```

24.04, the step's script and the harness's lines:

```
2026-10-27T22:17:26.1513744Z ##[group]Run cpus=$(pnpm -s screening:capacity --print-harness-cpus)
2026-10-27T22:17:26.1514037Z cpus=$(pnpm -s screening:capacity --print-harness-cpus)
2026-10-27T22:17:26.1514241Z echo "harness on CPUs $cpus"
2026-10-27T22:17:26.1514425Z taskset -c "$cpus" pnpm screening:capacity \
2026-10-27T22:17:26.1514625Z   --out "$RUNNER_TEMP/screening-capacity" \
2026-10-27T22:17:26.1514827Z   --release-dir "$RUNNER_TEMP/scale-release" \
2026-10-27T22:17:26.1515017Z   --web-image tp-web:capacity \
2026-10-27T22:17:26.1515189Z   --worker-image tp-worker:capacity \
2026-10-27T22:17:26.1515361Z   --time-mode advisory
2026-10-27T22:17:27.8031393Z harness on CPUs 0-1
2026-10-27T22:17:29.2345755Z [capacity 2026-10-27T22:17:29.234Z] runner 4 CPUs, 15989 MiB, load 1.20 0.81 0.35; harness on CPUs 0-1; runtime docker; time mode advisory
2026-10-27T22:17:29.2355802Z [capacity 2026-10-27T22:17:29.234Z] layout: shared CPUs: Postgres on CPUs 0-1, the screening consumer on 2-3, the web on 3, the platform on 3 and the harness with Chromium on 0-1 (Postgres and the harness share CPUs 0-1; the screening consumer, the web and the platform share CPU 3)
2026-10-27T22:17:29.2356521Z [capacity 2026-10-27T22:17:29.235Z] release 900100: 2247791 records
2026-10-27T22:17:43.7951008Z [capacity 2026-10-27T22:17:43.794Z] migrating and creating the logins
2026-10-27T22:17:45.6553092Z [capacity 2026-10-27T22:17:45.655Z] loading the release
2026-10-27T22:20:49.8426667Z [capacity 2026-10-27T22:20:49.842Z] loaded: {"status":"loaded","releaseNo":900100,"manifestSha256":"711d4efa5326b7ce0b76d841525292f540b2cf7ba8011586338425a0fd4ac214","records":2247791,"seconds":182.9}
2026-10-27T22:20:49.9386930Z [capacity 2026-10-27T22:20:49.938Z] starting web, platform and the screening consumer (1 task of 2 vCPU and 4096 MiB, 3 at once)
2026-10-27T22:20:58.9279591Z [capacity 2026-10-27T22:20:58.927Z] S1: worst shape, one upload alone, then a small one behind it from a ZIP split across localities with its ZIP+4: fresh Postgres, fresh consumer
2026-10-27T22:20:58.9287430Z [capacity 2026-10-27T22:20:58.928Z] S1: a cold Postgres (restarted, page cache dropped), then web, platform and the consumer fresh
2026-10-27T22:21:16.7358769Z [capacity 2026-10-27T22:21:16.735Z] S1: 2 pages ready; submitting
2026-10-27T22:21:19.4548111Z [capacity 2026-10-27T22:21:19.454Z] S1: the large uploads' jobs are queued after 2.6 s; sending the small one behind them
2026-10-27T22:21:33.3732895Z [capacity 2026-10-27T22:21:33.373Z] S1-1 (worst): 15.2 s to email (logged 15.1, normal); run complete
2026-10-27T22:21:33.3733519Z [capacity 2026-10-27T22:21:33.373Z] S1-2 (small): 0.5 s to email (logged 0.4, normal); run complete
2026-10-27T22:21:33.9996262Z [capacity 2026-10-27T22:21:33.999Z] S2: practice shape, one upload alone: fresh consumer
2026-10-27T22:21:34.0477731Z [capacity 2026-10-27T22:21:34.047Z] S2: a fresh consumer
2026-10-27T22:21:36.3636991Z [capacity 2026-10-27T22:21:36.363Z] S2: 1 pages ready; submitting
2026-10-27T22:21:41.5596817Z [capacity 2026-10-27T22:21:41.559Z] S2-1 (practice): 4.0 s to email (logged 3.9, normal); run complete
2026-10-27T22:21:42.0734662Z [capacity 2026-10-27T22:21:42.073Z] S3: practice shape again in the same consumer (shared types held by the thread that priced S2)
2026-10-27T22:21:42.7678899Z [capacity 2026-10-27T22:21:42.767Z] S3: 1 pages ready; submitting
2026-10-27T22:21:47.4464907Z [capacity 2026-10-27T22:21:47.446Z] S3-1 (practice): 3.6 s to email (logged 3.6, normal); run complete
2026-10-27T22:21:47.9557753Z [capacity 2026-10-27T22:21:47.955Z] S4#1: worst shape, three at once (variants 1 to 3, three prospects), a small one behind them: fresh Postgres, fresh consumer (run 1 of 3)
2026-10-27T22:21:47.9558406Z [capacity 2026-10-27T22:21:47.955Z] S4#1: a cold Postgres (restarted, page cache dropped), then web, platform and the consumer fresh
2026-10-27T22:22:11.8483162Z [capacity 2026-10-27T22:22:11.848Z] S4#1: 4 pages ready; submitting
2026-10-27T22:22:19.3951062Z [capacity 2026-10-27T22:22:19.394Z] S4#1: the large uploads' jobs are queued after 7.2 s; sending the small one behind them
2026-10-27T22:22:43.5679147Z [capacity 2026-10-27T22:22:43.567Z] S4#1 S4-1 (worst): 27.8 s to email (logged 27.7, normal); run complete
2026-10-27T22:22:43.5679661Z [capacity 2026-10-27T22:22:43.567Z] S4#1 S4-2 (worst): 28.9 s to email (logged 28.7, normal); run complete
2026-10-27T22:22:43.5680068Z [capacity 2026-10-27T22:22:43.567Z] S4#1 S4-3 (worst): 27.9 s to email (logged 27.8, normal); run complete
2026-10-27T22:22:43.5680467Z [capacity 2026-10-27T22:22:43.567Z] S4#1 S4-4 (small): 20.4 s to email (logged 20.3, normal); run complete
2026-10-27T22:22:44.0172983Z [capacity 2026-10-27T22:22:44.017Z] S4#2: worst shape, three at once (variants 1 to 3, three prospects), a small one behind them: fresh Postgres, fresh consumer (run 2 of 3)
2026-10-27T22:22:44.0173930Z [capacity 2026-10-27T22:22:44.017Z] S4#2: a cold Postgres (restarted, page cache dropped), then web, platform and the consumer fresh
2026-10-27T22:23:17.4175931Z [capacity 2026-10-27T22:23:17.417Z] S4#2: 4 pages ready; submitting
2026-10-27T22:23:23.5892768Z [capacity 2026-10-27T22:23:23.589Z] S4#2: the large uploads' jobs are queued after 5.9 s; sending the small one behind them
2026-10-27T22:23:46.9269518Z [capacity 2026-10-27T22:23:46.926Z] S4#2 S4-1 (worst): 26.6 s to email (logged 26.5, normal); run complete
2026-10-27T22:23:46.9270027Z [capacity 2026-10-27T22:23:46.926Z] S4#2 S4-2 (worst): 26.1 s to email (logged 26.0, normal); run complete
2026-10-27T22:23:46.9270428Z [capacity 2026-10-27T22:23:46.926Z] S4#2 S4-3 (worst): 26.3 s to email (logged 26.2, normal); run complete
2026-10-27T22:23:46.9270822Z [capacity 2026-10-27T22:23:46.926Z] S4#2 S4-4 (small): 20.1 s to email (logged 20.0, normal); run complete
2026-10-27T22:23:47.4575069Z [capacity 2026-10-27T22:23:47.457Z] S4#3: worst shape, three at once (variants 1 to 3, three prospects), a small one behind them: fresh Postgres, fresh consumer (run 3 of 3)
2026-10-27T22:23:47.4575707Z [capacity 2026-10-27T22:23:47.457Z] S4#3: a cold Postgres (restarted, page cache dropped), then web, platform and the consumer fresh
2026-10-27T22:24:16.6306556Z [capacity 2026-10-27T22:24:16.630Z] S4#3: 4 pages ready; submitting
2026-10-27T22:24:23.7099703Z [capacity 2026-10-27T22:24:23.709Z] S4#3: the large uploads' jobs are queued after 6.8 s; sending the small one behind them
2026-10-27T22:24:48.9456104Z [capacity 2026-10-27T22:24:48.945Z] S4#3 S4-1 (worst): 29.3 s to email (logged 29.2, normal); run complete
2026-10-27T22:24:48.9456593Z [capacity 2026-10-27T22:24:48.945Z] S4#3 S4-2 (worst): 28.3 s to email (logged 28.2, normal); run complete
2026-10-27T22:24:48.9457000Z [capacity 2026-10-27T22:24:48.945Z] S4#3 S4-3 (worst): 27.6 s to email (logged 27.5, normal); run complete
2026-10-27T22:24:48.9457398Z [capacity 2026-10-27T22:24:48.945Z] S4#3 S4-4 (small): 20.6 s to email (logged 20.6, normal); run complete
2026-10-27T22:24:49.5036026Z [capacity 2026-10-27T22:24:49.503Z] S5: practice shape, three at once (three prospects), a small one behind them: fresh Postgres, fresh consumer
2026-10-27T22:24:49.5036640Z [capacity 2026-10-27T22:24:49.503Z] S5: a cold Postgres (restarted, page cache dropped), then web, platform and the consumer fresh
2026-10-27T22:25:05.5690152Z [capacity 2026-10-27T22:25:05.568Z] S5: 4 pages ready; submitting
2026-10-27T22:25:13.1907427Z [capacity 2026-10-27T22:25:13.188Z] S5: the large uploads' jobs are queued after 7.3 s; sending the small one behind them
2026-10-27T22:25:18.8118251Z [capacity 2026-10-27T22:25:18.811Z] S5-1 (practice): 11.5 s to email (logged 11.4, normal); run complete
2026-10-27T22:25:18.8118739Z [capacity 2026-10-27T22:25:18.811Z] S5-2 (practice): 10.9 s to email (logged 10.8, normal); run complete
2026-10-27T22:25:18.8119150Z [capacity 2026-10-27T22:25:18.811Z] S5-3 (practice): 11.5 s to email (logged 11.4, normal); run complete
2026-10-27T22:25:18.8119554Z [capacity 2026-10-27T22:25:18.811Z] S5-4 (small): 3.4 s to email (logged 3.3, normal); run complete
2026-10-27T22:25:36.0446195Z [capacity 2026-10-27T22:25:36.044Z] comparing S1-1 (frozen_3c1b289), S1-2 (whole_release), S2-1 (frozen_3c1b289), S3-1 (frozen_3c1b289) with the oracles
2026-10-27T22:27:20.3552580Z [capacity 2026-10-27T22:27:20.354Z] S4 ran three times (the founder's ruling of 2026-10-23): S4#1 27.8, 28.9, 27.9 and 20.4 s; S4#2 26.6, 26.1, 26.3 and 20.1 s; S4#3 29.3, 28.3, 27.6 and 20.6 s. Ordered by each run's worst upload, the small one included, the middle run is S4#1 (28.9 s): its four uploads are judged against the 48-s line and the 44-s question, and every other check holds in all three runs.
2026-10-27T22:27:20.3553587Z [capacity 2026-10-27T22:27:20.354Z] verdict: pass (time advisory)
```

26.04:

```
2026-10-27T22:29:17.8853878Z ##[group]Run cpus=$(pnpm -s screening:capacity --print-harness-cpus)
2026-10-27T22:29:17.8854797Z cpus=$(pnpm -s screening:capacity --print-harness-cpus)
2026-10-27T22:29:17.8855484Z echo "harness on CPUs $cpus"
2026-10-27T22:29:17.8856251Z taskset -c "$cpus" pnpm screening:capacity \
2026-10-27T22:29:17.8856702Z   --out "$RUNNER_TEMP/screening-capacity" \
2026-10-27T22:29:17.8857437Z   --release-dir "$RUNNER_TEMP/scale-release" \
2026-10-27T22:29:17.8857832Z   --web-image tp-web:capacity \
2026-10-27T22:29:17.8858187Z   --worker-image tp-worker:capacity \
2026-10-27T22:29:17.8858526Z   --time-mode advisory
2026-10-27T22:29:20.5127506Z harness on CPUs 0-1
2026-10-27T22:29:23.0451151Z [capacity 2026-10-27T22:29:23.044Z] runner 4 CPUs, 15983 MiB, load 1.81 0.81 0.30; harness on CPUs 0-1; runtime docker; time mode advisory
2026-10-27T22:29:23.0456295Z [capacity 2026-10-27T22:29:23.045Z] layout: shared CPUs: Postgres on CPUs 0-1, the screening consumer on 2-3, the web on 3, the platform on 3 and the harness with Chromium on 0-1 (Postgres and the harness share CPUs 0-1; the screening consumer, the web and the platform share CPU 3)
2026-10-27T22:29:23.0462707Z [capacity 2026-10-27T22:29:23.046Z] release 900100: 2247791 records
2026-10-27T22:29:32.2969890Z [capacity 2026-10-27T22:29:32.296Z] migrating and creating the logins
2026-10-27T22:29:34.5371325Z [capacity 2026-10-27T22:29:34.536Z] loading the release
2026-10-27T22:34:10.8800934Z [capacity 2026-10-27T22:34:10.879Z] loaded: {"status":"loaded","releaseNo":900100,"manifestSha256":"711d4efa5326b7ce0b76d841525292f540b2cf7ba8011586338425a0fd4ac214","records":2247791,"seconds":274.6}
2026-10-27T22:34:10.9711491Z [capacity 2026-10-27T22:34:10.970Z] starting web, platform and the screening consumer (1 task of 2 vCPU and 4096 MiB, 3 at once)
2026-10-27T22:34:22.7541215Z [capacity 2026-10-27T22:34:22.753Z] S1: worst shape, one upload alone, then a small one behind it from a ZIP split across localities with its ZIP+4: fresh Postgres, fresh consumer
2026-10-27T22:34:22.7558152Z [capacity 2026-10-27T22:34:22.755Z] S1: a cold Postgres (restarted, page cache dropped), then web, platform and the consumer fresh
2026-10-27T22:34:45.2220865Z [capacity 2026-10-27T22:34:45.221Z] S1: 2 pages ready; submitting
2026-10-27T22:34:49.5221860Z [capacity 2026-10-27T22:34:49.521Z] S1: the large uploads' jobs are queued after 4.1 s; sending the small one behind them
2026-10-27T22:35:13.8863652Z [capacity 2026-10-27T22:35:13.886Z] S1-1 (worst): 26.3 s to email (logged 26.2, normal); run complete
2026-10-27T22:35:13.8865646Z [capacity 2026-10-27T22:35:13.886Z] S1-2 (small): 0.7 s to email (logged 0.7, normal); run complete
2026-10-27T22:35:14.8065960Z [capacity 2026-10-27T22:35:14.806Z] S2: practice shape, one upload alone: fresh consumer
2026-10-27T22:35:14.8709713Z [capacity 2026-10-27T22:35:14.870Z] S2: a fresh consumer
2026-10-27T22:35:18.3025203Z [capacity 2026-10-27T22:35:18.302Z] S2: 1 pages ready; submitting
2026-10-27T22:35:27.3843961Z [capacity 2026-10-27T22:35:27.384Z] S2-1 (practice): 7.3 s to email (logged 7.2, normal); run complete
2026-10-27T22:35:28.0793675Z [capacity 2026-10-27T22:35:28.079Z] S3: practice shape again in the same consumer (shared types held by the thread that priced S2)
2026-10-27T22:35:29.1713695Z [capacity 2026-10-27T22:35:29.170Z] S3: 1 pages ready; submitting
2026-10-27T22:35:37.2072447Z [capacity 2026-10-27T22:35:37.207Z] S3-1 (practice): 6.8 s to email (logged 6.7, normal); run complete
2026-10-27T22:35:37.9932185Z [capacity 2026-10-27T22:35:37.992Z] S4#1: worst shape, three at once (variants 1 to 3, three prospects), a small one behind them: fresh Postgres, fresh consumer (run 1 of 3)
2026-10-27T22:35:37.9935740Z [capacity 2026-10-27T22:35:37.992Z] S4#1: a cold Postgres (restarted, page cache dropped), then web, platform and the consumer fresh
2026-10-27T22:36:12.4282219Z [capacity 2026-10-27T22:36:12.428Z] S4#1: 4 pages ready; submitting
2026-10-27T22:36:23.3523715Z [capacity 2026-10-27T22:36:23.352Z] S4#1: the large uploads' jobs are queued after 10.5 s; sending the small one behind them
2026-10-27T22:37:11.2965238Z [capacity 2026-10-27T22:37:11.296Z] S4#1 S4-1 (worst): 52.4 s to email (logged 51.3, normal); run complete
2026-10-27T22:37:11.2966876Z [capacity 2026-10-27T22:37:11.296Z] S4#1 S4-2 (worst): 48.4 s to email (logged 48.3, normal); run complete
2026-10-27T22:37:11.2968761Z [capacity 2026-10-27T22:37:11.296Z] S4#1 S4-3 (worst): 50.5 s to email (logged 49.4, normal); run complete
2026-10-27T22:37:11.2970134Z [capacity 2026-10-27T22:37:11.296Z] S4#1 S4-4 (small): 37.7 s to email (logged 37.7, normal); run complete
2026-10-27T22:37:12.1159493Z [capacity 2026-10-27T22:37:12.115Z] S4#2: worst shape, three at once (variants 1 to 3, three prospects), a small one behind them: fresh Postgres, fresh consumer (run 2 of 3)
2026-10-27T22:37:12.1161932Z [capacity 2026-10-27T22:37:12.115Z] S4#2: a cold Postgres (restarted, page cache dropped), then web, platform and the consumer fresh
2026-10-27T22:37:32.5741707Z [capacity 2026-10-27T22:37:32.573Z] S4#2: 4 pages ready; submitting
2026-10-27T22:37:43.8731871Z [capacity 2026-10-27T22:37:43.872Z] S4#2: the large uploads' jobs are queued after 10.8 s; sending the small one behind them
2026-10-27T22:38:32.2892163Z [capacity 2026-10-27T22:38:32.288Z] S4#2 S4-1 (worst): 53.9 s to email (logged 52.8, normal); run complete
2026-10-27T22:38:32.2913877Z [capacity 2026-10-27T22:38:32.288Z] S4#2 S4-2 (worst): 54.0 s to email (logged 53.9, normal); run complete
2026-10-27T22:38:32.2915313Z [capacity 2026-10-27T22:38:32.288Z] S4#2 S4-3 (worst): 54.2 s to email (logged 53.0, normal); run complete
2026-10-27T22:38:32.2916697Z [capacity 2026-10-27T22:38:32.288Z] S4#2 S4-4 (small): 42.8 s to email (logged 42.7, normal); run complete
2026-10-27T22:38:33.0950582Z [capacity 2026-10-27T22:38:33.094Z] S4#3: worst shape, three at once (variants 1 to 3, three prospects), a small one behind them: fresh Postgres, fresh consumer (run 3 of 3)
2026-10-27T22:38:33.0952524Z [capacity 2026-10-27T22:38:33.094Z] S4#3: a cold Postgres (restarted, page cache dropped), then web, platform and the consumer fresh
2026-10-27T22:39:16.5261655Z [capacity 2026-10-27T22:39:16.525Z] S4#3: 4 pages ready; submitting
2026-10-27T22:39:26.9940843Z [capacity 2026-10-27T22:39:26.993Z] S4#3: the large uploads' jobs are queued after 10.0 s; sending the small one behind them
2026-10-27T22:40:14.7275585Z [capacity 2026-10-27T22:40:14.727Z] S4#3 S4-1 (worst): 51.5 s to email (logged 50.4, normal); run complete
2026-10-27T22:40:14.7276636Z [capacity 2026-10-27T22:40:14.727Z] S4#3 S4-2 (worst): 48.9 s to email (logged 48.8, normal); run complete
2026-10-27T22:40:14.7277975Z [capacity 2026-10-27T22:40:14.727Z] S4#3 S4-3 (worst): 51.9 s to email (logged 50.8, normal); run complete
2026-10-27T22:40:14.7278950Z [capacity 2026-10-27T22:40:14.727Z] S4#3 S4-4 (small): 38.6 s to email (logged 38.5, normal); run complete
2026-10-27T22:40:15.4780729Z [capacity 2026-10-27T22:40:15.477Z] S5: practice shape, three at once (three prospects), a small one behind them: fresh Postgres, fresh consumer
2026-10-27T22:40:15.4782387Z [capacity 2026-10-27T22:40:15.477Z] S5: a cold Postgres (restarted, page cache dropped), then web, platform and the consumer fresh
2026-10-27T22:40:36.5841317Z [capacity 2026-10-27T22:40:36.583Z] S5: 4 pages ready; submitting
2026-10-27T22:40:46.3102189Z [capacity 2026-10-27T22:40:46.309Z] S5: the large uploads' jobs are queued after 9.3 s; sending the small one behind them
2026-10-27T22:40:57.1881416Z [capacity 2026-10-27T22:40:57.187Z] S5-1 (practice): 16.9 s to email (logged 16.7, normal); run complete
2026-10-27T22:40:57.1883788Z [capacity 2026-10-27T22:40:57.187Z] S5-2 (practice): 17.3 s to email (logged 17.1, normal); run complete
2026-10-27T22:40:57.1885264Z [capacity 2026-10-27T22:40:57.187Z] S5-3 (practice): 16.4 s to email (logged 16.2, normal); run complete
2026-10-27T22:40:57.1886565Z [capacity 2026-10-27T22:40:57.187Z] S5-4 (small): 6.8 s to email (logged 6.7, normal); run complete
2026-10-27T22:41:02.7439609Z [capacity 2026-10-27T22:41:02.743Z] comparing S1-1 (frozen_3c1b289), S1-2 (whole_release), S2-1 (frozen_3c1b289), S3-1 (frozen_3c1b289) with the oracles
2026-10-27T22:43:28.6647787Z [capacity 2026-10-27T22:43:28.664Z] S4 ran three times (the founder's ruling of 2026-10-23): S4#1 52.4, 48.4, 50.5 and 37.7 s; S4#2 53.9, 54.0, 54.2 and 42.8 s; S4#3 51.5, 48.9, 51.9 and 38.6 s. Ordered by each run's worst upload, the small one included, the middle run is S4#1 (52.4 s): its four uploads are judged against the 48-s line and the 44-s question, and every other check holds in all three runs.
2026-10-27T22:43:28.6650588Z [capacity 2026-10-27T22:43:28.664Z] verdict: pass (time advisory)
2026-10-27T22:43:28.6651865Z [capacity 2026-10-27T22:43:28.664Z]   time warning (advisory): time: S4#1 S4-1 52.4 s (the middle of S4's three runs), fail (allowance: above 48 s on the runner)
2026-10-27T22:43:28.6653451Z [capacity 2026-10-27T22:43:28.664Z]   time warning (advisory): time: S4#1 S4-2 48.4 s (the middle of S4's three runs), fail (allowance: above 48 s on the runner)
2026-10-27T22:43:28.6655043Z [capacity 2026-10-27T22:43:28.664Z]   time warning (advisory): time: S4#1 S4-3 50.5 s (the middle of S4's three runs), fail (allowance: above 48 s on the runner)
2026-10-27T22:43:28.6656896Z [capacity 2026-10-27T22:43:28.664Z] sizing question for the founder (O9): the worst time, S4#1 S4-1's 52.4 s (the middle of S4's three runs), is above 44 s: the consumer's size goes to the founder before merge
2026-10-27T22:43:28.6682743Z ##[warning]time: S4#1 S4-1 52.4 s (the middle of S4's three runs), fail (allowance: above 48 s on the runner)
2026-10-27T22:43:28.6691711Z ##[warning]time: S4#1 S4-2 48.4 s (the middle of S4's three runs), fail (allowance: above 48 s on the runner)
2026-10-27T22:43:28.6693464Z ##[warning]time: S4#1 S4-3 50.5 s (the middle of S4's three runs), fail (allowance: above 48 s on the runner)
2026-10-27T22:43:28.6695401Z ##[warning]the worst time, S4#1 S4-1's 52.4 s (the middle of S4's three runs), is above 44 s: the consumer's size goes to the founder before merge
2026-10-27T22:43:34.5675739Z Evaluate and set job outputs
2026-10-27T22:43:34.5682232Z Set output 'sizing'
2026-10-27T22:43:34.5684752Z Set output 'time-warnings'
```

The 24.04 job printed no time warning, no sizing line and no `##[warning]`, and set no job output (its log ends `Evaluate and set job outputs` with no `Set output` line).

Step durations of "Measure under production limits": 24.04 started 22:17:26 and completed 22:27:20 (9 min 54 s); 26.04 started 22:29:17 and completed 22:43:28 (14 min 11 s).

### What happened in one run and not the other

Nothing failed in either job: every step of both capacity jobs concluded `success` or `skipped`, and the same two steps were skipped in both ("Build the scale release", "Save the scale release", on the scale release's cache hit). Both runs' "screening-capacity gate" passed and both runs' "notify" job was skipped. The one `[WARN]` common to both is pnpm's layout notice (push line at 22:16:29.9971410Z, probe at 22:28:30.2110217Z).

Only on 26.04:

- The four `##[warning]` annotations and the `sizing` and `time-warnings` job outputs (quoted above).
- The system packages' cache was restored from a restore-key of another image version, and the verify step discarded four `amd64v3` packages the signed index does not list; 10 were then collected and saved under the new key:

```
2026-10-27T22:28:53.6490740Z Cache hit for restore-key: apt-v1-ubuntu26-20261023.163.3-3cf66136bc3815daf17f0f16fa0c6eee18dd41d29cdcd95cf2dd7b89fb69e639
2026-10-27T22:28:57.3552972Z discarded libnss3-tools_2%3a3.120-1ubuntu2.2_amd64v3.deb: the index lists no libnss3-tools:amd64v3=2:3.120-1ubuntu2.2
2026-10-27T22:28:57.3831021Z discarded libnss3_2%3a3.120-1ubuntu2.2_amd64v3.deb: the index lists no libnss3:amd64v3=2:3.120-1ubuntu2.2
2026-10-27T22:28:57.5073372Z discarded xfonts-utils_1%3a7.7+7build1_amd64v3.deb: the index lists no xfonts-utils:amd64v3=1:7.7+7build1
2026-10-27T22:28:57.5676897Z discarded xvfb_2%3a21.1.22-1ubuntu1.3_amd64v3.deb: the index lists no xvfb:amd64v3=2:21.1.22-1ubuntu1.3
2026-10-27T22:28:57.5689429Z apt archives: 9 kept (each the signed index's SHA-256 for its version), 4 discarded
2026-10-27T22:29:00.0984547Z 0 upgraded, 9 newly installed, 0 to remove and 5 not upgraded.
2026-10-27T22:29:00.0985221Z Need to get 97.3 kB/21.9 MB of archives.
2026-10-27T22:29:14.1468269Z apt archives: 10 collected into /home/runner/work/_temp/apt-archives
2026-10-27T22:29:14.9436114Z Cache saved with key: apt-v1-ubuntu26-20261026.180.1-3cf66136bc3815daf17f0f16fa0c6eee18dd41d29cdcd95cf2dd7b89fb69e639
```

- The images came wholly from the build cache: "Build the web image" 22:28:11 to 22:28:14 (3 s), "Build the worker image" 22:28:14 to 22:28:25 (11 s), each Dockerfile step `CACHED`, with `cache-from` only:

```
2026-10-27T22:28:11.2104558Z   cache-from: type=gha,scope=screening-capacity-web
2026-10-27T22:28:11.2104878Z   load: false
2026-10-27T22:28:13.2185632Z #9 [runtime 3/9] RUN apt-get update  && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y --no-install-recommends  && rm -rf /var/lib/apt/lists/*  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack            /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
2026-10-27T22:28:13.2188725Z #9 CACHED
```

Only on 24.04:

- The system packages' cache missed every key, so nothing was kept or discarded, apt fetched the packages, and 17 were collected and saved:

```
2026-10-27T22:16:57.2584057Z Cache not found for input keys: apt-v1-ubuntu24-20261023.334.3-3cf66136bc3815daf17f0f16fa0c6eee18dd41d29cdcd95cf2dd7b89fb69e639, apt-v1-ubuntu24-20261023.334.3-, apt-v1-ubuntu24-
2026-10-27T22:17:03.6139336Z apt archives: 0 kept (each the signed index's SHA-256 for its version), 0 discarded
2026-10-27T22:17:05.5211604Z 8 upgraded, 9 newly installed, 0 to remove and 96 not upgraded.
2026-10-27T22:17:05.5212013Z Need to get 25.9 MB of archives.
2026-10-27T22:17:18.8491512Z apt archives: 17 collected into /home/runner/work/_temp/apt-archives
2026-10-27T22:17:21.4992552Z Cache saved with key: apt-v1-ubuntu24-20261023.334.3-3cf66136bc3815daf17f0f16fa0c6eee18dd41d29cdcd95cf2dd7b89fb69e639
```

- The images were built and the build cache exported (`cache-to`): "Build the web image" 22:14:11 to 22:15:18 (67 s), "Build the worker image" 22:15:18 to 22:16:26 (68 s):

```
2026-10-27T22:14:11.2190947Z   cache-to: type=gha,mode=min,scope=screening-capacity-web
2026-10-27T22:14:24.4509600Z #15 [build 8/8] RUN pnpm --filter @tp/web build
2026-10-27T22:15:09.4629814Z #15 DONE 45.2s
2026-10-27T22:15:18.3683612Z #25 sending cache export 4.8s done
2026-10-27T22:15:18.4394137Z   cache-to: type=gha,mode=min,scope=screening-capacity-worker
2026-10-27T22:15:29.6329033Z #18 [runtime 4/9] RUN apt-get update  && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y --no-install-recommends  && node node_modules/playwright-core/cli.js install --with-deps chromium-headless-shell  && rm -rf /var/lib/apt/lists/*  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack            /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
2026-10-27T22:15:48.2063718Z #18 DONE 18.7s
2026-10-27T22:16:26.8239301Z #25 sending cache export 22.1s done
```

## Draft comment for issue #41

Same commit, `ecebdc9`, measured twice: [run 40593100143](https://github.com/PureTideWater/PhysicalTherapy/actions/runs/40593100143), the push run, with capacity on ubuntu-24.04 (the release's runner), and [run 40593230221](https://github.com/PureTideWater/PhysicalTherapy/actions/runs/40593230221), the O5 probe, dispatched with `runner=ubuntu-26.04`. Both measured the same images (web config `e67d7782…`, worker config `1ef77a5c…`).

| Seconds | ubuntu-24.04, run 40593100143 | ubuntu-26.04, run 40593230221 |
|---|---|---|
| Release 900100 load | 182.9 | 274.6 |
| S1 (worst, small) | 15.2, 0.5 | 26.3, 0.7 |
| S2 | 4.0 | 7.3 |
| S3 | 3.6 | 6.8 |
| S4#1 | 27.8, 28.9, 27.9, 20.4 | 52.4, 48.4, 50.5, 37.7 |
| S4#2 | 26.6, 26.1, 26.3, 20.1 | 53.9, 54.0, 54.2, 42.8 |
| S4#3 | 29.3, 28.3, 27.6, 20.6 | 51.5, 48.9, 51.9, 38.6 |
| S4 middle run | S4#1, 28.9 | S4#1, 52.4 |
| S5 | 11.5, 10.9, 11.5, 3.4 | 16.9, 17.3, 16.4, 6.8 |
| Verdict | pass (time advisory), no warnings | pass (time advisory), three time warnings (52.4, 48.4 and 50.5 above 48 s) and the sizing question (above 44 s) |

The 26.04 job ran Docker Engine 29.4.2 on the containerd image store (`Storage Driver: overlayfs`, `driver-type: io.containerd.snapshotter.v1`). Its load step matched each image's `.Id` to the archive's manifest digest, and the worker image's headless shell matched browser.json in every file. The 24.04 job ran Docker 28.0.4 on the classic store.

The probe is advisory: the launch check refuses its report and its failure would open no issue, and moving the release's capacity chain remains the founder's ruling under F5. In favour of the move: the 26.04 job's content-bound image load, browser check and every check other than time passed, and one pair of runs on different hosts (centralus and eastus) cannot separate the image from host speed, which this issue already shows moving S4's worst between 38.3 and 56.9 s on the same code. Against it: with the same commit and the same images, the 26.04 job took 1.4 to 2.1 times as long in every scenario, and its middle S4 run is over the 48-s line a release enforces, while the 24.04 run's middle run (28.9 s) is under the 44-s question.

---
_Generated by [Claude Code](https://claude.ai/code)_
