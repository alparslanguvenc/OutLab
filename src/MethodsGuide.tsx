import type { KeyboardEvent, ReactNode } from "react";
import { t, useLang } from "./i18n";
import type { GuideSection } from "./OptionalMethods";
import scienceSources from "../docs/SOURCES.json";

/* ------------------------------------------------------------------ shared pieces */

type GuideSource = { id: string; title: string; url: string };
const SOURCE_LIST = (scienceSources as unknown as { sources: GuideSource[] })
  .sources;

const SECTIONS: GuideSection[] = [
  "core",
  "quality",
  "motion",
  "annotation",
  "robustness",
  "ledalab",
];

const tabLabel = (s: GuideSection) =>
  ({
    core: t("Temel analiz", "Core analysis"),
    quality: t("Kalite kuralları", "Quality rules"),
    motion: t("Pencere tabanlı hareket", "Window-based motion"),
    annotation: t("Elle etiketleme ve uyum", "Manual labelling and agreement"),
    robustness: t("Çoklu yöntem sağlamlığı", "Multi-method robustness"),
    ledalab: t("Ledalab ve diğer yöntemler", "Ledalab and other methods"),
  })[s];

/** The seven fixed headings every section uses, in this order. */
const headings = () => ({
  what: t("Ne yapar?", "What it does"),
  why: t("Neden gerekli?", "Why it matters"),
  how: t("Nasıl hesaplanır?", "How it is computed"),
  use: t("OutLab'da nasıl kullanılır?", "Using it in OutLab"),
  limits: t("Sınırlamalar", "Limitations"),
  report: t("Tezde nasıl raporlanır?", "How to report it"),
  sources: t("Kaynaklar", "Sources"),
});

type ParamRow = [string, string, string, string];

function ParamTable({
  rows,
  head,
}: {
  rows: ParamRow[];
  head?: [string, string, string, string];
}) {
  useLang();
  const columns = head ?? [
    t("Ayar (formdaki adı)", "Setting (as in the form)"),
    t("Varsayılan", "Default"),
    t("İzin verilen aralık", "Allowed range"),
    t("Varsayılanın kaynağı", "Where the default comes from"),
  ];
  return (
    <div className="table-wrap">
      <table className="guide-params">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, i) => (
                <td key={i}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Source list: id + short citation, linked to the entry in docs/SOURCES.json. */
function Sources({ items }: { items: [string, string][] }) {
  useLang();
  return (
    <ul className="guide-sources">
      {items.map(([id, citation]) => {
        const source = SOURCE_LIST.find((s) => s.id === id);
        return (
          <li key={id}>
            <b>{id}</b> {citation}
            {source && (
              <>
                {": "}
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const rangeNote = () =>
  t(
    "Formdaki giriş kutuları daha dar bir aralık önerebilir; tabloda sunucunun kabul ettiği sınırlar yer alır.",
    "The input boxes in the form may suggest a narrower range; the table lists the limits the server accepts.",
  );

/* ------------------------------------------------------------------ main component */

export function MethodsGuide({
  section,
  onSection,
}: {
  section: GuideSection;
  onSection: (s: GuideSection) => void;
}) {
  useLang();
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = SECTIONS.indexOf(section);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % SECTIONS.length;
    else if (e.key === "ArrowLeft")
      next = (i - 1 + SECTIONS.length) % SECTIONS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = SECTIONS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onSection(SECTIONS[next]);
    document.getElementById(`guide-tab-${SECTIONS[next]}`)?.focus();
  };
  const body: Record<GuideSection, ReactNode> = {
    core: <CoreSection />,
    quality: <QualitySection />,
    motion: <MotionSection />,
    annotation: <AnnotationSection />,
    robustness: <RobustnessSection />,
    ledalab: <LedalabSection />,
  };
  return (
    <div className="methods-guide">
      <div
        className="guide-tabs"
        role="tablist"
        aria-label={t("Yöntem rehberi bölümleri", "Methods guide sections")}
        onKeyDown={onKey}
      >
        {SECTIONS.map((s) => (
          <button
            key={s}
            id={`guide-tab-${s}`}
            type="button"
            role="tab"
            className="guide-tab"
            aria-selected={s === section}
            aria-controls="guide-panel"
            tabIndex={s === section ? 0 : -1}
            onClick={() => onSection(s)}
          >
            {tabLabel(s)}
          </button>
        ))}
      </div>
      <article
        className="guide-section"
        id="guide-panel"
        role="tabpanel"
        aria-labelledby={`guide-tab-${section}`}
      >
        {body[section]}
      </article>
    </div>
  );
}

/* ------------------------------------------------------------------ core */

function CoreSection() {
  useLang();
  const h = headings();
  return (
    <>
      <h2>
        {t(
          "Temel analiz: açıklanabilir aday taraması",
          "Core analysis: explainable candidate screening",
        )}
      </h2>

      <h3>{h.what}</h3>
      <p>
        {t(
          "Ham EDA'yı (EA kanalı, µS) kayıt boşluklarında kesitlere ayırır, her kesiti NeuroKit2 ile temizler ve tonik (yavaş düzey) ile fazik (hızlı değişim) bileşenlere ayırır. Ardından fazik bileşende, sizin seçtiğiniz karşılaştırma aralığına göre olağandışı yüksek kalan yerel tepeleri “aday” olarak listeler. Adaylar, stimulated recall görüşmesinde katılımcıyla konuşulacak anları seçmeye yarar. Aynı anda ivme bileşkesinin değişim hızı bir eşiği aşıyorsa aday hareket açısından işaretlenir.",
          "It splits raw EDA (the EA channel, in µS) into segments at recording gaps, cleans each segment with NeuroKit2 and separates it into a tonic (slow level) and a phasic (fast change) component. It then lists local peaks in the phasic component that are unusually high relative to a reference interval you choose. These “candidates” help you pick moments to discuss with the participant in the stimulated-recall interview. If the rate of change of acceleration magnitude exceeds a threshold at the same moment, the candidate is flagged for motion.",
        )}
      </p>
      <blockquote>
        {t(
          "Adaylar doğrulanmış SCR (deri iletkenliği yanıtı) değildir. Aday sayısı SCR sıklığı, aday yüksekliği de onset-to-peak SCR genliği olarak raporlanamaz.",
          "Candidates are not validated SCRs (skin conductance responses). The number of candidates cannot be reported as SCR frequency, and their height cannot be reported as onset-to-peak SCR amplitude.",
        )}
      </blockquote>

      <h3>{h.why}</h3>
      <p>
        {t(
          "Bisiklette bilekteki ya da koldaki EDA sensörü sürekli yol titreşimi, gidon tutuşu ve kol hareketiyle değişen basınç altındadır. Efor ve sıcak hava terlemeyi artırır ve tonik düzeyi sürüş boyunca kaydırır. Bu yüzden sabit bir µS eşiği oturumlar ve katılımcılar arasında aynı anlama gelmez. Robust z puanı, aynı oturumun sizin seçtiğiniz bir bölümüne göre ölçekler; medyan ve MAD birkaç uç değerden fazla etkilenmez. Bluetooth veya kart kopmalarıyla oluşan boşlukların üzerinden filtre uygulamak sahte sıçramalar üreteceği için her kesit ayrı işlenir.",
          "On a bike, a wrist or arm EDA sensor is under constant road vibration and under pressure that changes with grip and arm movement. Effort and warm weather increase sweating and shift the tonic level during the ride. A fixed µS threshold therefore means different things across sessions and participants. The robust z-score scales the signal against a section of the same session that you choose, and the median and MAD are little affected by a few extreme values. Filtering across gaps caused by Bluetooth or card dropouts would create false jumps, so each segment is processed separately.",
        )}
      </p>

      <h3>{h.how}</h3>
      <ol>
        <li>
          {t(
            "Girdi denetimi: tam olarak bir EA kanalı; birim µS olmalıdır (otomatik dönüştürme yapılmaz); en az 50 örnek; medyan zaman farkından hesaplanan örnekleme hızı 7–2000 Hz; toplamda en fazla 1.500.000 sensör örneği.",
            "Input checks: exactly one EA channel; the unit must be µS (no automatic conversion); at least 50 samples; a sampling rate, estimated from the median time difference, of 7–2000 Hz; at most 1,500,000 sensor samples in total.",
          )}
        </li>
        <li>
          {t("Kesitleme: boşluk sınırı ", "Segmentation: the gap limit is ")}
          <code>
            {t("max(3 × medyan Δt, 0,25 s)", "max(3 × median Δt, 0.25 s)")}
          </code>
          {t(
            " (15 Hz'de 0,25 s). Bundan uzun boşluklar ve negatif ölçümler kesiti böler. 10 s'den veya 50 örnekten kısa kesitler işlenmez: ham değerler korunur, türetilmiş değerler boş kalır.",
            " (0.25 s at 15 Hz). Longer gaps and negative readings split the segment. Segments shorter than 10 s or 50 samples are not processed: raw values are kept and derived values stay empty.",
          )}
        </li>
        <li>
          {t(
            "Yeniden örnekleme: her kesit, kendi medyan örnek aralığıyla düzenli bir ızgaraya doğrusal interpolasyonla taşınır. Boşluklar köprülenmez, kesit dışına uzatma yapılmaz.",
            "Resampling: each segment is moved onto a regular grid at its own median sample interval by linear interpolation. Gaps are not bridged and nothing is extrapolated beyond the segment.",
          )}
        </li>
        <li>
          {t("Temizleme: ", "Cleaning: ")}
          <code>nk.eda_clean(method="neurokit")</code>
          {t(
            ", yani 3 Hz kesimli, 4. dereceden Butterworth alçak geçiren filtre.",
            ", a 4th-order Butterworth low-pass filter with a 3 Hz cutoff.",
          )}
        </li>
        <li>
          {t("Ayrıştırma: ", "Decomposition: ")}
          <code>nk.eda_phasic(method="highpass", cutoff=0.05)</code>
          {t(
            ". 0,05 Hz Butterworth yüksek geçiren filtre fazik, aynı kesimli alçak geçiren filtre tonik bileşeni verir (çalıştırma kaydında derece 2 olarak yazılır).",
            ". A 0.05 Hz Butterworth high-pass filter gives the phasic component and a low-pass filter at the same cutoff gives the tonic component (the run record lists order 2).",
          )}
        </li>
        <li>
          {t(
            "Sonuçlar özgün örnek zamanlarına geri interpolasyonla taşınır. Her kesitin ilk ve son 3 s'si hem aday aramasına hem karşılaştırma aralığına kapalıdır (filtre uç etkileri).",
            "Results are interpolated back to the original sample times. The first and last 3 s of each segment are closed to both the candidate search and the reference interval (filter edge effects).",
          )}
        </li>
        <li>
          {t(
            "Karşılaştırma aralığı: en az 10 s uzunlukta ve kayıt içinde olmalıdır. Uçlar ve boşluklar çıkarıldıktan sonra en az 50 geçerli fazik örnek, en az 10 s yayılım ve beklenen örnek sayısının (süre × örnekleme hızı) en az %80'i gerekir. MAD ≤ 10⁻⁹ µS ise analiz durur.",
            "Reference interval: it must be at least 10 s long and inside the recording. After edges and gaps are removed it needs at least 50 valid phasic samples, a span of at least 10 s and at least 80% of the expected number of samples (duration × sampling rate). If MAD ≤ 10⁻⁹ µS the analysis stops.",
          )}
        </li>
        <li>
          {t("Skor: ", "Score: ")}
          <code>
            {t(
              "z = 0,6745 · (fazik − medyan) / MAD",
              "z = 0.6745 · (phasic − median) / MAD",
            )}
          </code>
          {t(
            ". Sabit tam olarak 0,6744897501960817'dir; medyan ve MAD (medyandan mutlak sapmaların medyanı) karşılaştırma aralığındaki fazik değerlerden hesaplanır.",
            ". The constant is exactly 0.6744897501960817; the median and the MAD (median absolute deviation from the median) come from the phasic values in the reference interval.",
          )}
        </li>
        <li>
          {t(
            "Aday seçimi: her kesitin geçerli örneklerinde ",
            "Candidate selection: in the valid samples of each segment, ",
          )}
          <code>scipy.signal.find_peaks</code>
          {t(
            " ile yüksekliği en az “Aday eşiği (robust z)” olan yerel tepeler bulunur; fazik değer pozitif olmalıdır. Tepeler skora göre büyükten küçüğe sıralanır ve “Adaylar arası en az süre” örnek indeksiyle değil saniyeyle uygulanır: daha güçlü bir adaya bu süreden yakın olanlar atılır.",
            " finds local peaks whose height is at least the “Candidate threshold (robust z)”; the phasic value must be positive. Peaks are sorted from the highest score down, and the “Minimum time between candidates” is applied in seconds, not sample indices: peaks closer than this to a stronger candidate are dropped.",
          )}
        </li>
        <li>
          {t("Hareket işareti: ", "Motion flag: ")}
          <code>|d√(AX² + AY² + AZ²) / dt|</code>
          {t(
            " (g/s). m/s² kayıtları 9,80665'e bölünerek g'ye çevrilir; AY ve AZ, AX zamanlarına hizalanır; boşluk üzerindeki türevler boş bırakılır. Değer EDA zamanlarına interpolasyonla taşınır ve “İvme değişimi eşiği”ni aşan örnekler işaretlenir. Hareket verisi olmayan örneklerin durumu “bilinmiyor”dur, temiz sayılmaz; işaretli yüzde tüm EDA örneklerine bölünerek hesaplanır.",
            " (g/s). Recordings in m/s² are divided by 9.80665 to give g; AY and AZ are aligned to the AX times; derivatives across gaps are left empty. The value is interpolated to the EDA times and samples above the “Acceleration change threshold” are flagged. Samples without motion data are “unknown”, not clean; the flagged percentage is computed over all EDA samples.",
          )}
        </li>
      </ol>
      <ParamTable
        rows={[
          [
            t(
              "Karşılaştırma aralığı: Başlangıç (s) / Bitiş (s)",
              "Reference interval: Start (s) / End (s)",
            ),
            "10 / 70",
            t(
              "Başlangıç ≥ 0; uzunluk ≥ 10 s; kayıt içinde",
              "Start ≥ 0; length ≥ 10 s; inside the recording",
            ),
            t(
              "OutLab başlangıç değeri; her oturum için araştırmacı seçer",
              "OutLab starting value; the researcher chooses per session",
            ),
          ],
          [
            t("Aday eşiği (robust z)", "Candidate threshold (robust z)"),
            "3",
            "0,5–50",
            t(
              "OutLab başlangıç değeri; keşif amaçlı hassasiyet ayarı",
              "OutLab starting value; an exploratory sensitivity setting",
            ),
          ],
          [
            t(
              "Adaylar arası en az süre (s)",
              "Minimum time between candidates (s)",
            ),
            "20",
            t("0,1–3600", "0.1–3600"),
            t(
              "OutLab başlangıç değeri; görüşmede birbirine çok yakın anları azaltır",
              "OutLab starting value; reduces moments that lie very close together in the interview",
            ),
          ],
          [
            t(
              "İvme değişimi eşiği (g/s)",
              "Acceleration change threshold (g/s)",
            ),
            "3",
            t("0'dan büyük, en çok 1000", "above 0, at most 1000"),
            t(
              "OutLab başlangıç değeri; doğrulanmamış tarama sezgisi",
              "OutLab starting value; an unvalidated screening heuristic",
            ),
          ],
          [
            t(
              "Temizleme filtresi (formda yok)",
              "Cleaning filter (not in the form)",
            ),
            t("3 Hz, 4. derece", "3 Hz, 4th order"),
            t("sabit", "fixed"),
            t("NeuroKit2 varsayılanı (S12)", "NeuroKit2 default (S12)"),
          ],
          [
            t(
              "Ayrıştırma kesimi (formda yok)",
              "Decomposition cutoff (not in the form)",
            ),
            "0,05 Hz",
            t("sabit", "fixed"),
            t("NeuroKit2 varsayılanı (S11)", "NeuroKit2 default (S11)"),
          ],
          [
            t(
              "Uç dışlama, en kısa kesit, kapsam (formda yok)",
              "Edge exclusion, shortest segment, coverage (not in the form)",
            ),
            t("3 s; 10 s / 50 örnek; %80", "3 s; 10 s / 50 samples; 80%"),
            t("sabit", "fixed"),
            t("OutLab kararı", "OutLab decision"),
          ],
        ]}
      />
      <p>
        <small>{rangeNote()}</small>
      </p>

      <h3>{h.use}</h3>
      <ol>
        <li>
          {t(
            "Veri & kalite sekmesinde EmotiBit DataParser'ın kanal CSV'lerini ve bilgi JSON'unu ekleyin. EA kanalının birimi µS olmalı; hareket işareti için AX, AY ve AZ kanallarının her biri bir kez bulunmalı.",
            "On the Data & quality tab, add the channel CSV files from EmotiBit DataParser and the info JSON. The EA channel must be in µS; for the motion flag, AX, AY and AZ must each be present once.",
          )}
        </li>
        <li>
          {t(
            "Zaman eşleme sekmesinde videoyu ve GPX'i sensör zaman eksenine hizalayın; adayları videoda doğru yerde görmek buna bağlıdır.",
            "On the Time sync tab, align the video and the GPX to the sensor time axis; seeing candidates at the right place in the video depends on this.",
          )}
        </li>
        <li>
          {t(
            "Analiz ayarları → “1. Karşılaştırma aralığı”: grafikte boşluksuz, kaliteli ve bağlamını bildiğiniz bir bölüm seçin. Dinlenme olması gerekmez, ama tüm skorlar bu bölüme göre okunur.",
            "Analysis settings → “1. Reference interval”: on the chart, choose a gap-free, good-quality section whose context you know. It does not have to be rest, but every score is read relative to it.",
          )}
        </li>
        <li>
          {t(
            "“2. Açıklanabilir aday taraması”nda eşikleri girin ve “Analizi çalıştır”a basın.",
            "Under “2. Explainable candidate screening”, enter the thresholds and press “Run analysis”.",
          )}
        </li>
        <li>
          {t(
            "Çalışma alanında adayları videoyla birlikte inceleyin. Hareket işaretli adayları görüntüde kontrol edin ve görüşmede konuşulacak anları seçin.",
            "Review the candidates with the video in the workspace. Check motion-flagged candidates in the footage and select the moments to discuss in the interview.",
          )}
        </li>
        <li>
          {t(
            "“Çalıştırma kaydı” ve dışa aktarılan proje paketi; tüm parametreleri, NeuroKit2, NumPy ve SciPy sürümlerini ve kaynak dosyaların SHA-256 değerlerini saklar. Tezde bu sürümleri kullanın.",
            "The “Run record” and the exported project package store every parameter, the NeuroKit2, NumPy and SciPy versions and the SHA-256 of the source files. Use these versions in the thesis.",
          )}
        </li>
      </ol>

      <h3>{h.limits}</h3>
      <ul>
        <li>
          {t(
            "Robust z bir tarama ölçüsüdür, p değeri veya klinik eşik değildir. Skor tamamen karşılaştırma aralığına bağlıdır: çok sakin bir aralık seçerseniz MAD küçülür ve aday sayısı artar; başka bir aralık başka adaylar verir.",
            "Robust z is a screening measure, not a p-value or a clinical cut-off. The score depends entirely on the reference interval: a very calm interval gives a small MAD and more candidates; another interval gives other candidates.",
          )}
        </li>
        <li>
          {t(
            "0,05 Hz yüksek geçiren filtre tepkilerin şeklini değiştirir. Fazik tepe yüksekliği bir SCR genliği değildir ve laboratuvar çalışmalarındaki SCR değerleriyle karşılaştırılamaz.",
            "The 0.05 Hz high-pass filter changes the shape of responses. A phasic peak height is not an SCR amplitude and cannot be compared with SCR values from laboratory studies.",
          )}
        </li>
        <li>
          {t(
            "3 s uç dışlama bütün uç etkilerini gidermez; kısa kesitlerdeki adayları ham izle doğrulayın.",
            "The 3 s edge exclusion does not remove every edge effect; verify candidates from short segments against the raw trace.",
          )}
        </li>
        <li>
          {t(
            "Türev tabanlı hareket eşiği sabittir. Pürüzlü yolda titreşim türevi sürekli yüksek tutabilir, düz asfaltta neredeyse hiç işaret çıkmayabilir. Oturuma göre uyarlanan bir eşik için “Pencere tabanlı hareket”e bakın.",
            "The derivative-based motion threshold is fixed. On a rough road vibration can keep the derivative high all the time, while on smooth asphalt almost nothing may be flagged. For a threshold that adapts to the session, see “Window-based motion”.",
          )}
        </li>
        <li>
          {t(
            "EDA sempatik uyarılmayla ilişkilidir; duygunun türünü ya da olumlu/olumsuz yönünü tek başına göstermez. Bisiklette efor ve ısıya bağlı terleme de fazik bileşeni etkileyebilir.",
            "EDA is associated with sympathetic arousal; on its own it does not show the type of emotion or whether it is positive or negative. During cycling, sweating from effort and heat can also affect the phasic component.",
          )}
        </li>
        <li>
          {t(
            "Bağımsız karşılaştırmalarda EmotiBit'in EDA ölçümleri referans cihazlarla yetersiz uyum göstermiştir (S30, S31). Bu iş akışı bir bütün olarak doğrulanmamıştır; sonuçlar keşif amaçlıdır.",
            "In independent comparisons, EmotiBit's EDA measurements agreed poorly with reference devices (S30, S31). This workflow as a whole has not been validated; results are exploratory.",
          )}
        </li>
      </ul>

      <h3>{h.report}</h3>
      <blockquote>
        {t(
          "EDA verisi (EmotiBit, EA kanalı, yaklaşık 15 Hz, µS) OutLab v1.2 ve NeuroKit2 [sürüm] ile keşif amacıyla işlendi. Kayıt, medyan örnek aralığının üç katından (en az 0,25 s) uzun boşluklarda ve negatif ölçümlerde kesitlere ayrıldı; 10 s'den kısa kesitler analiz dışında bırakıldı. Her kesit kendi medyan örnek aralığında doğrusal olarak yeniden örneklendi, 3 Hz kesimli 4. dereceden Butterworth alçak geçiren filtreyle temizlendi ve 0,05 Hz yüksek geçiren filtreyle tonik ve fazik bileşenlere ayrıldı. Fazik bileşen, aynı oturumun [a–b] s aralığındaki medyan ve MAD kullanılarak robust z puanına dönüştürüldü (z = 0,6745 × (x − medyan) / MAD). z ≥ [3] olan pozitif yerel tepeler, aralarında en az [20] s kalacak biçimde görüşme adayı olarak seçildi; kesit uçlarındaki 3 s dışlandı. İvme bileşkesinin değişim hızının [3] g/s'yi aştığı adaylar hareket açısından işaretlendi ve video ile incelendi. Adaylar doğrulanmış SCR olarak yorumlanmadı; SCR sayısı veya genliği raporlanmadı.",
          "EDA data (EmotiBit, EA channel, about 15 Hz, µS) were processed for exploratory purposes with OutLab v1.2 and NeuroKit2 [version]. The recording was split into segments at gaps longer than three times the median sample interval (at least 0.25 s) and at negative readings; segments shorter than 10 s were excluded. Each segment was linearly resampled at its own median sample interval, cleaned with a 4th-order Butterworth low-pass filter at 3 Hz and separated into tonic and phasic components with a 0.05 Hz high-pass filter. The phasic component was converted to a robust z-score using the median and MAD of the [a–b] s interval of the same session (z = 0.6745 × (x − median) / MAD). Positive local peaks with z ≥ [3] were selected as interview candidates, at least [20] s apart; the first and last 3 s of each segment were excluded. Candidates at which the rate of change of acceleration magnitude exceeded [3] g/s were flagged for motion and reviewed against the video. Candidates were not interpreted as validated SCRs, and no SCR count or amplitude is reported.",
        )}
      </blockquote>

      <h3>{h.sources}</h3>
      <Sources
        items={[
          [
            "S12",
            t(
              "NeuroKit2 eda_clean kaynak kodu",
              "NeuroKit2 eda_clean source code",
            ),
          ],
          [
            "S11",
            t(
              "NeuroKit2 eda_phasic kaynak kodu",
              "NeuroKit2 eda_phasic source code",
            ),
          ],
          ["S15", t("Makowski ve ark., 2021", "Makowski et al., 2021")],
          [
            "S10",
            t(
              "NIST/SEMATECH, değiştirilmiş z puanı",
              "NIST/SEMATECH, modified z-score",
            ),
          ],
          ["S07", t("Boucsein ve ark., 2012", "Boucsein et al., 2012")],
          ["S01", t("EmotiBit belgeleri", "EmotiBit documentation")],
          ["S30", t("Langevin ve ark., 2021", "Langevin et al., 2021")],
          ["S31", t("Vorreuther ve ark., 2025", "Vorreuther et al., 2025")],
        ]}
      />
    </>
  );
}

/* ------------------------------------------------------------------ quality */

function QualitySection() {
  useLang();
  const h = headings();
  return (
    <>
      <h2>
        {t(
          "Kalite kuralları (Kleckner ve ark., 2018)",
          "Quality rules (Kleckner et al., 2018)",
        )}
      </h2>

      <h3>{h.what}</h3>
      <p>
        {t(
          "Her EDA örneğini şeffaf eşiklerle tarar ve geçersiz bulduklarını bir neden koduyla işaretler: aralık dışı, ani eğim, sıcaklık, düz çizgi ve bunların çevresindeki geçiş payı. Oturumun kullanılabilir veri yüzdesini raporlar. İsterseniz geçersiz örnekleri karşılaştırma aralığından ve aday aramasından çıkarır. Ham veri hiçbir durumda silinmez.",
          "It screens every EDA sample with transparent thresholds and marks the invalid ones with a reason code: out of range, steep slope, temperature, flat line, and a transition margin around these. It reports the session's usable-data percentage. If you choose, it removes invalid samples from the reference interval and the candidate search. Raw data are never deleted.",
        )}
      </p>

      <h3>{h.why}</h3>
      <p>
        {t(
          "Açık havada elektrot teması kopabilir ve EDA tabana düşer; kol hareketi ya da gidona yaslanma basıncı ani sıçramalar yapar; soğukta veya sensör yeni takılmışken sinyal henüz oturmamıştır. Bu bölümlerin hangi kurala göre dışarıda kaldığını açıkça yazmak sonuçların tekrarlanabilmesi için gereklidir. Kleckner ve ark. (2018) kuralları basit ve şeffaf olduğu için yöntem bölümünde tek tek raporlanabilir.",
          "Outdoors, electrode contact can break and EDA drops to the floor; arm movement or leaning on the handlebar causes sudden jumps; in the cold, or right after the sensor is put on, the signal has not settled yet. Stating which rule excluded each section is necessary for the results to be reproducible. The Kleckner et al. (2018) rules are simple and transparent, so they can be reported one by one in the methods section.",
        )}
      </p>

      <h3>{h.how}</h3>
      <h4>{t("Yayımlanan kurallar", "The published rules")}</h4>
      <p>
        {t(
          "Kleckner ve ark. (2018, Tablo 1) dört kural tanımlar:",
          "Kleckner et al. (2018, Table 1) define four rules:",
        )}
      </p>
      <ol>
        <li>
          {t(
            "EDA 0,05–60 µS aralığı dışında. 0,05 µS kabul edilen en küçük SCR genliği olduğu için, 60 µS ise kullandıkları Q Sensor'ın üst sınırına yakın olduğu için seçilmiştir.",
            "EDA outside 0.05–60 µS. 0.05 µS was chosen as an accepted minimum SCR amplitude, and 60 µS because it is near the maximum of the Q Sensor they used.",
          )}
        </li>
        <li>
          {t(
            "EDA ±10 µS/s'den hızlı değişiyor (“sıçrama” artefaktları için).",
            "EDA changes faster than ±10 µS/s (for “jump” artifacts).",
          )}
        </li>
        <li>
          {t(
            "Sıcaklık 30–40 °C dışında (sensör takılı değil veya yeterince uzun süredir takılı değil).",
            "Temperature outside 30–40 °C (the sensor is not worn, or has not been worn long enough).",
          )}
        </li>
        <li>
          {t(
            "1–3. kurallara göre geçersiz verinin 5 s yakınındaki veri. Şekil 3'e göre geçersiz bölge 10 s genişliğe yayılır, yani her iki yana 5 s.",
            "Data within 5 s of data that are invalid by rules 1–3. According to Figure 3 the invalid region is widened to 10 s, that is 5 s on each side.",
          )}
        </li>
      </ol>
      <p>
        {t(
          "Yazarlar bu değerlerin donanıma, örnekleme ve bağlama göre değiştirilebileceğini ve araştırmacıların kuralları kendi cihazlarına göre ayarlaması gerektiğini açıkça yazar. Kurallar bir ön filtreden sonra uygulanır. Makalede bu, 0,35 Hz kesimli bir FIR alçak geçiren “despiking” filtresidir (32 Hz için tasarlanmış, 2.057 katsayılı). Yazarların 2019'dan beri güncellenen resmî EDAQA kodunda ise ön filtre filtfilt ile uygulanan bir hareketli ortalamadır; kod yorumu varsayılanı 2 s olarak verir, NaN filtreyi kapatır ve demo dosyası filtre kapalı (NaN) gelir.",
          "The authors state plainly that these values can be changed for different hardware, samples and contexts, and that researchers must tune the rules to their own device. The rules are applied after a pre-filter. In the paper this is a 0.35 Hz FIR low-pass “despiking” filter (designed for 32 Hz, 2,057 taps). In the authors' official EDAQA code, updated since 2019, the pre-filter is a moving average applied with filtfilt; the code comment gives 2 s as the default, NaN turns it off, and the demo file ships with the filter off (NaN).",
        )}
      </p>
      <p>
        {t(
          "Kendi verilerinde (otizmli 20 çocuk, Affectiva Q Sensor, bilek) otomatik yöntem uzman uzlaşısına karşı %91 duyarlılık, %99 özgüllük, %92 doğruluk ve κ = 0,739 göstermiştir; uzmanlar arası uyum %98, κ = 0,87'dir. Bu değerler o veriye aittir, bizim verimize taşınamaz.",
          "On their own data (20 children with autism, Affectiva Q Sensor, wrist), the automated procedure showed 91% sensitivity, 99% specificity, 92% accuracy and κ = 0.739 against expert consensus; inter-expert agreement was 98%, κ = 0.87. These figures belong to that dataset and do not carry over to ours.",
        )}
      </p>
      <h4>{t("OutLab'daki uygulama", "How OutLab implements them")}</h4>
      <ol>
        <li>
          {t(
            "Ön filtre: her boşluksuz parçada, genişliği round(Ön filtre × örnekleme hızı) örnek olan bir hareketli ortalama filtfilt ile ileri ve geri uygulanır (sıfır faz). 15 Hz ve 2 s'de genişlik 30 örnektir. OutLab kodun belgelenmiş 2 s varsayılanını izler; bunun sonucu olarak çok kısa sıçramalar yumuşar. Genişliğin üç katından kısa parçalarda filtre atlanır ve kurallar ham değere uygulanır. Süzülmüş kopya yalnızca aralık ve eğim kurallarında kullanılır.",
            "Pre-filter: in each gap-free part, a moving average of round(Pre-filter × sampling rate) samples is applied forwards and backwards with filtfilt (zero phase). At 15 Hz and 2 s the width is 30 samples. OutLab follows the code's documented 2 s default; as a consequence, very brief spikes are smoothed. In parts shorter than three times the width the filter is skipped and the rules use raw values. The filtered copy is used only for the range and slope rules.",
          )}
        </li>
        <li>
          {t("Aralık: ", "Range: ")}
          <code>
            {t(
              "x̃ < En düşük EDA  veya  x̃ > En yüksek EDA",
              "x̃ < Minimum EDA  or  x̃ > Maximum EDA",
            )}
          </code>
          {t(" (x̃: süzülmüş değer).", " (x̃: filtered value).")}
        </li>
        <li>
          {t(
            "Eğim, ardışık örnekler arasında: ",
            "Slope, between consecutive samples: ",
          )}
          <code>
            |x̃ᵢ₊₁ − x̃ᵢ| / (tᵢ₊₁ − tᵢ) {">"}{" "}
            {t("En büyük eğim", "Maximum slope")}
          </code>
          {t(
            ". İki örneğin ikisi de işaretlenir; boşluk sınırını aşan aralıklar test edilmez. 15 Hz'de 10 µS/s, ardışık iki örnek arasında 0,667 µS'den büyük bir sıçramaya karşılık gelir.",
            ". Both samples of the pair are marked; intervals longer than the gap limit are not tested. At 15 Hz, 10 µS/s corresponds to a jump of more than 0.667 µS between two consecutive samples.",
          )}
        </li>
        <li>
          {t(
            "Sıcaklık: yalnızca bir “Sıcaklık kanalı” seçildiyse ve kanalın birimi °C ise uygulanır. Sıcaklık EDA zamanlarına, boşluklar köprülenmeden interpolasyonla taşınır. Eşzamanlı sıcaklığı olmayan örnekler bu kurala göre geçersiz sayılmaz; kaç örnek olduğu bildirimlerde yazılır.",
            "Temperature: applied only if a “Temperature channel” is selected and its unit is °C. Temperature is interpolated to the EDA times without bridging gaps. Samples without a simultaneous temperature value are not marked invalid by this rule; their number is given in the notices.",
          )}
        </li>
        <li>
          {t(
            "Düz çizgi (OutLab sezgisi, Kleckner kurallarında yoktur): ham değerlerin en büyük ile en küçük farkının “Düz çizgi aralığı”nı aşmadığı, boşluksuz ve en az “Düz çizgi süresi” boyunca süren ardışık örnekler. Kopan elektrot temasını veya donmuş sensörü yakalamak içindir.",
            "Flat line (an OutLab heuristic, not part of the Kleckner rules): consecutive, gap-free samples whose raw max − min stays within the “Flat-line range” for at least the “Flat-line duration”. It is meant to catch lost electrode contact or a frozen sensor.",
          )}
        </li>
        <li>
          {t(
            "Geçiş payı: yukarıdaki kurallardan herhangi birine göre geçersiz her ardışık dizinin başından önceki ve sonundan sonraki “Geçiş payı” saniyesi (zamana göre) geçersiz sayılır. OutLab bu payı düz çizgi bölümlerinin çevresine de uygular.",
            "Transition margin: the “Transition margin” seconds (by time) before the start and after the end of every run of samples invalid by any rule above are also marked invalid. OutLab applies this margin around flat-line sections as well.",
          )}
        </li>
        <li>
          {t("Kullanılabilir veri: ", "Usable data: ")}
          <code>
            {t(
              "%kullanılabilir = 100 × (geçersiz olmayan örnek) / (tüm EDA örnekleri)",
              "usable % = 100 × (samples not invalid) / (all EDA samples)",
            )}
          </code>
          .
        </li>
        <li>
          {t(
            "Özet pencereler: kayıt 5 s'lik pencerelere bölünür; içinde tek bir geçersiz örnek bulunan pencere grafikte geçersiz bant olarak gösterilir. Bu yalnızca özet ve gösterim içindir; örnek düzeyindeki karar değişmez.",
            "Summary windows: the recording is divided into 5 s windows; a window that contains even one invalid sample is shown as an invalid band on the chart. This is only for the summary and display; the sample-level decision does not change.",
          )}
        </li>
        <li>
          {t(
            "“Yalnızca işaretle”: aday listesi değişmez, geçersiz örneğe denk gelen adaylar “Kalite: geçersiz” rozeti alır. “Karşılaştırma aralığından ve aday aramasından dışla”: geçersiz örnekler aday aramasından ve karşılaştırma aralığından çıkarılır. Bu, aralıktaki geçerli örnekleri azaltır; %80 kapsam, 10 s ya da 50 örnek koşulu artık sağlanmıyorsa analiz hata verir. O zaman başka bir aralık seçin ya da yalnızca işaretleyin.",
            "“Flag only”: the candidate list does not change, and candidates that fall on an invalid sample get a “Quality: invalid” badge. “Exclude from the reference interval and candidate search”: invalid samples are removed from both. This reduces the valid samples in the interval; if the 80% coverage, 10 s or 50-sample condition is no longer met, the analysis stops with an error. Then choose another interval, or flag only.",
          )}
        </li>
      </ol>
      <ParamTable
        rows={[
          [
            t("En düşük EDA (µS)", "Minimum EDA (µS)"),
            "0,05",
            t("0–100; en yüksekten küçük", "0–100; below the maximum"),
            t(
              "Kleckner ve ark. 2018, kural 1 (S13)",
              "Kleckner et al. 2018, rule 1 (S13)",
            ),
          ],
          [
            t("En yüksek EDA (µS)", "Maximum EDA (µS)"),
            "60",
            t("0'dan büyük, en çok 1000", "above 0, at most 1000"),
            t(
              "Kural 1; Q Sensor'a özgü üst sınır. EmotiBit'in kendi aralığına göre ayarlayın",
              "Rule 1; a Q Sensor ceiling. Set it to EmotiBit's own range",
            ),
          ],
          [
            t("En büyük eğim (µS/s)", "Maximum slope (µS/s)"),
            "10",
            t("0'dan büyük, en çok 1000", "above 0, at most 1000"),
            t(
              "Kural 2 (S13); ardışık örnekler arasında (S14)",
              "Rule 2 (S13); between consecutive samples (S14)",
            ),
          ],
          [
            t("Sıcaklık kanalı", "Temperature channel"),
            t("Kullanma", "Don't use"),
            t(
              "T0, T1 veya TH; birimi °C olmalı",
              "T0, T1 or TH; unit must be °C",
            ),
            t("OutLab", "OutLab"),
          ],
          [
            t(
              "En düşük / En yüksek sıcaklık (°C)",
              "Minimum / Maximum temperature (°C)",
            ),
            "30 / 40",
            t("−50–60; en düşük < en yüksek", "−50–60; minimum < maximum"),
            t("Kural 3 (S13)", "Rule 3 (S13)"),
          ],
          [
            t("Ön filtre (s)", "Pre-filter (s)"),
            "2",
            t("0–30; 0 kapatır", "0–30; 0 turns it off"),
            t(
              "EDAQA kodunun belgelenmiş varsayılanı (S14); makaledeki 0,35 Hz FIR değil",
              "The EDAQA code's documented default (S14); not the paper's 0.35 Hz FIR",
            ),
          ],
          [
            t("Geçiş payı (s)", "Transition margin (s)"),
            "5",
            "0–60",
            t(
              "Kural 4; her iki yana (S13, S14)",
              "Rule 4; on both sides (S13, S14)",
            ),
          ],
          [
            t("Düz çizgi süresi (s)", "Flat-line duration (s)"),
            "10",
            t("0–600; 0 kapatır", "0–600; 0 turns it off"),
            t(
              "OutLab sezgisi; doğrulanmadı",
              "OutLab heuristic; not validated",
            ),
          ],
          [
            t("Düz çizgi aralığı (µS)", "Flat-line range (µS)"),
            "0,001",
            "0–10",
            t(
              "OutLab sezgisi; doğrulanmadı",
              "OutLab heuristic; not validated",
            ),
          ],
          [
            t("Özet pencere (s)", "Summary window (s)"),
            "5",
            t("0,5–120", "0.5–120"),
            t(
              "OutLab; yalnızca özet ve grafik bandı",
              "OutLab; summary and chart band only",
            ),
          ],
          [
            t("Geçersiz veri", "Invalid data"),
            t("Yalnızca işaretle", "Flag only"),
            t("Yalnızca işaretle / Dışla", "Flag only / Exclude"),
            t("OutLab", "OutLab"),
          ],
        ]}
      />
      <p>
        <small>{rangeNote()}</small>
      </p>

      <h3>{h.use}</h3>
      <ol>
        <li>
          {t(
            "Analiz ayarları → “3. Ek artefakt ve güvenirlik yöntemleri” bölümünde “Kalite kuralları” kutusunu işaretleyin.",
            "In Analysis settings → “3. Additional artifact and reliability methods”, tick “Quality rules”.",
          )}
        </li>
        <li>
          {t(
            "Eşikleri girin. “En yüksek EDA”yı EmotiBit'in ölçüm aralığına göre ayarlayın. Sıcaklık kuralını kullanacaksanız T1'in deri sıcaklığı olmadığını unutmayın (aşağıya bakın).",
            "Enter the thresholds. Set “Maximum EDA” to EmotiBit's measurement range. If you use the temperature rule, remember that T1 is not skin temperature (see below).",
          )}
        </li>
        <li>
          {t(
            "Önce “Yalnızca işaretle” ile çalıştırın (“Analizi ek yöntemlerle çalıştır”). “Ek yöntem sonuçları”nda Kullanılabilir veri, Geçersiz örnek ve Nedenler (örnek) değerlerine bakın.",
            "Run first with “Flag only” (“Run analysis with additional methods”). In “Additional method results”, look at Usable data, Invalid samples and Reasons (samples).",
          )}
        </li>
        <li>
          {t(
            "Grafikteki “Kalite kuralı: geçersiz veri” bantlarını videoyla karşılaştırın. Ön filtreyi 0 yaparak kısa sıçramaların sonucu nasıl değiştirdiğini deneyin.",
            "Compare the “Quality rule: invalid data” bands on the chart with the video. Set the pre-filter to 0 to see how brief spikes change the result.",
          )}
        </li>
        <li>
          {t(
            "Gerekçeniz varsa “Dışla”ya geçin. “İşlenmiş EDA serileri” CSV'si örnek başına qualityInvalid sütununu içerir; Veri & kalite sekmesi kuralların elle etiketlere göre duyarlılık ve özgüllüğünü verir.",
            "Switch to “Exclude” if you have a reason to. The “Processed EDA series” CSV contains a per-sample qualityInvalid column; the Data & quality tab gives the sensitivity and specificity of the rules against manual labels.",
          )}
        </li>
      </ol>

      <h3>{h.limits}</h3>
      <ul>
        <li>
          {t(
            "Eşikler Q Sensor ile ve otizmli çocukların günlük yaşam verisinde belirlenmiştir. Yazarlar kuralların cihaza ve çalışmaya göre ayarlanmasını, ölçütlerin bağımsız bir veri kümesinde el puanlamasıyla eşleştirilmesini önerir. EmotiBit ve bisiklet için doğrulanmamıştır.",
            "The thresholds were set with the Q Sensor in daily-life data from children with autism. The authors recommend tuning the rules to the device and study, and matching the criteria to manual ratings on an independent dataset. They have not been validated for EmotiBit or cycling.",
          )}
        </li>
        <li>
          {t(
            "OutLab makaledeki FIR filtresini değil, güncel kodun hareketli ortalamasını kullanır; sonuçlar makaledeki yöntemle birebir aynı olmaz. 2 s'lik ortalama kısa ve sivri artefaktları yumuşattığı için bunlar eğim kuralından kaçabilir.",
            "OutLab uses the current code's moving average, not the paper's FIR filter, so results will not match the paper's method exactly. Because the 2 s average smooths short, sharp artifacts, these can escape the slope rule.",
          )}
        </li>
        <li>
          {t(
            "Sıcaklık kuralı °C birimli bir kanal ister. EmotiBit'in T1 kanalı PPG sensörünün sıcaklığıdır, deri sıcaklığı değildir; termopil (TH) yalnızca EmotiBit MD'de bulunur. Bilekte, soğuk ve rüzgârlı havada sensör 30 °C'nin altını okuyabilir ve geçerli veriyi geçersiz sayabilir. Bu kural ya yeniden ayarlanmalı ya da kullanılmamalıdır.",
            "The temperature rule needs a channel in °C. EmotiBit's T1 channel is the temperature of the PPG sensor, not skin temperature; the thermopile (TH) exists only on EmotiBit MD. On the wrist, in cold and windy weather, the sensor can read below 30 °C and mark valid data as invalid. This rule must either be re-tuned or left off.",
          )}
        </li>
        <li>
          {t(
            "60 µS üst sınırı Q Sensor'a özgüdür; EmotiBit'in ölçüm aralığını üreticinin belgelerinden doğrulayın.",
            "The 60 µS ceiling is specific to the Q Sensor; check EmotiBit's measurement range in the manufacturer's documentation.",
          )}
        </li>
        <li>
          {t(
            "Düz çizgi kuralı yayımlanmış bir kural değil, OutLab sezgisidir. Soğukta çok düşük ama gerçek bir EDA da düz görünebilir; 10 s ve 0,001 µS değerleri doğrulanmamıştır.",
            "The flat-line rule is an OutLab heuristic, not a published rule. Very low but real EDA, for example in the cold, can also look flat; the 10 s and 0.001 µS values have not been validated.",
          )}
        </li>
        <li>
          {t(
            "Kurallar hareketi doğrudan görmez. Fizyolojik aralıkta kalan ve yavaş gelişen hareket artefaktlarını yakalamazlar.",
            "The rules do not see motion directly. They do not catch motion artifacts that stay within the physiological range and develop slowly.",
          )}
        </li>
      </ul>

      <h3>{h.report}</h3>
      <blockquote>
        {t(
          "EDA kalitesi, Kleckner ve ark. (2018) kurallarının uyarlanmasıyla örnek düzeyinde değerlendirildi. Kurallar, EDAQA kodunun varsayılanı olan 2 s'lik sıfır fazlı hareketli ortalamayla süzülmüş bir kopyaya uygulandı: EDA'nın 0,05–[60] µS dışında olması ve ardışık örnekler arasındaki değişim hızının 10 µS/s'yi aşması. Sıcaklık kuralı [kullanılmadı, çünkü EmotiBit T1 kanalı deri sıcaklığını değil PPG sensörünün sıcaklığını ölçer]. Ek olarak OutLab'ın düz çizgi sezgisiyle en az 10 s boyunca 0,001 µS'den az değişen bölümler işaretlendi. Bu kurallara göre geçersiz bölümlerin her iki yanındaki 5 s de geçersiz sayıldı. Kullanılabilir veri oranı oturum başına ortalama %[..] (aralık %[..]–%[..]) idi. Geçersiz örnekler [yalnızca işaretlendi / karşılaştırma aralığından ve aday aramasından çıkarıldı]. Eşikler EmotiBit ve bisiklet koşulları için doğrulanmamıştır.",
          "EDA quality was assessed at the sample level with an adaptation of the Kleckner et al. (2018) rules. The rules were applied to a copy smoothed with a 2 s zero-phase moving average, the default of the EDAQA code: EDA outside 0.05–[60] µS, and a rate of change between consecutive samples above 10 µS/s. The temperature rule was [not used, because EmotiBit's T1 channel measures the PPG sensor's temperature, not skin temperature]. In addition, OutLab's flat-line heuristic marked sections that changed by less than 0.001 µS for at least 10 s. Data within 5 s on either side of sections invalid by these rules were also marked invalid. Usable data averaged [..]% per session (range [..]–[..]%). Invalid samples were [flagged only / removed from the reference interval and the candidate search]. The thresholds have not been validated for EmotiBit or cycling conditions.",
        )}
      </blockquote>

      <h3>{h.sources}</h3>
      <Sources
        items={[
          ["S13", t("Kleckner ve ark., 2018", "Kleckner et al., 2018")],
          ["S14", t("EDAQA resmî kodu", "EDAQA official code")],
          [
            "S01",
            t("EmotiBit belgeleri (T1, TH)", "EmotiBit documentation (T1, TH)"),
          ],
        ]}
      />
    </>
  );
}

/* ------------------------------------------------------------------ motion */

function MotionSection() {
  useLang();
  const h = headings();
  return (
    <>
      <h2>{t("Pencere tabanlı hareket", "Window-based motion")}</h2>

      <h3>{h.what}</h3>
      <p>
        {t(
          "Kaydı kısa, örtüşmeyen pencerelere böler. Her pencerede ivme bileşkesinin standart sapmasını (g) ve isteğe bağlı olarak jiroskop bileşkesinin ortalamasını (°/s) hesaplar. Bir değer bu sürüşün kendi pencerelerine göre olağandışı yüksekse pencere “yüksek hareketli” olarak işaretlenir. GPX'ten hesaplanan hız her pencereye bağlam olarak eklenir (duruş ya da sürüş). Aday listesini değiştirmez.",
          "It divides the recording into short, non-overlapping windows. In each window it computes the standard deviation of acceleration magnitude (g) and, optionally, the mean gyroscope magnitude (°/s). If a value is unusually high relative to this ride's own windows, the window is flagged as “high motion”. Speed computed from the GPX is added to each window as context (stationary or riding). It does not change the candidate list.",
        )}
      </p>

      <h3>{h.why}</h3>
      <p>
        {t(
          "Bisiklette ivmeölçer pedal ritmi, yol yüzeyi ve gidon titreşimi yüzünden hiç sakin kalmaz. Temel analizdeki sabit g/s eşiği arnavut kaldırımında neredeyse her yeri, düz asfaltta neredeyse hiçbir yeri işaretleyebilir. Medyan + k·MAD eşiği her sürüşün kendi titreşim düzeyine uyum sağlar ve yalnızca o sürüş için olağandışı anları öne çıkarır: çukur, bordür, tutuş değişimi, işaret vermek için kol kaldırma. Jiroskop bilek dönüşlerini ayrıca yakalar. Hız durma anlarını ayırmaya yardım eder; dururken kol hareketi ve sensöre dokunma artabilir.",
          "On a bike the accelerometer is never still because of pedalling, the road surface and handlebar vibration. The fixed g/s threshold of the core analysis can flag almost everything on cobblestones and almost nothing on smooth asphalt. A median + k·MAD threshold adapts to each ride's own vibration level and highlights only moments that are unusual for that ride: a pothole, a kerb, a grip change, raising an arm to signal. The gyroscope also catches wrist rotations. Speed helps to separate stops, when arm movement and touching the sensor can increase.",
        )}
      </p>
      <p>
        {t(
          "Hareket bir artefaktın olası nedenidir, kanıtı değildir: ani fren gerektiren bir olay gibi gerçek bir sempatik tepki de hareketle aynı anda olur. Bu yüzden işaret bir inceleme çağrısıdır.",
          "Motion is a possible cause of an artifact, not proof of one: a real sympathetic response, such as an event that requires sudden braking, also coincides with motion. The flag is therefore a call to review.",
        )}
      </p>

      <h3>{h.how}</h3>
      <ol>
        <li>
          {t("İvme bileşkesi: ", "Acceleration magnitude: ")}
          <code>|a| = √(AX² + AY² + AZ²)</code>
          {t(
            ". Birim g ya da m/s² olabilir (m/s² 9,80665'e bölünür). AY ve AZ, AX zamanlarına boşluk köprülenmeden hizalanır.",
            ". The unit can be g or m/s² (m/s² is divided by 9.80665). AY and AZ are aligned to the AX times without bridging gaps.",
          )}
        </li>
        <li>
          {t("Jiroskop bileşkesi: ", "Gyroscope magnitude: ")}
          <code>|ω| = √(GX² + GY² + GZ²)</code>
          {t(
            " (°/s; “deg/s” ve “dps” de kabul edilir). Kanallar yoksa veya birim tanınmazsa jiroskop atlanır.",
            " (°/s; “deg/s” and “dps” are also accepted). If the channels are missing or the unit is not recognised, the gyroscope is skipped.",
          )}
        </li>
        <li>
          {t(
            "Pencereler: EDA ve ivme kayıtlarının ortak aralığında, “Pencere (s)” uzunluğunda ardışık, örtüşmeyen pencereler. 3'ten az örnek içeren pencerenin değeri boş kalır.",
            "Windows: consecutive, non-overlapping windows of length “Window (s)” over the period covered by both EDA and acceleration. A window with fewer than 3 samples has no value.",
          )}
        </li>
        <li>
          {t("Öznitelikler: ", "Features: ")}
          <code>{t("SD(|a|)", "SD(|a|)")}</code>
          {t(
            " (popülasyon standart sapması) ve ",
            " (population standard deviation) and ",
          )}
          <code>{t("ortalama(|ω|)", "mean(|ω|)")}</code>.
        </li>
        <li>
          {t(
            "Eşik, ivme ve jiroskop için ayrı ayrı, aynı oturumun tüm pencerelerinden: ",
            "Threshold, separately for acceleration and gyroscope, from all windows of the same session: ",
          )}
          <code>
            {t(
              "eşik = medyan + k · MAD / 0,6745",
              "threshold = median + k · MAD / 0.6745",
            )}
          </code>
          {t(
            ". MAD/0,6745 normal dağılımda standart sapmayı tahmin ettiği için k, robust z ile aynı ölçektedir. En az 5 geçerli pencere ve sıfırdan büyük bir MAD gerekir; yoksa eşik hesaplanmaz.",
            ". Because MAD/0.6745 estimates the standard deviation for normally distributed data, k is on the same scale as robust z. At least 5 valid windows and a MAD above zero are needed; otherwise no threshold is computed.",
          )}
        </li>
        <li>
          {t(
            "İşaret: ivme veya jiroskop değeri eşiğini aşarsa pencere işaretlenir (neden kodları “ivme değişkenliği”, “jiroskop”) ve penceredeki EDA örnekleri hareket penceresi olarak işaretlenir.",
            "Flag: if the acceleration or gyroscope value exceeds its threshold, the window is flagged (reason codes “acceleration variability”, “gyroscope”) and the EDA samples in it are marked as a motion window.",
          )}
        </li>
        <li>
          {t(
            "GPS hızı: GPX noktaları Zaman eşleme sekmesindeki ofsetle sensör eksenine taşınır. Ardışık iki nokta arası haversine mesafesi süreye bölünür ve 3,6 ile çarpılır (km/sa); yalnızca 0 < Δt ≤ 30 s olan ve aynı segmentteki çiftler kullanılır. Pencere merkezine en yakın çift, en fazla max(Δt, 5) s uzaktaysa kullanılır. 1,5 km/sa altı “duruş”, üstü “sürüş”tür. Hız işareti etkilemez.",
            "GPS speed: GPX points are moved to the sensor axis with the offset from the Time sync tab. The haversine distance between two consecutive points is divided by the time and multiplied by 3.6 (km/h); only pairs with 0 < Δt ≤ 30 s within the same segment are used. The pair nearest to the window centre is used if it is at most max(Δt, 5) s away. Below 1.5 km/h is “stationary”, above is “riding”. Speed does not affect the flag.",
          )}
        </li>
      </ol>
      <ParamTable
        rows={[
          [
            t("Pencere (s)", "Window (s)"),
            "2",
            t("0,5–30", "0.5–30"),
            t("OutLab başlangıç değeri", "OutLab starting value"),
          ],
          [
            t("Hassasiyet k", "Sensitivity k"),
            "3",
            t("0,5–20", "0.5–20"),
            t(
              "OutLab başlangıç değeri; küçük k daha çok pencere işaretler",
              "OutLab starting value; a smaller k flags more windows",
            ),
          ],
          [
            t("Jiroskop (GX/GY/GZ)", "Gyroscope (GX/GY/GZ)"),
            t("açık (kanallar varsa)", "on (if the channels exist)"),
            t("açık / kapalı", "on / off"),
            t("OutLab", "OutLab"),
          ],
          [
            t("GPX hız bağlamı", "GPX speed context"),
            t("açık (GPX varsa)", "on (if a GPX exists)"),
            t("açık / kapalı", "on / off"),
            t("OutLab", "OutLab"),
          ],
          [
            t(
              "Duruş sınırı (formda yok)",
              "Stationary limit (not in the form)",
            ),
            t("1,5 km/sa", "1.5 km/h"),
            t("sabit", "fixed"),
            t(
              "OutLab sezgisi; doğrulanmadı",
              "OutLab heuristic; not validated",
            ),
          ],
          [
            t("GPX ofseti (Zaman eşleme)", "GPX offset (Time sync)"),
            t("Zaman eşlemedeki değer", "The value from Time sync"),
            t("±86.400 s", "±86,400 s"),
            t("Zaman eşleme sekmesi", "Time sync tab"),
          ],
        ]}
      />
      <p>
        <small>{rangeNote()}</small>
      </p>

      <h3>{h.use}</h3>
      <ol>
        <li>
          {t(
            "Analiz ayarları → “3. Ek artefakt ve güvenirlik yöntemleri” bölümünde “Pencere tabanlı hareket”i işaretleyin.",
            "In Analysis settings → “3. Additional artifact and reliability methods”, tick “Window-based motion”.",
          )}
        </li>
        <li>
          {t(
            "Pencereyi ve k'yı ayarlayın. Jiroskop ve GPX kutuları yalnızca ilgili veri varsa etkindir; GPX hızı için önce Zaman eşleme'de GPX ofsetini doğrulayın.",
            "Set the window and k. The gyroscope and GPX boxes are enabled only when the data exist; for GPX speed, check the GPX offset in Time sync first.",
          )}
        </li>
        <li>
          {t(
            "“Analizi ek yöntemlerle çalıştır”. Sonuçlarda İşaretli pencere yüzdesini, İvme eşiği (SD, g), Jiroskop eşiği (°/s) ve GPX bağlamı (sürüş/duruş pencere sayısı) değerlerini görürsünüz.",
            "Press “Run analysis with additional methods”. The results show the Flagged windows percentage, the Acceleration threshold (SD, g), the Gyroscope threshold (°/s) and the GPX context (riding/stationary window counts).",
          )}
        </li>
        <li>
          {t(
            "Grafikte “Yüksek hareket penceresi” bantları, adaylarda “Hareket penceresi” rozeti çıkar. Bu adayları videoda kontrol edin. CSV'de motionWindow sütunu bulunur; Veri & kalite sekmesi yöntemi elle etiketlerle karşılaştırır.",
            "“High-motion window” bands appear on the chart and a “Motion window” badge on candidates. Check these candidates in the video. The CSV has a motionWindow column; the Data & quality tab compares the method with manual labels.",
          )}
        </li>
      </ol>

      <h3>{h.limits}</h3>
      <ul>
        <li>
          {t(
            "Eşik oturuma görelidir; işaretli pencere yüzdesi oturumlar arasında “hareket miktarı” olarak karşılaştırılamaz. Baştan sona sarsıntılı bir sürüşte eşik yükselir ve sarsıntılı bölümler işaretlenmeyebilir.",
            "The threshold is relative to the session, so the flagged-window percentage cannot be compared between sessions as an “amount of motion”. On a ride that is bumpy throughout, the threshold rises and bumpy sections may not be flagged.",
          )}
        </li>
        <li>
          {t(
            "5'ten az pencerelik kayıtlarda eşik hesaplanmaz. Ortalama jiroskop büyüklüğü uzun virajları da yüksek gösterebilir.",
            "No threshold is computed for recordings with fewer than 5 windows. The mean gyroscope magnitude can also be high in long bends.",
          )}
        </li>
        <li>
          {t(
            "GPX noktaları seyrek ve kentte sapmalı olabilir; 1,5 km/sa duruş sınırı doğrulanmamıştır.",
            "GPX points can be sparse and inaccurate in cities; the 1.5 km/h stationary limit has not been validated.",
          )}
        </li>
        <li>
          {t(
            "Zhang ve ark. (2017), bilek EDA'sında ivmeölçer özniteliklerinin artefakt tespitine gözetimli yöntemlerde yalnızca az katkı sağladığını, gözetimsiz yöntemlerde ise doğruluğu düşürdüğünü bildirmiştir. Bu bulgu OutLab'ın hareketi kanıt değil, bağlam ve inceleme işareti olarak kullanmasının bir nedenidir.",
            "Zhang et al. (2017) reported that, for wrist EDA, accelerometer features added only a little to artifact detection with supervised methods and lowered accuracy with unsupervised ones. This finding is one reason why OutLab uses motion as context and a review flag, not as proof.",
          )}
        </li>
        <li>
          {t(
            "Pencere, k ve duruş sınırı için yayımlanmış bir doğrulama yoktur. Elle etiketlerle duyarlılık ve özgüllüğü kontrol edin.",
            "There is no published validation for the window, k or the stationary limit. Check sensitivity and specificity against manual labels.",
          )}
        </li>
      </ul>

      <h3>{h.report}</h3>
      <blockquote>
        {t(
          "Hareket, 2 s'lik örtüşmeyen pencerelerde ivme bileşkesinin standart sapması (g) ve jiroskop bileşkesinin ortalaması (°/s) ile özetlendi. Eşik her oturum için o oturumun pencerelerinden medyan + 3 × MAD/0,6745 olarak belirlendi ve eşiği aşan pencereler video incelemesi için işaretlendi. GPX'ten hesaplanan hız (1,5 km/sa altı duruş) yalnızca bağlam olarak kullanıldı. Pencerelerin oturum başına ortalama %[..]'i işaretlendi. Hareket işaretleri artefakt kanıtı olarak değil inceleme işareti olarak kullanıldı; işaretli adaylar video ve katılımcı anlatımıyla birlikte değerlendirildi.",
          "Motion was summarised in non-overlapping 2 s windows by the standard deviation of acceleration magnitude (g) and the mean gyroscope magnitude (°/s). For each session the threshold was set from that session's windows as median + 3 × MAD/0.6745, and windows above it were flagged for video review. Speed computed from the GPX (below 1.5 km/h = stationary) was used as context only. On average [..]% of windows per session were flagged. Motion flags were used as review flags, not as evidence of artifacts; flagged candidates were assessed together with the video and the participant's account.",
        )}
      </blockquote>

      <h3>{h.sources}</h3>
      <Sources
        items={[
          ["S25", t("Zhang ve ark., 2017", "Zhang et al., 2017")],
          [
            "S10",
            t(
              "NIST/SEMATECH, MAD ve değiştirilmiş z",
              "NIST/SEMATECH, MAD and modified z",
            ),
          ],
          ["S03", t("GPX 1.1 şeması", "GPX 1.1 schema")],
          ["S01", t("EmotiBit belgeleri", "EmotiBit documentation")],
        ]}
      />
    </>
  );
}

/* ------------------------------------------------------------------ annotation */

function AnnotationSection() {
  useLang();
  const h = headings();
  return (
    <>
      <h2>
        {t(
          "Videoyla elle etiketleme ve kodlayıcı uyumu",
          "Manual labelling with video and coder agreement",
        )}
      </h2>

      <h3>{h.what}</h3>
      <p>
        {t(
          "Çalışma alanında videoyu izlerken zaman aralıklarını Artefakt, Geçerli veya Emin değilim olarak etiketlersiniz; bir neden (ör. Yol darbesi / çukur, Tutuş değişimi, Sensöre dokunma) ve not eklersiniz. Veri & kalite sekmesi iki kodlayıcı arasındaki uyumu (Cohen's kappa ve gözlenen uyum) ve her otomatik yöntemin bir kodlayıcıya göre duyarlılık, özgüllük ve kappasını hesaplar. Etiketler analizi değiştirmez.",
          "In the workspace you label time ranges as Artifact, Valid or Unsure while watching the video, and add a reason (e.g. Road bump / pothole, Grip change, Touching the sensor) and a note. The Data & quality tab computes the agreement between two coders (Cohen's kappa and observed agreement) and the sensitivity, specificity and kappa of each automatic method against one coder. Labels do not change the analysis.",
        )}
      </p>

      <h3>{h.why}</h3>
      <p>
        {t(
          "OutLab'ın otomatik kuralları EmotiBit ve bisiklet için doğrulanmamıştır; Kleckner ve ark. (2018) de ölçütlerin bağımsız bir veri kümesinde el puanlamasına göre ayarlanmasını önerir. 360° video, EDA'daki bir sıçramanın çukurdan mı, tutuş değişiminden mi, sensöre dokunmadan mı geldiğini görmenin en doğrudan yoludur. İki bağımsız kodlayıcı, etiketlerin kişiye bağlı olup olmadığını gösterir ve otomatik yöntemleri karşılaştırmak için bir referans sağlar.",
          "OutLab's automatic rules have not been validated for EmotiBit or cycling, and Kleckner et al. (2018) recommend matching the criteria to manual ratings on an independent dataset. The 360° video is the most direct way to see whether a jump in EDA comes from a pothole, a grip change or touching the sensor. Two independent coders show whether the labels depend on the person, and give a reference for comparing the automatic methods.",
        )}
      </p>

      <h3>{h.how}</h3>
      <ol>
        <li>
          {t(
            "Dilimler: oturum 1 saniyelik dilimlere bölünür (dilim i = [i, i+1) s). Bir etiket aralığı dokunduğu her dilimi kapsar: ",
            "Bins: the session is divided into 1-second bins (bin i = [i, i+1) s). A label range covers every bin it touches: ",
          )}
          <code>
            {t(
              "floor(başlangıç) … ceil(bitiş) − 1",
              "floor(start) … ceil(end) − 1",
            )}
          </code>
          .
        </li>
        <li>
          {t(
            "Bir kodlayıcı içinde: dilimde “Emin değilim” varsa dilim dışarıda kalır; yoksa Artefakt, Geçerli'ye üstün gelir. Etiketlenmemiş dilimler de dışarıda kalır.",
            "Within one coder: if a bin contains “Unsure”, the bin is left out; otherwise Artifact wins over Valid. Unlabelled bins are left out too.",
          )}
        </li>
        <li>
          {t(
            "Otomatik yöntemler: dilimdeki tek bir örnek işaretliyse dilim artefakt (1), değilse geçerli (0). Karşılaştırılan yöntemler: Temel hareket eşiği (g/s), Kalite kuralları ve Pencere tabanlı hareket (çalıştırıldıysa).",
            "Automatic methods: if any sample in a bin is flagged the bin is an artifact (1), otherwise valid (0). The methods compared are the Core motion threshold (g/s), Quality rules and Window-based motion (if run).",
          )}
        </li>
        <li>
          {t(
            "Yalnızca iki tarafın da etiketlediği dilimler sayılır (n). Kodlayıcı A referanstır: tp = ikisi de artefakt, fn = A artefakt / B geçerli, fp = A geçerli / B artefakt, tn = ikisi de geçerli.",
            "Only bins labelled by both sides are counted (n). Coder A is the reference: tp = both artifact, fn = A artifact / B valid, fp = A valid / B artifact, tn = both valid.",
          )}
        </li>
        <li>
          <code>pₒ = (tp + tn) / n</code>
          {"; "}
          <code>pₑ = [(tp+fn)/n]·[(tp+fp)/n] + [(fp+tn)/n]·[(fn+tn)/n]</code>
          {"; "}
          <code>κ = (pₒ − pₑ) / (1 − pₑ)</code>
          {t(
            ". Kappa, gözlenen uyumdan şansa bağlı beklenen uyumu düşer.",
            ". Kappa removes the agreement expected by chance from the observed agreement.",
          )}
        </li>
        <li>
          {t("Duyarlılık ", "Sensitivity ")}
          <code>tp / (tp + fn)</code>
          {t(", özgüllük ", ", specificity ")}
          <code>tn / (tn + fp)</code>
          {t(
            "; referans kodlayıcı doğru kabul edilir.",
            "; the reference coder is treated as the truth.",
          )}
        </li>
        <li>
          {t(
            "Kappa tanımsızdır (“—”, “tanımsız”): ortak etiketli dilim yoksa (n = 0) veya pₑ = 1 ise. pₑ = 1, iki tarafın da bütün dilimlere aynı tek etiketi verdiği durumdur (ör. hepsi Geçerli); o zaman paydada sıfır kalır. Referansta hiç artefakt yoksa duyarlılık, hiç geçerli dilim yoksa özgüllük tanımsızdır.",
            "Kappa is undefined (“—”, “not defined”) when there are no bins labelled by both (n = 0) or when pₑ = 1. pₑ = 1 happens when both sides gave every bin the same single label (e.g. all Valid), leaving zero in the denominator. Sensitivity is undefined if the reference has no artifact bins, and specificity if it has no valid bins.",
          )}
        </li>
        <li>
          {t(
            "Artefaktlar seyrekse pₑ 1'e yaklaşır; gözlenen uyum yüksek olsa bile birkaç uyuşmazlık kappayı belirgin biçimde düşürür. Bu yüzden kappayı tek başına değil, pₒ, n ve artefakt oranıyla birlikte raporlayın.",
            "When artifacts are rare, pₑ approaches 1; even with high observed agreement, a few disagreements lower kappa markedly. So report kappa together with pₒ, n and the artifact rate, not on its own.",
          )}
        </li>
      </ol>
      <p>
        {t(
          "OutLab kappanın yanında Landis ve Koch (1977) bandını gösterir. Bantlar görüşe dayalıdır, ampirik olarak türetilmemiştir; bir kalite eşiği değil, betimleyici bir etikettir.",
          "OutLab shows the Landis and Koch (1977) band next to kappa. The bands are opinion-based, not empirically derived; they are a descriptive label, not a quality threshold.",
        )}
      </p>
      <ParamTable
        head={[
          "κ",
          t("OutLab etiketi", "OutLab label"),
          t("Landis ve Koch (özgün)", "Landis and Koch (original)"),
          t("Not", "Note"),
        ]}
        rows={[
          [
            "< 0",
            t("uyum yok (şans altı)", "poor (below chance)"),
            "poor",
            t("şanstan kötü", "worse than chance"),
          ],
          [t("0–0,20", "0–0.20"), t("çok zayıf", "slight"), "slight", "—"],
          [t("0,21–0,40", "0.21–0.40"), t("zayıf", "fair"), "fair", "—"],
          [t("0,41–0,60", "0.41–0.60"), t("orta", "moderate"), "moderate", "—"],
          [
            t("0,61–0,80", "0.61–0.80"),
            t("önemli", "substantial"),
            "substantial",
            "—",
          ],
          [
            t("0,81–1,00", "0.81–1.00"),
            t("neredeyse tam", "almost perfect"),
            "almost perfect",
            "—",
          ],
        ]}
      />
      <ParamTable
        rows={[
          [
            t("Dilim uzunluğu (formda yok)", "Bin length (not in the form)"),
            "1 s",
            t("sabit", "fixed"),
            t("OutLab kararı", "OutLab decision"),
          ],
          [
            t("Kodlayıcı", "Coder"),
            "K1",
            t(
              "en çok 20 karakter; tarayıcıda hatırlanır",
              "up to 20 characters; remembered in the browser",
            ),
            t("OutLab", "OutLab"),
          ],
          [
            t("Etiket", "Label"),
            t("Artefakt", "Artifact"),
            t("Artefakt / Geçerli / Emin değilim", "Artifact / Valid / Unsure"),
            t("OutLab", "OutLab"),
          ],
          [
            t("Kodlayıcı A (referans)", "Coder A (reference)"),
            t("alfabetik ilk kodlayıcı", "first coder alphabetically"),
            t("etiketi olan herhangi bir kodlayıcı", "any coder with labels"),
            t("OutLab", "OutLab"),
          ],
        ]}
      />

      <h3>{h.use}</h3>
      <ol>
        <li>
          {t(
            "Önce Zaman eşleme'de videonun sensör eksenine doğru hizalandığını kontrol edin. Etiketler sensör zamanında kaydedilir; ofset yanlışsa etiketler yanlış dilimlere düşer.",
            "First check in Time sync that the video is correctly aligned to the sensor axis. Labels are stored in sensor time; if the offset is wrong, labels fall into the wrong bins.",
          )}
        </li>
        <li>
          {t(
            "Çalışma alanında “Aralık etiketle”ye basın ve Kodlayıcı adınızı girin (ör. K1).",
            "In the workspace press “Label a range” and enter your Coder name (e.g. K1).",
          )}
        </li>
        <li>
          {t(
            "Videoyu oynatın. “Başlangıç” ve “Bitiş” düğmeleri o anki zamanı alır. Etiket, Neden ve Not'u seçip “Etiketi kaydet”e basın. Kodladığınız bölümü baştan sona etiketleyin: yalnızca artefaktları etiketlerseniz özgüllük ve kappa hesaplanamaz.",
            "Play the video. The “Start” and “End” buttons take the current time. Choose the Label, Reason and Note, then press “Save label”. Label the coded period from start to end: if you label only artifacts, specificity and kappa cannot be computed.",
          )}
        </li>
        <li>
          {t(
            "İkinci kodlayıcı aynı oturumu kendi adıyla (ör. K2) bağımsız olarak etiketler. Etiketleme çubuğundaki “Kör kodlama” seçeneği açıkken grafikte yalnızca o kodlayıcının kendi etiketleri görünür; diğer kodlayıcıların etiketleri ve otomatik yöntemlerin bantları ile aday rozetleri gizlenir.",
            "A second coder labels the same session independently under their own name (e.g. K2). With “Blind coding” switched on in the labelling bar, the chart shows only that coder's own labels; other coders' labels and the automatic methods' bands and candidate badges are hidden.",
          )}
        </li>
        <li>
          {t(
            "Veri & kalite → “Elle artefakt etiketleri ve uyum”: Kodlayıcı A (referans) ve Kodlayıcı B'yi seçin. Cohen's kappa, Gözlenen uyum ve Ortak etiketli saniye görünür; altında otomatik yöntemlerin Kodlayıcı A'ya göre Duyarlılık, Özgüllük, kappa ve n değerleri listelenir.",
            "Data & quality → “Manual artifact labels and agreement”: choose Coder A (reference) and Coder B. Cohen's kappa, Observed agreement and Seconds labelled by both appear; below them, the Sensitivity, Specificity, kappa and n of each automatic method against Coder A are listed.",
          )}
        </li>
      </ol>
      <h4>{t("İyi uygulama", "Good practice")}</h4>
      <ul>
        <li>
          {t(
            "Etiketlemeden önce yazılı bir kodlama protokolü hazırlayın: neyin artefakt sayılacağı, neden kategorileri ve ne zaman “Emin değilim” kullanılacağı. Gashi ve ark. (2020) ambulatuvar EDA için elle etiketleme yönergeleri yayımlamıştır; örnek olarak kullanılabilir.",
            "Write a coding protocol before labelling: what counts as an artifact, the reason categories, and when to use “Unsure”. Gashi et al. (2020) published manual labelling guidelines for ambulatory EDA that can serve as an example.",
          )}
        </li>
        <li>
          {t(
            "Kodlayıcıları ayrı bir pilot oturumda eğitin; asıl verideki uyumu bu eğitimden sonra ölçün.",
            "Train coders on a separate pilot session; measure agreement on the main data after this training.",
          )}
        </li>
        <li>
          {t(
            "İkinci kodlayıcı “Kör kodlama” açıkken, bağımsız çalışsın. Aday listesindeki EDA adayları yine görünür; bunların etiket kararını etkilemesini istemiyorsanız etiketlemeyi analizden önce yapın.",
            "Let the second coder work independently with “Blind coding” on. EDA candidates in the moment list stay visible; if they should not influence labelling, label before running the analysis.",
          )}
        </li>
        <li>
          {t(
            "Kappayı uzlaşı tartışmasından önce hesaplayın. Uzlaşı etiketini ayrı bir kodlayıcı adıyla (ör. UZL) kaydedin.",
            "Compute kappa before any consensus discussion. Save the consensus labels under a separate coder name (e.g. CONS).",
          )}
        </li>
        <li>
          {t(
            "Oturum başına ve toplamda n (ortak etiketli dilim), pₒ, κ, artefakt oranı ve “Emin değilim” oranını raporlayın.",
            "Report n (bins labelled by both), pₒ, κ, the artifact rate and the “Unsure” rate per session and overall.",
          )}
        </li>
      </ul>

      <h3>{h.limits}</h3>
      <ul>
        <li>
          {t(
            "1 s dilim kabadır: kısa bir artefakt bütün dilimi artefakt yapar ve aralık sınırları dokunulan dilimleri tümüyle kapsar.",
            "A 1 s bin is coarse: a short artifact makes the whole bin an artifact, and range boundaries cover every bin they touch.",
          )}
        </li>
        <li>
          {t(
            "Otomatik bir dilim tek işaretli örnekle artefakt sayılır; 5 s geçiş payı ve 2 s pencereler de dilimlere yayılır. Bu, otomatik yöntemlerin artefakt oranını yükseltir ve özgüllüğü düşürebilir.",
            "An automatic bin counts as an artifact with a single flagged sample, and the 5 s transition margin and 2 s windows also spread over bins. This raises the artifact rate of automatic methods and can lower their specificity.",
          )}
        </li>
        <li>
          {t(
            "Komşu dilimler birbirinden bağımsız değildir; bu yüzden kappa için basit formüllerle güven aralığı hesaplanamaz ve OutLab güven aralığı vermez.",
            "Neighbouring bins are not independent, so a confidence interval for kappa cannot be computed with simple formulas, and OutLab gives none.",
          )}
        </li>
        <li>
          {t(
            "Video gerçeğin kendisi değildir: elektrot teması veya ter gibi bazı nedenler görüntüde görünmez. Kodlayıcı “doğru”yu değil, kendi yargısını verir.",
            "The video is not the truth itself: some causes, such as electrode contact or sweat, are not visible. A coder gives their judgement, not the “truth”.",
          )}
        </li>
        <li>
          {t(
            "Landis ve Koch bantları bir gelenektir; tezde bir değeri “yeterli” saymak için gerekçe olarak kullanılmamalıdır.",
            "The Landis and Koch bands are a convention; in a thesis they should not be used as the justification for calling a value “sufficient”.",
          )}
        </li>
      </ul>

      <h3>{h.report}</h3>
      <blockquote>
        {t(
          "Artefakt etiketleri, önceden yazılmış bir kodlama protokolüne göre 360° video ve ham EDA izi izlenerek iki kodlayıcı (K1, K2) tarafından bağımsız olarak verildi. Etiketler 1 saniyelik dilimlere dönüştürüldü; “emin değilim” olarak işaretlenen dilimler dışarıda bırakıldı ve bir kodlayıcının çakışan etiketlerinde artefakt etiketi öncelikli sayıldı. Kodlayıcılar arası uyum, iki kodlayıcının da etiketlediği n = [..] dilim üzerinden Cohen'in kappasıyla hesaplandı (κ = [..], gözlenen uyum %[..], artefakt oranı %[..]); Landis ve Koch (1977) bantları yalnızca betimleyici olarak kullanıldı. K1 etiketleri referans alındığında kalite kurallarının duyarlılığı %[..], özgüllüğü %[..] idi (n = [..] dilim).",
          "Artifact labels were assigned independently by two coders (K1, K2) following a pre-written coding protocol while watching the 360° video and the raw EDA trace. Labels were converted to 1-second bins; bins marked “unsure” were left out, and where one coder's labels overlapped, the artifact label took precedence. Inter-coder agreement was computed with Cohen's kappa over the n = [..] bins labelled by both coders (κ = [..], observed agreement [..]%, artifact rate [..]%); the Landis and Koch (1977) bands were used for description only. With K1's labels as the reference, the quality rules had a sensitivity of [..]% and a specificity of [..]% (n = [..] bins).",
        )}
      </blockquote>

      <h3>{h.sources}</h3>
      <Sources
        items={[
          ["S18", t("Cohen, 1960", "Cohen, 1960")],
          ["S19", t("Landis ve Koch, 1977", "Landis and Koch, 1977")],
          ["S13", t("Kleckner ve ark., 2018", "Kleckner et al., 2018")],
          ["S32", t("Gashi ve ark., 2020", "Gashi et al., 2020")],
        ]}
      />
    </>
  );
}

/* ------------------------------------------------------------------ robustness */

function RobustnessSection() {
  useLang();
  const h = headings();
  return (
    <>
      <h2>{t("Çoklu yöntem sağlamlığı", "Multi-method robustness")}</h2>

      <h3>{h.what}</h3>
      <p>
        {t(
          "Temel analizin bulduğu her aday için tonik/fazik ayrımını ve SCR tepe tespitini farklı yayımlanmış yöntemlerin birleşimleriyle yeniden yapar. Kaç birleşimin aynı anda (± tolerans içinde) yeterince büyük bir SCR bulduğunu sayar ve bunu adayın yanında “Destek n/N” olarak gösterir. Yeni aday eklemez ve aday listesini değiştirmez.",
          "For every candidate found by the core analysis, it repeats the tonic/phasic split and SCR peak detection with combinations of different published methods. It counts how many combinations find a large enough SCR at the same moment (within ± tolerance) and shows this next to the candidate as “Support n/N”. It adds no candidates and does not change the candidate list.",
        )}
      </p>

      <h3>{h.why}</h3>
      <p>
        {t(
          "Bir aday yalnızca belirli bir filtre ayarında ortaya çıkıyorsa, büyük olasılıkla yöntemin ürünüdür ya da gürültüdür. Bisiklette tonik düzey eforla kayarken ve hareket keskin sıçramalar üretirken farklı ayrıştırma yöntemleri farklı sonuç verebilir. Birden çok yöntemin desteklediği anlar görüşmede konuşmak için daha sağlam adaylardır; tek bir ayara bağlı olanlar dikkatle ele alınmalıdır. Bu, analiz seçimlerine karşı bir duyarlılık analizidir.",
          "If a candidate appears only with one particular filter setting, it is probably a product of the method or noise. On a bike, while the tonic level drifts with effort and motion produces sharp jumps, different decomposition methods can give different results. Moments supported by several methods are sturdier candidates for the interview; those that depend on a single setting should be handled with care. This is a sensitivity analysis against analysis choices.",
        )}
      </p>

      <h3>{h.how}</h3>
      <ol>
        <li>
          {t(
            "Girdi: temel analizdeki her işlenmiş kesitin temizlenmiş (3 Hz), düzenli ızgaradaki sinyali.",
            "Input: the cleaned (3 Hz) signal on the regular grid of every processed segment from the core analysis.",
          )}
        </li>
        <li>
          {t("Ayrıştırmalar, NeuroKit2 ", "Decompositions, NeuroKit2 ")}
          <code>eda_phasic</code>
          {t(
            " varsayılan parametreleriyle: highpass (0,05 Hz Butterworth); smoothmedian (4 s'lik medyan düzleştirme toniği verir, fazik = sinyal − tonik); cvxEDA (Greco ve ark., 2016; cvxopt paketi gerekir; NeuroKit2 varsayılanları tau0 = 2,0, tau1 = 0,7, delta_knot = 10, alpha = 8e-4, gamma = 1e-2). cvxopt kurulu değilse cvxEDA atlanır ve bildirimde yazılır.",
            " with default parameters: highpass (0.05 Hz Butterworth); smoothmedian (a 4 s median smoothing gives the tonic, phasic = signal − tonic); cvxEDA (Greco et al., 2016; needs the cvxopt package; NeuroKit2 defaults tau0 = 2.0, tau1 = 0.7, delta_knot = 10, alpha = 8e-4, gamma = 1e-2). If cvxopt is not installed, cvxEDA is skipped and a notice says so.",
          )}
        </li>
        <li>
          {t("Tepe yöntemleri, NeuroKit2 ", "Peak methods, NeuroKit2 ")}
          <code>eda_peaks</code>
          {t(
            " varsayılanlarıyla: neurokit (en büyük tepeye göreli), kim2004, gamboa2008 ve nabian2018 (en büyük SCR genliğinin %10'undan küçükleri eler) her ayrıştırmanın fazik bileşenine uygulanır. vanhalem2020 kendi düzleştirmesini yapıp deri iletkenliği düzeyini beklediği için (0,5 s'den uzun yükselme ve iniş şart koşar) kesit başına bir kez, temizlenmiş düzey sinyaline uygulanır.",
            " with defaults: neurokit (relative to the largest peak), kim2004, gamboa2008 and nabian2018 (rejects SCRs smaller than 10% of the largest SCR amplitude) are applied to the phasic component of each decomposition. vanhalem2020 applies its own smoothing and expects the skin conductance level (it requires rise and decay longer than 0.5 s), so it runs once per segment on the cleaned level signal.",
          )}
        </li>
        <li>
          {t("Birleşim sayısı: ", "Number of combinations: ")}
          <code>
            {t(
              "N = (vanhalem2020 dışındaki tepe yöntemi sayısı × ayrıştırma sayısı) + (vanhalem2020 seçiliyse 1)",
              "N = (peak methods other than vanhalem2020 × decompositions) + (1 if vanhalem2020 is selected)",
            )}
          </code>
          {t(
            ". Varsayılan 4 × 3 + 1 = 13.",
            ". The default is 4 × 3 + 1 = 13.",
          )}
        </li>
        <li>
          {t(
            "Bulunan her SCR kesit uçlarındaki 3 s'nin dışında olmalıdır; NeuroKit2'nin SCR_Amplitude değeri “En küçük SCR genliği (µS)”nin altındaysa atılır.",
            "Every SCR found must lie outside the first and last 3 s of its segment; it is dropped if NeuroKit2's SCR_Amplitude is below the “Minimum SCR amplitude (µS)”.",
          )}
        </li>
        <li>
          {t("Destek: ", "Support: ")}
          <code>
            {t(
              "n = aday zamanından en çok ± tolerans uzaklıkta en az bir SCR bulan birleşim sayısı",
              "n = number of combinations with at least one SCR within ± tolerance of the candidate time",
            )}
          </code>
          {t(
            ". n/N < 0,5 ise aday zayıf (uyarı rengi), n/N ≥ 0,5 ise güçlü kabul edilir.",
            ". A candidate is weak (warning colour) if n/N < 0.5 and strong if n/N ≥ 0.5.",
          )}
        </li>
        <li>
          {t(
            "NeuroKit2 tepe yöntemleri kısa veya düz kesitlerde hata verebilir. Bu durumda o birleşim o kesit için atlanır ve bildirimlerde “… bazı kesitlerde çalışmadı” olarak raporlanır. Birleşim N içinde sayılmaya devam eder, yani hata desteği düşürür.",
            "NeuroKit2 peak methods can fail on short or flat segments. The combination is then skipped for that segment and reported in the notices as “… failed on some segments”. It still counts in N, so a failure lowers support.",
          )}
        </li>
      </ol>
      <p>
        {t(
          "Genlik ölçütü: NeuroKit2'nin kendi amplitude_min değeri (varsayılan 0,1) neurokit ve kim2004'te en büyük genliğin bir oranıdır, mutlak µS değildir. Bu yüzden OutLab ayrıca mutlak bir alt sınır uygular. Boucsein ve ark. (2012) en küçük genlik ölçütünün belirtilip raporlanmasını ister; yaygın değerler 0,01–0,05 µS aralığındadır. OutLab'ın varsayılanı bu aralığın üst ucu olan 0,05 µS'dir.",
          "Amplitude criterion: NeuroKit2's own amplitude_min (default 0.1) is, for neurokit and kim2004, a fraction of the largest amplitude, not an absolute µS value. OutLab therefore applies an absolute lower limit as well. Boucsein et al. (2012) ask for a minimum amplitude criterion to be specified and reported; common values lie in the range 0.01–0.05 µS. OutLab's default is 0.05 µS, the upper end of this range.",
        )}
      </p>
      <p>
        {t(
          "sparsEDA: NeuroKit2'nin belgeleri sparsEDA'yı da listeler ve kurulu 0.2.13 sürümünde method=\"sparse\" olarak çağrılabilir. Ancak aynı belge uygulamanın yeniden denetlenmesi gerektiğini ve bazen belirsiz nedenlerle hata verdiğini yazar. Bu nedenle OutLab sparsEDA'yı sunmaz.",
          'sparsEDA: NeuroKit2\'s documentation also lists sparsEDA, and in the installed version 0.2.13 it can be called as method="sparse". However, the same documentation says the implementation needs to be double-checked and sometimes fails for unclear reasons. OutLab therefore does not offer sparsEDA.',
        )}
      </p>
      <ParamTable
        rows={[
          [
            t("Tonik/fazik ayrımı", "Tonic/phasic decomposition"),
            t(
              "Highpass 0,05 Hz, Smooth median, cvxEDA (Greco 2016)",
              "Highpass 0.05 Hz, Smooth median, cvxEDA (Greco 2016)",
            ),
            t("bu üçünden herhangi biri", "any of these three"),
            t(
              "NeuroKit2 eda_phasic (S11, S17)",
              "NeuroKit2 eda_phasic (S11, S17)",
            ),
          ],
          [
            t("SCR tepe yöntemi", "SCR peak method"),
            "NeuroKit2, Kim 2004, Gamboa 2008, Nabian 2018, van Halem 2020",
            t("bu beşinden herhangi biri", "any of these five"),
            t("NeuroKit2 eda_peaks (S16)", "NeuroKit2 eda_peaks (S16)"),
          ],
          [
            t("En küçük SCR genliği (µS)", "Minimum SCR amplitude (µS)"),
            "0,05",
            "0–10",
            t(
              "Boucsein ve ark. 2012'de anılan 0,01–0,05 µS aralığının üst ucu (S07)",
              "Upper end of the 0.01–0.05 µS range cited from Boucsein et al. 2012 (S07)",
            ),
          ],
          [
            t("Zaman toleransı (± s)", "Time tolerance (± s)"),
            "2",
            t("0'dan büyük, en çok 30", "above 0, at most 30"),
            t("OutLab başlangıç değeri", "OutLab starting value"),
          ],
          [
            t(
              "Destek sınırı (formda yok)",
              "Support cut-off (not in the form)",
            ),
            "%50",
            t("sabit", "fixed"),
            t("OutLab kararı", "OutLab decision"),
          ],
        ]}
      />
      <p>
        <small>{rangeNote()}</small>
      </p>

      <h3>{h.use}</h3>
      <ol>
        <li>
          {t(
            "Analiz ayarları → “3. Ek artefakt ve güvenirlik yöntemleri” bölümünde “Çoklu yöntem sağlamlığı”nı işaretleyin.",
            "In Analysis settings → “3. Additional artifact and reliability methods”, tick “Multi-method robustness”.",
          )}
        </li>
        <li>
          {t(
            "Ayrıştırma ve tepe yöntemlerini seçin; “Birleşim sayısı” N'yi gösterir. Genlik ve toleransı girin, sonra “Analizi ek yöntemlerle çalıştır”a basın.",
            "Choose the decompositions and peak methods; “Combinations” shows N. Enter the amplitude and tolerance, then press “Run analysis with additional methods”.",
          )}
        </li>
        <li>
          {t(
            "“Ek yöntem sonuçları”, adayların kaçının birleşimlerin en az yarısında desteklendiğini ve her birleşimin bulduğu SCR sayısını gösterir. Bildirimlerde hata veren birleşimleri kontrol edin.",
            "“Additional method results” shows how many candidates are supported by at least half of the combinations and how many SCRs each combination found. Check the notices for combinations that failed.",
          )}
        </li>
        <li>
          {t(
            "Çalışma alanında her adayın yanında “Destek n/N” rozeti görünür. Zayıf adayları ham iz ve videoyla inceleyin.",
            "In the workspace each candidate shows a “Support n/N” badge. Review weak candidates against the raw trace and the video.",
          )}
        </li>
      </ol>
      <h4>{t("Zayıf adaylar nasıl okunur?", "How to read weak candidates")}</h4>
      <ul>
        <li>
          {t(
            "Zayıf aday yanlış aday demek değildir. Robust z adayı bir fazik tepedir; SCR yöntemleri tepe zamanını farklı tanımlayabilir. ±2 s tolerans bunu yalnızca kısmen karşılar.",
            "A weak candidate is not necessarily a wrong one. A robust-z candidate is a phasic peak; SCR methods may define the peak time differently. The ±2 s tolerance covers this only in part.",
          )}
        </li>
        <li>
          {t(
            "Göreli eşik kullanan yöntemlerde (neurokit, kim2004, nabian2018) kesitte büyük bir hareket sıçraması varsa eşik yükselir ve gerçek küçük SCR'ler bulunmaz; destek düşer.",
            "With methods that use a relative threshold (neurokit, kim2004, nabian2018), a large motion jump in the segment raises the threshold so real small SCRs are missed and support drops.",
          )}
        </li>
        <li>
          {t(
            "Güçlü destek de artefakt olmadığını göstermez: bir hareket sıçraması bütün yöntemlerde SCR gibi görünebilir. Desteği kalite ve hareket işaretleriyle birlikte okuyun.",
            "Strong support does not show that there is no artifact either: a motion jump can look like an SCR to every method. Read support together with the quality and motion flags.",
          )}
        </li>
        <li>
          {t(
            "Görüşmede zayıf bir adayı kullandıysanız bunu raporda belirtin.",
            "If you used a weak candidate in the interview, say so in the report.",
          )}
        </li>
      </ul>

      <h3>{h.limits}</h3>
      <ul>
        <li>
          {t(
            "Birleşimler birbirinden bağımsız değildir: hepsi aynı temizlenmiş sinyali kullanır. highpass ayrıştırması temel analizle aynı 0,05 Hz filtredir, bu yüzden highpass birleşimleri bağımsız kanıt sayılmaz.",
            "The combinations are not independent: they all use the same cleaned signal. The highpass decomposition is the same 0.05 Hz filter as the core analysis, so highpass combinations do not count as independent evidence.",
          )}
        </li>
        <li>
          {t(
            "Her birleşim eşit ağırlıktadır ve %50 sınırı OutLab'ın keyfi bir kararıdır.",
            "Every combination has equal weight, and the 50% cut-off is an arbitrary OutLab decision.",
          )}
        </li>
        <li>
          {t(
            "Yöntemler 15 Hz EmotiBit verisinde ve hareket altında doğrulanmamıştır; smoothmedian'ın 4 s penceresi ve cvxEDA parametreleri NeuroKit2 varsayılanlarıdır.",
            "The methods have not been validated on 15 Hz EmotiBit data or under motion; the 4 s smoothmedian window and the cvxEDA parameters are NeuroKit2 defaults.",
          )}
        </li>
        <li>
          {t(
            "Hata veren yöntemler desteği düşürür. Kalite kurallarındaki “Dışla” seçimi SCR aramasına uygulanmaz; yalnızca temel aday listesini etkiler.",
            "Methods that fail lower support. The “Exclude” choice of the quality rules is not applied to the SCR search; it affects only the core candidate list.",
          )}
        </li>
        <li>
          {t(
            "cvxEDA'nın özgün kodu ve cvxopt paketi GPL-3.0 lisanslıdır; OutLab'ı başkalarına dağıtırken bunu göz önünde bulundurun.",
            "The original cvxEDA code and the cvxopt package are licensed under GPL-3.0; keep this in mind if you distribute OutLab to others.",
          )}
        </li>
      </ul>

      <h3>{h.report}</h3>
      <blockquote>
        {t(
          "Adayların yönteme bağımlılığını değerlendirmek için her kesitin temizlenmiş sinyali NeuroKit2 [sürüm] ile üç ayrıştırma yöntemi (highpass 0,05 Hz, smooth median, cvxEDA) ve dört SCR tepe yöntemiyle (neurokit, kim2004, gamboa2008, nabian2018) yeniden analiz edildi; vanhalem2020 yöntemi temizlenmiş düzey sinyaline bir kez uygulandı (toplam 13 birleşim). 0,05 µS'den küçük SCR'ler dışlandı. Her aday için ±2 s içinde SCR bulan birleşim sayısı destek olarak raporlandı; birleşimlerin yarısından azında desteklenen adaylar zayıf kabul edildi ve ham iz ile videoda ayrıca incelendi. [k] birleşim bazı kesitlerde çalışmadı ve bu kesitlerde desteğe katkı vermedi.",
          "To assess how much the candidates depend on the method, the cleaned signal of each segment was re-analysed with NeuroKit2 [version] using three decomposition methods (highpass 0.05 Hz, smooth median, cvxEDA) and four SCR peak methods (neurokit, kim2004, gamboa2008, nabian2018); the vanhalem2020 method was applied once to the cleaned level signal (13 combinations in total). SCRs smaller than 0.05 µS were excluded. For each candidate, the number of combinations finding an SCR within ±2 s was reported as its support; candidates supported by fewer than half of the combinations were treated as weak and reviewed separately against the raw trace and the video. [k] combinations failed on some segments and contributed no support there.",
        )}
      </blockquote>

      <h3>{h.sources}</h3>
      <Sources
        items={[
          [
            "S11",
            t(
              "NeuroKit2 eda_phasic kaynak kodu",
              "NeuroKit2 eda_phasic source code",
            ),
          ],
          [
            "S16",
            t(
              "NeuroKit2 eda_findpeaks kaynak kodu",
              "NeuroKit2 eda_findpeaks source code",
            ),
          ],
          ["S15", t("Makowski ve ark., 2021", "Makowski et al., 2021")],
          ["S17", t("Greco ve ark., 2016", "Greco et al., 2016")],
          ["S07", t("Boucsein ve ark., 2012", "Boucsein et al., 2012")],
          ["S13", t("Kleckner ve ark., 2018", "Kleckner et al., 2018")],
        ]}
      />
    </>
  );
}

/* ------------------------------------------------------------------ ledalab */

function LedalabSection() {
  useLang();
  const h = headings();
  return (
    <>
      <h2>{t("Ledalab ve diğer yöntemler", "Ledalab and other methods")}</h2>

      <h3>{h.what}</h3>
      <p>
        {t(
          "Ledalab, deri iletkenliği verisini analiz eden MATLAB tabanlı bir yazılımdır; hem arayüzle hem toplu (batch) modda çalışır. İki ayrıştırma yöntemi sunar: Sürekli Ayrıştırma Analizi (CDA) ve Ayrık Ayrıştırma Analizi (DDA). Olaylara göre tonik ve fazik ölçümleri dışa aktarır. Geliştiricileri Mathias Benedek (Karl-Franzens-Universität Graz) ve Christian Kaernbach'tır (Christian-Albrechts-Universität zu Kiel).",
          "Ledalab is MATLAB-based software for analysing skin conductance data; it runs both with a graphical interface and in batch mode. It offers two decomposition methods: Continuous Decomposition Analysis (CDA) and Discrete Decomposition Analysis (DDA). It exports tonic and phasic measures relative to events. Its developers are Mathias Benedek (Karl-Franzens-Universität Graz) and Christian Kaernbach (Christian-Albrechts-Universität zu Kiel).",
        )}
      </p>
      <p>
        {t(
          "OutLab Ledalab'ı içermez. Ham EDA'yı Ledalab'ın doğrudan içe aktarabileceği bir metin dosyası olarak dışa aktarır; CDA veya DDA'yı Ledalab'ın kendisinde çalıştırırsınız.",
          "OutLab does not include Ledalab. It exports raw EDA as a text file that Ledalab can import directly; you run CDA or DDA in Ledalab itself.",
        )}
      </p>

      <h3>{h.why}</h3>
      <p>
        {t(
          "CDA ve DDA, SCR'lerin standart bir yanıt şekliyle oluştuğunu varsayan ve sinyali bu şekle göre çözen, çok atıf alan yöntemlerdir; art arda gelen tepkileri ayrı ayrı ele almaya çalışırlar. Bisiklette tepkiler sık gelir ve tonik düzey eforla kayar. OutLab'ın 0,05 Hz yüksek geçiren filtresi basit bir yaklaşımdır; Ledalab, adaylarınızı bambaşka bir modelle karşılaştırmak isteyen bir tez için yararlı bir ikinci görüş sağlar.",
          "CDA and DDA are widely cited methods that assume SCRs follow a standard response shape and solve the signal against that shape; they try to handle responses that follow each other closely one by one. On a bike, responses come often and the tonic level drifts with effort. OutLab's 0.05 Hz high-pass filter is a simple approach; Ledalab gives a useful second opinion for a thesis that wants to compare its candidates with a quite different model.",
        )}
      </p>

      <h3>{h.how}</h3>
      <p>
        {t(
          "Ortak fikir: ölçülen iletkenlik, yavaş bir tonik düzey ile sudomotor sinir etkinliğini temsil eden bir “sürücü” sinyalinin standart bir yanıt eğrisiyle evrişiminin toplamı olarak modellenir. Ters evrişim bu sürücüyü geri hesaplar.",
          "The shared idea: measured conductance is modelled as the sum of a slow tonic level and a “driver” signal, standing for sudomotor nerve activity, convolved with a standard response curve. Deconvolution recovers this driver.",
        )}
      </p>
      <ul>
        <li>
          {t(
            "CDA (Benedek ve Kaernbach, 2010a): sürücüyü sıfır tabanlı ve kısa dürtülerden oluşan sürekli bir sinyal olarak tahmin eder. Olaya bağlı ölçü olarak bir yanıt penceresindeki sürücünün zaman integralini önerir. Ledalab'ın olay ilişkili kodunda varsayılan yanıt penceresi olaydan sonraki 1–4 s'dir.",
            "CDA (Benedek and Kaernbach, 2010a): estimates the driver as a continuous signal with a zero baseline and compact impulses. As the event-related measure it proposes the time integral of the driver in a response window. The default response window in Ledalab's event-related code is 1–4 s after the event.",
          )}
        </li>
        <li>
          {t(
            "DDA (Benedek ve Kaernbach, 2010b): negatif olmayan ters evrişimle sinyali ayrık SCR'lere ve tonik bileşene ayırır; standart yanıt şeklinden sapmaları da modeller. SCR şekliyle ilgilenen çalışmalara uygundur.",
            "DDA (Benedek and Kaernbach, 2010b): splits the signal into discrete SCRs and a tonic component by nonnegative deconvolution, and also models deviations from the standard response shape. It suits studies interested in SCR shape.",
          )}
        </li>
      </ul>
      <ParamTable
        head={[
          t("Özellik", "Property"),
          t("Değer", "Value"),
          t("Not", "Note"),
          t("Kaynak", "Source"),
        ]}
        rows={[
          [
            t("Sürüm", "Version"),
            "3.4.9 (2016-04-18)",
            t("Ledalab.m", "Ledalab.m"),
            "S22",
          ],
          [
            t("Bakım", "Maintenance"),
            t("son commit 2018-09-12", "last commit 2018-09-12"),
            t(
              "o tarihten beri güncellenmiyor; kararlı ve yaygın atıf alıyor",
              "not updated since; stable and widely cited",
            ),
            "S22",
          ],
          [
            t("Lisans", "Licence"),
            "GNU GPL",
            t("README sürüm belirtmez", "the README gives no version"),
            "S22",
          ],
          [
            t("Dil", "Language"),
            "MATLAB",
            t("arayüz ve toplu mod", "GUI and batch mode"),
            "S22",
          ],
        ]}
      />
      <h4>{t("OutLab'ın dışa aktardığı dosya", "The file OutLab exports")}</h4>
      <ParamTable
        head={[
          t("Sütun", "Column"),
          t("İçerik", "Content"),
          t("Biçim", "Format"),
          t("Not", "Note"),
        ]}
        rows={[
          [
            "1",
            t("zaman (s), sensör ekseni", "time (s), sensor axis"),
            t("4 ondalık", "4 decimals"),
            t(
              "Ledalab ilk örneği 0'a kaydırır",
              "Ledalab shifts the first sample to 0",
            ),
          ],
          [
            "2",
            t(
              "deri iletkenliği (µS), ham EA değeri",
              "skin conductance (µS), raw EA value",
            ),
            t("6 ondalık", "6 decimals"),
            t(
              "temizlenmemiş; kalite kuralları uygulanmamış",
              "not cleaned; quality rules not applied",
            ),
          ],
          [
            "3",
            t("olay kodu", "event code"),
            t("0 = olay yok; 1..n", "0 = no event; 1..n"),
            t(
              "görüşme anları zaman sırasıyla, en yakın örneğe",
              "interview moments in time order, at the nearest sample",
            ),
          ],
        ]}
      />
      <p>
        {t(
          "Sütunlar sekmeyle ayrılır, başlık satırı yoktur. Bu, Ledalab'ın “Text Type 1 [Time SC (Marker)]” içe aktarma biçimidir.",
          "Columns are tab-separated and there is no header row. This is Ledalab's “Text Type 1 [Time SC (Marker)]” import format.",
        )}
      </p>
      <h4>
        {t(
          "OutLab Ledalab'ı neden gömmüyor?",
          "Why OutLab does not embed Ledalab",
        )}
      </h4>
      <ul>
        <li>
          {t(
            "MATLAB gerektirir; OutLab ise yerel bir Python sunucusu ve tarayıcıyla çalışır.",
            "It needs MATLAB, while OutLab runs with a local Python server and a browser.",
          )}
        </li>
        <li>
          {t(
            "GPL lisanslıdır; kodunu gömmek OutLab'ın dağıtım koşullarını GPL'e bağlar.",
            "It is GPL-licensed; embedding its code would tie OutLab's distribution terms to the GPL.",
          )}
        </li>
        <li>
          {t(
            "2018'den beri bakımı yapılmıyor.",
            "It has not been maintained since 2018.",
          )}
        </li>
        <li>
          {t(
            "Python portu ledapy yalnızca CDA'yı içerir (DDA, olay ilişkili dışa aktarma ve artefakt araçları yok), Ledalab ile eşliğini gösteren yayımlanmış bir doğrulama bulunamadı ve 2020'den beri güncellenmiyor. GPL koddan türetilmiş olduğu halde MIT lisansıyla yayımlanması da hukuken tartışmalıdır. NeuroKit2'de CDA yöntemi yoktur.",
            "The Python port ledapy contains only CDA (no DDA, event-related export or artifact tools), no published validation showing that it matches Ledalab was found, and it has not been updated since 2020. Its release under MIT although it derives from GPL code is also legally questionable. NeuroKit2 has no CDA method.",
          )}
        </li>
      </ul>

      <h3>{h.use}</h3>
      <ol>
        <li>
          {t(
            "Zaman eşlemeyi ve görüşme anlarını tamamlayın. Görüşme için seçilen anlar dosyaya olay kodu olarak yazılır.",
            "Finish the time sync and the interview moments. The moments selected for the interview are written to the file as event codes.",
          )}
        </li>
        <li>
          {t(
            "Üst çubuktaki “Dışa aktar” → “Araştırma çıktıları” → “Ledalab için ham EDA”. Dosyanın adı <katılımcı>_ledalab.txt olur.",
            "In the top bar, “Export” → “Research outputs” → “Raw EDA for Ledalab”. The file is named <participant>_ledalab.txt.",
          )}
        </li>
        <li>
          {t(
            "Görüşme kayıtları CSV'sini de indirin; olay kodlarını (1..n, zaman sırasıyla) görüşme başlıklarıyla eşleştirmek için gerekir.",
            "Download the Interview records CSV as well; you need it to match the event codes (1..n, in time order) to the interview titles.",
          )}
        </li>
        <li>
          {t(
            "Ledalab'da (MATLAB): File → Import Data... → “Text Type 1 [Time SC (Marker)]”. 36.000'den fazla örnek içeren dosyalarda (15 Hz'de 40 dakika) Ledalab örnek seyreltme (downsample) önerir; kararınızı raporlayın.",
            "In Ledalab (MATLAB): File → Import Data... → “Text Type 1 [Time SC (Marker)]”. For files with more than 36,000 samples (40 minutes at 15 Hz) Ledalab offers to downsample; report your choice.",
          )}
        </li>
        <li>
          {t(
            "CDA veya DDA'yı çalıştırıp olay ilişkili sonuçları dışa aktarın. Toplu mod örneği: ",
            "Run CDA or DDA and export the event-related results. A batch-mode example: ",
          )}
          <code>
            Ledalab('C:\data\*.txt', 'open','text', 'analyze','CDA',
            'optimize',2, 'export_era',[1 4 0.01])
          </code>
          {t(
            ". export_era sırasıyla yanıt penceresinin başlangıcını ve bitişini (s) ve genlik eşiğini alır.",
            ". export_era takes the start and end of the response window (s) and the amplitude threshold, in that order.",
          )}
        </li>
      </ol>

      <h3>{h.limits}</h3>
      <ul>
        <li>
          {t(
            "Dışa aktarım ham EA değerlerini yazar: temizlenmemiş, kalite kuralları uygulanmamış; negatif değerler ve kayıt boşlukları olduğu gibi kalır. Ledalab örnekleme hızını (N − 1) / süre olarak hesaplar, yani düzenli örnekleme varsayar. Kayıtta boşluk varsa Ledalab'ın zaman ekseni ve sonuçları bozulur; boşlukları Veri & kalite sekmesinde kontrol edin ve boşluklu oturumlarda Ledalab sonuçlarını güvenilir saymayın.",
            "The export writes raw EA values: not cleaned and without the quality rules; negative values and recording gaps stay as they are. Ledalab computes the sampling rate as (N − 1) / duration, so it assumes regular sampling. If the recording has gaps, Ledalab's time axis and results are distorted; check gaps on the Data & quality tab and do not trust Ledalab results for sessions with gaps.",
          )}
        </li>
        <li>
          {t(
            "Olay kodları uyaran değil, görüşme anlarıdır. Bu anlar OutLab adaylarından, yani EDA tepelerinden seçildiyse çevrelerindeki olay ilişkili Ledalab ölçümleri döngüseldir: anlar zaten tepkiye göre seçilmiştir. Bunları uyarana yanıt olarak raporlamayın; adayların bağımsız bir ayrıştırmayla tutarlı olup olmadığını görmek için kullanın.",
            "The event codes are interview moments, not stimuli. If these moments were selected from OutLab candidates, i.e. EDA peaks, event-related Ledalab measures around them are circular: the moments were chosen because of a response. Do not report them as responses to stimuli; use them to see whether the candidates are consistent with an independent decomposition.",
          )}
        </li>
        <li>
          {t(
            "İki an aynı örneğe en yakınsa yalnızca ilki kodlanır.",
            "If two moments are nearest to the same sample, only the first is coded.",
          )}
        </li>
        <li>
          {t(
            "CDA ve DDA hareketli, ambulatuvar kayıtlar için doğrulanmamıştır. Ledalab'daki artefakt düzeltmesi elle yapılır (artefaktın çevresine kutu çizip interpolasyon seçilir).",
            "CDA and DDA have not been validated for moving, ambulatory recordings. Artifact correction in Ledalab is manual (you draw a box around the artifact and choose an interpolation).",
          )}
        </li>
      </ul>
      <h4>
        {t(
          "Çalışmanın tümü için: EmotiBit EDA geçerliği",
          "For the whole study: EmotiBit EDA validity",
        )}
      </h4>
      <p>
        {t(
          "İki bağımsız karşılaştırmada EmotiBit'in kalp hızı ölçümleri kabul edilebilir bulunmuş, ancak EDA uyumu yetersiz kalmıştır: Langevin ve ark. (2021) FlexComp Infiniti'ye karşı SCL, SCR genliği ve SCR sayısında; Vorreuther ve ark. (2025) iş yükü altındaki 15 katılımcıda BITalino PsychoBit'e karşı SCL ile SCR sayısı ve genliğinde. Bu çalışmalar bisiklet koşullarını kapsamaz. Tezde EmotiBit EDA'sından türetilen bütün değerleri (OutLab adayları, Ledalab çıktıları, kalite oranları) referans cihazlarla eşdeğer kabul etmeyin ve bunu sınırlılık olarak yazın.",
          "In two independent comparisons, EmotiBit's heart-rate measurements were found acceptable but its EDA agreement was insufficient: Langevin et al. (2021) against FlexComp Infiniti for SCL, SCR amplitude and SCR count; Vorreuther et al. (2025) against BITalino PsychoBit in 15 participants under workload for SCL and for SCR number and amplitude. These studies do not cover cycling. In the thesis, do not treat any value derived from EmotiBit EDA (OutLab candidates, Ledalab outputs, quality rates) as equivalent to reference devices, and state this as a limitation.",
        )}
      </p>

      <h3>{h.report}</h3>
      <blockquote>
        {t(
          "Ayrıştırma yöntemine duyarlılığı denetlemek için ham EDA, OutLab'dan Ledalab metin biçiminde (zaman, iletkenlik, olay kodu) dışa aktarıldı ve Ledalab 3.4.9 (Benedek ve Kaernbach; MATLAB [sürüm]) ile Sürekli Ayrıştırma Analizi (CDA; Benedek ve Kaernbach, 2010a) uygulandı. Örnek seyreltme [uygulanmadı / x Hz'e yapıldı]; optimizasyon [2] başlangıç değeriyle yapıldı. Olay ilişkili ölçümler olaydan sonraki 1–4 s yanıt penceresinde, [0,01] µS genlik eşiğiyle hesaplandı. Kayıt boşluğu olan oturumlar bu analize alınmadı. Görüşme anları EDA adaylarından seçildiği için bu ölçümler uyarana yanıt olarak değil, OutLab adaylarının bağımsız bir ayrıştırmayla tutarlılığı olarak yorumlandı.",
          "To check sensitivity to the decomposition method, raw EDA was exported from OutLab in Ledalab's text format (time, conductance, event code) and analysed in Ledalab 3.4.9 (Benedek and Kaernbach; MATLAB [version]) with Continuous Decomposition Analysis (CDA; Benedek and Kaernbach, 2010a). Downsampling was [not applied / applied to x Hz]; optimisation used [2] initial values. Event-related measures were computed in a response window of 1–4 s after the event with an amplitude threshold of [0.01] µS. Sessions with recording gaps were not included in this analysis. Because the interview moments were selected from EDA candidates, these measures were interpreted not as responses to stimuli but as the consistency of the OutLab candidates with an independent decomposition.",
        )}
      </blockquote>

      <h3>{t("Diğer olası yöntemler", "Other possible methods")}</h3>
      <p>
        {t(
          "Aşağıdakiler OutLab'a dahil değildir. Her biri için çevrimdışı uygulanabilirliği ve lisansı veriyoruz; hiçbiri bisiklet verisinde doğrulanmamıştır.",
          "None of the following is part of OutLab. For each we give offline feasibility and the licence; none has been validated on cycling data.",
        )}
      </p>
      <ul>
        <li>
          <b>
            {t(
              "EDA Explorer (Taylor ve ark., 2015; S24): ",
              "EDA Explorer (Taylor et al., 2015; S24): ",
            )}
          </b>
          {t(
            "5 s'lik dönemlerde EDA özniteliklerinden SVM ile artefakt sınıflandırır. Python'da çevrimdışı çalışır, MIT lisanslıdır. Kod veriyi 8 Hz'e örnekler; model Q Sensor verisiyle eğitilmiştir ve Kleckner ve ark. verisinde uzmanlarla uyumu %77, κ = 0,46'dır.",
            "classifies artifacts with an SVM on EDA features in 5 s epochs. It runs offline in Python under the MIT licence. The code resamples to 8 Hz; the model was trained on Q Sensor data, and on Kleckner et al.'s data its agreement with experts was 77%, κ = 0.46.",
          )}
        </li>
        <li>
          <b>
            {t(
              "EDASymp (Posada-Quintero ve ark., 2016; S26): ",
              "EDASymp (Posada-Quintero et al., 2016; S26): ",
            )}
          </b>
          {t(
            "EDA'nın 0,045–0,25 Hz bandındaki spektral gücü; tek tek SCR tespitine dayanmaz. NeuroKit2'de eda_sympathetic(method=\"posada\") olarak bulunur (MIT), en az 64 s sinyal ister; çevrimdışı kolaydır. Egzersizde bandın üst sınırı yükselir (yaklaşık 0,28–0,37 Hz; S27), bu yüzden efor sırasında frequency_band genişletilmeli ve raporlanmalıdır.",
            'the spectral power of EDA in the 0.045–0.25 Hz band; it does not rely on detecting individual SCRs. NeuroKit2 provides it as eda_sympathetic(method="posada") (MIT), which needs at least 64 s of signal; easy to run offline. During exercise the upper band limit rises (about 0.28–0.37 Hz; S27), so frequency_band should be widened during effort and reported.',
          )}
        </li>
        <li>
          <b>
            {t(
              "Gözetimsiz artefakt tespiti (Zhang ve ark., 2017; S25): ",
              "Unsupervised artifact detection (Zhang et al., 2017; S25): ",
            )}
          </b>
          {t(
            "Haar dalgacık ve istatistiksel öznitelikler; etiket gerektirmez. Resmî kod bulunamadı; scikit-learn ile kendi kodunuz olarak yeniden yazılabilir, bu durumda lisans sorunu yoktur.",
            "Haar wavelet and statistical features; needs no labels. No official code was found; it can be reimplemented as your own code with scikit-learn, in which case there is no licence issue.",
          )}
        </li>
        <li>
          <b>
            {t(
              "LSTM-CNN (Llanes-Jurado ve ark., 2023; S28): ",
              "LSTM-CNN (Llanes-Jurado et al., 2023; S28): ",
            )}
          </b>
          {t(
            "artefaktları hem tanır hem düzeltir; önceden eğitilmiş model TensorFlow/Keras ile çevrimdışı çalışabilir. Kod ve model CC BY-NC-SA 4.0 lisanslıdır: yalnızca ticari olmayan kullanım, türevler aynı lisansla. Veri modelin eğitim örnekleme hızına getirilmeli; bisiklete alan kayması beklenir.",
            "both recognises and corrects artifacts; the pre-trained model can run offline with TensorFlow/Keras. The code and model are licensed CC BY-NC-SA 4.0: non-commercial use only, derivatives under the same licence. Data must be brought to the model's training sampling rate; a domain shift to cycling is likely.",
          )}
        </li>
        <li>
          <b>
            {t(
              "Dalgacık tabanlı artefakt giderme (Chen ve ark., 2015; S29): ",
              "Wavelet-based artifact removal (Chen et al., 2015; S29): ",
            )}
          </b>
          {t(
            "durağan dalgacık dönüşümü katsayılarına Gauss karışımıyla uyarlanır eşik uygular. Resmî kod bulunamadı; PyWavelets ile yeniden yazılabilir. Giderme sinyali değiştirdiği için ham veri ayrıca saklanmalıdır.",
            "applies adaptive thresholds, based on a Gaussian mixture, to stationary wavelet transform coefficients. No official code was found; it can be reimplemented with PyWavelets. Because removal changes the signal, the raw data must be kept separately.",
          )}
        </li>
      </ul>

      <h3>{h.sources}</h3>
      <Sources
        items={[
          ["S22", t("Ledalab resmî deposu", "Ledalab official repository")],
          [
            "S20",
            t(
              "Benedek ve Kaernbach, 2010a (CDA)",
              "Benedek and Kaernbach, 2010a (CDA)",
            ),
          ],
          [
            "S21",
            t(
              "Benedek ve Kaernbach, 2010b (DDA)",
              "Benedek and Kaernbach, 2010b (DDA)",
            ),
          ],
          ["S23", t("ledapy", "ledapy")],
          ["S15", t("Makowski ve ark., 2021", "Makowski et al., 2021")],
          ["S24", t("Taylor ve ark., 2015", "Taylor et al., 2015")],
          [
            "S26",
            t("Posada-Quintero ve ark., 2016", "Posada-Quintero et al., 2016"),
          ],
          [
            "S27",
            t("Posada-Quintero ve ark., 2018", "Posada-Quintero et al., 2018"),
          ],
          ["S25", t("Zhang ve ark., 2017", "Zhang et al., 2017")],
          [
            "S28",
            t("Llanes-Jurado ve ark., 2023", "Llanes-Jurado et al., 2023"),
          ],
          ["S29", t("Chen ve ark., 2015", "Chen et al., 2015")],
          ["S30", t("Langevin ve ark., 2021", "Langevin et al., 2021")],
          ["S31", t("Vorreuther ve ark., 2025", "Vorreuther et al., 2025")],
        ]}
      />
    </>
  );
}
