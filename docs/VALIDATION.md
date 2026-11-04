# OutLab doğrulama kaydı

Tarih: **14 Eylül 2026**. Ortam: macOS arm64; Python 3.13.7; Node.js 22.18.0; React 19.3.0; Vite 6.4.3; NeuroKit2 0.2.13; NumPy 2.5.3; SciPy 1.18.1; Playwright 1.63.0; yerel Google Chrome. Kurulan tam Python ve Node bağımlılıkları kilit dosyalarındadır.

## Tamamlanan kontroller

| Kontrol | Sonuç |
|---|---|
| TypeScript + üretim derlemesi | `npm run build` başarılı; iki JS paketi, yerel CSS |
| Python parser/API/analiz testleri | **43/43 geçti**; 2 üçüncü taraf deprecation uyarısı |
| Tarayıcı ve geometri testleri | **12/12 geçti** (9 iş akışı + 3 geometri); yakalanmamış JS hatası yok |
| Başlatıcı sözdizimi | `python3 -m py_compile launch.py`, `bash -n OutLab_Baslat.command` başarılı |
| Gerçek başlatıcı ve üretim sürümü | `.command --no-browser` ile sunucu açıldı; `launch.py --check`, uygulama kimliği/sürümü ve HTTP 200 doğrulandı. Üretim arayüzünde demo analizi 5 aday üretti; aynı an video/rota/grafikte açıldı |
| Kaynak kayıtları | SOURCES.json ve bilimsel belgedeki 12 kaynak kimliği tutarlı; birincil sayfalar doğrudan doğrulandı |
| Yerel eski EmotiBit kaydı | Başlıksız ham paket olarak tanındı; DataParser yönlendirmesiyle analizden korundu. Gerçek bilgi JSON dizi biçimi kabul edildi; dosyalar depoya kopyalanmadı |
| Masaüstü ve mobil | 1512×982 ve 390×844 tarayıcı görünümü incelendi; yatay taşma yok; mobil sahne açıklaması düzeltildi |
| Bilimsel kod incelemesi | Aşağıdaki dört veri bütünlüğü bulgusu düzeltilip yeniden kontrol edildi |

## 43 backend testi neyi doğruluyor?

- Sensör/metadata sayaç ayrımı; geniş CSV; açık sütun seçimi; virgül/noktalı virgül ve ondalık virgül; bozuk satır sayımı; kaynak hash değerleri.
- Epoch saniye/milisaniye/mikrosaniye ve saat dilimli ISO; ortak sensör başlangıcının korunması; kanallar arası gecikme; karışık mutlak/göreli saatin reddi; cihaz sıfırlama davranışı.
- Resmî bilgi JSON nesne dizisi; kaynakta beyan edilmiş birimler; uyumsuz EDA biriminin reddi; m/s² → g hareket dönüşümü; UTF-8 BOM'un ayrıştırılırken kaynakta/hash'te korunması.
- GPX ad alanı, bölüm sınırları, zaman damgasız izlerin reddi; kötü niyetli XML varlıklarının reddi.
- Boşluklar üzerinden filtreleme yapılmaması; sabit/yetersiz MAD aralığında skor üretilmemesi; negatif EDA ve kısa kesitler; hareket kapsamı ve adaylar.
- Localhost Host/Origin sınırı; gerçek istek gövdesi sınırı; geçersiz JSON/model davranışı; ham paket yönlendirmesi.

## 12 tarayıcı/geometri testi neyi doğruluyor?

1. Sentetik demo analizi → aday seçimi → nötr görüşme → anlatı kaydı → yeniden açma → paket geri yükleme. Yeniden analizde seçili adayın eski skor/config/runId/hash/anlatı kaydı korunur.
2. Tüm tanınan CSV sütunları ve manuel eşleme; GPX içe aktarma; kaynak hash'lerinin pakete taşınması.
3. Zaman damgasız GPX görünür reddedilir; mevcut oturum bozulmaz.
4. Analiz ayarı değiştirilince eski-sonuç uyarısı yeniden açılıştan sonra da kalır.
5. Değiştirilmiş proje paketi bütünlük hatasıyla reddedilir.
6. GPX doğrulaması videodan bağımsızdır; GPX ofseti değişince iptal olur ve yeniden açıldığında bu durum korunur.
7. Geciken analiz yanıtı yeni içe aktarılan veri kümesini ezemez.
8. Gerçek tarayıcıda oluşturulmuş yaklaşık 3 saniyelik sentetik WebM: video metadata, pozitif ofset, iki işaretle 1,02 oran, ortak seek, oynatma, bölüm sonunda durma ve 360° canvas.
9. Masaüstü/mobil çalışma alanı ve içe aktarma düzeni; yatay taşma ve ekran görüntüsü incelemesi.
10. Min/max çizim sadeleştirmesi çok dar pozitif/negatif pikleri korur.
11. Null/geçersiz örnek/zaman boşluğu çizgide veya gösterilen değerde sahte bağlantı üretmez.
12. GPX yalnız sürekli kapsama içinde enterpole edilir; tarih değiştirme çizgisinde kısa yay kullanılır.

## İncelemede düzeltilen veri bütünlüğü sorunları

Çalıştırma parametreleri ile düzenlenebilir ayarlar ayrı tutuldu. Eski analiz yanıtına veri kümesi kimliği koruması eklendi. Video/GPX doğrulaması ayrıldı. Görüşme adayına özgün hesaplama kökeni eklendi; çalıştırma geçmişi ve raporlar bunu korur. Bunlar yalnız görsel düzeltme değildir; yorumun hangi veri/parametreyle yapıldığını izlenebilir kılar.

## Bu kontrollerin göstermediği

**Gerçek, ortak senkronizasyon işaretli EmotiBit + Insta360 X3 + GPX saha oturumu henüz birlikte sınanmadı.** Browser testindeki video gerçek bir medya dosyasıdır, ancak matematiksel olarak üretilmiştir; X3 dosyası değildir. Sensör yerleşimi, hareket altında fizyolojik doğruluk, saha saat hatası, seçilen eşiklerin geçerliği ve katılımcı anlatısının bellek sınırlılıkları pilot çalışmada değerlendirilmelidir.

Yazılım testi, ölçüm validasyonu ve araştırma yönteminin onayı aynı şey değildir. Her test bu belgede belirtilen sentetik ve sınır-durum girdileri için kanıt sağlar; tüm olası uzunluk/kodek/firmware biçimlerini kapsamaz. Uygulamadaki veri hacmi sınırları kullanım kılavuzundadır.
