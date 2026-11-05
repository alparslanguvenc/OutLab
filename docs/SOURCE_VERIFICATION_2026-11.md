# OutLab EDA: verified sources (compiled 2026-11-05)

## How this was checked (read this first)

- **Network limits:** WebFetch could not reach pmc.ncbi.nlm.nih.gov or affective-science.org (DNS blocked in this session). doi.org, Crossref, Europe PMC and publisher sites were also blocked (proxy 403).
- **What worked:**
  1. **GitHub `git clone`:** official code repos. The EDAQA repo ships the authors' accepted-manuscript PDF of Kleckner et al. 2018, so the Kleckner rules below were read from the paper's full text.
  2. **PyPI JSON API and sdists:** package metadata and code.
  3. **Wiley Scholar Gateway:** full-text passages from Psychophysiology.
  4. **WebSearch:** a search engine that summarises PMC, PubMed, publisher and DOAJ pages. When a fact came only from these summaries, I say so and mark it as *verified (via search summary)* or *partially verified*.
- **Status labels:**
  - **verified (primary):** I read it myself in the paper's full text or in the official code.
  - **verified (via search summary):** citation metadata or abstract facts. They are consistent across PMC, PubMed and publisher hits, but I did not open the page myself.
  - **partially verified:** some facts confirmed, others not.
  - **unverified:** could not confirm.
- **Local copies of the cloned sources** (under `(oturuma özel geçici klon; depoya dahil değil) `):
  - Kleckner paper PDF and its extracted text: `edaqa_repo/2017-Kleckner-EDA_QA.pdf` and `kleckner.txt`.
  - Code repos: `edaexp/` (EDA Explorer), `edartifact/`, `cvxeda/`, `nk/` (NeuroKit2), `ledalab/`, `ledapy/`, `c_EDABE_LSTM_1DCNN/`, `c_sparsEDA/`, `c_SparsEDA-python/`, `emdocs/` (EmotiBit docs), `pyphysio_dl/`.

---

## Part A — references

### A1. Kleckner et al. (2018), the EDA quality-assessment rules. Status: VERIFIED (primary: full text + official code)

**Citation:** Kleckner IR, Jones RM, Wilder-Smith O, Wormwood JB, Akcakaya M, Quigley KS, Lord C, Goodwin MS. Simple, transparent, and flexible automated quality assessment procedures for ambulatory electrodermal activity data. *IEEE Trans Biomed Eng.* 2018;65(7):1460–1467.
- **DOI:** 10.1109/TBME.2017.2758643 (printed on the manuscript header). PMID 28976309, PMCID PMC5880745.
- **Volume, issue, pages:** from search summaries of PMC and the IEEE record. The PDF I read is the accepted manuscript TBME-01044-2017.

**Sources opened:**
- `https://github.com/iankleckner/EDAQA`, cloned at commit aeed0cf, 2025-02-15. The repo contains `2017-Kleckner-EDA_QA.pdf` (author manuscript) and the MATLAB code.
- Licence: **GPL-3.0** (`LICENSE.txt`).
- Paper's software URL: http://www.cbslab.org/EDAQA.

**Rules: Table 1, "Our four simple rules for quality assessment of EDA data" (p. 3 of the manuscript). Quoted verbatim:**

1. "EDA is out of range (not within 0.05-60 μS)". Rationale: to prevent "floor" artifacts (e.g., electrode loses contact with skin) and "ceiling" artifacts (circuit is overloaded). "We chose 0.05 μS because it is at an accepted minimum for SCR amplitude [1]. We chose 60 μS because it is near the maximum for the Q Sensor."
2. "EDA changes too quickly (faster than ±10 μS/sec)". Rationale: "To prevent high frequency or 'jump' artifacts".
3. "Temperature is out of range (not within 30-40ºC)". Rationale: "To account for times when the EDA sensor is not being worn or has not been worn long enough. Our data reached plateaus of approximately 32-36ºC across individuals…"
4. "EDA data are surrounding (within 5 sec of) invalid portions according to rules 1-3". Rationale: "To account for transition effects close in time to artifacts."

**Supporting text:**
- **Fig. 1 caption:** "The values in parentheses were used for this study but can be modified based on differences in EDA hardware, participant sample, experimental context, and the relative importance of keeping vs. removing both valid and invalid data."
- **Fig. 3 caption (p. 5):** the rules are given as "(1) EDA range set to 0.05-60 μS; (2) EDA maximum slope set to ±10 μS/sec; (3) temperature range set to 30-40ºC; and (4) transition range set to any data within 5 sec." The caption also says the invalid region was "expanded to a 10-sec wide window (Rule 4 in Table 1)". So the 5 s is a radius on each side.
- **Pre-filter (Sec. II-C, p. 3):** "First, we used a low-pass 'despiking' filter … a low-pass FIR filter of length 2,057 (symmetric around zero) with cutoff frequencies at 0 and 0.35 Hz and designed for a sampling frequency of 32 Hz … constant group delay of 1,028 samples." The rules are applied after filtering.

**Code: `run_automated_EDAQA.m` (official implementation)**
- **Rule 2 slope:** an instantaneous first difference, `[0; diff(EDA_filtered) ./ sampling_period]`, tested as `abs(slope) > 10`.
  - At 15 Hz, this equals a jump of more than 0.667 µS between consecutive samples.
- **Rule 4:** `QA_radius_to_spread_invalid_datum_sec / sampling_period` samples are marked invalid **both forward and backward** from every invalid sample.
- **Demo defaults** (`demo_EDAQA_single_input_file.m`): `QA_EDA_floor = 0.05`, `QA_EDA_ceiling = 60`, `QA_EDA_max_slope_uS_per_sec = 10`, `QA_temperature_C_min = 30`, `QA_temperature_C_max = 40`, `QA_radius_to_spread_invalid_datum_sec = 5`.
- **Pre-filter in the current code:** a moving average applied with `filtfilt`. The comment says the default window is 2 s and that `NaN` disables it. The demo ships with `QA_filter_window_EDA_sec = NaN`, i.e. no filter.
  - This differs from the 0.35 Hz FIR described in the paper. The README changelog says "2019/02/11 Update code to output FILTERED EDA data and option for NO filtering".
- **Missing temperature (2025 fix):** if no temperature data are given, Rule 3 is disabled.

**Results (abstract and Sec. III):**
- 20 children with autism; 181 h of data from the Affectiva Q Sensor (16 or 32 Hz, ventral wrist).
- 32.8 h subset rated by 5 experts. Inter-rater agreement 98%, κ = 0.87.
- Automated procedure vs expert consensus: sensitivity 91%, specificity 99%, accuracy 92%, κ = 0.739 (95% CI 0.738–0.740). Table 2.
- 21.3% of data flagged invalid.
- Against EDA Explorer (Taylor) in 5-s epochs: agreement 73%, κ = 0.39. Taylor vs experts: 77%, κ = 0.46. Kleckner vs experts in 5-s epochs: 94%, κ = 0.83 (Sec. III-E).

**Implications for OutLab:**
- **Thresholds are device-dependent:** the authors say explicitly that the thresholds must be tuned to the device (Discussion, p. 6).
- **EmotiBit's "T1" channel** is "Temperature via the PPG sensor" (EmotiBit docs, `Working_with_emotibit_data.md`), not a dedicated skin thermistor. A wrist sensor cycling outdoors may also read cold. The 30–40 °C rule therefore needs re-validation, or should be optional.
- **EmotiBit's EDA ceiling** is not 60 µS. Use the device's range.

### A2. Taylor et al. (2015), EDA Explorer. Status: PARTIALLY VERIFIED (code primary; paper via search summary)

**Citation:** Taylor S, Jaques N, Chen W, Fedor S, Sano A, Picard R. Automatic identification of artifacts in electrodermal activity data. *Conf Proc IEEE EMBC* 2015:1934–1937.
- **DOI:** 10.1109/EMBC.2015.7318762. PMID 26736662, PMCID PMC5413200 (via search summary of PubMed and PMC).

**Paper facts (via search summary of the PMC page):**
- Device: Affectiva Q sensor, EDA at 8 Hz.
- Data: 1,560 non-overlapping **5-s epochs** labelled by expert raters, who also saw accelerometer data. Binary set: 798 clean and 252 artifact epochs.
- Classifiers compared included NN, RF, naïve Bayes, kNN, logistic regression and **SVM**.
- About 95% test accuracy, per co-author Jaques's site; I could not confirm the exact figure.
- Kleckner 2018 (Discussion, primary) describes it as "training a support vector machine classifier on 14 EDA features", with "81% agreement and Cohen's κ of 0.55" between the two human raters.

**Code: `https://github.com/MITMediaLabAffectiveComputing/eda-explorer`, cloned at commit fdfde39, 2019-08-30.**
- **Licence: MIT** ("Copyright (c) 2016 Sara Taylor and Natasha Jaques").
- **Pre-processing:** data are interpolated to **8 Hz**, then low-pass filtered with a Butterworth filter (1 Hz cutoff, order 6) (`load_files.py`). README note: "currently … assumption that the sample rate is an integer power of 2."
- **Features per 5-s epoch** (`EDA-Artifact-Detection-Script.py`):
  - Statistical features: amplitude, first and second derivatives on raw and filtered EDA.
  - Haar wavelet features: 1-s and 0.5-s levels (max, mean, std, median, fraction above zero).
- **Classifiers** (`ArtifactClassifiers.py`): binary SVM on 13 features; multiclass SVM (clean / questionable / artifact) on 10 features.
- Web tool: https://eda-explorer.media.mit.edu (not opened).

**Feasibility:** offline Python, MIT licence.
- EmotiBit's 15 Hz must be resampled to 8 Hz.
- The models were trained on Q-sensor data from the wrist in daily life, not on cycling. Kleckner found only modest agreement on new data.

### A3. Gashi et al. (2020), EDArtifact. Status: PARTIALLY VERIFIED

**Citation:** Gashi S, Di Lascio E, Stancu B, Das Swain V, Mishra V, Gjoreski M, Santini S. Detection of artifacts in ambulatory electrodermal activity data. *Proc ACM Interact Mob Wearable Ubiquitous Technol (IMWUT)* 2020;4(2):Article 44 (31 pp).
- **DOI:** 10.1145/3397316.
- The author list is from the official repo README (primary). Note that the prompt's author list is wrong: there is no "Stojanovic".

**Method:**
- Systematic literature review, then guidelines for labelling artifacts by hand, then an automatic detector of "shape artifacts".
- Detector, from the repo notebook `EDArtifacts_Detection/EDArtifacts_Detection.ipynb` (primary):
  - 5-s non-overlapping windows at **4 Hz** (Empatica E4), 20 samples each.
  - Features: statistical; SCR features from the cvxEDA phasic component; wavelet features.
  - Windows that are "flat" (slope within ±0.002) are removed first.
  - A pre-trained **XGBoost** model (`SA_Detection.sav`).

**Data and results (via search summary of the ACM abstract and project page):**
- 13 participants in the wild; 107.56 h labelled by 2 annotators.
- Recall about 98% for clean vs shape-artifact under leave-one-subject-out validation, which is 42 percentage points above the baseline.
- Existing methods caught only 17% of artifacts on this data.

**Code:** `https://github.com/shkurtagashi/EDArtifact` (last commit 2023-04-03). **No licence file**, so by default all rights are reserved; ask the authors before reuse. The dataset is available on request.

### A4. Greco et al. (2016), cvxEDA. Status: VERIFIED (code/README primary; volume and pages via search summary)

**Citation:** Greco A, Valenza G, Lanata A, Scilingo EP, Citi L. cvxEDA: a convex optimization approach to electrodermal activity processing. *IEEE Trans Biomed Eng.* 2016;63(4):797–804.
- **DOI:** 10.1109/TBME.2015.2474131. Published online in 2015, hence some sources give 2015.

**Model (official README):** EDA = phasic (sparse sudomotor bursts) + tonic (slow spline baseline) + Gaussian noise term, solved by convex optimisation with sparsity.

**Code:** `https://github.com/lciti/cvxEDA`, Python (`pip install cvxeda`, v1.1.0 on PyPI) and MATLAB. **Licence: GPL-3.0** (`LICENSE.txt`; PyPI metadata agrees).

**NeuroKit2** exposes it as `eda_phasic(method="cvxeda")`. It needs `cvxopt`. Defaults: tau0 = 2.0, tau1 = 0.7, delta_knot = 10, alpha = 8e-4, gamma = 1e-2.

### A5. Benedek & Kaernbach (2010), CDA and DDA. Status: VERIFIED (via search summary + Ledalab code primary)

- **CDA:** Benedek M, Kaernbach C. A continuous measure of phasic electrodermal activity. *J Neurosci Methods.* 2010;190(1):80–91.
  - DOI 10.1016/j.jneumeth.2010.04.028. PMID 20451556, PMCID PMC2892750.
  - Method: standard deconvolution into a continuous phasic driver (zero baseline, compact impulses) plus tonic. Proposes the time integral of the phasic driver as the event-related measure.
- **DDA:** Benedek M, Kaernbach C. Decomposition of skin conductance data by means of nonnegative deconvolution. *Psychophysiology.* 2010;47(4):647–658.
  - DOI 10.1111/j.1469-8986.2009.00972.x. PMCID PMC2904901.
  - Method: nonnegative deconvolution into discrete SCRs plus tonic. Models deviations from the standard SCR shape, attributed to pore opening.
- **Ledalab presets** (primary, `main/settings/ledapreset.m`): `tau0 = [.50 30]` for DDA ("see Benedek & Kaernbach, 2010, Psychophysiology") and `tau0_sdeco = [1 3.75]` for CDA ("see … J Neurosc Meth"). The default response window in `variable_era.m` is `[1, 4]` s.
- **Independent comparison (Wiley full text):** Bach & Friston 2013, *Psychophysiology* 50(1):15–22, DOI 10.1111/j.1469-8986.2012.01483.x. Table 1 lists both methods as "Modified LTI model / Deterministic", software Ledalab. Bach 2014 (PMC4266536, via search summary) found SCRalyze/PsPM recovered known differences better than Ledalab in 4 of 5 contrasts.

### A6. Böttcher et al. (2022), wearable data quality. Status: PARTIALLY VERIFIED

**Citation:** Böttcher S, Vieluf S, Bruno E, Joseph B, Epitashvili N, Biondi A, Zabler N, Glasstetter M, Dümpelmann M, Van Laerhoven K, Nasseri M, Brinkmann BH, Richardson MP, Schulze-Bonhage A, Loddenkemper T. Data quality evaluation in wearable monitoring. *Sci Rep.* 2022;12:21412.
- **DOI:** 10.1038/s41598-022-25949-x.
- The full author list is from memory and the search summary listed only the first three, so treat the full list as unverified.

**EDA checks (via search summary of nature.com):**
- Device: Empatica E4.
- Quality from a **simple amplitude threshold (lower bound 0.05 µS)** plus a **rate of amplitude change (RAC)**. RAC = (max − min in a window) / the extreme that occurs first.
- Also a 1-min on-body score that combines EDA, skin temperature and movement.
- **Not confirmed from the paper itself:** the window length and RAC cutoff. A citing 2023 paper (Frontiers in Physiology, 10.3389/fphys.2023.1248899) that "followed Böttcher 2022" uses a 2-s window, RAC > 0.2 and a 0.05 µS minimum. Treat 2 s / 0.2 as **unverified for Böttcher itself**.

### A7. Posada-Quintero & Chon (2020), systematic review. Status: VERIFIED (via search summary)

**Citation:** Posada-Quintero HF, Chon KH. Innovations in electrodermal activity data collection and signal processing: a systematic review. *Sensors.* 2020;20(2):479.
- DOI 10.3390/s20020479. PMCID PMC7014446, PMID 31952141.
- Scope: last 10 years of EDA sensors, processing (decomposition, spectral indices) and EDA quality assessment. Written for newcomers to EDA.

### A8. Boucsein et al. (2012), SPR publication recommendations. Status: PARTIALLY VERIFIED

**Citation:** Society for Psychophysiological Research Ad Hoc Committee on Electrodermal Measures: Boucsein W, Fowles DC, Grimnes S, Ben-Shakhar G, Roth WT, Dawson ME, Filion DL. Publication recommendations for electrodermal measurements. *Psychophysiology.* 2012;49(8):1017–1034.
- DOI 10.1111/j.1469-8986.2012.01384.x.
- One search summary gave the DOI as 10.1111/psyp.12147. That is wrong: it belongs to a later erratum or another item.

**Amplitude criterion (via search summary of the report text):**
- The report requires that "a minimum amplitude criterion must be specified and reported (e.g., 0.01 μS…)".
- It notes that 0.05 μS was common with hand scoring, and that "with computerized scoring … as low as 0.01 μS".
- So 0.01–0.05 µS is the accepted range. 0.02 µS is used by some labs, but I found no evidence that the report names it specifically.

**Latency windows (verified only as secondary attributions in Wiley full text):**
- Kuhn et al. 2022, *Psychophysiology*, DOI 10.1111/psyp.14058 (Introduction), and Sjouwerman et al. 2022, DOI 10.1111/psyp.14130, both attribute to Boucsein et al. 2012:
  - onset latency window **1–4 s** after stimulus onset (versus 1–3 s from Levinson & Edelberg 1985);
  - peak within **0.5–5 s** after SCR onset;
  - minimum amplitude **0.01–0.05 µS**.
- Kleckner 2018 (p. 1) describes the conventional SCR as "an increase in EDA of at least 0.05 µS over 1-3 sec followed by a slower decrease … over 3-15 sec".
- I could not see the report's own table, so the exact rise-time and recovery wording is **unverified at the primary level**.

### A9. Cohen (1960) and Landis & Koch (1977). Status: VERIFIED (via search summary)

- Cohen J. A coefficient of agreement for nominal scales. *Educ Psychol Meas.* 1960;20(1):37–46. DOI 10.1177/001316446002000104.
- Landis JR, Koch GG. The measurement of observer agreement for categorical data. *Biometrics.* 1977;33(1):159–174. DOI 10.2307/2529310 (DOI from memory, not shown in the search results).
- **Bands:**

  | κ | Agreement |
  |---|---|
  | < 0 | poor |
  | 0–0.20 | slight |
  | 0.21–0.40 | fair |
  | 0.41–0.60 | moderate |
  | 0.61–0.80 | substantial |
  | 0.81–1.00 | almost perfect |

- **Caveat:** the bands are opinion-based, not empirically derived, and are often criticised. Cite them as a convention.

### A10. NeuroKit2. Status: VERIFIED (paper via search summary; methods primary from source code)

**Citation:** Makowski D, Pham T, Lau ZJ, Brammer JC, Lespinasse F, Pham H, Schölzel C, Chen SHA. NeuroKit2: a Python toolbox for neurophysiological signal processing. *Behav Res Methods.* 2021;53(4):1689–1696.
- DOI 10.3758/s13428-020-01516-y.
- Software licence **MIT**. PyPI latest is 0.3.0. Repo cloned at commit f49ad48, 2026-11-01.
- The docs site (neuropsychology.github.io) was blocked, so I read the docstrings that generate the docs.

**`eda_phasic(eda_signal, sampling_rate, method="highpass")`** (`neurokit2/eda/eda_phasic.py`):

| `method` | What it does | Source |
|---|---|---|
| `"highpass"` (default; aliases `neurokit`, `biopac`, `acqknowledge`) | Butterworth high-pass, cutoff 0.05 Hz | "Method implemented in Biopac's Acqknowledge" |
| `"smoothmedian"` / `"median"` | Median smoothing (default 4 s) gives the tonic; phasic = raw − tonic | Acqknowledge |
| `"cvxeda"` / `"convex"` | cvxEDA | Greco et al. 2016, TBME 63(4):797–804 |
| `"sparse"` / `"sparseda"` | sparsEDA | Hernando-Gallego et al. 2017/2018, IEEE JBHI 22(5):1385–1394 |

- The docstring carries a warning for sparsEDA: "Help is needed to double-check it … sometimes it errors for unclear reasons."
- **There is no CDA/Ledalab method in NeuroKit2.**

**`eda_peaks(eda_phasic, sampling_rate, method="neurokit", amplitude_min=0.1)`** (`eda_peaks.py`, `eda_findpeaks.py`):

| `method` | Source / behaviour |
|---|---|
| `"neurokit"` (default) | Peaks relative to the largest peak |
| `"gamboa2008"` | Gamboa H. (2008) PhD thesis, *Multi-modal behavioral biometrics based on HCI and electrophysiology* |
| `"kim2004"` (BioSPPy default) | Kim KH, Bang SW, Kim SR (2004), *Med Biol Eng Comput* 42(3):419–427 |
| `"vanhalem2020"` | van Halem S et al. (2020), *Eur J Personality*, "Moments that matter?…". Requires more than 0.5 s of rise and decay. |
| `"nabian2018"` | Nabian M et al. (2018), *IEEE J Transl Eng Health Med* 6:2800711. Rejects SCRs smaller than 10% of the maximum SCR amplitude. |

- **Important:** `amplitude_min = 0.1` is **relative** (a fraction of the largest amplitude) for `neurokit` and `kim2004`. It is **not** an absolute µS threshold, so a Boucsein-style 0.01/0.05 µS criterion must be applied separately.

**Other relevant functions:**
- **`eda_clean`:** default is a 4th-order Butterworth low-pass at 3 Hz. Filtering is skipped if `sampling_rate <= 6`, so it is applied at 15 Hz. Alternative: `method="biosppy"` (5 Hz low-pass plus boxzen smoothing).
- **`eda_sympathetic`:** methods `posada` (Posada-Quintero et al. 2016, Ann Biomed Eng 44(10):3124–3135; band 0.045–0.25 Hz; signal of at least 64 s) and `ghiasi` (Ghiasi et al. 2018 EMBC).

---

## Part B — Ledalab

**Status: VERIFIED (primary: official repo) for content and licence; developers' affiliations via search summary.**


**Who develops it:**
- **Developers:** Mathias Benedek and Christian Kaernbach. `graphics/ledalogo.m`: "Code by Mathias Benedek & Christian Kaernbach".
- **Affiliations** (via search summaries of the 2010 papers' records):
  - Benedek: Institut für Psychologie, Karl-Franzens-Universität **Graz**, Austria.
  - Kaernbach: Institut für Psychologie, Christian-Albrechts-Universität zu **Kiel**, Germany.
  - Kiel also appears in the code credits of `getevents.m`.
- **Later commits** on GitHub: Tristan Stenner (2016) and Felix Kalbe (2018).

**What Ledalab implements** (official README and repo, `https://github.com/ledalab/ledalab`, cloned):
- **Language:** MATLAB, with a GUI and a batch mode.
- **Analysis methods:**
  - **CDA**, Continuous Decomposition Analysis (Benedek & Kaernbach 2010, JNM).
  - **DDA**, Discrete Decomposition Analysis by nonnegative deconvolution (Benedek & Kaernbach 2010, Psychophysiology).
- **Trough-to-peak:** `analyze/trough2peak_analysis.m`.
- **Artifacts:**
  - `preprocessing/artifact_detect.m` flags samples where the scaled second derivative of the smoothed SC exceeds a user threshold (`ckk_thresh`).
  - `preprocessing/artifact_interp.m` is GUI-based correction: you drag a box around the artifact and choose linear, spline or cubic interpolation, with a 1-s pre/post period.
- **Other preprocessing:** adaptive smoothing, filtering, downsampling.
- **Imports:** BioPac, Biotrace, VarioPort, VisionAnalyzer and others. Event-related export.

**Licence:** README: "is licensed under the GNU General Public License" (no version stated in the README).

**Status:**
- `Ledalab.m`: `version = 3.49` (V3.4.9), `version_datestr = '2016-04-18'`.
- Last commit 2018-09-12 ("Removed the sampling rate from the divisor of the CDA.SCR calculation").
- So it is effectively unmaintained since 2018, but stable and widely cited.
- Also distributed on the MATLAB File Exchange (#68502) and ledalab.de; I did not open either page.

**Python options:**

| Package | Licence | What it implements | Assessment |
|---|---|---|---|
| **ledapy** (PyPI 1.2.1, 2020-04-10; `github.com/HIIT/ledapy`, Marco Filetti, Univ. Helsinki / Aalto) | **MIT** in the LICENSE file; the PyPI licence field is empty | Self-described "minimal port of Ledalab … for Python". **CDA only**: `runner.getResult(raw, 'phasicdata' or 'phasicdriver', fs, downsample, optimisation)` calls `deconvolution.sdeco`, i.e. Ledalab's continuous deconvolution. No DDA, no event-related export, no artifact tools, no GUI. | Ships .mat files so you can compare against Ledalab yourself. I found **no published validation** that the outputs match Ledalab. Unmaintained since 2020. It predates or ignores the 2018 Ledalab CDA.SCR fix (unverified which). **Licence caveat:** a port of GPL code released under MIT is legally questionable; treat it as GPL to be safe. |
| **PyLedalab** (`github.com/veeturisuparna/PyLedalab`) | None | Fork-style "improved port" of ledapy | 0 stars; not assessed. |
| **pyphysio** (PyPI 4.10.0, Bizzego) | GPL | `DriverEstim`: deconvolution with a Bateman IRF, defaults t1 = 0.96 and t2 = 3.76 ("average value found in Benedek and Kaernbach, 2010"); also `PhasicEstim` | CDA-like but **not a faithful CDA port**: no Ledalab optimisation of tau, a different tonic estimation, and the docstring's citation is a TODO. |
| **NeuroKit2** | MIT | No CDA (see A10) | cvxEDA or sparsEDA are the closest maintained deconvolution-type alternatives. |
| **PsPM** (MATLAB, Bach lab) | — | Model-based SCR analysis | The PyPI package named `pspm` (codeberg Jahn16) is unrelated. |

---

## Part C — further methods suited to outdoor cycling (wrist EDA at 15 Hz plus IMU)

| # | Method / citation | DOI / URL | What it does | Code / licence | Offline Python at 15 Hz | Status |
|---|---|---|---|---|---|---|
| C1 | **Hossain MB, Posada-Quintero HF, Kong Y, McNaboe R, Chon KH (2022).** Automatic motion artifact detection in electrodermal activity data using machine learning. *Biomed Signal Process Control* 74:103483. | 10.1016/j.bspc.2022.103483 | Statistical, model-based and time-frequency features with ML classifiers; leave-one-subject-out validation on 20 subjects. Best model 94.7% accuracy. Beat two earlier published methods (names not seen; search summaries suggest Kleckner/EDAQA and possibly Taylor). Precursor: arXiv 2107.07650 (EMBC 2021, 10 subjects, 83.85%). | Code not found | Re-implementable with scipy/sklearn; needs labelled data. | partially verified |
| C2 | **Llanes-Jurado J, Carrasco-Ribelles LA, Alcañiz M, Soria-Olivas E, Marín-Morales J (2023).** Automatic artifact recognition and correction for EDA based on LSTM-CNN models. *Expert Syst Appl* 230:120581. | 10.1016/j.eswa.2023.120581 | LSTM–1D-CNN that both **detects and corrects** (reconstructs) artifacts. Trained on the public EDABE dataset (33 subjects, 56.27 h train; 10 subjects, 18.19 h test). Reported to recognise 72% of artifacts at 88% accuracy (figures from a citing summary). | `github.com/ASAPLableni/EDABE_LSTM_1DCNN` (cloned): **CC BY-NC-SA 4.0** (non-commercial). Pre-trained model plus notebook. Dataset on Mendeley Data (w8fxrg4pv5). | Feasible (TensorFlow/Keras). Must resample to the model's training rate; domain shift to cycling is likely. | partially verified |
| C3 | **Zhang Y, Haghdan M, Xu KS (2017).** Unsupervised motion artifact detection in wrist-measured electrodermal activity data. ISWC 2017. | arXiv 1707.08287 | Haar-wavelet and statistical features per window; unsupervised detectors trained mostly on clean data perform comparably to supervised ones (lab data plus about 23 h real-world). **Adding accelerometer features helped supervised methods only slightly and degraded unsupervised accuracy.** | Not found | Very feasible (sklearn); needs no labels. | verified (via search summary) |
| C4 | **sparsEDA: Hernando-Gallego F, Luengo D, Artés-Rodríguez A (2018).** Feature extraction of galvanic skin responses by non-negative sparse deconvolution. *IEEE J Biomed Health Inform* 22(5):1385–1394. | 10.1109/JBHI.2017.2780252 | Sparse non-negative deconvolution gives SCR impulses and tonic. Validated on 100 signals at 4–128 Hz (repo README). | MATLAB `github.com/fhernandogallego/sparsEDA`: README says MIT, **but there is no LICENSE file**. Python port `github.com/yskong224/SparsEDA-python` (UConn): **no licence file**; "resample to ~8 Hz". Also inside NeuroKit2 (`method="sparse"`, flagged experimental). | Feasible after resampling to 8 Hz. | verified (code primary) |
| C5 | **EDASymp / TVSymp: Posada-Quintero HF et al. (2016).** (a) Power spectral density analysis of EDA for sympathetic function assessment. *Ann Biomed Eng* 44(10):3124–3135. (b) Highly sensitive index of sympathetic activity based on time-frequency spectral analysis of EDA. *Am J Physiol Regul Integr Comp Physiol* 311(3):R582–R591. **Plus, highly relevant to cycling:** Posada-Quintero HF et al. (2018). Time-varying analysis of electrodermal activity during exercise. *PLoS ONE* 13(6):e0198328. | (a) 10.1007/s10439-016-1606-6; (b) 10.1152/ajpregu.00180.2016; (c) 10.1371/journal.pone.0198328 | Spectral power of EDA in the 0.045–0.25 Hz band (EDASymp) or a time-varying 0.08–0.24 Hz band (TVSymp, from VFCDM). Less sensitive to individual SCR detection. **2018:** during exercise the band's upper bound shifts upward (about 0.28 Hz for prolonged low intensity, about 0.37 Hz for vigorous exercise; 18 subjects walking/running), so band limits should be widened during exertion. | EDASymp is in NeuroKit2 `eda_sympathetic(method="posada")` (MIT; resamples, needs at least 64 s). TVSymp/VFCDM: no official Python code found. | EDASymp: easy. TVSymp: needs a VFCDM implementation. | verified (via search summary); NK2 code primary |
| C6 | **Chen W, Jaques N, Taylor S, Sano A, Fedor S, Picard RW (2015).** Wavelet-based motion artifact removal for electrodermal activity. *IEEE EMBC* 2015:6223–6226. | 10.1109/EMBC.2015.7319814 | Stationary wavelet transform. Coefficients are modelled as a Gaussian mixture (SCL vs SCR); adaptive per-window, per-level thresholds remove artifacts while preserving clean data. Outperformed three earlier methods. | Not in the EDA Explorer repo; no official code found. | Feasible with PyWavelets (`swt`) plus a hand-written GMM threshold. | verified (via search summary) |
| C7 | **Kong Y, Hossain MB, Peitzsch A, Posada-Quintero HF, Chon KH (2024).** Automatic motion artifact detection in EDA signals using 1D U-net architecture. *Comput Biol Med* 182:109139. | 10.1016/j.compbiomed.2024.109139; PMID 39270456 | Sample-wise artifact segmentation with a 1D U-Net. A 2024 summary reports balanced accuracy of about 75–80% on test sets, outperforming 4 of 5 recent methods. | ResearchGate states code is open source, but I found no link. | Feasible if the code is obtained. | partially verified |
| C8 | **Kelsey M, Akcakaya M, Kleckner IR, Palumbo RV, Barrett LF, Quigley KS, Goodwin MS (2018).** Applications of sparse recovery and dictionary learning to enhance analysis of ambulatory EDA data. *Biomed Signal Process Control* 40:58–70. | 10.1016/j.bspc.2017.08.024 | Curve fitting and orthogonal matching pursuit with SCR/artifact dictionaries to detect SCRs and artifacts (69% of expert-labelled SCRs detected). Same group as Kleckner. | Not found | Moderate effort. | partially verified (Goodwin authorship unconfirmed) |
| C9 | **Hossain MB et al. (about 2022).** A deep convolutional autoencoder for automatic motion artifact removal in EDA (signals: a preliminary study). *IEEE Trans Biomed Eng.* | 10.1109/TBME.2022.3174509 (DOI from a search link; title wording unconfirmed) | Denoising autoencoder for MA *removal*. | Not found | — | unverified |
| C10 | **EmotiBit validation** | See the next three rows | | | | |
| | (a) Montgomery SM, Nair N, Chen P, Dikker S (2023). Introducing EmotiBit, an open-source multi-modal sensor for measuring research-grade physiological signals. *Science Talks* (Elsevier). | sciencedirect.com/science/article/pii/S2772569323000567 | Platform description: EDA, PPG, temperature, 9-axis IMU. | — | — | verified (via search summary) |
| | (b) Montgomery SM et al. (2024). Validating EmotiBit… *Measurement: Sensors* 32:101075. | DOAJ record | Comparison against Brain Products devices; "high degree of similarity" (vendor-affiliated authors). | — | — | partially verified |
| | (c) **Independent:** Langevin et al. (2021), SciTePress (DOI 10.5220/0010640300003059), against FlexComp Infiniti; and **Vorreuther A, Tagalidou N, Vukelić M (2025)**, *Front Neuroergon* (10.3389/fnrgo.2025.1585469; PMC12213893), against BITalino PsychoBit, 15 participants under workload. | as listed | Both found heart rate OK but **EDA agreement insufficient**: Langevin for SCL, SCR amplitude and SCR count; Vorreuther for SCL and SCR number and amplitude. | — | — | verified (via search summary) |
| | **EmotiBit EDA format (primary, `github.com/EmotiBit/EmotiBit_Docs`):** EDA stream "EA", `nominal_srate: 15`, units microsiemens, on-board low-pass "15.91Hz". Temperature in the example metadata is 7 Hz. T1 is "Temperature via the PPG sensor"; TH (thermopile) exists on EmotiBit MD only. | | | | | verified (primary) |

**Other items found:**
- **EDABE dataset (with C2):** the only large public, labelled ambulatory EDA artifact dataset found that is usable for training or benchmarking.
- **EDArtifact labelling guidelines PDF (Gashi):** in the repo; useful as the protocol for OutLab's own human labelling, and for computing κ against the automatic rules.
- **Böttcher-style per-window quality score (A6):** a cheap complement to Kleckner.
- **Possible 2026 review "Electrodermal activity measurements: a review of artifacts" (PMID 42269681):** appeared in one search listing, but the title, authors and journal could not be confirmed. **unverified.**

**Suggested use for OutLab:** Kleckner rules → IMU-aware flags → optional EDA Explorer/Zhang classifiers → spectral indices robust to SCR mis-detection, validated by κ against human labels. Details:
1. **Rule-based baseline:** Kleckner rules, with a device-specific ceiling and the temperature rule optional or re-tuned, applied at 15 Hz with ±5 s spreading.
2. **IMU context:** add flags from accelerometer/gyro jerk. Note that Zhang 2017 found the accelerometer adds little to classifiers, so use it as context and to explain artifacts, not as the sole detector.
3. **Optional classifiers:** EDA Explorer (MIT) after resampling to 8 Hz, or a Zhang-style unsupervised detector.
4. **Robust indices:** report EDASymp/TVSymp alongside SCR counts, with the band widened during exertion per Posada-Quintero 2018.
5. **Validation:** check against human labels from stimulated-recall sessions using Cohen's κ.
