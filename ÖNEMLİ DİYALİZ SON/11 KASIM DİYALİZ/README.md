# 🏥 Kocaeli Üniversitesi Hemodiyaliz Ünitesi Seans Yönetim ve TV Bekleme Sistemi

Kocaeli Üniversitesi Hastanesi Hemodiyaliz Ünitesi için özel olarak geliştirilmiş; sekreter, nöbetçi hemşire ve hastane yöneticileri için modern hasta kabul, seans planlama, klinik süreç takibi konsolu ile bekleme salonundaki Akıllı TV ekranlarını canlı olarak senkronize eden, **KVKK uyumlu**, **Oracle HBYS 4 ilişkisel tablo ve View mimarisine tam entegre**, **otomatik yerel ağ (LAN) keşifli Flask REST API** ve **gelişmiş siber güvenlik katmanına sahip** kurumsal sağlık bilişimi çözümüdür.

---

## 📋 İçindekiler
- [🌟 Öne Çıkan Özellikler ve Yenilikler](#-öne-çıkan-özellikler-ve-yenilikler)
- [🗄️ Oracle HBYS Veritabanı & 4 İlişkisel Tablo View Mimarisi](#️-oracle-hbys-veritabanı--4-ilişkisel-tablo-view-mimarisi)
- [📺 Akıllı TV Bekleme Ekranı & Dinamik Çalışma Modları](#-akıllı-tv-bekleme-ekranı--dinamik-çalışma-modları)
- [⏱️ Seansı Biten Hastaların 2 Dakika Takibi ve Otomatik Temizlenmesi](#️-seansı-biten-hastaların-2-dakika-takibi-ve-otomatik-temizlenmesi)
- [⏰ Sistem Çalışma Saatleri & Bekleme Zamanlayıcısı](#-sistem-çalışma-saatleri--bekleme-zamanlayıcısı)
- [🔄 Canlı View Sorgusu & "Verileri Güncelle" Mekanizması](#-canlı-view-sorgusu--verileri-güncelle-mekanizması)
- [🩺 8 Aşamalı Klinik Seans Süreci](#-8-aşamalı-klinik-seans-süreci)
- [🔒 KVKK Uyumlu Hasta Mahremiyeti & Güvenli Detay Yönetimi](#-kvkk-uyumlu-hasta-mahremiyeti--güvenli-detay-yönetimi)
- [🛡️ Kapsamlı Siber Güvenlik Katmanı](#️-kapsamlı-siber-güvenlik-katmanı)
- [👥 Rol Tabanlı Yetkilendirme & Admin Delegasyonu](#-rol-tabanlı-yetkilendirme--admin-delegasyonu)
- [📅 Rutin Seans Günleri & Güne Özel Saat Planlama](#-rutin-seans-günleri--güne-özel-saat-planlama)
- [🖥️ Ekranlar ve Erişim Adresleri](#️-ekranlar-ve-erişim-adresleri)
- [🚀 Kurulum ve Tek Tıkla Çalıştırma](#-kurulum-ve-tek-tıkla-çalıştırma)
- [📁 Dosya ve Dizin Mimarisi](#-dosya-ve-dizin-mimarisi)
- [📡 REST API Uç Noktaları (Endpoints)](#-rest-api-uç-noktaları-endpoints)

---

## 🌟 Öne Çıkan Özellikler ve Yenilikler

* **Üç Kademeli TV Güvenlik Modu:**
  1. *Güvenli Bekleme Modu (Standby):* Personel sisteme giriş yapmadığında hasta listesi tamamen gizlenir, logo ve bilgilendirme gösterilir.
  2. *Mesai Dışı Modu (Off-Duty):* Çalışma saatleri dışında ünitenin kapalı olduğu ve acil yönlendirmesi yayınlanır.
  3. *Canlı Yayın Modu (Live):* Personel oturum açtığında ve mesai saatleri içinde tam ekran 4 slaytlı canlı hasta akışı çalışır.
* **Seansı Bitenlerin 2 Dakika (120 sn) Takibi & Otomatik Temizlenmesi:** Seansı tamamlanan, yarıda kalan veya taburcu edilen hastalar 120 saniye boyunca ekranda kalır; sekreter ekranında saniye sayacı işler, süre bitince hem TV'den hem sekreterden otomatik olarak kaldırılır.
* **Tek Tıkla "Verileri Güncelle" & Dinamik View Polling:** Sekreter ekranındaki butonla veritabanı view'ı tek hamlede sorgulanır; arka plan polling servisi veritabanındaki değişiklikleri otomatik algılar.
* **Detay Modalından Doğrudan Diyaliz Durumu Güncelleme:** Hasta detay penceresinde (`Detay ▸`) hastanın seans durumu anında değiştirilebilir.
* **Dinamik "Kaydet" Butonu & Senkronize Rozet:** Kart üzerindeki dropdown değiştiğinde "Kaydet" butonu dikkat çekici yeşil durumuna geçer ve kategori rozeti anında senkronize olur.
* **Tam Ekran TV Karuseli & Dinamik Slayt Süresi:** 5'erli hasta kartları ekran yüksekliğine tam oturur; hasta yoğunluğuna göre dinamik hesaplanan slayt süresi (boşken 4 sn, hasta başı 5 sn, maks 25 sn).
* **Kesintisiz Kayan Alt Bilgi Bandı (Marquee Ticker):** Fare ile üzerine gelinse dahi durmaksızın kesintisiz akan kurumsal bilgilendirme bandı.
* **Taşınabilir / Flash Bellek Uyumluluğu:** Göreceli (relative) dizin çözümlemesi sayesinde sürücü harfi veya klasör konumu değişse bile `BASLAT.bat` ile tek tıkla çalışır.
* **Self-Healing (Kendi Kendini Onarma):** Veritabanı veya tarayıcı önbelleğinde veri tutarsızlığı tespit edildiğinde 17 standart hasta kaydı ve ilişkisel tablolar otomatik olarak yeniden yapılandırılır.

---

## 🗄️ Oracle HBYS Veritabanı & 4 İlişkisel Tablo View Mimarisi

Sistem, hastane HBYS sistemindeki Oracle veritabanı şemasına ve ilişkisel view yapısına birebir uygundur:

```
┌────────────────────────┐       ┌────────────────────────┐
│    hasta_bilgileri     │       │  dyz_hasta_bilgileri   │
├────────────────────────┤       ├────────────────────────┤
│ hastano (PK)           │◄──────│ hastadiyalizrefno (PK) │
│ adi                    │       │ hastano (FK)           │
│ soyadi                 │       └────────────────────────┘
└────────────────────────┘                   ▲
                                             │
┌────────────────────────┐                   │
│   dyz_hasta_seanslari  │       ┌────────────────────────┐
├────────────────────────┤       │dyz_hasta_tedavi_bilgi..│
│ HASTASEANSREFNO (PK)   │       ├────────────────────────┤
│ HASTATEDAVIREFNO (FK)  │──────►│ hastatedavirefno (PK)  │
│ SEANSTARIHI            │       │ hastadiyalizrefno (FK) │
│ VARDIYATANIMNO (1 / 2) │       └────────────────────────┘
│ STATU                  │
│ completed_at           │
└────────────────────────┘
```

### 1. Tablo Rolleri
1. **`hasta_bilgileri (hb)`:** Temel hasta kimlik tablosu (`hastano`, `adi`, `soyadi`).
2. **`dyz_hasta_bilgileri (dhb)`:** Diyaliz hasta kayıt tablosu (`hastadiyalizrefno`, `hastano`).
3. **`dyz_hasta_tedavi_bilgileri (dhtb)`:** Tedavi ve protokol bilgileri (`hastatedavirefno`, `hastadiyalizrefno`).
4. **`dyz_hasta_seanslari (t)`:** Günlük seans operasyon tablosu (`HASTASEANSREFNO`, `HASTATEDAVIREFNO`, `SEANSTARIHI`, `VARDIYATANIMNO`, `SEANSTURU`, `SURE`, `STATU`, `completed_at`, vb.).

### 2. SQL View Tanımı (`VW_DYZ_GUNLUK_HASTA_SEANSLARI`)
Seansları tamamlanan hastaların 2 dakika boyunca görünmesini sağlayan ve süresi dolanları otomatik filtreleyen SQL View:

```sql
CREATE OR REPLACE VIEW VW_DYZ_GUNLUK_HASTA_SEANSLARI AS
SELECT hb.adi || ' ' || hb.soyadi AS HASTAADI,
       dhb.hastano,
       t.HASTASEANSREFNO,
       t.HASTATEDAVIREFNO,
       t.KABULTARIHI,
       t.HASTABASVURUREFNO,
       t.HASTAHIZMETREFNO,
       t.SEANSTARIHI,
       CASE WHEN t.VARDIYATANIMNO = 1 THEN 'SABAH' ELSE 'ÖGLEN' END AS VARDIYA,
       t.SEANSTURU,
       t.SURE,
       t.BASVURUTURU,
       t.KABULIPTALNEDENNO,
       t.KABULIPTALTARIHI,
       t.kabuliptalaciklama,
       t.IPTALEDENP,
       t.IPTALTARIHI,
       t.STATU,
       t.completed_at
  FROM dyz_hasta_seanslari t
  LEFT JOIN dyz_hasta_tedavi_bilgileri dhtb ON t.hastatedavirefno = dhtb.hastatedavirefno
  LEFT JOIN dyz_hasta_bilgileri dhb ON dhtb.hastadiyalizrefno = dhb.hastadiyalizrefno
  LEFT JOIN hasta_bilgileri hb ON dhb.hastano = hb.hastano
 WHERE (
    t.STATU NOT IN ('COMPLETED', 'TABURCU', 'TAMAMLANDI', 'AYRILDI', 'YARIDA_KALDI')
    OR t.completed_at IS NULL
    OR t.completed_at >= SYSTIMESTAMP - INTERVAL '2' MINUTE
 );
```

* **Üçlü Eşzamanlı Yedekleme:** Herhangi bir seans durumu veya hasta bilgisi güncellendiğinde;
  - Yerel SQLite veritabanına (`diyaliz_veritabani.sqlite`),
  - Disk JSON veri yedeğine (`diyaliz_database.json`),
  - Oracle SQL üretim scriptine (`diyaliz_oracle_db.sql`) anında yansıtılır.

---

## 📺 Akıllı TV Bekleme Ekranı & Dinamik Çalışma Modları

Bekleme salonundaki Akıllı TV ve monitörler için 3 aşamalı güvenlik ve bilgilendirme motoru geliştirilmiştir:

```
                          ┌───────────────────────────┐
                          │    TV Bekleme Ekranı      │
                          └─────────────┬─────────────┘
                                        │
                 ┌──────────────────────┴──────────────────────┐
                 │                                             │
      [Mesai Saatleri Dışında mı?]                  [Mesai Saatleri İçinde]
                 │                                             │
                 ▼                                             ▼
     ┌───────────────────────┐                    ┌─────────────────────────┐
     │  2. MESAİ DIŞI MODU   │                    │ Personel Oturumu Var mı?│
     │  "Ünitemiz Kapalıdır" │                    └────────────┬────────────┘
     │  Acil Servis Uyarısı  │                                 │
     └───────────────────────┘                     ┌───────────┴───────────┐
                                                   │                       │
                                                [HAYIR]                  [EVET]
                                                   │                       │
                                                   ▼                       ▼
                                       ┌───────────────────────┐ ┌───────────────────────┐
                                       │ 1. GÜVENLİ BEKLEME    │ │  3. CANLI YAYIN MODU  │
                                       │ Logo & Kurumsal Mesaj │ │ 4 Kayan Slayt Ekranı  │
                                       │ Canlı Liste Gizli     │ │ 5 Kart / Sayfa Düzeni │
                                       └───────────────────────┘ └───────────────────────┘
```

### 1. 🛡️ Güvenli Bekleme Modu (Standby Screen)
* Sekreter, hemşire veya yönetici sisteme giriş yapmadığı sürece TV ekranında hiçbir hasta bilgisi listelenmez.
* Kocaeli Üniversitesi Hastanesi resmi logosu, birim adı, çalışma saatleri ve hasta mahremiyetine ilişkin kurumsal bekleme kartı gösterilir.
* İstemci taraflı hack girişimlerine karşı TV endpoint'i (`/api/tv/seanslar`) sunucu tarafında zero-trust veri maskelemesi uygular.

### 2. 🌙 Mesai Dışı Modu (Off-Duty Screen)
* Admin tarafından belirlenen mesai saatleri (varsayılan: 07:40 - 18:00) veya izinli günler dışında ekran otomatik olarak bu moda geçer.
* "Hemodiyaliz Ünitemiz Hizmet Saatleri Dışındadır" bildirimi ile birlikte acil durumlar için **Kocaeli Üniversitesi Hastanesi Acil Servis Birimi** yönlendirmesi yer alır.

### 3. 🎬 Canlı Yayın Modu (Live Panel)
Yetkili personel sisteme giriş yaptığında ve mesai saatleri dahilinde otomatik olarak devreye girer:
* **Slayt 1:** 1. Bekleme & Çağrı Listesi (Sayfa 1)
* **Slayt 2:** 1. Bekleme & Çağrı Listesi (Sayfa 2)
* **Slayt 3:** 2. Diyaliz Seansı Devam Edenler
* **Slayt 4:** 3. Seansı Tamamlananlar
* **5 Hasta Standardı & Tam Dikey Uyum:** Her sayfada 5 hasta kartı bulunur. `flex: 1 1 0` ve `clamp(26px, 2.55vw, 42px)` tipografisi ile ekranın tüm dikey yüksekliği taşma ve boşluk olmaksızın doldurulur.
* **Dinamik Slayt Süresi:** Boş kategoriler 4 saniyede hızlıca geçilir; dolu slaytlarda hasta başına 5 saniye atanır (en fazla 25 saniye).
* **Kesintisiz Alt Kayan Yazı:** Bilgilendirmeler alt bantta fare üzerine gelse dahi takılmadan sürekli akar.

---

## ⏱️ Seansı Biten Hastaların 2 Dakika Takibi ve Otomatik Temizlenmesi

Klinik akışta diyalizi biten hastaların yakınları tarafından görülmesi, ancak ekranın gereksiz yere meşgul edilmemesi için otomatik yaşam döngüsü motoru entegre edilmiştir:

1. Hasta durumu `YARIDA_KALDI` (6), `AYRILDI` (7) veya `TABURCU` (8) yapıldığında hastaya anlık bir `completed_at` zaman damgası atanır.
2. **Sekreter Ekranında Canlı Sayaç:** İlgili hasta kartının altında saniye saniye geri sayan rozet belirir:
   ```text
   ⏳ 2 dk içinde listeden kaldırılacak (118 sn)
   ```
3. **2 Dakika (120 Saniye) Kuralı:** 120 saniye boyunca hasta TV ekranındaki "Seansı Tamamlananlar" slaytında ve sekreter listesinde görünmeye devam eder.
4. **Otomatik Tasfiye (Purge):** 120 saniye dolduğu anda hasta hem TV ekranından hem de sekreter listesinden otomatik olarak kaldırılır.
5. **Veritabanı Seviyesinde Güvence:** Sayfa yenilense dahi SQLite / Oracle View'ında bulunan `datetime(t.completed_at, '+2 minutes') >= datetime('now')` filtresi sayesinde 2 dakikası dolmuş hastalar listeye tekrar gelmez.

---

## ⏰ Sistem Çalışma Saatleri & Bekleme Zamanlayıcısı

Admin panelinde (`Hesap & Sistem Yönetimi`) yer alan entegre zamanlayıcı modülü ile ünitenin çalışma takvimi yönetilir:

* **Mesai Başlangıç Saati:** Örn: `07:40`
* **Mesai Bitiş Saati:** Örn: `18:00`
* **Aktif Çalışma Günleri:** Pazartesi, Salı, Çarşamba, Perşembe, Cuma, Cumartesi (Onay kutucukları ile istenen günler seçilebilir veya Pazar dahil edilebilir).
* **Zamanlayıcıyı Aktifleştir / Devre Dışı Bırak:** Tek anahtarla mesai kontrolü geçici olarak askıya alınabilir veya aktif edilebilir.
* **Kalıcı Saklama:** Ayarlar SQLite `T_SISTEM_AYARLARI` tablosuna kaydedilir ve TV ekranlarına anlık senkronize edilir.

---

## 🔄 Canlı View Sorgusu & "Verileri Güncelle" Mekanizması

* **Manuel Güncelle Butonu:** Sekreter panelinin üst kısmında yer alan **"🔄 Verileri Güncelle"** butonuna basıldığında, veritabanındaki `VW_DYZ_GUNLUK_HASTA_SEANSLARI` view'ı anında tetiklenir ve en güncel hasta kayıtları ekrana yansıtılır.
* **Arka Plan Dinamik Polling:** Sistem her 7 saniyede bir arka planda view değişikliklerini kontrol eder; başka bir terminalden veya doğrudan veritabanından yapılan müdahaleler ekrana otomatik yansır.
* **Dahili Oturum Bekçisi:** TV ekranı her 2.5 saniyede bir sunucudaki aktif personel oturumlarını denetleyerek bekleme modundan canlı moda veya tam tersine anında geçiş yapar.

---

## 🩺 8 Aşamalı Klinik Seans Süreci

| Aşama No | Durum Kodu | Durum Adı | Klinik Süre & Güvenlik Özellikleri |
|:---:|:---|:---|:---|
| **1** | `BEKLEMEDE` | ⏳ Bekleme Salonunda | Hasta kabul edildi, hazırlık bekleniyor. |
| **2** | `ODAYA_CAGRILDI` | 🔔 Odaya Çağır (Hazırlık) | 3 dakikalık intikal süresi; melodik bildirim zili çalar. |
| **3** | `KATETER_TAKILIYOR` | ⏱️ Kateter Hazırlığı | 45 dakikalık kateter hazırlığı ve damar yolu hazırlığı. |
| **4** | `BAGLANDI` | 🔌 Diyalize Bağla | Standart 180 dakikalık (3 saat) seans süreci; kalan süre canlı hesaplanır. |
| **5** | `YAKINI_CAGRILIYOR` | ℹ️ Danışma / Yakını Çağrısı | Belirgin turuncu görsel kart ve dikkat çekici 3 tonlu sesli çağrı zili. |
| **6** | `YARIDA_KALDI` | 📋 Hekim Kararıyla Erken Durdurma | Tıbbi gerekçeyle kontrollü durdurma; TV'de teşhis detayı gizlenir (2 dk sonra listeden düşer). |
| **7** | `AYRILDI` | 🩺 Dinlenme & Tansiyon Kontrolü | Diyaliz bitimi 15 dakikalık pansuman ve tansiyon güvenlik tamponu (2 dk sonra listeden düşer). |
| **8** | `TABURCU` | ✅ Seans Tamamlandı / Taburcu | Seans başarıyla tamamlandı (2 dk sonra listeden düşer). |

---

## 🔒 KVKK Uyumlu Hasta Mahremiyeti & Güvenli Detay Yönetimi

* **Otomatik Maskeleme:** TV ekranlarında ve sekreter ana listesinde hasta isimlerinin yalnızca ilk 3 harfi açık gösterilir, soyadın da ilk 3 harfi haricindeki tüm harfler yıldızlanır (Örn: `BAH**** GÖK***`, `DUR*** ÖNA*`).
* **Çift Yönlü Detay Yönetimi (`Detay ▸` Modalı):**
  - Sekreter veya hemşire hastanın adına tıkladığında açılan güvenli modalda hastanın tam adı, protokol numarası, vardiyası, rutin günleri ve güne özel saatleri görüntülenir.
  - **Yeni:** Diyaliz seans durumu (`BEKLEMEDE`, `BAGLANDI`, `TABURCU` vb.) doğrudan bu modal içerisindeki seçim kutusundan da değiştirilebilir ve kaydedilebilir.
* **Hasta Kartında Dinamik "Kaydet" Butonu:**
  - Sekreter kartında diyaliz durumu dropdown'ından yeni bir durum seçildiğinde buton "Kaydet" durumuna geçer ve yeşil renkle vurgulanır (`btn-save-ready`).
  - Kategori etiketi (Bekleme / Seans / Tamamlanan) dropdown seçimine anında senkronize olur.

---

## 🛡️ Kapsamlı Siber Güvenlik Katmanı

Hastane yerel ağındaki açıklar ve yetkisiz erişim risklerine karşı kurumsal güvenlik tedbirleri:

* **Token Tabanlı Kimlik Doğrulama:** Oturum açan kullanıcılara kriptografik `bearer-like` oturum token'ı (`diyaliz_auth_token`) atanır. Token'lar `T_OTURUMLAR` tablosunda saklanır ve TTL süresine sahiptir.
* **Scrypt Hash Algoritması:** Kullanıcı şifreleri veritabanında asla açık tutulmaz; Python `hashlib.scrypt` (tuzlu ve maliyet parametreli) ile şifrelenir.
* **Brute-Force (Kaba Kuvvet) Engelleme:** Aynı IP veya kullanıcı adından yapılan 5 ardışık hatalı parola denemesinde hesap ve IP adresi 10 dakika süreyle kilitlenir (`T_BASARISIZ_GIRISLER`).
* **Zero-Trust TV Endpoint'i (`/api/tv/seanslar`):** Bekleme salonundaki TV tarayıcısı veya ağ üzerindeki yetkisiz dinleyiciler API'ye istek attığında, sunucu tarafında hasta adları `BAH**** GÖK***` şeklinde maskelenerek iletilir; tam hasta isimleri yetkisiz cihazlara asla gönderilmez.
* **Denetim İzi & Güvenli Arşivleme:** Sistemden kalıcı olarak silinen hasta kayıtları `silinen_hastalar.sqlite` ve `silinen_hastalar.json` dosyalarına silen personel, tarih ve gerekçesiyle arşivlenir.

---

## 👥 Rol Tabanlı Yetkilendirme & Admin Delegasyonu

| Rol | Varsayılan Kullanıcı | Varsayılan Şifre | Yetkiler |
|:---|:---:|:---:|:---|
| **Yönetici (Admin)** | `admin` | `1234` | Kullanıcı oluşturma/silme/şifre değiştirme, çalışma saatleri ayarları, süre gösterimini açma/kapatma, kalıcı silme ve varsayılan 17 hastayı geri yükleme yetkisi delegasyonu. |
| **Sekreter** | `sekreter` | `1234` | Hafta içi hasta kabulü, seans durum güncellemeleri, gün/saat planlaması, acil hasta kaydı. |
| **Nöbetçi Hemşire** | `hemsire` | `1234` | Hafta sonu / nöbet seans operasyonları, hasta durum takibi, odaya alma ve seans başlatma. |

> [!NOTE]
> **Yetki Delegasyonu:** `Kalıcı Silme Kilidini Aç` ve `Varsayılan 17 Hasta` butonları varsayılan olarak yalnızca Admin'de görünür. Admin, **Hesap & Sistem Yönetimi** panelinden dilediği kullanıcıya tek tıkla bu yetkiyi (`SILME_SIFIRLAMA_YETKISI`) devredebilir veya yetkiyi geri alabilir.

---

## 📅 Rutin Seans Günleri & Güne Özel Saat Planlama

* **Hızlı Gün Grubu Şablonları:**
  - Pazartesi - Çarşamba - Cuma
  - Salı - Perşembe - Cumartesi
  - Tekil/Esnek Gün Seçimi (Haftanın istenen günleri işaretlenebilir).
* **Güne Göre Bağımsız Seans Saatleri:**
  - `08.00`, `10.00`, `12.00`, `14.00`, `16.00` seans saatleri.
  - Bir hasta için Pazartesi günü `08.00`, Çarşamba günü `10.00` gibi güne özel bağımsız saatler tanımlanabilir.
* **Acil Hasta Kabulü:**
  - Acil servisten gelen hastalar "Acil Hasta" seçeneğiyle eklenir ve sadece o günün seans listesinde yer alır; gelecekteki rutin takvimi etkilemez.

---

## 🖥️ Ekranlar ve Erişim Adresleri

| Ekran | Açıklama | Yerel Bağlantı (Sunucu PC) | Ağ Bağlantısı (TV, Tablet, Diğer PC) |
|---|---|---|---|
| **Sekreter / Hemşire Paneli** | Hasta kabul, seans takibi, detay ve durum yönetimi | `http://localhost:5000/sekreter.html` | `http://[SUNUCU-IP]:5000/sekreter.html` |
| **TV Bekleme Ekranı** | Bekleme salonu tam ekran TV yayını (Standby/Off-duty/Live) | `http://localhost:5000/display.html` | `http://[SUNUCU-IP]:5000/display.html` |
| **Genel Bilgi Ekranı** | Karşılama ve alternatif konsol görünümü | `http://localhost:5000/` | `http://[SUNUCU-IP]:5000/` |

---

## 🚀 Kurulum ve Tek Tıkla Çalıştırma

### Gereksinimler
* **Python 3.8 veya üzeri**
* Modern Web Tarayıcısı (Chrome, Edge, Firefox vb.)

### 1. Adım: Gerekli Paketleri Yükleyin
```bash
pip install flask flask-cors
```

### 2. Adım: Başlatma Seçenekleri

#### Yöntem 1: Evrensel Başlatıcı (Flash Bellek / Kök Dizin Uyumlu - Önerilen)
Projenin kök dizinindeki veya klasör içindeki **`BASLAT.bat`** dosyasına çift tıklayın:
* Python ortamını (`python`, `py`, `python3`) dinamik olarak tespit eder.
* Flash bellek sürücü harfi veya klasör adı değişse dahi göreceli yollarla sunucuyu arka planda başlatır.
* 3 saniye içinde Sekreter ve TV Display ekranlarını tarayıcınızda otomatik açar.

#### Yöntem 2: Sunucu Başlatıcı Komut Dosyası
`11 KASIM DİYALİZ\SUNUCUYU_BASLAT.bat` dosyasına çift tıklayın.

#### Yöntem 3: Penceresiz Sessiz Başlatıcı
`arka_plan_baslatici.vbs` dosyasına çift tıklayarak konsol penceresi görünmeden arka planda sessizce çalıştırabilirsiniz.

#### Yöntem 4: Terminal Üzerinden Manuel Başlatma
```bash
python app.py
```

Sunucu açıldığında konsolda yerel ağ IP adresi otomatik olarak yazdırılır:
```text
==================================================================
🌐 BU BİLGİSAYARDAN AÇMAK İÇİN:
   🖥️  Sekreter Paneli : http://localhost:5000/sekreter.html
   📺 TV Bekleme Ekranı: http://localhost:5000/display.html
   📋 Genel Ekran     : http://localhost:5000/
------------------------------------------------------------------
📱 YEREL AĞDAKİ DİĞER CİHAZLAR (TV, Tablet, Diğer PC'ler):
   🖥️  Sekreter: http://192.168.1.X:5000/sekreter.html
   📺 TV Display : http://192.168.1.X:5000/display.html
==================================================================
```

#### Sunucuyu Güvenli Durdurma
Sunucuyu kapatmak istediğinizde **`SUNUCUYU_DURDUR.bat`** dosyasına çift tıklamanız yeterlidir.

---

## 📁 Dosya ve Dizin Mimarisi

```text
sezen-diyaliz/
├── BASLAT.bat                  # Flash bellek ve taşınabilir disk uyumlu tek tıkla başlatıcı
├── 11 KASIM DİYALİZ/
│   ├── app.py                  # Python Flask REST API, SQLite & dinamik LAN IP sunucusu
│   ├── app.js                  # İstemci tarafı seans motoru, KVKK maskeleme, TV karuseli & zamanlayıcı
│   ├── style.css               # Tam ekran TV düzeni, medikal tema, animasyonlar ve responsive tasarım
│   ├── display.html            # Bekleme salonu Akıllı TV ekranı (Standby / Off-duty / Live)
│   ├── sekreter.html           # Sekreter, Nöbetçi Hemşire ve Admin yönetim paneli
│   ├── index.html              # Genel bilgilendirme ve karşılama ekranı
│   ├── kocaeli_logo.jpg        # Kocaeli Üniversitesi Hastanesi resmi kurumsal logosu
│   ├── diyaliz_veritabani.sqlite # 4 ilişkisel tablo, view, kullanıcılar ve ayarlar veritabanı
│   ├── diyaliz_oracle_db.sql   # Oracle HBYS SQL şeması, view tanımı ve güncel veri yedeği
│   ├── diyaliz_database.json   # Anlık JSON veri yedeği
│   ├── silinen_hastalar.sqlite # Silinen hastalar denetim ve arşiv veritabanı
│   ├── silinen_hastalar.json   # Silinen hastalar JSON arşiv kütüğü
│   ├── SUNUCUYU_BASLAT.bat     # Klasör içi Windows başlatıcı komut dosyası
│   ├── SUNUCUYU_DURDUR.bat     # Flask sunucusunu güvenle kapatan komut dosyası
│   ├── arka_plan_baslatici.vbs # Konsol penceresiz arka plan başlatıcı VBScript
│   ├── GIT_GONDER.bat          # Değişiklikleri Git deposuna gönderen betik
│   └── README.md               # Kapsamlı teknik dokümantasyon
```

---

## 📡 REST API Uç Noktaları (Endpoints)

| Metot | Uç Nokta | Yetki | Açıklama |
|:---:|:---|:---:|:---|
| `POST` | `/api/auth/login` | Anonim | Kullanıcı girişi (scrypt doğrulama & token üretimi) |
| `POST` | `/api/auth/logout` | Token | Oturumu sonlandırma ve token geçersiz kılma |
| `GET` | `/api/auth/active-session` | Anonim | TV ekranları için sistemde aktif personel oturumu kontrolü |
| `GET` | `/api/auth/users` | Admin | Personel kullanıcı listesi ve yetki delegasyonu durumu |
| `POST` | `/api/auth/users` | Admin | Yeni personel hesabı oluşturma |
| `DELETE` | `/api/auth/users/<id>` | Admin | Personel hesabını silme |
| `GET` | `/api/seanslar` | Token | Tam yetkili Oracle HBYS View hasta seans listesi |
| `GET` | `/api/tv/seanslar` | Anonim | **Zero-Trust:** TV ekranı için sunucu taraflı maskelenmiş seans listesi |
| `POST` | `/api/seanslar/guncelle` | Token | Hasta seans durumu ve tamamlanma zamanı güncelleme |
| `POST` | `/api/seanslar/kaydet` | Token | Yeni hasta ekleme veya mevcut hasta detaylarını güncelleme |
| `POST` | `/api/seanslar/sil` | Token / Yetki | Hastayı kalıcı olarak silip arşive taşıma |
| `POST` | `/api/seanslar/varsayilana-don` | Token / Yetki | Veritabanını varsayılan 17 hastaya sıfırlama |
| `GET` / `POST` | `/api/ayarlar` | Token (POST) | Çalışma saatleri ve bekleme ekranı zamanlayıcısı ayarları |
| `GET` / `POST` | `/api/sync-state` | Hibrit | Ekranlar arası gerçek zamanlı durum paketi senkronizasyonu |
| `GET` | `/api/silinenler` | Token | Silinen hastaların denetim arşivi |

---

> 💡 **Kocaeli Üniversitesi Hastanesi Bilişim Ekibi Notu:** Sistem yerel ağda internet bağlantısına ihtiyaç duymadan tam çevrimdışı (offline) modda güvenle çalışabilir. Modemin kapanıp açılması durumunda IP adresleri otomatik çözümlenir ve TV yayınları kesintiye uğramadan devam eder.
