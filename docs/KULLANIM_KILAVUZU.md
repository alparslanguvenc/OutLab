# OutLab kullanım kılavuzu

## 1. Uygulamayı açma ve yeniden açma

`OutLab_Baslat.command` dosyasını çift tıklayın. Uygulama http://127.0.0.1:8765 adresinde açılır. Terminal penceresi sunucuyu çalıştırır; açık bırakın. Bitirdiğinizde önce proje paketini indirin, sonra terminalde Control+C kullanın. Yeniden açmak için aynı başlatıcı yeterlidir. İlk kurulum paket indirir; sonraki açılışlarda ağ gerekmez.

## 2. Saha hazırlığı

- Katılımcının gerçek adı yerine kod kullanın. Onam, kayıt, saklama ve görüşme düzeninizi araştırma protokolünüzde belirleyin.
- Cihaz yazılım sürümü, sensör yerleşimi, elektrot/temas durumu, hava, molalar ve efor bağlamını saha notuna yazın.
- Video, EmotiBit ve GPS kaydının gerçekten başladığını kısa testte kontrol edin. GPX üreticisinin dışa aktarması zaman damgası içermelidir; Strava zorunlu değildir.
- Başlangıç ve bitişte kamera ile sensörde ayırt edilebilen ortak fiziksel işaret planlayın. Duygusal bir tepkinin pikini saat işareti olarak kullanmayın.
- En az bir pilot turda kaydı baştan sona geri oynatın. Bu işaretlerin sensör konumu ve kayıt hızınızda ayırt edilebildiğini doğrulayın.

## 3. Dosyaları hazırlama

**EmotiBit:** Ham SD kart dosyasını resmî EmotiBit DataParser ile ayrıştırın. Her sensör için `_EA.csv`, `_AX.csv` gibi dosyalar oluşabilir. Hepsini birden bırakabilirsiniz. `_info.json` kaydı varsa onu da ekleyin. Başlıksız paketlerin bir satırında birden fazla örnek bulunabilir; güvenilir zaman dağıtımı için OutLab bu ham biçimi doğrudan yorumlamaz.

**Video:** Insta360 Studio’da X3 kaydını açıp kameranın görüntülerini birleştirerek MP4 dışa aktarın. Yaygın tarayıcı desteği için H.264 tercih edin. 360° bakış için 2:1 equirectangular MP4; sabit çerçeve için yeniden kadrajlanmış MP4 kullanın. INSV doğrudan açılmaz. Tarayıcı kodeği desteklemiyorsa dönüştürüp yeniden bağlayın. Bir oturuma **en fazla 4 video** bağlanabilir (ör. dört adet 60 dakikalık Full HD dosya). Bunlar aynı turun ardışık parçaları ya da aynı anda kayıt yapan farklı kameralar olabilir. Videolar yüklenmez; tarayıcı dosyayı doğrudan diskten okur. Çalışma alanındaki video listesinden bir videoyu seçebilir, “Değiştir” ile başka dosya bağlayabilir veya kaldırabilirsiniz.

**GPX:** Her `trkpt` noktasında geçerli `<time>` bulunmalıdır. Yalnız koordinat içeren bir rota, zamanda senkronizasyon yapmaya yetmez. İzdeki bölüm sınırları ve zaman boşlukları korunur. Arka plan haritası internetten çağrılmaz; enlem-boylamdan hesaplanan çevrimdışı rota gösterilir. Görüntü sahici sokak haritası değildir.

## 4. Sütunları doğrulama

**Veri ekle** alanına dosyaları bırakınca önce dosya türü, ilk satırlar ve seçilen sütunlar görünür. Sayısal sayaçlar (`PacketNumber`, `DataLength`, `DataReliability`, `ProtocolVersion` vb.) fizyolojik değer değildir.

| Alan | Nasıl karar verilir? |
|---|---|
| Sensör türü | EA deri iletkenliği; PI/PR/PG optik dalga; HR kaynaktaki türetilmiş nabız. |
| Zaman sütunu | `LocalTimestamp` geçerli epoch saniyesi ise ortak saat sunar. `EmotiBitTimestamp` cihazın açılışından itibaren milisaniyedir. |
| Değer sütunu | Gerçek sensör etiketi; geniş CSV'de “Tüm tanınan sensör sütunları” seçilebilir. |
| Zaman birimi | Otomatik tahmini ilk zaman farklarıyla kontrol edin. Gerekirse saniye/ms/µs/ISO seçin. |

Mutlak saat ve cihaz saati aynı sensör oturumunda karıştırılmaz. Kanalların her biri ayrı sıfırlanmaz; en erken ortak sensör zamanına göre gecikmeleri korunur. Aynı cihaz zamanının geriye gittiği yeniden başlatılmış kayıtlar ayrı oturum olmalıdır.

Geçersiz satırlar ve aynı zamandaki tekrarlar sayılır. Tekrarda ilk ölçüm analizde tutulur; ham kaynak metni proje paketinde değişmeden korunur. Herhangi bir zaman düzeltmesi fizyolojik yeniden ölçüm değildir. İçe aktarma mevcut analizi ve an listesini sıfırlar; önce proje paketini indirin.

## 5. Zamanı eşleme

Sensör ekseni referanstır. Video dönüşümü: `sensör_saniyesi = oran × video_saniyesi + ofset`. **Her video kendi ofset ve oranına sahiptir**; Zaman eşleme sayfasının üstündeki video seçicisinden eşlenecek videoyu seçin ve her biri için ortak olay işaretleyin. Ardışık parçalarda her parçanın başlangıcı farklı ofset demektir. İmleç bir anı kapsayan videoya kendiliğinden geçer; bir parça bitip sonraki aynı anı kapsıyorsa oynatma devam eder. Hiçbir videonun kapsamadığı aralıkta “Bu anda video kaydı yok” görünür.

Tek işarette oran 1'dir. Örneğin videodaki 12. saniye sensörde 20. saniyeye karşılık geliyorsa ofset +8 saniyedir. İkinci işaret 312 → 320 ise oran yine 1 olur. İkinci işaret 312 → 321 ise küçük doğrusal saat kayması hesaplanır. Çok farklı oran, yanlış işaret/saati düşündürür.

Ortak olayın açıklamasını ve gözleminize dayalı ± saniye belirsizliğini kaydedin. Bu belirsizlik istatistiksel güven aralığı değildir. İşaretler arasındaki üçüncü bağımsız olayda kalan farkı kontrol edin ve not alanına yazın.

**GPX ayrıca doğrulanır.** Geçerli mutlak saatler varsa başlangıç farkı otomatik hesaplanır; yine de video/rota bağlamında kontrol edin. Cihazda mutlak saat yoksa GPX kaydırmasını ortak bir konum/olaydan belirleyin. Kaydırma, gerekçe ve belirsizlik değişince GPX doğrulaması iptal olur. Video işareti GPX'i kendiliğinden doğrulamaz.

Zaman kapsama dışındaysa konum gösterilmez; 15 saniyeden büyük GPX araları ve bölüm sınırları üzerinde konum enterpolasyonu yapılmaz. Bunlar uygulamanın görünür kurallarıdır; cihaz doğruluğunun sertifikası değildir.

## 6. Analizi anlama

1. **Karşılaştırma aralığı:** Bağlamı bilinen, kaliteli aynı-oturum bölümü. En az 10 saniye/50 geçerli örnek ve en az %80 fazik kapsam gerekir. Bu yazılım kuralları “geçerli fizyolojik baseline” garantisi vermez. Dinlenim olarak etiketlenmez.
2. **Filtreleme:** Kesintisiz kesitler düzenli ızgaraya alınır. NeuroKit2 `eda_clean(method='neurokit')` ve `eda_phasic(method='highpass', cutoff=0.05)` uygulanır. Yöntem, kütüphane sürümleri, örnekleme ve uç dışlamaları rapora yazılır.
3. **Adaylar:** Pozitif fazik yerel tepeler, karşılaştırma medyanı/MAD ile robust-z olarak taranır. Eşik keşif amaçlıdır. MAD çok küçükse anlamlı skor üretilmez. Bu tepe yüksekliği doğrulanmış onset-to-peak SCR genliği değildir.
4. **Hareket:** Üç eksenin büyüklük değişimi g/sn cinsinden hesaplanır. Kaynak m/s² ise 9,80665 ile g'ye dönüştürülür, ham değerler değişmez. Eşik aşımı yalnız uyarıdır; bilinmeyen hareket verisi “temiz” demek değildir. Dönmenin sabit büyüklükte kaldığı hareketleri bu sezgi kaçırabilir.
5. **Görsel kontrol:** Ham/işlenmiş farkına, boşluklara, uçlara, hareket ve videoya bakın. Kısa kesitlerin tonic/phasic bileşenleri özellikle kırılgandır. Kaynak HR/BI varsa türetilmiş cihaz değeridir; PPG genliği nabız değildir.

Yeni ayar uygulamak için analizi yeniden çalıştırın. Ayarlar değişirse mevcut grafiklerin eski çalıştırmaya ait olduğu görünür. Seçilen/anlatı eklenen anlar sonraki analizde korunur; özgün skor, parametre, kaynak hash ve çalıştırma kimlikleri de saklanır.

## 7. Görüşme

Çalışma alanındaki artı düğmesi adayı görüşmeye ekler. “Anı işaretle” ile düşük tepki veya bağlamsal karşılaştırma anları da seçin. Önce/sonra süreleri varsayılan 15/20 saniyedir; protokol ve olay bağlamına göre değiştirin. Oynatıcı o anı kapsayan bağlı videoyu seçer, videonun kapsamı içinde kalır ve bölüm sonunda durur.

**Katılımcı görünümü** video ve nötr açık uçlu soruyu gösterir. Biyometrik grafik/aday gerekçesi gizlenir. Önce katılımcının kendi sözlerini kaydedin; araştırmacı kodlarını ayrı alana yazın. Ses kaydı otomatik yapılmaz. İsteğe bağlı hoşluk/uyarılma alanları valide bir ölçek uygulaması olarak sunulmaz; protokolünüzde yoksa boş bırakın.

Görüşme tarihini girin. Tur ile görüşme arasındaki gecikme raporlanmalıdır. Bir hafta içinde görüşme yapmak pratik hedefiniz olabilir; bunun bellek doğruluğunu garanti eden yöntemsel sınır olmadığı açıklanmalıdır.

## 8. Kayıt ve dışa aktarma

- **Otomatik kayıt:** Değişiklikten yaklaşık 0,7 saniye sonra IndexedDB'ye yazılır. Üstte “Yerelde kaydedildi” durumunu görün. Kapasite hatasında proje paketini hemen indirin.
- **Taşınabilir proje:** Kaynak CSV/GPX/JSON metinleri, hash'ler, analiz, eşleme, görüşme, aday kökeni, çalıştırma geçmişi ve günlük içerir. Paket bütünlüğü açılışta kontrol edilir. Video ikili dosyalarını içermez; her videonun adı, süresi ve eşlemesi pakettedir.
- **EDA CSV:** Ham, temiz, tonic, phasic, hareket göstergesi ve işaretli durum. Boş türetilmiş değerler sıfır değildir.
- **Görüşme CSV:** Seçili an, anlatı, kod, tarihler, anı kapsayan video ve dosya adı, video zamanı, o videonun senkronizasyon durumu ve aday kökeni.
- **HTML yöntem raporu:** Tarayıcıda açılır; Yazdır → PDF ile sabit rapor alınabilir. Bu otomatik kayıt tezinizin yöntem bölümünün yerine geçmez.

Paket şifrelenmez; kurumunuzun saklama protokolüne uygun yerde tutun. SHA-256 imza veya kimlik kanıtı değildir. Aynı tarayıcı profilinde açık oturumlar diğer kullanıcılarca görülebilir.

## 9. Sorun çözme ve sınırlar

| Durum | Ne yapılır? |
|---|---|
| Sunucu açılamıyor | Başlatıcı terminalindeki mesajı kontrol edin; 8765 başka uygulamadaysa onu kapatın. |
| Paket indirilemiyor | İlk kurulum için internet gerekir; Python ve Node sürümlerini kontrol edin. Analiz sırasında dış servis gerekmez. |
| Ham paket reddedildi | Resmî EmotiBit DataParser ile ayrıştırın; zaman sütunlarını doğrulayın. |
| Video açılmıyor | INSV'yi Studio'dan H.264 MP4'e dönüştürün. Tarayıcı HEVC/MOV desteği değişebilir. |
| Grafikte boşluk var | Kaynakta ölçüm yok veya kesit işlenememiştir; sistem bunu sıfırla doldurmaz. |
| Konum görünmüyor | GPX zaman aralığı, bölüm sınırı, boşluk ve kaydırmayı kontrol edin. |
| MAD/sabit aralık hatası | Yanlış sütun, elektrot teması, kalibrasyon ve aralık seçimini değerlendirin; eşiği rastgele düşürmeyin. |
| Oturumlar kayıp görünüyor | Aynı tarayıcı ve 127.0.0.1:8765 adresini kullanın. Paket yedeğinizi açın. |
| Büyük kayıt sınırı | Metin dosyası 60 MB, ön yüzde toplam 100 MB; API 128 MB, toplam sensör analiz noktası 1,5 milyon. Uzun turu başlangıçları bilinen ayrı oturum bölümlerine ayırın. Videolar blob olarak bağlanır, bu metin sınırına dahil değildir. Oturum başına en fazla 4 video bağlanır. |

Doğrudan INSV çözme, canlı cihaz akışı, otomatik ses deşifresi, video dosyasını fiziksel olarak kesip dışa aktarma, birden çok videoyu aynı anda yan yana oynatma, bulut paylaşımı ve gruplar arası istatistik bu sürümde yoktur. Görüşme bölümleri, anı kapsayan videodan zaman aralığı olarak oynatılır.
