# İstek ve uygulama karşılıkları

Kaynak belge: projenin ilk gereksinim şartnamesi (14.09.2026). Şartname bağlayıcı bir teknik tasarım olarak değil, gereksinim listesi olarak ele alındı. Streamlit yerine video/konum/sinyal etkileşiminde tek saat kontrolü için React + yerel FastAPI kullanıldı.

| İstek | Karşılığı / açık sınır |
|---|---|
| Türkçe, pratik modern arayüz | Aşamalı gezinme, rehber, demo, masaüstü/mobile uyum, erişilebilir düğme etiketleri |
| Toplu sürükle bırak | CSV/GPX/info JSON toplu inceleme, video yerel bağlama |
| Yanlış sütun seçimini önleme | Etiket önceliği, metadata sayaçlarının reddi, önizleme ve elle eşleme |
| Çoklu sensörler | Şartnamedeki tüm etiketler; birim belirsizliği korunur |
| Video + konum + biyometri | Tek sensör referans saati; video/grafik/rota tıklaması ortak konum |
| Insta360 X3 | Studio'dan dışa aktarılmış MP4, isteğe bağlı 360 küre görünümü; INSV doğrudan çözülmez |
| Tonic/phasic | NeuroKit2 temizleme/highpass; gerçek sürüm ve parametre kaydı |
| Hareket destekli kalite | Bileşke ivme türevi g/sn; varsayılan otomatik silme/interpolasyon onarımı yerine uyarı |
| Sonuçların bilimsel gerekçesi | Kaynak/iddia/uygulama/sınır matrisi, ekran açıklamaları, işlem raporu |
| Görüşmede önce/sonra video | Ayarlanabilir aralık, sınırlı oynatma, nötr katılımcı görünümü ve notlar |
| Yeniden üretilebilirlik | Ham kaynak metni, SHA-256, analizin sürümü, parametreler, aday snapshot, çalıştırma/günlük geçmişi |
| Kaydet ve devam et | IndexedDB, çoklu oturum, taşınabilir JSON paket; video tekrar bağlanır |
| Tek tık açılış | macOS .command, bağımlılık/build hazırlayan Python başlatıcı |
| Gizli GitHub | Yalnız kod, belgeler ve sentetik testler; kullanıcı verileri ayrı |

Bilimsel gerekçeyle değiştirilmiş kararlar: sabit 15/25/7,5 Hz varsayımı yapılmaz; bozuk satırlar sessizce yutulmaz; hareket kesin artefakt sayılmaz; “tonic = temel stres” ve “phasic = duygu” yorumları kullanılmaz; genel EDA tepesi valide SCR genliği/sıklığı olarak verilmez; cihaz ve epoch saatleri büyüklük tahminiyle körlemesine birleştirilmez.

Saha doğrulaması araştırmacının gerçek, senkronizasyon işaretli EmotiBit + X3 + GPX pilot kaydıyla yapılmalıdır. Mevcut eski ham SD kart kaydı biçim tanıma/red davranışının yerel kontrolünde kullanıldı; uygulama deposuna kopyalanmadı.
