# RotaLab: bilimsel temel ve araştırma protokolü

Doğrulama tarihi: **14 Eylül 2026**. Bu metin, kaynaklarda belirtilen bilgiler ile RotaLab için seçilen yöntem kararlarını ayırır. Aşağıdaki kaynaklar bu yazılımın veya EmotiBit–bisiklet kullanımının bilimsel olarak valide edildiği anlamına gelmez. Saha geçerliği, gerçek cihaz kaydı ve bağımsız değerlendirme gerektirir. Makine tarafından okunabilir kaynak kaydı: [SOURCES.json](SOURCES.json).

## 1. Bu sistem hangi soruyu yanıtlar?

RotaLab, “Bu zaman aralığında hangi sinyaller değişti, video ve konum ne gösteriyor, katılımcı daha sonra bu anı nasıl anlatıyor?” sorusunu araştırmaya yardım eder. Bir EDA yükselişine otomatik olarak korku, mutluluk veya stres adı vermez. Ölçüm, işlenmiş sinyal, araştırmacı yorumu ve katılımcının geriye dönük anlatısı ayrı kanıt katmanlarıdır.

EDA literatürü aynı ölçümü uyarılma, dikkat ve başka süreçlerle ilişkilendirir; saha koşulları ve ölçüm özellikleri yorum için gereklidir. Bu nedenle **tek bir sinyalden özgül duygu çıkarılmaması**, bu proje için temkinli bir yöntem kararıdır. Bir dalga yükselişini belirli bir manzaranın nedeni olarak göstermek de gözlemsel eşzamanlılığın ötesine geçer. [S07: SPR önerileri](https://doi.org/10.1111/j.1469-8986.2012.01384.x)

| Ekrandaki bilgi | Anlamı | Tek başına göstermediği şey |
| --- | --- | --- |
| EDA / EA | Deri iletkenliği zaman serisi | Duygunun adı, olumlu veya olumsuz oluşu |
| PPG / PI, PR, PG | Optik nabız dalgası kanalları | Doğrudan kalp hızı veya güvenilir HRV |
| HR / BI | Kaynak cihazın ürettiği türetilmiş kanallar | Bisiklet sırasında doğruluğu kanıtlanmış ölçüm |
| ACC / AX, AY, AZ | İvme ve hareket bağlamı | EDA değişiminin kesinlikle artefakt olduğu |
| GPX | Zamanı varsa konumla eşleme | Noktalar arasındaki kusursuz gerçek rota |
| Aday an | İncelenmeye değer sinyal değişimi | Doğrulanmış SCR, istatistiksel anlamlılık veya duygu |
| Görüşme notu | Katılımcının sonraki anlatısı | Geçmiş zihinsel durumun hatasız kaydı |

Kanal adları EmotiBit belgesinden gelir; yorum sınırları bu çalışma için belirlenmiştir. [S01: EmotiBit veri rehberi](https://github.com/EmotiBit/EmotiBit_Docs/blob/master/Working_with_emotibit_data.md)

## 2. Kayıt dosyalarını hazırlama

**EmotiBit:** Ham paket CSV'sini, oturumun `_info.json` dosyasını ve DataParser çıktısını birlikte arşivleyin. Resmî ayrıştırılmış biçimde `LocalTimestamp` epoch saniyesi, `EmotiBitTimestamp` cihaz açılışından itibaren milisaniyedir. `_info.json` birim, örnekleme ve sürüm bilgilerini taşır. `DataReliability` alanı geleceğe ayrılmıştır; “%100 kaliteli veri” anlamına gelmez. [S01](https://github.com/EmotiBit/EmotiBit_Docs/blob/master/Working_with_emotibit_data.md)

İlk sürüm için desteklenen güvenilir giriş yolu **DataParser ile ayrıştırılmış CSV** veya zaman/değer sütunları açık genel CSV'dir. Ham pakette birden fazla örnek bulunabildiğinden paket zamanını her örneğe aynı biçimde kopyalayarak bilimsel kesinlik üretilmez. Resmî örnekte bile tekrarlanan zamanlar bulunduğu için tekrarlar görünür biçimde raporlanmalıdır. `LocalTimestamp` eksikliği, otomatik olarak sıfır zaman veya UTC kabul edilmez. [S02: DataParser kılavuzu](https://github.com/EmotiBit/EmotiBit_Docs/blob/master/EmotiBitDataParser_reference_manual.md)

**Insta360 X3:** 360° kayıtlar INSV, bazı tek lens kayıtları MP4 biçimindedir; X3'ün yüksek çözünürlüklü kaydı birden fazla VID dosyası üretebilir. Asıl kamera dosyalarını adlarını değiştirmeden birlikte saklayın. Studio MP4 dışa aktarımını destekler. [S04: X3 dosya biçimleri](https://onlinemanual.insta360.com/x3/en-us/operating-tutorials/storage/fileformat), [S05: Studio dışa aktarımı](https://onlinemanual.insta360.com/studio/en-us/operation-guide/file-management/file-export-instructions)

Uygulamaya aktarılacak inceleme kopyasını normal hızda, zaman atlaması veya sessiz kesme olmadan dışa aktarmak bu projenin tercihidir. Tarayıcı uyumu için önce kısa bir MP4 deneyin. Dışa aktarılmış MP4'ün mevcut olması, 360° pan/tilt görüntüleyicisinin veya doğrudan INSV işlemenin desteklendiği anlamına gelmez. Dosya oluşturulma tarihi ve kamera dosya adı tek başına senkron kanıtı değildir.

**GPX:** Strava web sitesinde kendi kaydedilmiş etkinliğinizin menüsünden **Export GPX** kullanın. Resmî açıklama, bu çıktıda koordinat ve zaman damgaları bulunduğunu belirtir. [S06: Strava dışa aktarımı](https://support.strava.com/en-us/articles/15401919-exporting-your-data-and-bulk-export)

GPX 1.1 şemasında konum WGS84'tür; nokta zamanı isteğe bağlıdır. Bu yüzden “GPX dosyası var” ile “zamanlı etkinlik izi var” aynı değildir. Zamansız planlanmış rota, videonun belirli saniyesindeki gerçek konumu doğrulamaz. Segmentler ve kayıt boşlukları korunmalıdır. [S03: GPX şeması](https://www.topografix.com/GPX/1/1/)

## 3. Aynı zaman eksenine yerleştirme

Bu bölüm bir **mühendislik modeli** ve saha doğrulama önerisidir; üreticilerin garanti ettiği eşleme doğruluğu değildir.

Sensör oturum zamanı referans alınır. Her sensör kanalı ayrı ayrı sıfırlanmaz; ortak başlangıç korunur. Video eşlemesi şöyledir:

```text
oturum_saniyesi = a × video_saniyesi + b
tek eşleme noktası: a = 1, b = sensör_zamanı − video_zamanı
iki eşleme noktası: a = (s2 − s1) / (v2 − v1), b = s1 − a × v1
saat kayması (ppm) = (a − 1) × 1 000 000
```

`b` başlangıç farkını, `a` kayıt boyunca saatlerin farklı ilerlemesini temsil eder. İki noktanın kendi çizgisine tam oturması bağımsız doğrulama değildir. Mümkünse üçüncü bir gözlenebilir olayı kontrol için ayırın; tahmin ile gözlem farkını saniye olarak raporlayın. Kesilmiş veya hızı değiştirilmiş videoya tek doğrusal eşleme yetmeyebilir. Eşleme noktalarının dışında doğruluk varsayımının zayıfladığını belirtin.

Bisiklet dururken, turun başı ve sonunda kamera görüntüsünde seçilebilen, sensör ivmesinde de ayırt edilen kısa bir kol hareketi kaydetmek uygulanabilir bir pilot yöntemdir. Bu işareti biyolojik EDA yanıtına göre eşlemeyin; biyolojik gecikme ile cihaz saat farkı karışabilir. Alkış sesi tek başına EmotiBit'te karşılığı gösterilmedikçe ortak işaret sayılmaz. GPS için zamanlı cihaz kaydı kullanın; sadece bir harita noktasını görerek alt saniye hassasiyeti iddia etmeyin.

UTC/epoch bilgisi bulunan sensör ve GPX akışları başlangıç farkıyla ön yerleşebilir. **Otomatik ön yerleşim, doğrulanmış senkron anlamına gelmez.** Zaman dilimi olmayan tarih metnini tahminle dönüştürmeyin. Her eşleme için yöntem, noktalar, gerekçe, kullanıcı tarafından tahmin edilen belirsizlik ve varsa bağımsız kontrol farkı saklanmalıdır. Kullanıcının yazdığı “±1 saniye” istatistiksel güven aralığı değildir.

## 4. EDA işlemenin açıklanabilir sınırları

SPR önerileri tonik/fazik değerlendirmeyi, örneklemeyi, elektrot ve yerleşimi, baseline koşullarını, değerlendirme pencerelerini ve artefakt işlemlerini açık raporlamayı ister. Şüpheli tepkilerin görsel kontrolünü de önerir. [S07](https://doi.org/10.1111/j.1469-8986.2012.01384.x)

RotaLab için yöntem düzeni:

1. **Önce giriş kontrolü:** Zaman sırası, sayısal değerler, tekrarlar, boşluklar ve düz sinyal raporlanır. Ham değerlerin üstüne yazılmaz.
2. **İşlenmiş gösterim:** Filtre veya yeniden örnekleme yalnız türetilmiş seride uygulanır. Büyük boşluklar üzerinden çizgiyle sahte süreklilik oluşturulmaz; kısa kesitlerde filtre sonuçlarına temkinli yaklaşılır.
3. **Tonik ve fazik tahmin:** NeuroKit2 `eda_phasic(method="highpass")`, varsayılan 0,05 Hz sınırla Butterworth yüksek/alçak geçiren filtreler kullanır. Bu yöntem cvxEDA değildir. Gerçek çalıştırmada kullanılan kütüphane sürümü ve parametreler kaydedilmelidir. [S11: resmî fonksiyon kodu](https://neuropsychology.github.io/NeuroKit/_modules/neurokit2/eda/eda_phasic.html)
4. **Aday seçimi:** Araştırmacının belirlediği referans bölümüne göre büyük değişimleri inceleme kuyruğuna almak için robust-z tabanlı keşif yaklaşımı kullanılır.
5. **Görsel karar:** Adaylar video, ham/işlenmiş iz ve hareket bağlamıyla incelenir. Kabul, dışlama veya kararsızlık gerekçesi not edilir.

Robust-z hesaplamasının genel biçimi:

```text
m = medyan(referans bölümündeki x değerleri)
MAD = medyan(|x − m|)
z_robust = (x − m) / (1,4826 × MAD)
```

NIST'in değiştirilmiş z puanı yaklaşık eşdeğer `0,6745 × (x − medyan) / MAD` biçimindedir. Kaynak bunu olası aykırı gözlemleri incelemeye alma aracı olarak açıklar. **Biyometrik zaman serisine, seçili baseline'a ve aday olaylara uygulanması RotaLab'ın keşif amaçlı uyarlamasıdır.** Otokorelasyon, dağılım ve baseline seçimi nedeniyle bu puan p değeri değildir; NIST'teki 3,5 değeri duygu veya SCR eşiği olarak aktarılamaz. [S10: NIST](https://www.itl.nist.gov/div898/handbook/eda/section3/eda35h.htm)

`x` için kullanılan seri, referans başlangıç/bitişi, eşik, adaylar arası minimum süre ve kalite kuralları işlem çıktısında bulunmalıdır. Referans bölümünün yetersiz, boş veya değişimsiz olması açıklanmalıdır; MAD sıfır olduğunda sessizce sonsuz skor üretilmez. Adayın fazik tepe yüksekliği, ayrıca başlangıç ve tepe saptanmadıkça standart **SCR genliği** adıyla sunulmaz.

### İlk analiz sürümünün parametreleri

Temizleme için NeuroKit2 `eda_clean(method="neurokit")` kullanımı 3 Hz, dördüncü dereceden Butterworth alçak geçiren filtreye dayanır. [S12: resmî temizleme kodu](https://neuropsychology.github.io/NeuroKit/_modules/neurokit2/eda/eda_clean.html)

Aşağıdaki diğer değerler **RotaLab'ın hesaplama sınırlarıdır; valide edilmiş fizyolojik eşikler değildir**:

| Adım | İlk sürüm kararı |
| --- | --- |
| Analiz örneklemesi | 7 Hz altındaki EDA analizi reddedilir; bu, düşük örneklemeli EDA'nın genel olarak geçersiz olduğu anlamına gelmez. |
| Boşluk ayrımı | Ardışık fark `max(3 × medyan zaman aralığı, 0,25 sn)` değerini aşarsa kesit ayrılır. Kesit içi düzenli örneklemeye geçiş türetilmiş seridir. |
| Kesit ve baseline yeterliği | En az 10 saniye ve 50 geçerli örnek aranır. Baseline tercihi deneysel protokole göre ayrıca gerekçelendirilmelidir. |
| Skor serisi | `x`, filtre ile elde edilen fazik seridir; referans medyanı ve MAD bu seriden hesaplanır. |
| MAD denetimi | `MAD ≤ 10⁻⁹` ise açıklayıcı hata verilir; sayısal olarak kararsız skor üretilmez. |
| Aday seçimi | Pozitif fazik yerel tepeler, robust-z eşiği ve kullanıcı tarafından belirlenen minimum zaman aralığıyla seçilir. |
| Genlik alanı | API'deki `amplitude`, fazik tepe yüksekliğidir; başlangıçtan tepeye hesaplanan standart SCR genliği değildir. |
| Kesit uçları | İlk ve son 3 saniyede aday aranmaz. Bu tercih filtre uç etkilerini bütünüyle ortadan kaldırdığı anlamına gelmez. |
| Hareket göstergesi | `abs(d(sqrt(AX²+AY²+AZ²))/dt)` eşikle karşılaştırılır. İvme birimi g ise sonuç g/sn'dir; kaynak birimi doğrulanmalıdır. |

Özellikle kısa kesitlerde 0,05 Hz ayırmanın sınır etkileri ve baseline seçimine duyarlılık devam edebilir. İvme büyüklüğündeki değişim, her hareketi veya eforu yakalayan bir ölçü değildir. Hareket göstergesi ölçülen fiziksel efor puanı olarak adlandırılmaz. Aynı parametrelerle işlem yeniden üretilebilir olsa da bu, yorumun geçerliği anlamına gelmez.

Hareket bayrağı bir inceleme ipucudur. Egzersiz esnasında PPG'de güçlü hareket etkileri oluşabildiği özgün araştırmayla gösterilmiştir; ilgili çalışmanın koşulları bilek PPG'si ve koşudur, EmotiBit bisiklet doğrulaması değildir. RotaLab bu nedenle doğrulanmamış ham PPG'den HR/HRV üretmez. [S08: TROIKA](https://arxiv.org/abs/1409.5181)

## 5. Uyarılmış hatırlama görüşmesi

Lyle, video ile geçmiş düşüncelerin sorgulanmasını yararlı fakat yeniden yorumlama ve hatırlama sınırlılıkları taşıyan bir yöntem olarak değerlendirir; gecikmenin kısa olması yönteme katkı sağlar. **Bir hafta, literatürün garanti ettiği bir hatırlama doğruluğu eşiği değildir.** Kullanıcının saha düzenine uygun üst hedef olarak ele alınmalı; tur ve görüşme tarihleri ile geçen süre kaydedilmelidir. [S09: Lyle, 2003](https://bera-journals.onlinelibrary.wiley.com/doi/10.1080/0141192032000137349)

Aşağıdaki akış bu proje için önerilen görüşme tasarımıdır:

1. Katılımcıya önce biyometrik grafik ve aday gerekçesi gösterilmeden, seçilen anın öncesini ve sonrasını içeren kesiti izletin. Önce/sonra sürelerini olay bağlamına göre ayarlayıp saklayın; örneğin 15 saniye bir arayüz başlangıç tercihi olabilir, evrensel yöntem kuralı değildir.
2. “Bu bölümde neler hatırlıyorsunuz?” ve “O anda dikkatinizi ne çekiyordu?” gibi nötr sorularla başlayın. “Burada neden korktunuz?” gibi duygu varsayan sorulardan kaçının.
3. “Bunu o andan mı hatırlıyorsunuz, şimdi görüntüyü izlerken mi yorumluyorsunuz?” ayrımını nazikçe kaydedin. “Hatırlamıyorum” geçerli yanıttır.
4. Serbest anlatıdan sonra gerekliyse duygu sözcükleri ve özbildirim puanları ekleyin. Arayüzdeki isteğe bağlı valans/uyarılma değerleri, ayrıca geçerliği gösterilmiş bir ölçek uygulanmadıkça **araştırmacı tarafından tanımlanan puanlardır**.
5. Anlatıyı katılımcının ifadesi olarak, araştırmacı kodunu ve yorumunu ayrı alanlarda tutun. Video/görüşme kaydı izin kapsamıyla uyumlu olmalıdır.

Yalnız en büyük biyometrik yükselişleri seçmek, deneyimin tamamını temsil etmez. Katılımcının seçtiği anları, önceden tanımlı rota kesitlerini ve düşük değişimli karşılaştırma kesitlerini de değerlendirmek yararlı bir **örnekleme tasarımı önerisidir**. Otomatik aday sayısı, kabul edilen kesit sayısı ve anlatı sayısı birbirine eşit varsayılmaz. Özbildirim ile fizyoloji arasındaki uyuşmazlık silinmemeli veya zorla aynı etikete çevrilmemelidir.

## 6. Sahaya çıkmadan önce yapılacak pilot

Bu liste bir doğrulama planıdır; tamamlandığına ilişkin iddia değildir.

| Kontrol | Kanıt olarak saklanacak çıktı |
| --- | --- |
| Kısa gerçek EmotiBit kaydı | Ham CSV, `_info.json`, DataParser sürümü ve ayrıştırılmış dosyalar |
| Başlangıç/orta/bitiş eşleme kontrolü | Video ve ACC işaretleri; bağımsız işarette zaman hatası |
| Kayıt kesintisi ve saat sorunu | Yeniden başlatma, boşluk ve eksik zamanlarda açık uyarı |
| Manuel sinyal karşılaştırması | Seçilmiş zamanlarda kaynak CSV ile uygulama değerlerinin eşleşmesi |
| Hareket ve duruş karşılaştırması | Sensör sabitlemesi, temas sorunu ve hareketli kesitlerin görsel incelemesi |
| Adayların insan tarafından incelenmesi | Aday başına kabul/dışlama/kararsızlık ve gerekçe; algoritmanın kaçırdığı manuel anlar |
| Parametre duyarlılığı | Baseline/eşik değişince hangi anların değiştiğinin kaydı |
| Görüşme provası | Kesit öncesi/sonrası bağlamın yeterliği, yönlendirici soru kontrolü, yeniden açılabilen notlar |
| Projeyi taşıma | Dışa aktarılan proje dosyasını yeni oturumda açıp video bağlantısı, eşleme, not ve kaynak özetlerini doğrulama |

Sentetik demo ve otomatik testler yazılım davranışını kontrol eder; insan fizyolojisi için duyarlılık/özgüllük veya saha geçerliği göstermez. Bu çıktılar araştırmacının yöntem kararını denetlenebilir kılar; tezin yöntem bölümünde gerçek uygulanan prosedür, örneklem ve kontrol sonuçları ayrıca yazılmalıdır.

## 7. Asgari araştırma kaydı

Her oturumda katılımcı kodu, tur/görüşme tarihi, kayıt cihazı ve sürümü, sensör yerleşimi, kayıt öncesi koşullar, ortam ve efor notları; dosya adları ve SHA-256 özetleri; içe aktarma eşlemeleri; saat modeli; analiz sürümü/parametreleri; aday seçim gerekçeleri ve katılımcı anlatıları korunmalıdır. SHA-256 dosya değişikliğini denetlemeye yardım eder, ölçümün bilimsel doğruluğunu kanıtlamaz.

Kimlik eşleme anahtarı ve ham kişisel kayıtlar kaynak kod deposunun dışında tutulmalıdır. Gizli GitHub deposu, araştırma verisinin oraya yüklenmesini gerekli kılmaz. Bu bir veri yönetimi tercihidir; hukuki uygunluk veya etik kurul onayı hakkında otomatik değerlendirme değildir.

## 8. Kaynakların kapsamadığı iddialar

- EmotiBit'in bu bisiklet protokolünde belirli bir doğrulukla çalıştığı.
- Video, GPX ve sensörün dosyaları seçilince kendiliğinden kusursuz senkron olduğu.
- Uygulamanın stres, korku, mutluluk, hastalık veya klinik risk teşhis ettiği.
- Robust-z eşiğini aşan her adayın gerçek SCR olduğu veya aynı duyguya karşılık geldiği.
- Yüksek ACC'nin fizyolojik veriyi otomatik geçersiz kıldığı.
- Bir haftalık görüşme gecikmesinin hatırlama yanlılığını ortadan kaldırdığı.
- Uygulamada bulunan bir kaynak bağlantısının yazılımın tamamını valide ettiği.

Kaynak metinleri 14 Eylül 2026 tarihinde üretici, standart sahibi, yazar arşivi veya yayıncı sayfasında kontrol edildi. Arama sonuçları keşif için kullanıldı; bu belgedeki teknik iddialar doğrudan açılan kaynaklara dayanır. Lyle için yayıncı özeti incelendi; makalenin tüm yöntem ayrıntılarının incelendiği iddia edilmez. Kaynak kaydındaki erişim düzeyi bu ayrımı korur.
