# RotaLab

EmotiBit sensörleri, Insta360 videosu ve GPX rotasını ortak bir zaman çizgisinde incelemek; seçilen anları uyarılmış hatırlama görüşmesinde kullanmak için Türkçe, yerel araştırma uygulaması.

**Açılış:** macOS'ta `RotaLab_Baslat.command` dosyasına çift tıklayın. Adres: **http://127.0.0.1:8765**. Terminal penceresi açık kalmalıdır. İlk kurulum Python 3.11+ ve Node.js 22+ gerektirir; ücretsiz açık kaynak paketlerini indirir. Kurulumdan sonra analiz ve rota görünümü çevrimdışı çalışır. API anahtarı veya ücretli servis gerekmez.

## Neler yapar?

- CSV, `_info.json`, GPX ve yerel video için toplu sürükle bırak. Dosya başlığı/ilk satır önizlemesi, kanal/zaman/değer/birim eşlemesi.
- EA/EL/ER/SA/SR/SF, PI/PR/PG, HR/BI, AX/AY/AZ, GX/GY/GZ, MX/MY/MZ, T0/T1/TH/H0 kanalları.
- Ortak imleç, sinyalden veya rotadan videoya atlama; pikleri koruyan çizim, kesinti ve kapsam dışı zamanlarda veri uydurmama.
- Tek ortak olayla ofset; iki olayla doğrusal saat kayması düzeltmesi; bağımsız kontrol notu. GPX için ayrı doğrulama, gerekçe ve belirsizlik.
- NeuroKit2 temizleme ve highpass tonic/phasic tahmini; açık robust-z aday taraması. Hareket yalnızca uyarı; ham veri korunur.
- Öncesi/sonrası ayarlanabilen görüşme bölümleri; grafik ve biyometrik gerekçe gizleyen katılımcı görünümü; anlatı ve araştırmacı kodları.
- Yerel otomatik kayıt ve birden çok oturum. SHA-256 kontrollü taşınabilir proje paketi; işlenmiş EDA CSV, görüşme CSV, yazdırılabilir yöntem/işlem raporu.
- Gerçek katılımcı kullanmayan, açıkça etiketlenmiş sentetik demo.

## Araştırma sınırı

RotaLab **duygu veya stres teşhisi yapmaz**. Aday eşikleri keşif amaçlı araştırmacı ayarlarıdır; doğrulanmış SCR ölçütü veya klinik sınır değildir. Tonic/phasic ayrımı yöntem ve filtreye bağlı tahmindir. Kaynakta bulunmayan HR veya HRV ham PPG'den üretilmez. Yazılım testleri, bisiklet sürerken yapılan ölçümün bilimsel geçerliğini kanıtlamaz. Saha öncesi pilot ve danışmanla yöntem değerlendirmesi gerekir.

Bu sürüm resmî **EmotiBit DataParser tarafından ayrıştırılmış CSV** ister. Ham başlıksız paket dosyası açık yönlendirmeyle reddedilir. INSV dosyası **Insta360 Studio üzerinden H.264 MP4** olarak dışa aktarılmalıdır. 360° sürüklemeli görünüm için birleştirilmiş 2:1 equirectangular MP4 desteklenir; yeniden kadrajlanmış düz MP4 de açılır. Uzun/parçalı videolar önceden tek video haline getirilmelidir. Gerçek X3 kaydıyla cihazdan uçtan uca saha doğrulaması henüz yapılmamıştır.

## İlk kullanım

1. Sentetik demoda **Adayları hesapla** düğmesini deneyin; birkaç anı görüşme listesine ekleyin.
2. Sol üst oturum menüsünden **Yeni oturum** açın. Katılımcıya araştırma kodu verin.
3. **Veri ekle** ile ayrıştırılmış CSV'leri ve `_info.json` dosyasını sürükleyin. Sütunları ve zaman birimini kontrol edip onaylayın.
4. MP4 ve zaman damgalı GPX'i ekleyin. **Zaman eşleme** sayfasında video ve GPX'i ayrı doğrulayın.
5. **Analiz ayarları** bölümünde bağlamı bilinen kaliteli bir karşılaştırma aralığı seçin; analizi çalıştırın.
6. Adayları ham sinyal/hareket/video ile inceleyin. Düşük değişimli karşılaştırma anlarını da elle işaretleyin.
7. **Görüşme odası**nda bölümün öncesi/sonrasını belirleyin; katılımcı görünümüne geçip serbest anlatıyı kaydedin.
8. **Dışa aktar → Taşınabilir proje paketi** ile yedek alın. Video ayrıca saklanır ve sonraki açılışta yeniden bağlanır.

## Belgeler

- [Türkçe kullanım kılavuzu](docs/KULLANIM_KILAVUZU.md)
- [Bilimsel gerekçeler ve pilot protokol](docs/SCIENTIFIC_BASIS.md)
- [Doğrudan doğrulanmış 12 kaynak](docs/SOURCES.json)
- [Gereksinim karşılıkları ve uygulama sınırları](docs/REQUIREMENTS.md)
- [Doğrulama kaydı](docs/VALIDATION.md)
- [API sözleşmesi](docs/CONTRACT.md)

## Veri saklama

Sunucu yalnız `127.0.0.1` üzerinden erişilir. Video tarayıcıda yerel dosya olarak oynatılır; uygulama CSV/GPX metnini yalnız yerel Python motoruna gönderir. Harici harita, analiz API'si, font veya telemetri isteği yoktur. Bilimsel kaynak bağlantıları ancak tıklandığında dış siteyi açar.

Oturumlar tarayıcının **IndexedDB** deposundadır. Tarayıcı/site verisi silinirse oturumlar kaybolabilir. Aynı tarayıcı profilini kullananlar verilere erişebilir. Paket JSON şifrelenmez; ayrı güvenli yedek gerekir. SHA-256 dosya bütünlüğü kontrolüdür, elektronik imza/kimlik doğrulaması değildir. `localhost`, `127.0.0.1`, geliştirme 5173 ve çalışma 8765 adresleri ayrı tarayıcı depolarıdır; standart olarak **127.0.0.1:8765** kullanın.

Git deposu uygulama kodu ve sentetik testlerden oluşur. Gerçek biyometrik CSV, GPX, video, tez belgeleri ve oturum yedekleri dahil edilmez. `.gitignore` ek koruma sağlar; dosya uzantısını değiştirerek bu korumanın aşılabileceğini unutmayın.

## Geliştirme / doğrulama

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock.txt
npm ci
npm run build
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765 --no-access-log
```

Geliştirmede ikinci terminal: `npm run dev` (127.0.0.1:5173, yerel API proxy). Testler:

```sh
.venv/bin/python -m pytest -q tests/test_backend.py
npm run test:e2e
```

Kilit dosyaları gerçek test ortamının sürümlerini içerir. İlk tarayıcı testi Chrome gerektirir; alternatif Playwright Chromium kurulumu test yapılandırmasında uyarlanabilir. `requirements.lock.txt` Python 3.13/macOS arm64 üzerinde doğrulanmıştır; diğer platformlarda bağımlılık uyumluluğu ayrıca kontrol edilmelidir.
