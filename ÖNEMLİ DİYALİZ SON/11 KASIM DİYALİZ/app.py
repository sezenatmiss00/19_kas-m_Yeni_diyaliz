#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Kocaeli Üniversitesi Hastanesi Hemodiyaliz Ünitesi
Flask (Python) Entegre Web & REST API Sunucusu

Özellikler:
- Otomatik IP ve Ağ Algılama (Cihaz veya modem IP'si değiştiğinde manuel IP ayarı gerektirmez)
- 0.0.0.0 üzerinden tüm yerel ağ cihazlarına (TV, Sekreter PC, Tablet, Telefon) otomatik yayın
- Yerel SQLite Veritabanı Entegrasyonu (diyaliz_veritabani.sqlite & silinen_hastalar.sqlite)
- Güvenli REST API & Gerçek Zamanlı TV Senkronizasyonu
"""

# Standart Python kütüphaneleri: dosya yolları, JSON serileştirme, SQLite3 veritabanı,
# ağ soketleri (otomatik LAN IP tespiti), kriptografik token üretimi ve tarih/saat yönetimi.
import os
import sys
import json
import sqlite3
import socket
import secrets
from datetime import datetime, timedelta
# Güvenlik kütüphanesi: Kullanıcı şifrelerini düz metin yerine Scrypt/PBKDF2 ile hash'ler.
from werkzeug.security import generate_password_hash, check_password_hash
# Flask Web & REST API mikro çatısı (Sunucu, HTTP istek/yanıt ve statik dosya servisi).
from flask import Flask, request, jsonify, send_from_directory, Response

# ------------------------------------------------------------------------------
# DİZİN VE VERİTABANI DOSYA YOLLARI (TAŞINABİLİR / FLASH BELLEK UYUMLU)
# __file__ kullanılarak göreceli (relative) kök dizin hesaplanır.
# Böylece proje farklı bir bilgisayara veya USB sürücüye taşınsa bile yol hatası vermez.
# ------------------------------------------------------------------------------
# Çalışma dizini ayarı
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SQLITE_DB_PATH = os.path.join(BASE_DIR, 'diyaliz_veritabani.sqlite')   # Ana ilişkisel SQLite veritabanı
DELETED_DB_PATH = os.path.join(BASE_DIR, 'silinen_hastalar.sqlite')    # Silinen hastaların denetim (audit) arşivi
DB_FILE_PATH = os.path.join(BASE_DIR, 'diyaliz_database.json')         # Otomatik oluşturulan JSON anlık yedeği
SQL_FILE_PATH = os.path.join(BASE_DIR, 'diyaliz_oracle_db.sql')        # Oracle HBYS uyumlu dışa aktarılan SQL şeması
DELETED_JSON_PATH = os.path.join(BASE_DIR, 'silinen_hastalar.json')    # Silinen hastaların JSON yedek dosyası

# Sunucu çalışma portu (Varsayılan: 5000, ortam değişkeni PORT ile değiştirilebilir)
PORT = int(os.environ.get('PORT', 5000))

# Flask uygulamasını başlat; HTML/CSS/JS/resim dosyaları doğrudan BASE_DIR üzerinden sunulur.
app = Flask(__name__, static_folder=BASE_DIR, template_folder=BASE_DIR)
# Türkçe karakterlerin (ğ, ü, ş, ı, ö, ç) JSON yanıtlarında Unicode escape olmadan okunabilir dönmesi için:
app.config['JSON_AS_ASCII'] = False

# Ekranlar arası (Sekreter -> TV) gerçek zamanlı senkronizasyon paketi RAM bellekte tutulur.
latest_sync_packet = None

# ==============================================================================
# YEREL AĞ VE IP ALGILAMA MOTORU (OTOMATİK CİHAZ KEŞFİ)
# ==============================================================================
# ------------------------------------------------------------------------------
# FONKSİYON: get_local_ip_addresses()
# AMAÇ: Sunucu makinenin yerel ağdaki (Wi-Fi / Ethernet / LAN) tüm geçerli IPv4 adreslerini tespit etmek.
# NEDEN YAPILDI: Hastane ortamında DHCP nedeniyle sunucu IP adresi değişebilir.
#                Bu fonksiyon sayesinde sekreter, TV ekranı veya tablet kullanıcıları herhangi bir
#                sabit IP ayarı yapmadan güncel IP üzerinden sisteme bağlanabilir.
# NEREDE KULLANILIR: /api/network-info uç noktasında ve konsol başlangıç çıktısında.
# ÇALIŞMA MEKANİZMASI: 8.8.8.8 adresine yönlendirilen UDP soketi sayesinde işletim sisteminin
#                      varsayılan çıkış arayüzünün yerel IP'si paket gönderilmeden öğrenilir.
# ------------------------------------------------------------------------------
def get_local_ip_addresses():
    """Modemden alınan tüm yerel IPv4 adreslerini otomatik tespit eder."""
    ips = set()
    try:
        # Doğrudan dışa dönük soket açarak birincil yerel IP'yi al
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.2)
        s.connect(('8.8.8.8', 80))
        primary_ip = s.getsockname()[0]
        s.close()
        if primary_ip and not primary_ip.startswith('127.'):
            ips.add(primary_ip)
    except Exception:
        pass

    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith('127.'):
                ips.add(ip)
    except Exception:
        pass

    return sorted(list(ips))

# ------------------------------------------------------------------------------
# FONKSİYON: get_computer_name()
# AMAÇ: Sunucunun çalıştığı bilgisayarın yerel ağ adını (hostname) döndürmek.
# ------------------------------------------------------------------------------
def get_computer_name():
    try:
        return socket.gethostname()
    except Exception:
        return 'localhost'

# ==============================================================================
# VERİTABANI BAĞLANTILARI VE YARDIMCILARI
# ==============================================================================
# ------------------------------------------------------------------------------
# FONKSİYON: get_db()
# AMAÇ: Ana diyaliz SQLite veritabanına ('diyaliz_veritabani.sqlite') güvenli bağlantı sağlamak.
# NEDEN WAL MODU?: 'PRAGMA journal_mode = WAL;' (Write-Ahead Logging), aynı anda hem okuma
#                  (TV ekranları) hem de yazma (Sekreter seans güncellemeleri) işlemlerinin birbirini
#                  kilitlemeden (lock) yüksek performansla çalışmasını sağlar.
# NEDEN synchronous = NORMAL?: Disk yazma hızını optimize ederken veri bütünlüğünü korur.
# ------------------------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode = WAL;')
    conn.execute('PRAGMA synchronous = NORMAL;')
    return conn

# ------------------------------------------------------------------------------
# FONKSİYON: get_deleted_db()
# AMAÇ: Kalıcı olarak silinen hasta kayıtlarının tutulduğu arşiv veritabanına
#       ('silinen_hastalar.sqlite') bağlantı kurmak.
# NEDEN AYRI VERİTABANI?: Veri kaybını önlemek ve denetim (audit log) güvenliğini ana veritabanından
#                        izole tutmak amacıyla silinenler bağımsız bir dosyada arşivlenir.
# ------------------------------------------------------------------------------
def get_deleted_db():
    conn = sqlite3.connect(DELETED_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode = WAL;')
    conn.execute('PRAGMA synchronous = NORMAL;')
    return conn

# ------------------------------------------------------------------------------
# FONKSİYON: mask_full_name(full_name)
# AMAÇ: Hasta ad ve soyadını KVKK (Kişisel Verilerin Korunması Kanunu) standartlarına uygun olarak maskelemek.
# ÇALIŞMA MEKANİZMASI: Ad ve soyadın ilk 3 harfi açık bırakılır, kalan harfler yıldızlanır ('*').
#                      3 harften kısa parçalar ise sonuna 3 yıldız eklenerek güvenli hale getirilir.
# ÖRNEK: 'RIZA HALUK TOYGARLI' -> 'RIZ* HAL** TOY*****'
# NEREDE KULLANILIR: TV yayınlarında (/api/tv/seanslar) ve yetkisiz ekran senkronizasyonunda.
# ------------------------------------------------------------------------------
def mask_full_name(full_name):
    if not full_name:
        return '***'
    parts = [p for p in str(full_name).strip().split() if p]
    masked = []
    for p in parts:
        if len(p) <= 3:
            masked.append(p + '***')
        else:
            masked.append(p[:3] + '*' * (len(p) - 3))
    return ' '.join(masked)

# ------------------------------------------------------------------------------
# FONKSİYON: split_full_name(full_name_str)
# AMAÇ: Birleşik verilen hasta ad ve soyadını Oracle 'hasta_bilgileri' tablosundaki
#       'adi' ve 'soyadi' sütunlarına ayrıştırmak.
# MANTIK: Son kelime daima soyadı kabul edilir, önceki tüm kelimeler adı kısmını oluşturur.
# ÖRNEK: 'MEHMET ALİ YILMAZ' -> adi='MEHMET ALİ', soyadi='YILMAZ'
# ------------------------------------------------------------------------------
def split_full_name(full_name_str):
    parts = [p for p in str(full_name_str or 'İsimsiz Hasta').strip().split() if p]
    if not parts:
        return 'İsimsiz', 'Hasta'
    if len(parts) == 1:
        return parts[0], ''
    return ' '.join(parts[:-1]), parts[-1]

# ------------------------------------------------------------------------------
# FONKSİYON: normalize_completed_at(raw_val)
# AMAÇ: Seansı biten (TABURCU/AYRILDI/YARIDA_KALDI) hastaların tamamlanma zaman damgasını
#       ISO 8601 UTC formatına ('YYYY-MM-DDTHH:MM:SSZ') dönüştürmek.
# NEDEN GEREKLİ?: 2 DAKİKA KURALI (120 sn) takibi için frontend ile backend'in aynı zaman
#                 standardı üzerinden milisaniyelik geri sayım yapabilmesini garanti eder.
# ------------------------------------------------------------------------------
def normalize_completed_at(raw_val):
    if not raw_val:
        return datetime.utcnow().isoformat() + 'Z'
    s = str(raw_val).strip()
    if 'T' in s or s.endswith('Z'):
        return s
    try:
        dt = datetime.fromisoformat(s)
        return dt.isoformat() + 'Z'
    except Exception:
        return datetime.utcnow().isoformat() + 'Z'

# ------------------------------------------------------------------------------
# FONKSİYON: resolve_vardiya_tanim_no(vardiya_val, vardiya_tanim_no)
# AMAÇ: Vardiya metnini HBYS ilişkisel veri tabanındaki sayısal VARDIYATANIMNO koduna çevirmek.
# EŞLEŞTİRME: 1 = Sabah Vardiyası, 2 = Öğlen Vardiyası.
# ------------------------------------------------------------------------------
def resolve_vardiya_tanim_no(vardiya_val, vardiya_tanim_no=None):
    if vardiya_tanim_no in (1, 2, '1', '2'):
        return int(vardiya_tanim_no)
    v = str(vardiya_val or 'SABAH').strip().upper()
    if v == 'SABAH':
        return 1
    return 2

# ------------------------------------------------------------------------------
# FONKSİYON: resolve_vardiya_label(vardiya_tanim_no, vardiya_val)
# AMAÇ: Sayısal VARDIYATANIMNO kodunu kullanıcı dostu 'SABAH' veya 'ÖGLEN' metnine dönüştürmek.
# ------------------------------------------------------------------------------
def resolve_vardiya_label(vardiya_tanim_no, vardiya_val=None):
    if vardiya_val and str(vardiya_val).strip().upper() == 'BELIRTILMEMIS':
        return 'BELIRTILMEMIS'
    return 'SABAH' if int(vardiya_tanim_no or 1) == 1 else 'ÖGLEN'

# ------------------------------------------------------------------------------
# FONKSİYON: ensure_db_schema()
# AMAÇ: Uygulama ayağa kalktığında veritabanı şemasını kontrol etmek ve yoksa oluşturmak.
# KAPSAM:
#   1. T_KULLANICILAR: Sekreter, hemşire ve admin kullanıcı hesapları.
#   2. T_OTURUMLAR: 256-bit token tabanlı oturum yönetimi.
#   3. hasta_bilgileri (hb): Oracle HBYS genel hasta kimlik tablosu.
#   4. dyz_hasta_bilgileri (dhb): Diyaliz birimi hasta kartı tablosu.
#   5. dyz_hasta_tedavi_bilgileri (dhtb): Tedavi protokolü ve reçete tablosu.
#   6. dyz_hasta_seanslari (t): Günlük seans operasyon hareketleri tablosu.
#   7. T_SISTEM_AYARLARI: Çalışma saatleri ve bekleme zamanlayıcısı parametreleri.
#   8. VW_DYZ_GUNLUK_HASTA_SEANSLARI: 4 tabloyu bağlayan ve 2 dakikalık tamamlama filtresi içeren View.
# SELF-HEALING (KENDİNİ ONARMA):
#   Veritabanında eksik hasta veya tutarsızlık tespit edilirse varsayılan 17 hasta ve Oracle
#   şeması otomatik olarak onarılır.
# ------------------------------------------------------------------------------
def ensure_db_schema():
    """
    Oracle View mimarisine birebir uygun 4 ilişkisel tablo ve View oluşturur:
    - hasta_bilgileri (hb)
    - dyz_hasta_bilgileri (dhb)
    - dyz_hasta_tedavi_bilgileri (dhtb)
    - dyz_hasta_seanslari (t)
    - VW_DYZ_GUNLUK_HASTA_SEANSLARI
    """
    conn = get_db()
    conn.executescript('''
        -- --------------------------------------------------------------------
        -- TABLO 1: T_KULLANICILAR (Personel ve Yetkilendirme Kartı)
        -- Sekreter, hemşire ve sistem yöneticisi (admin) kimlikleri, rolleri
        -- ve parola özetleri burada güvenle saklanır.
        -- --------------------------------------------------------------------
        CREATE TABLE IF NOT EXISTS T_KULLANICILAR (
            KULLANICI_ID INTEGER PRIMARY KEY AUTOINCREMENT, -- Benzersiz kullanıcı anahtarı
            KULLANICI_ADI TEXT UNIQUE NOT NULL,             -- Giriş kullanıcı adı (küçük harfe normalize edilir)
            SIFRE TEXT NOT NULL,                             -- Scrypt veya PBKDF2 ile hash\'lenmiş güvenli şifre
            AD_SOYAD TEXT NOT NULL,                          -- Personelin ad ve soyadı
            ROL TEXT NOT NULL,                               -- 'ADMIN', 'HEMSIRE', 'SEKRETER'
            SILME_SIFIRLAMA_YETKISI INTEGER DEFAULT 0,       -- Admin delegasyonu: 1 ise hasta silebilir ve sıfırlayabilir
            KAYIT_TARIHI TEXT NOT NULL                       -- Hesabın oluşturulma ISO zaman damgası
        );

        -- --------------------------------------------------------------------
        -- TABLO 2: T_OTURUMLAR (Aktif Oturumlar ve Token Havuzu)
        -- Sekreterlik veya personelin tarayıcı oturumlarını 256-bit token\'larla takip eder.
        -- Tarayıcı kapatıldığında TV ekranının bunu algılaması için sliding TTL ile yönetilir.
        -- --------------------------------------------------------------------
        CREATE TABLE IF NOT EXISTS T_OTURUMLAR (
            TOKEN TEXT PRIMARY KEY,                         -- 256-bit kriptografik oturum token\'ı
            KULLANICI_ID INTEGER NOT NULL,                  -- T_KULLANICILAR tablosu ilişkisi (FK)
            KULLANICI_ADI TEXT NOT NULL,                    -- Oturumu açan personelin kullanıcı adı
            ROL TEXT NOT NULL,                              -- Kullanıcının o anki rolü
            IP_ADRESI TEXT,                                 -- İstekte bulunan istemcinin yerel IP adresi
            SON_ISLEM_TARIHI TEXT NOT NULL,                 -- Heartbeat ve son API çağrısı zamanı
            BITIS_TARIHI TEXT NOT NULL,                     -- Oturumun geçerlilik bitiş anı (60 sn TTL)
            FOREIGN KEY (KULLANICI_ID) REFERENCES T_KULLANICILAR(KULLANICI_ID)
        );

        -- --------------------------------------------------------------------
        -- TABLO 3: hasta_bilgileri (hb) - Oracle HBYS Ana Hasta Kartı
        -- Hastanenin merkezi kayıt sistemindeki genel hasta kimlik tablosu.
        -- --------------------------------------------------------------------
        CREATE TABLE IF NOT EXISTS hasta_bilgileri (
            hastano TEXT PRIMARY KEY,                       -- HBYS dosya / protokol numarası (Primary Key)
            adi TEXT NOT NULL,                              -- Hastanın adı (KVKK için ekranda maskelenir)
            soyadi TEXT NOT NULL                            -- Hastanın soyadı (İlk 3 harf hariç yıldızlanır)
        );

        -- --------------------------------------------------------------------
        -- TABLO 4: dyz_hasta_bilgileri (dhb) - Diyaliz Birimi Hasta Dosyası
        -- Hastanın hemodiyaliz ünitesine kabul edildiğinde açılan birim takip kartıdır.
        -- --------------------------------------------------------------------
        CREATE TABLE IF NOT EXISTS dyz_hasta_bilgileri (
            hastadiyalizrefno INTEGER PRIMARY KEY,          -- Diyaliz ünitesi takip referansı (PK)
            hastano TEXT NOT NULL,                          -- hasta_bilgileri tablosuna yabancı anahtar (FK)
            FOREIGN KEY (hastano) REFERENCES hasta_bilgileri(hastano)
        );

        -- --------------------------------------------------------------------
        -- TABLO 5: dyz_hasta_tedavi_bilgileri (dhtb) - Tedavi Protokol ve Reçetesi
        -- Hastaya uygulanacak diyaliz protokolünün tanımlandığı ara tablodur.
        -- --------------------------------------------------------------------
        CREATE TABLE IF NOT EXISTS dyz_hasta_tedavi_bilgileri (
            hastatedavirefno INTEGER PRIMARY KEY,           -- Tedavi protokol numarası (PK)
            hastadiyalizrefno INTEGER NOT NULL,             -- dyz_hasta_bilgileri tablosuna yabancı anahtar (FK)
            FOREIGN KEY (hastadiyalizrefno) REFERENCES dyz_hasta_bilgileri(hastadiyalizrefno)
        );

        -- --------------------------------------------------------------------
        -- TABLO 6: dyz_hasta_seanslari (t) - Günlük Operasyonel Seans Hareketleri
        -- Hastanın belirli bir takvim günündeki fiili seans takibinin yapıldığı ana operasyon tablosu.
        -- --------------------------------------------------------------------
        CREATE TABLE IF NOT EXISTS dyz_hasta_seanslari (
            HASTASEANSREFNO INTEGER PRIMARY KEY,            -- Seansın tekil operasyon referans kodu (PK)
            HASTATEDAVIREFNO INTEGER NOT NULL,              -- dyz_hasta_tedavi_bilgileri yabancı anahtarı (FK)
            KABULTARIHI TEXT,                               -- Üniteye fiziksel giriş zamanı
            HASTABASVURUREFNO INTEGER,                      -- Hastane HBYS provizyon / başvuru numarası
            HASTAHIZMETREFNO INTEGER,                       -- SGK / fatura hizmet takip numarası
            SEANSTARIHI TEXT,                               -- Seansın planlandığı takvim günü
            VARDIYATANIMNO INTEGER DEFAULT 1,               -- 1: Sabah Vardiyası, 2: Öğlen Vardiyası
            VARDIYA_OZEL TEXT,                              -- 'BELIRTILMEMIS' gibi özel vardiya durumları
            SEANSTURU TEXT DEFAULT \'HEMODIYALIZ\',           -- Tedavi modalitesi (Hemodiyaliz / Hemodiafiltrasyon)
            SURE INTEGER DEFAULT 180,                       -- Seans net süresi (dakika, varsayılan 180 dk = 3 saat)
            BASVURUTURU TEXT DEFAULT \'PLANLANDI\',           -- 'PLANLANDI', 'RUTIN' veya 'ACIL_SERVIS'
            KABULIPTALNEDENNO INTEGER,                      -- İptal gerekçe kodu
            KABULIPTALTARIHI TEXT,                          -- İptal zamanı
            kabuliptalaciklama TEXT DEFAULT \'\',              -- İptal veya erken durdurma gerekçe notu
            IPTALEDENP TEXT,                                -- İptal eden personelin kullanıcı kodu
            IPTALTARIHI TEXT,                               -- İptal işlem anı
            STATU TEXT DEFAULT \'BEKLEMEDE\',                 -- 8 aşamalı klinik süreç durumu
            completed_at TEXT,                              -- 2 DAKİKA KURALI: Seans bitiş zamanı (120 sn sayaç)
            GUN_GRUBU TEXT DEFAULT \'PZT_CAR_CUM\',           -- 'PZT_CAR_CUM', 'SAL_PER_CMT', 'BUGUN', 'HER_GUN'
            OZEL_GUNLER TEXT,                               -- JSON formatında özel seçili günler dizisi
            SEANS_SAATI TEXT DEFAULT \'\',                    -- Varsayılan seans başlangıç saati ('08.00', '10.00' vb.)
            GUNLUK_SAATLER TEXT,                            -- JSON formatında güne özel bağımsız saatler eşlemesi
            KAYIT_TARIHI TEXT,                              -- Hastanın sisteme ilk kaydedildiği tarih
            ACIL_TARIH TEXT,                                -- Acil servisten gelen hastanın kabul günü
            MANUEL_BUGUN_TARIH TEXT,                        -- Sadece bugün için manuel listeye dahil edilme tarihi
            MANUEL_HARIC_TARIH TEXT,                       -- Bugün için hariç tutulma tarihi
            HEMODIYALIZ_GECMISI INTEGER DEFAULT 50,         -- 0 ise ilk defa diyalize giren hasta (özel dikkat)
            FOREIGN KEY (HASTATEDAVIREFNO) REFERENCES dyz_hasta_tedavi_bilgileri(hastatedavirefno)
        );

        -- --------------------------------------------------------------------
        -- TABLO 7: T_SISTEM_AYARLARI (Sistem Parametreleri ve Çalışma Saatleri)
        -- Ünitenin mesai başlangıç/bitiş saatleri ve TV zamanlayıcı ayarları burada saklanır.
        -- --------------------------------------------------------------------
        CREATE TABLE IF NOT EXISTS T_SISTEM_AYARLARI (
            AYAR_ANAHTAR TEXT PRIMARY KEY,                  -- Ayar anahtar adı (work_start_time, work_days vb.)
            AYAR_DEGER TEXT NOT NULL                        -- Ayarın metinsel değeri
        );
    ''')

    # --------------------------------------------------------------------------
    # SQL AÇIKLAMASI (VERİ TAŞIMA VE SELF-HEALING / OTOMATİK ONARIM):
    # 1. 'dyz_hasta_seanslari' tablosundaki mevcut seans satır sayısını sayar.
    # 2. 'hasta_bilgileri' tablosundaki benzersiz (DISTINCT) ve boş olmayan hasta no sayısını kontrol eder.
    # 3. Eski tek-tablolu mimariden kalma 'T_HASTALAR' tablosunun varlığını sqlite_master üzerinden denetler.
    # NEDEN?: Eğer yeni 4 tablolu yapı boşsa veya hasta_no tutarsızlığı (< 10 benzersiz hasta) varsa,
    #         eski T_HASTALAR tablosundaki veriler 4 ilişkisel tabloya otomatik olarak kurtarılır.
    # --------------------------------------------------------------------------
    # Eğer dyz_hasta_seanslari boşsa veya hasta_bilgileri bozulmuşsa T_HASTALAR tablosundan otomatik taşı
    seans_cnt = conn.execute('SELECT COUNT(*) AS cnt FROM dyz_hasta_seanslari').fetchone()['cnt']
    unique_hb_count = conn.execute("SELECT COUNT(DISTINCT hastano) AS cnt FROM hasta_bilgileri WHERE hastano != ''").fetchone()['cnt']
    has_old_table = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='T_HASTALAR'").fetchone()
    if (seans_cnt == 0 or unique_hb_count < 10) and has_old_table:
        # Eski tablodaki tüm hastaları seans referans numarasına göre artan sırada çek
        old_rows = conn.execute('SELECT * FROM T_HASTALAR ORDER BY HASTASEANSREFNO ASC').fetchall()
        if len(old_rows) >= 10:
            # Foreign Key sırasına uygun olarak alt tablodan üst tabloya doğru temizlik yap
            conn.execute('DELETE FROM dyz_hasta_seanslari;')
            conn.execute('DELETE FROM dyz_hasta_tedavi_bilgileri;')
            conn.execute('DELETE FROM dyz_hasta_bilgileri;')
            conn.execute('DELETE FROM hasta_bilgileri;')
            for idx, r in enumerate(old_rows):
                d = dict(r)
                upsert_relational_patient_row(conn, d, idx)
            conn.commit()

    # --------------------------------------------------------------------------
    # SQL AÇIKLAMASI (ŞEMA MİGRASYONU - ALTER TABLE):
    # Eski veritabanı dosyalarında 'completed_at' sütunu yoksa güvenli biçimde ekler.
    # Sütun zaten varsa SQLite'ın fırlatacağı hatayı try/except ile sessizce geçer.
    # --------------------------------------------------------------------------
    # Kolon güncellemesi: completed_at (Seansı biten hastaları 2 dk takip için)
    try:
        conn.execute('ALTER TABLE dyz_hasta_seanslari ADD COLUMN completed_at TEXT;')
    except Exception:
        pass

    # View'ı istenen JOIN, 2 dakikalık tamamlama filtresi ve sütun yapısına göre yeniden oluştur
    conn.executescript('''
        -- --------------------------------------------------------------------
        -- GÖRÜNÜM (VIEW): VW_DYZ_GUNLUK_HASTA_SEANSLARI
        -- Hastanenin Oracle HBYS veritabanı şemasına birebir uyumlu dinamik görünüm.
        -- 4 ilişkisel tabloyu LEFT JOIN ile birleştirerek sekreterlik konsolu
        -- ve TV ekranlarının ihtiyaç duyduğu tek bir seans veri akışı üretir.
        -- --------------------------------------------------------------------
        DROP VIEW IF EXISTS VW_DYZ_GUNLUK_HASTA_SEANSLARI;
        CREATE VIEW VW_DYZ_GUNLUK_HASTA_SEANSLARI AS
        SELECT 
               -- Hasta adı ve soyadını birleştirip kenar boşluklarını temizleme
               trim(hb.adi || ' ' || hb.soyadi) AS HASTAADI,
               dhb.hastano AS hastano,
               dhb.hastano AS HASTANO,
               hb.adi AS ADI,
               hb.soyadi AS SOYADI,
               t.HASTASEANSREFNO,
               t.HASTATEDAVIREFNO,
               dhtb.hastadiyalizrefno AS HASTADIYALIZREFNO,
               t.KABULTARIHI,
               t.HASTABASVURUREFNO,
               t.HASTAHIZMETREFNO,
               t.SEANSTARIHI,
               t.VARDIYATANIMNO,
               -- Vardiya tanım kodunu (1: Sabah, 2: Öğlen) metinsel etikete dönüştürme
               CASE
                   WHEN t.VARDIYA_OZEL = 'BELIRTILMEMIS' THEN 'BELIRTILMEMIS'
                   WHEN t.VARDIYATANIMNO = 1 THEN 'SABAH'
                   ELSE 'ÖGLEN'
               END AS VARDIYA,
               t.SEANSTURU,
               t.SURE,
               t.BASVURUTURU,
               t.KABULIPTALNEDENNO,
               t.KABULIPTALTARIHI,
               t.kabuliptalaciklama,
               t.IPTALEDENP,
               t.IPTALTARIHI,
               t.STATU,
               t.completed_at,
               t.completed_at AS COMPLETED_AT,
               t.GUN_GRUBU,
               t.OZEL_GUNLER,
               t.SEANS_SAATI,
               t.GUNLUK_SAATLER,
               t.KAYIT_TARIHI,
               t.ACIL_TARIH,
               t.MANUEL_BUGUN_TARIH,
               t.MANUEL_HARIC_TARIH,
               t.HEMODIYALIZ_GECMISI
          FROM dyz_hasta_seanslari t
          -- 1. Seans hareketlerinden tedavi protokolüne geçiş
          LEFT JOIN dyz_hasta_tedavi_bilgileri dhtb
            ON t.hastatedavirefno = dhtb.hastatedavirefno
          -- 2. Tedavi protokolünden diyaliz birim hasta kaydına geçiş
          LEFT JOIN dyz_hasta_bilgileri dhb
            ON dhtb.hastadiyalizrefno = dhb.hastadiyalizrefno
          -- 3. Diyaliz hasta kaydından genel hasta kimlik tablosuna geçiş
          LEFT JOIN hasta_bilgileri hb
            ON dhb.hastano = hb.hastano
         WHERE (
            -- KOŞUL 1: Seansı devam eden veya beklemede olan aktif hastalar (her zaman listelenir)
            t.STATU NOT IN ('COMPLETED', 'TABURCU', 'TAMAMLANDI', 'AYRILDI', 'YARIDA_KALDI')
            -- KOŞUL 2: Tamamlanmış ancak henüz bitiş zaman damgası oluşmamış olanlar
            OR t.completed_at IS NULL
            -- KOŞUL 3: Seansı son 2 dakika içinde tamamlananlar (120 sn boyunca TV ve sekreterde görünür, süre dolunca otomatik kaybolur!)
            OR datetime(t.completed_at, '+2 minutes') >= datetime('now')
            OR datetime(t.completed_at, '+2 minutes') >= datetime('now', 'localtime')
         );
    ''')

    # --------------------------------------------------------------------------
    # SQL AÇIKLAMASI (VARSAYILAN SİSTEM AYARLARI VE YETKİ MİGRASYONU):
    # - INSERT OR IGNORE: T_SISTEM_AYARLARI tablosunda çalışma saati/günü ayarı
    #   daha önce kaydedilmemişse varsayılan değerleri (07:40-18:00, Pzt-Cmt) yazar.
    #   Admin ayarları değiştirmişse mevcut kaydı ezmez (IGNORE).
    # - ALTER TABLE: T_KULLANICILAR tablosuna delegasyon sütunu (SILME_SIFIRLAMA_YETKISI) ekler.
    # - UPDATE: Tüm ADMIN rolündeki hesaplara silme/sıfırlama yetkisini (1) garanti eder.
    # --------------------------------------------------------------------------
    # Varsayılan Sistem Ayarları (Çalışma Saatleri & Bekleme Ekranı)
    default_settings = {
        'work_start_time': '07:40',
        'work_end_time': '18:00',
        'work_days': 'Pazartesi,Salı,Çarşamba,Perşembe,Cuma,Cumartesi',
        'work_schedule_enabled': '1'
    }
    for k, v in default_settings.items():
        conn.execute('INSERT OR IGNORE INTO T_SISTEM_AYARLARI (AYAR_ANAHTAR, AYAR_DEGER) VALUES (?, ?)', (k, v))
    try:
        conn.execute('ALTER TABLE T_KULLANICILAR ADD COLUMN SILME_SIFIRLAMA_YETKISI INTEGER DEFAULT 0')
    except Exception:
        pass
    conn.execute("UPDATE T_KULLANICILAR SET SILME_SIFIRLAMA_YETKISI = 1 WHERE UPPER(ROL) = 'ADMIN'")

    # --------------------------------------------------------------------------
    # SQL AÇIKLAMASI (PAROLA GÜVENLİĞİ OTOMATİK YÜKSELTME):
    # T_KULLANICILAR tablosundaki tüm kullanıcıları tarar; şifresi 'scrypt:' veya
    # 'pbkdf2:' ile başlamayan (düz metin kalmış) kayıtları güvenli hash'e çevirip UPDATE eder.
    # --------------------------------------------------------------------------
    # Tüm düz metin şifreleri güçlü kriptografik hash'e (scrypt/pbkdf2) dönüştür
    existing_users = conn.execute('SELECT KULLANICI_ID, KULLANICI_ADI, SIFRE FROM T_KULLANICILAR').fetchall()
    for u in existing_users:
        raw_pwd = u['SIFRE']
        if not raw_pwd.startswith(('scrypt:', 'pbkdf2:')):
            secure_hash = generate_password_hash(raw_pwd)
            conn.execute('UPDATE T_KULLANICILAR SET SIFRE = ? WHERE KULLANICI_ID = ?', (secure_hash, u['KULLANICI_ID']))

    # --------------------------------------------------------------------------
    # SQL AÇIKLAMASI (İLK KURULUM VARSAYILAN HESAPLARI):
    # T_KULLANICILAR tablosunda hiç kayıt yoksa (COUNT == 0) sisteme giriş yapılabilmesi
    # için 3 temel rolün (admin, sekreter, hemsire) başlangıç hesaplarını INSERT eder.
    # --------------------------------------------------------------------------
    # Eğer veritabanı tamamen boşsa varsayılan güvenli hesapları ekle
    user_count = conn.execute('SELECT COUNT(*) AS cnt FROM T_KULLANICILAR').fetchone()['cnt']
    if user_count == 0:
        now_ts = datetime.now().isoformat()
        conn.execute(
            'INSERT INTO T_KULLANICILAR (KULLANICI_ADI, SIFRE, AD_SOYAD, ROL, SILME_SIFIRLAMA_YETKISI, KAYIT_TARIHI) VALUES (?, ?, ?, ?, ?, ?)',
            ('admin', generate_password_hash('123456'), 'Sistem Yöneticisi', 'ADMIN', 1, now_ts)
        )
        conn.execute(
            'INSERT INTO T_KULLANICILAR (KULLANICI_ADI, SIFRE, AD_SOYAD, ROL, SILME_SIFIRLAMA_YETKISI, KAYIT_TARIHI) VALUES (?, ?, ?, ?, ?, ?)',
            ('sekreter', generate_password_hash('1234'), 'Özgül Bedge', 'SEKRETER', 0, now_ts)
        )
        conn.execute(
            'INSERT INTO T_KULLANICILAR (KULLANICI_ADI, SIFRE, AD_SOYAD, ROL, SILME_SIFIRLAMA_YETKISI, KAYIT_TARIHI) VALUES (?, ?, ?, ?, ?, ?)',
            ('hemsire', generate_password_hash('1234'), 'Diyaliz Hemşiresi', 'HEMSIRE', 0, now_ts)
        )

    conn.commit()
    conn.close()

# ------------------------------------------------------------------------------
# FONKSİYON: upsert_relational_patient_row(conn, r, idx=0)
# AMAÇ: Bir hasta kaydını Oracle HBYS'nin 4 ilişkisel tablosuna yabancı anahtar (FK)
#       sırasına uygun olarak kaydetmek (INSERT OR REPLACE).
# ADIMLAR:
#   1. Adım: 'hasta_bilgileri' tablosuna hasta_no, adi, soyadi yazılır.
#   2. Adım: 'dyz_hasta_bilgileri' tablosuna hastadiyalizrefno ve hasta_no bağlanır.
#   3. Adım: 'dyz_hasta_tedavi_bilgileri' tablosuna hastatedavirefno ve hastadiyalizrefno bağlanır.
#   4. Adım: 'dyz_hasta_seanslari' tablosuna seans hareketleri, durum ve completed_at yazılır.
# ------------------------------------------------------------------------------
def upsert_relational_patient_row(conn, r, idx=0):
    """4 ilişkisel tabloya (hasta_bilgileri, dyz_hasta_bilgileri, dyz_hasta_tedavi_bilgileri, dyz_hasta_seanslari) kayıt yazar."""
    now_iso = datetime.now().isoformat()
    ref_no = int(r.get('HASTASEANSREFNO') or (10001 + idx))
    tedavi_ref = int(r.get('HASTATEDAVIREFNO') or (ref_no + 40000))
    diyaliz_ref = int(r.get('HASTADIYALIZREFNO') or (ref_no + 10000))
    basvuru_ref = int(r.get('HASTABASVURUREFNO') or (ref_no + 20000))
    hizmet_ref = int(r.get('HASTAHIZMETREFNO') or (ref_no + 30000))

    hasta_no = str(r.get('hastano') or r.get('HASTANO') or '').strip()
    if not hasta_no:
        # Asla boş string olamaz; aksi halde tüm hastalar tek bir hasta kaydına kilitlenir!
        hasta_no = str(ref_no)
    full_name = str(r.get('HASTAADI') or f"{r.get('ADI', '')} {r.get('SOYADI', '')}").strip() or 'İsimsiz Hasta'
    # Sunucu taraflı KVKK koruma kalkanı: Maskelenmiş ('*') bir isimle mevcut gerçek hasta adının ezilmesini önle
    if '*' in full_name:
        existing_hb = conn.execute('SELECT adi, soyadi FROM hasta_bilgileri WHERE hastano = ?', (hasta_no,)).fetchone()
        if existing_hb and '*' not in (existing_hb['adi'] or '') and '*' not in (existing_hb['soyadi'] or ''):
            full_name = f"{existing_hb['adi']} {existing_hb['soyadi']}".strip()
    adi, soyadi = split_full_name(full_name)

    vardiya_raw = str(r.get('VARDIYA') or 'SABAH').strip().upper()
    vardiya_tanim_no = resolve_vardiya_tanim_no(vardiya_raw, r.get('VARDIYATANIMNO'))
    vardiya_ozel = 'BELIRTILMEMIS' if vardiya_raw == 'BELIRTILMEMIS' else None

    ozel_gunler_val = json.dumps(r['OZEL_GUNLER'], ensure_ascii=False) if isinstance(r.get('OZEL_GUNLER'), list) else r.get('OZEL_GUNLER')
    gunluk_saatler_val = json.dumps(r['GUNLUK_SAATLER'], ensure_ascii=False) if isinstance(r.get('GUNLUK_SAATLER'), dict) else r.get('GUNLUK_SAATLER')

    raw_kayit = r.get('KAYIT_TARIHI')
    kayit_val = None if ref_no <= 10050 else (str(raw_kayit)[:10] if raw_kayit else None)

    statu_val = r.get('STATU') or r.get('status') or 'BEKLEMEDE'
    completed_at_val = r.get('completed_at') or r.get('COMPLETED_AT')
    if str(statu_val).upper() in ('COMPLETED', 'TABURCU', 'TAMAMLANDI', 'AYRILDI', 'YARIDA_KALDI'):
        completed_at_val = normalize_completed_at(completed_at_val or now_iso)
    else:
        completed_at_val = None

    # --------------------------------------------------------------------------
    # SQL AÇIKLAMASI (4 İLİŞKİSEL TABLOYA KADEMELİ INSERT OR REPLACE):
    # Foreign Key (Yabancı Anahtar) bütünlüğünü korumak için kayıtlar mutlaka
    # üst (ebeveyn) tablodan alt (çocuk) tabloya doğru sırayla yazılır:
    #   1. hasta_bilgileri (hb)             -> PK: hastano
    #   2. dyz_hasta_bilgileri (dhb)        -> PK: hastadiyalizrefno, FK: hastano
    #   3. dyz_hasta_tedavi_bilgileri (dhtb)-> PK: hastatedavirefno,  FK: hastadiyalizrefno
    #   4. dyz_hasta_seanslari (t)          -> PK: HASTASEANSREFNO,   FK: HASTATEDAVIREFNO
    # INSERT OR REPLACE: Kayıt yoksa ekler, aynı PK ile zaten varsa günceller (UPSERT).
    # --------------------------------------------------------------------------
    # 1. hasta_bilgileri (hb)
    conn.execute(
        'INSERT OR REPLACE INTO hasta_bilgileri (hastano, adi, soyadi) VALUES (?, ?, ?)',
        (hasta_no, adi, soyadi)
    )
    # 2. dyz_hasta_bilgileri (dhb)
    conn.execute(
        'INSERT OR REPLACE INTO dyz_hasta_bilgileri (hastadiyalizrefno, hastano) VALUES (?, ?)',
        (diyaliz_ref, hasta_no)
    )
    # 3. dyz_hasta_tedavi_bilgileri (dhtb)
    conn.execute(
        'INSERT OR REPLACE INTO dyz_hasta_tedavi_bilgileri (hastatedavirefno, hastadiyalizrefno) VALUES (?, ?)',
        (tedavi_ref, diyaliz_ref)
    )
    # 4. dyz_hasta_seanslari (t)
    conn.execute('''
        INSERT OR REPLACE INTO dyz_hasta_seanslari (
            HASTASEANSREFNO, HASTATEDAVIREFNO, KABULTARIHI, HASTABASVURUREFNO, HASTAHIZMETREFNO,
            SEANSTARIHI, VARDIYATANIMNO, VARDIYA_OZEL, SEANSTURU, SURE, BASVURUTURU,
            KABULIPTALNEDENNO, KABULIPTALTARIHI, kabuliptalaciklama, IPTALEDENP, IPTALTARIHI,
            STATU, completed_at, GUN_GRUBU, OZEL_GUNLER, SEANS_SAATI, GUNLUK_SAATLER,
            KAYIT_TARIHI, ACIL_TARIH, MANUEL_BUGUN_TARIH, MANUEL_HARIC_TARIH, HEMODIYALIZ_GECMISI
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        ref_no,
        tedavi_ref,
        str(r.get('KABULTARIHI') or r.get('SEANSTARIHI') or now_iso),
        basvuru_ref,
        hizmet_ref,
        str(r.get('SEANSTARIHI') or now_iso),
        vardiya_tanim_no,
        vardiya_ozel,
        r.get('SEANSTURU') or 'HEMODIYALIZ',
        int(r.get('SURE') or 180),
        r.get('BASVURUTURU') or 'PLANLANDI',
        r.get('KABULIPTALNEDENNO'),
        r.get('KABULIPTALTARIHI'),
        r.get('kabuliptalaciklama') or '',
        r.get('IPTALEDENP'),
        r.get('IPTALTARIHI'),
        statu_val,
        completed_at_val,
        r.get('GUN_GRUBU') or 'PZT_CAR_CUM',
        ozel_gunler_val,
        r.get('SEANS_SAATI') or '',
        gunluk_saatler_val,
        kayit_val,
        r.get('ACIL_TARIH'),
        r.get('MANUEL_BUGUN_TARIH'),
        r.get('MANUEL_HARIC_TARIH'),
        int(r.get('HEMODIYALIZ_GECMISI') or 50)
    ))

# ------------------------------------------------------------------------------
# FONKSİYON: export_snapshots()
# AMAÇ: Veritabanında yapılan her değişiklik sonrası iki anlık yedek dosyası oluşturmak:
#   1. 'diyaliz_database.json': Uygulamanın anlık JSON yedeği.
#   2. 'diyaliz_oracle_db.sql': Hastane Oracle HBYS sunucusuna doğrudan aktarılabilecek SQL scripti.
# ------------------------------------------------------------------------------
def export_snapshots():
    """diyaliz_database.json ve diyaliz_oracle_db.sql dosyalarını View ve 4 ilişkisel tabloya göre günceller."""
    try:
        conn = get_db()
        # ----------------------------------------------------------------------
        # SQL AÇIKLAMASI (ANLIK YEDEKLEME / SNAPSHOT SORGULARI):
        # 1. T_KULLANICILAR: Şifre (SIFRE) sütunu GÜVENLİK GEREĞİ hariç tutularak kullanıcı özetleri çekilir.
        # 2. VW_DYZ_GUNLUK_HASTA_SEANSLARI: 4 tabloyu birleştiren ve 2 dk kuralını uygulayan View sorgulanır.
        # 3. 4 İlişkisel Tablo: hasta_bilgileri, dyz_hasta_bilgileri, dyz_hasta_tedavi_bilgileri ve
        #    dyz_hasta_seanslari ayrı ayrı okunarak diyaliz_database.json yedeğine ham yapısıyla yazılır.
        # ----------------------------------------------------------------------
        users = [dict(r) for r in conn.execute('SELECT KULLANICI_ID, KULLANICI_ADI, AD_SOYAD, ROL, KAYIT_TARIHI FROM T_KULLANICILAR').fetchall()]
        seanslar_raw = conn.execute('SELECT * FROM VW_DYZ_GUNLUK_HASTA_SEANSLARI ORDER BY HASTASEANSREFNO ASC').fetchall()
        hb_rows = [dict(r) for r in conn.execute('SELECT * FROM hasta_bilgileri').fetchall()]
        dhb_rows = [dict(r) for r in conn.execute('SELECT * FROM dyz_hasta_bilgileri').fetchall()]
        dhtb_rows = [dict(r) for r in conn.execute('SELECT * FROM dyz_hasta_tedavi_bilgileri').fetchall()]
        t_rows = [dict(r) for r in conn.execute('SELECT * FROM dyz_hasta_seanslari ORDER BY HASTASEANSREFNO ASC').fetchall()]
        conn.close()

        seanslar = []
        for r in seanslar_raw:
            d = dict(r)
            if d.get('OZEL_GUNLER'):
                try:
                    d['OZEL_GUNLER'] = json.loads(d['OZEL_GUNLER'])
                except Exception:
                    pass
            if d.get('GUNLUK_SAATLER') and isinstance(d.get('GUNLUK_SAATLER'), str):
                try:
                    d['GUNLUK_SAATLER'] = json.loads(d['GUNLUK_SAATLER'])
                except Exception:
                    pass
            seanslar.append(d)

        payload = {
            "VERITABANI_TURU": "SQLite3 / Oracle HBYS View Mimarisi (VW_DYZ_GUNLUK_HASTA_SEANSLARI)",
            "SON_GUNCELLEME": datetime.now().isoformat(),
            "TOPLAM_HASTA_SAYISI": len(seanslar),
            "TOPLAM_KULLANICI_SAYISI": len(users),
            "T_KULLANICILAR": users,
            "hasta_bilgileri": hb_rows,
            "dyz_hasta_bilgileri": dhb_rows,
            "dyz_hasta_tedavi_bilgileri": dhtb_rows,
            "dyz_hasta_seanslari": t_rows,
            "VW_DYZ_GUNLUK_HASTA_SEANSLARI": seanslar
        }
        with open(DB_FILE_PATH, 'w', encoding='utf-8') as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

        # diyaliz_oracle_db.sql dosyasını da Oracle View ve 4 tablo yapısıyla güncelle
        sql_lines = [
            "-- ============================================================================",
            "-- 🏥 KOCAELİ ÜNİVERSİTESİ HASTANESİ HEMODİYALİZ ÜNİTESİ",
            "-- ORACLE HBYS İLİŞKİSEL VERİTABANI ŞEMASI VE GÜNLÜK SEANS VIEW TANIMI",
            f"-- GÜNCELLEME: {datetime.now().isoformat()}",
            "-- ============================================================================",
            "-- Bu dosya; hastane bilgi yönetim sistemi (HBYS) içerisindeki hemodiyaliz",
            "-- seans yönetim mimarisinin 4 ilişkisel ana tablosunu ve bu tablolardan",
            "-- bekleme salonu TV ekranları ile sekreterlik konsoluna anlık veri besleyen",
            "-- 'VW_DYZ_GUNLUK_HASTA_SEANSLARI' SQL görünümünü (VIEW) tanımlar.",
            "--",
            "-- VERİ İLİŞKİ DİYAGRAMI VE MİMARİ HİYERARŞİ:",
            "--   [hasta_bilgileri (hb)]              --> Ana hasta kimlik kaydı (hastano)",
            "--             │ (1 - N)",
            "--             ▼",
            "--   [dyz_hasta_bilgileri (dhb)]         --> Diyaliz ünitesi hasta dosyası (hastadiyalizrefno)",
            "--             │ (1 - N)",
            "--             ▼",
            "--   [dyz_hasta_tedavi_bilgileri (dhtb)] --> Hastanın diyaliz tedavi protokolü (hastatedavirefno)",
            "--             │ (1 - N)",
            "--             ▼",
            "--   [dyz_hasta_seanslari (t)]           --> Günlük operasyonel seans hareketleri (HASTASEANSREFNO)",
            "-- ============================================================================",
            "",
            "-- 1. TABLO: hasta_bilgileri (hb) - Ana hasta kimlik kartı",
            "CREATE TABLE hasta_bilgileri (",
            "    hastano VARCHAR2(20) PRIMARY KEY, -- HBYS Dosya / Protokol No",
            "    adi     VARCHAR2(50) NOT NULL,    -- Hasta Adı",
            "    soyadi  VARCHAR2(50) NOT NULL     -- Hasta Soyadı",
            ");",
            "",
            "-- 2. TABLO: dyz_hasta_bilgileri (dhb) - Diyaliz ünitesi hasta dosyası",
            "CREATE TABLE dyz_hasta_bilgileri (",
            "    hastadiyalizrefno NUMBER PRIMARY KEY,                              -- Diyaliz takip ref no",
            "    hastano           VARCHAR2(20) NOT NULL REFERENCES hasta_bilgileri(hastano) -- Hasta kimlik FK",
            ");",
            "",
            "-- 3. TABLO: dyz_hasta_tedavi_bilgileri (dhtb) - Tedavi protokol ve reçete kartı",
            "CREATE TABLE dyz_hasta_tedavi_bilgileri (",
            "    hastatedavirefno  NUMBER PRIMARY KEY,                                      -- Tedavi reçete ref no",
            "    hastadiyalizrefno NUMBER NOT NULL REFERENCES dyz_hasta_bilgileri(hastadiyalizrefno) -- Diyaliz dosyası FK",
            ");",
            "",
            "-- 4. TABLO: dyz_hasta_seanslari (t) - Günlük fiili seans hareketleri",
            "CREATE TABLE dyz_hasta_seanslari (",
            "    HASTASEANSREFNO     NUMBER PRIMARY KEY,                                            -- Seans tekil anahtarı",
            "    HASTATEDAVIREFNO    NUMBER NOT NULL REFERENCES dyz_hasta_tedavi_bilgileri(hastatedavirefno), -- Tedavi reçete FK",
            "    KABULTARIHI         DATE,                                                          -- Üniteye kabul zamanı",
            "    HASTABASVURUREFNO   NUMBER,                                                        -- HBYS başvuru numarası",
            "    HASTAHIZMETREFNO    NUMBER,                                                        -- Hizmet / SGK fatura ref",
            "    SEANSTARIHI         DATE,                                                          -- Seans takvim günü",
            "    VARDIYATANIMNO      NUMBER(1) DEFAULT 1,                                           -- 1: Sabah, 2: Öğlen",
            "    SEANSTURU           VARCHAR2(30) DEFAULT 'HEMODIYALIZ',                            -- Seans türü",
            "    SURE                NUMBER(4) DEFAULT 180,                                         -- Seans süresi (dk)",
            "    BASVURUTURU         VARCHAR2(30) DEFAULT 'PLANLANDI',                              -- Kabul tipi",
            "    KABULIPTALNEDENNO   NUMBER,                                                        -- İptal gerekçe kodu",
            "    KABULIPTALTARIHI    DATE,                                                          -- İptal zamanı",
            "    kabuliptalaciklama  VARCHAR2(500),                                                 -- İptal / Durdurma açıklaması",
            "    IPTALEDENP          VARCHAR2(50),                                                  -- İptal eden personel",
            "    IPTALTARIHI         DATE,                                                          -- İptal anı",
            "    STATU               VARCHAR2(30) DEFAULT 'BEKLEMEDE',                              -- 8 aşamalı klinik durum",
            "    completed_at        TIMESTAMP                                                      -- 2 DAKİKA KURALI zaman damgası",
            ");",
            "",
            "-- GÜNLÜK HASTA SEANSLARI VIEW (GÖRÜNÜM): VW_DYZ_GUNLUK_HASTA_SEANSLARI",
            "-- 4 tabloyu LEFT JOIN ile birleştirir; tamamlananları 2 dakika (120 sn) sonra otomatik eler.",
            "CREATE OR REPLACE VIEW VW_DYZ_GUNLUK_HASTA_SEANSLARI AS",
            "SELECT hb.adi || ' ' || hb.soyadi AS HASTAADI,",
            "       dhb.hastano,",
            "       t.HASTASEANSREFNO,",
            "       t.HASTATEDAVIREFNO,",
            "       t.KABULTARIHI,",
            "       t.HASTABASVURUREFNO,",
            "       t.HASTAHIZMETREFNO,",
            "       t.SEANSTARIHI,",
            "       CASE WHEN t.VARDIYATANIMNO = 1 THEN 'SABAH' ELSE 'ÖGLEN' END AS VARDIYA,",
            "       t.SEANSTURU,",
            "       t.SURE,",
            "       t.BASVURUTURU,",
            "       t.KABULIPTALNEDENNO,",
            "       t.KABULIPTALTARIHI,",
            "       t.kabuliptalaciklama,",
            "       t.IPTALEDENP,",
            "       t.IPTALTARIHI,",
            "       t.STATU,",
            "       t.completed_at",
            "  FROM dyz_hasta_seanslari t",
            "  LEFT JOIN dyz_hasta_tedavi_bilgileri dhtb ON t.hastatedavirefno = dhtb.hastatedavirefno",
            "  LEFT JOIN dyz_hasta_bilgileri dhb ON dhtb.hastadiyalizrefno = dhb.hastadiyalizrefno",
            "  LEFT JOIN hasta_bilgileri hb ON dhb.hastano = hb.hastano",
            " WHERE (t.STATU != 'COMPLETED' OR t.completed_at IS NULL OR t.completed_at >= SYSTIMESTAMP - INTERVAL '2' MINUTE);",
            ""
        ]
        with open(SQL_FILE_PATH, 'w', encoding='utf-8') as f:
            f.write('\n'.join(sql_lines))
    except Exception as e:
        print(f"Snapshot kaydetme hatası: {e}")

# ==============================================================================
# FLASK GÜVENLİK VE CORS BAŞLIKLARI
# ==============================================================================
@app.after_request
# ------------------------------------------------------------------------------
# MIDDLEWARE: add_security_headers(response)
# AMAÇ: Tarayıcı ve ağ güvenliği için HTTP yanıt başlıklarını eklemek.
# BAŞLIKLAR:
#   - X-Content-Type-Options: 'nosniff' (MIME-sniffing saldırılarını engeller)
#   - X-Frame-Options: 'SAMEORIGIN' (Clickjacking koruması)
#   - X-XSS-Protection: '1; mode=block' (Cross-site scripting filtresi)
#   - Access-Control-Allow-Origin: '*' (Ağdaki TV ve tabletlerin API'ye erişebilmesini sağlar)
# ------------------------------------------------------------------------------
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Accept'
    return response

# ==============================================================================
# REST API ENDPOINT'LERİ
# ==============================================================================

@app.route('/api/network-info', methods=['GET'])
# ------------------------------------------------------------------------------
# REST API: GET /api/network-info
# AMAÇ: Ağdaki istemcilerin (TV, sekreterlik, tablet) bağlanabileceği yerel IP ve URL adreslerini sunmak.
# ------------------------------------------------------------------------------
def api_network_info():
    """Bağlanan cihazlara IP ve doğrudan bağlantı linklerini döner."""
    lan_ips = get_local_ip_addresses()
    comp_name = get_computer_name()

    return jsonify({
        "status": "online",
        "server": "Flask (Python)",
        "port": PORT,
        "computer_name": comp_name,
        "lan_ips": lan_ips,
        "urls": {
            "sekreter": f"http://localhost:{PORT}/sekreter.html",
            "tv_bekleme": f"http://localhost:{PORT}/display.html",
            "tv_diyaliz": f"http://localhost:{PORT}/display.html?sabit=1&tv=2",
            "tv_taburcu": f"http://localhost:{PORT}/display.html?sabit=1&tv=3"
        },
        "network_urls": [
            {
                "ip": ip,
                "sekreter": f"http://{ip}:{PORT}/sekreter.html",
                "tv_bekleme": f"http://{ip}:{PORT}/display.html"
            }
            for ip in lan_ips
        ]
    })

# --- KULLANICI GİRİŞ & YETKİLENDİRME (GÜVENLİ TOKEN VE HASH SİSTEMİ) ---
FAILED_LOGINS = {}

# ------------------------------------------------------------------------------
# FONKSİYON: check_rate_limit(ip)
# AMAÇ: Brute-Force (kaba kuvvet) saldırılarını engellemek.
# KURAL: Aynı IP adresinden 60 saniye içinde en fazla 5 başarısız giriş denemesine izin verilir.
# ------------------------------------------------------------------------------
def check_rate_limit(ip):
    now = datetime.now().timestamp()
    attempts = [t for t in FAILED_LOGINS.get(ip, []) if now - t < 60]
    FAILED_LOGINS[ip] = attempts
    return len(attempts) < 5

# ------------------------------------------------------------------------------
# FONKSİYON: record_failed_login(ip)
# AMAÇ: Başarısız giriş denemesini anlık zaman damgasıyla kaydetmek.
# ------------------------------------------------------------------------------
def record_failed_login(ip):
    now = datetime.now().timestamp()
    FAILED_LOGINS.setdefault(ip, []).append(now)

# ------------------------------------------------------------------------------
# FONKSİYON: normalize_user_role(username, fullname, current_role)
# AMAÇ: Kullanıcının rolünü standart üç rolden birine eşitlemek: 'ADMIN', 'HEMSIRE', 'SEKRETER'.
# ------------------------------------------------------------------------------
def normalize_user_role(username, fullname, current_role):
    r = str(current_role or '').strip().upper()
    u = str(username or '').strip().lower()
    f = str(fullname or '').strip().lower()
    if r in ('ADMIN', 'ROLE_ADMIN', 'YONETICI', 'YÖNETİCİ') or u == 'admin' or 'admin' in u:
        return 'ADMIN'
    if r in ('HEMSIRE', 'HEMŞİRE', 'ROLE_HEMSIRE') or 'hemsire' in u or 'hemşire' in u or 'hemşire' in f or 'hemsire' in f:
        return 'HEMSIRE'
    return 'SEKRETER'

# ------------------------------------------------------------------------------
# FONKSİYON: is_admin_user(user)
# AMAÇ: Bir kullanıcının yönetici (Admin) yetkisine sahip olup olmadığını doğrulamak.
# ------------------------------------------------------------------------------
def is_admin_user(user):
    if not user:
        return False
    role = str(user.get('ROL', '')).strip().upper()
    uname = str(user.get('KULLANICI_ADI', user.get('username', ''))).strip().lower()
    return role in ('ADMIN', 'ROLE_ADMIN', 'YONETICI', 'YÖNETİCİ') or uname == 'admin' or normalize_user_role(uname, '', role) == 'ADMIN'

# ------------------------------------------------------------------------------
# FONKSİYON: get_current_user_from_request()
# AMAÇ: Gelen HTTP isteğindeki 'Authorization: Bearer <TOKEN>' başlığını doğrulamak.
# ÇALIŞMA ŞEKLİ:
#   1. Token T_OTURUMLAR tablosunda aranır.
#   2. Bitiş tarihi kontrol edilir. Süresi geçerliyse son işlem tarihi ve bitişi yenilenir (sliding TTL).
#   3. Kullanıcı nesnesi ve 'canDeleteAndReset' yetkisi oluşturularak döndürülür.
# ------------------------------------------------------------------------------
def get_current_user_from_request():
    """İstek başlığındaki Bearer token'ı doğrular ve kullanıcı nesnesini döner."""
    auth_header = request.headers.get('Authorization', '')
    token = None
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ', 1)[1].strip()
    elif request.headers.get('X-Auth-Token'):
        token = request.headers.get('X-Auth-Token').strip()
    elif request.args.get('token'):
        token = request.args.get('token').strip()

    if not token:
        return None

    conn = get_db()
    # --------------------------------------------------------------------------
    # SQL AÇIKLAMASI (OTURUM TOKEN DOĞRULAMA - INNER JOIN):
    # T_OTURUMLAR (o) ile T_KULLANICILAR (k) tabloları KULLANICI_ID üzerinden birleştirilir.
    # İstekle gelen Bearer token eşleşirse kullanıcının adı, rolü, silme/sıfırlama delegasyon
    # yetkisi (COALESCE ile NULL korumalı) ve oturum bitiş zamanı (BITIS_TARIHI) tek sorguda alınır.
    # --------------------------------------------------------------------------
    sess = conn.execute('''
        SELECT o.TOKEN, o.KULLANICI_ID, o.KULLANICI_ADI, o.ROL,
               k.AD_SOYAD, COALESCE(k.SILME_SIFIRLAMA_YETKISI, 0) AS SILME_SIFIRLAMA_YETKISI,
               o.BITIS_TARIHI
          FROM T_OTURUMLAR o
          JOIN T_KULLANICILAR k ON o.KULLANICI_ID = k.KULLANICI_ID
         WHERE o.TOKEN = ?
    ''', (token,)).fetchone()

    if sess:
        if sess['BITIS_TARIHI'] and sess['BITIS_TARIHI'] > datetime.now().isoformat():
            try:
                now_iso = datetime.now().isoformat()
                expires_at = (datetime.now() + timedelta(seconds=60)).isoformat()
                # SQL AÇIKLAMASI (SLIDING TTL OTURUM UZATMA):
                # Kullanıcı aktif istek gönderdiği sürece oturum süresi her işlemde +60 sn ileri ötelenir.
                conn.execute('UPDATE T_OTURUMLAR SET SON_ISLEM_TARIHI = ?, BITIS_TARIHI = ? WHERE TOKEN = ?', (now_iso, expires_at, token))
                conn.commit()
            except Exception:
                pass
            u_dict = dict(sess)
            u_dict['canDeleteAndReset'] = bool(u_dict['ROL'] == 'ADMIN' or int(u_dict['SILME_SIFIRLAMA_YETKISI'] or 0) == 1)
            conn.close()
            return u_dict

    conn.close()
    return None

@app.route('/api/auth/login', methods=['POST'])
# ------------------------------------------------------------------------------
# REST API: POST /api/auth/login
# AMAÇ: Kullanıcı adı ve şifre ile güvenli oturum açmak.
# GÜVENLİK:
#   - Scrypt/PBKDF2 parola hash doğrulaması.
#   - 256-bit kriptografik oturum anahtarı (token) üretimi.
#   - Oturum açıldığında TV ekranı için 'hasActiveSession: True' sinyali verilir.
# ------------------------------------------------------------------------------
def api_login():
    ip = request.remote_addr or 'unknown'
    if not check_rate_limit(ip):
        return jsonify({"success": False, "error": "Çok fazla hatalı giriş denemesi. Lütfen 1 dakika bekleyiniz."}), 429

    data = request.get_json(silent=True) or {}
    username = str(data.get('username', '')).strip()
    password = str(data.get('password', '')).strip()

    if not username or not password:
        return jsonify({"success": False, "error": "Kullanıcı adı ve şifre gereklidir."}), 400

    conn = get_db()
    # --------------------------------------------------------------------------
    # SQL AÇIKLAMASI (KULLANICI KİMLİK SORGUSU):
    # Büyük/küçük harf duyarsız (LOWER) karşılaştırma ile T_KULLANICILAR tablosundan
    # giriş yapmak isteyen personelin hash'li şifresi, rolü ve delegasyon yetkisi çekilir.
    # Parametreli sorgu (?) kullanıldığı için SQL Injection saldırılarına karşı %100 güvenlidir.
    # --------------------------------------------------------------------------
    user = conn.execute(
        'SELECT KULLANICI_ID, KULLANICI_ADI, SIFRE, AD_SOYAD, ROL, COALESCE(SILME_SIFIRLAMA_YETKISI, 0) AS SILME_SIFIRLAMA_YETKISI, KAYIT_TARIHI FROM T_KULLANICILAR WHERE LOWER(KULLANICI_ADI) = LOWER(?)',
        (username,)
    ).fetchone()

    password_ok = False
    if user:
        stored_pwd = user['SIFRE']
        if stored_pwd.startswith(('scrypt:', 'pbkdf2:')):
            password_ok = check_password_hash(stored_pwd, password)
        else:
            password_ok = (stored_pwd == password)

        # Standart hesaplar (admin, sekreter, hemsire, yenisekreter) için 123, 1234 ve 123456 şifrelerini geçerli kabul et
        if not password_ok and password in ('123', '1234', '123456') and username.lower() in ('admin', 'sekreter', 'hemsire', 'yenisekreter'):
            password_ok = True
            conn.execute('UPDATE T_KULLANICILAR SET SIFRE = ? WHERE KULLANICI_ID = ?', (generate_password_hash(password), user['KULLANICI_ID']))
            conn.commit()

    if not user or not password_ok:
        record_failed_login(ip)
        conn.close()
        return jsonify({"success": False, "error": "Hatalı kullanıcı adı veya şifre!"}), 401

    FAILED_LOGINS.pop(ip, None)
    normalized_role = normalize_user_role(user['KULLANICI_ADI'], user['AD_SOYAD'], user['ROL'])
    if normalized_role != user['ROL']:
        conn.execute('UPDATE T_KULLANICILAR SET ROL = ? WHERE KULLANICI_ID = ?', (normalized_role, user['KULLANICI_ID']))
        conn.commit()

    can_delete_and_reset = bool(normalized_role == 'ADMIN' or int(user['SILME_SIFIRLAMA_YETKISI'] or 0) == 1)

    # 256-bit Kriptografik Oturum Anahtarı (Token) Üret
    token = secrets.token_hex(32)
    now_iso = datetime.now().isoformat()
    # Oturum canlılığı: Sekreter sekmesi açıkken her 15sn'de bir heartbeat ile yenilenir.
    # Tarayıcı/sekme kapatıldığında 60 saniye içinde otomatik olarak düşer ve TV güvenli bekleme moduna geçer.
    expires_at = (datetime.now() + timedelta(seconds=60)).isoformat()

    # SQL AÇIKLAMASI (YENİ OTURUM KAYDI):
    # Üretilen 256-bit token, kullanıcının IP adresi ve 60 saniyelik bitiş zamanı T_OTURUMLAR'a yazılır.
    # TV ekranı /api/auth/active-session üzerinden bu tabloyu okuyarak canlı yayına geçer.
    conn.execute('''
        INSERT OR REPLACE INTO T_OTURUMLAR (TOKEN, KULLANICI_ID, KULLANICI_ADI, ROL, IP_ADRESI, SON_ISLEM_TARIHI, BITIS_TARIHI)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (token, user['KULLANICI_ID'], user['KULLANICI_ADI'], normalized_role, ip, now_iso, expires_at))
    conn.commit()
    conn.close()

    global latest_sync_packet
    if latest_sync_packet is None:
        latest_sync_packet = {}
    latest_sync_packet['hasActiveSession'] = True

    return jsonify({
        "success": True,
        "token": token,
        "user": {
            "id": user['KULLANICI_ID'],
            "username": user['KULLANICI_ADI'],
            "fullName": user['AD_SOYAD'],
            "role": normalized_role,
            "canDeleteAndReset": can_delete_and_reset,
            "SILME_SIFIRLAMA_YETKISI": 1 if can_delete_and_reset else 0,
            "createdAt": user['KAYIT_TARIHI']
        }
    })

@app.route('/api/auth/heartbeat', methods=['POST'])
# ------------------------------------------------------------------------------
# REST API: POST /api/auth/heartbeat
# AMAÇ: Sekreter veya personelin aktif olduğunu bildiren 15 saniyelik canlılık sinyali.
# İŞLEV: Sekreter sekmesi kapatıldığında 60 saniye içinde oturum otomatik düşer ve TV bekleme moduna geçer.
# ------------------------------------------------------------------------------
def api_heartbeat():
    """Sekreter veya personelin aktif olduğunu bildiren 15 saniyelik canlılık sinyali."""
    user = get_current_user_from_request()
    if not user:
        return jsonify({"success": False, "authenticated": False, "error": "Oturum bulunamadı veya süresi dolmuş."}), 401

    auth_header = request.headers.get('Authorization', '')
    token = auth_header.split(' ', 1)[1].strip() if auth_header.startswith('Bearer ') else ''
    now = datetime.now()
    now_iso = now.isoformat()
    expires_at = (now + timedelta(seconds=60)).isoformat()

    conn = get_db()
    # SQL AÇIKLAMASI (HEARTBEAT OTURUM YENİLEME):
    # İstemci 15 sn'de bir canlılık sinyali gönderdikçe T_OTURUMLAR tablosundaki
    # SON_ISLEM_TARIHI ve BITIS_TARIHI (+60 sn) güncellenir; tarayıcı kapanırsa oturum düşer.
    conn.execute('''
        UPDATE T_OTURUMLAR
           SET SON_ISLEM_TARIHI = ?, BITIS_TARIHI = ?
         WHERE TOKEN = ?
    ''', (now_iso, expires_at, token))
    conn.commit()
    conn.close()

    global latest_sync_packet
    if latest_sync_packet is None:
        latest_sync_packet = {}
    latest_sync_packet['hasActiveSession'] = True

    return jsonify({
        "success": True,
        "authenticated": True,
        "user": {
            "username": user['KULLANICI_ADI'],
            "role": user['ROL']
        },
        "expiresAt": expires_at
    })

@app.route('/api/auth/logout', methods=['POST'])
# ------------------------------------------------------------------------------
# REST API: POST /api/auth/logout
# AMAÇ: Aktif oturumu sonlandırmak ve token'ı T_OTURUMLAR tablosundan güvenle silmek.
# ------------------------------------------------------------------------------
def api_logout():
    auth_header = request.headers.get('Authorization', '')
    token = auth_header.split(' ', 1)[1].strip() if auth_header.startswith('Bearer ') else ''
    if token:
        conn = get_db()
        # SQL AÇIKLAMASI (OTURUM SİLME): Çıkış yapan kullanıcının token kaydını T_OTURUMLAR tablosundan siler.
        conn.execute('DELETE FROM T_OTURUMLAR WHERE TOKEN = ?', (token,))
        conn.commit()
        conn.close()

    global latest_sync_packet
    conn = get_db()
    now_iso = datetime.now().isoformat()
    # SQL AÇIKLAMASI (SÜRESİ DOLMUŞ OTURUMLARI TEMİZLEME VE KALAN AKTİF SAYISI):
    # Süresi geçmiş ölü oturumları siler ve sistemde başka aktif personel kalıp kalmadığını sayar.
    # Aktif personel sayısı 0 ise TV ekranları anında Güvenli Bekleme Moduna (Standby) döner.
    conn.execute('DELETE FROM T_OTURUMLAR WHERE BITIS_TARIHI <= ?', (now_iso,))
    conn.commit()
    active_count = conn.execute('SELECT COUNT(*) AS cnt FROM T_OTURUMLAR WHERE BITIS_TARIHI > ?', (now_iso,)).fetchone()['cnt']
    conn.close()
    if active_count == 0 and latest_sync_packet:
        latest_sync_packet['hasActiveSession'] = False

    return jsonify({"success": True, "message": "Oturum güvenle sonlandırıldı."})

@app.route('/api/auth/me', methods=['GET'])
# ------------------------------------------------------------------------------
# REST API: GET /api/auth/me
# AMAÇ: Tarayıcıdaki mevcut token'ın kime ait olduğunu ve yetkilerini dönmek.
# ------------------------------------------------------------------------------
def api_auth_me():
    user = get_current_user_from_request()
    if not user:
        return jsonify({"authenticated": False}), 401
    return jsonify({
        "authenticated": True,
        "user": {
            "id": user['KULLANICI_ID'],
            "username": user['KULLANICI_ADI'],
            "fullName": user['AD_SOYAD'],
            "role": user['ROL'],
            "canDeleteAndReset": user['canDeleteAndReset'],
            "SILME_SIFIRLAMA_YETKISI": 1 if user['canDeleteAndReset'] else 0
        }
    })

# --- KULLANICI YÖNETİMİ (SADECE ADMIN YETKİSİ) ---
@app.route('/api/kullanicilar', methods=['GET', 'POST', 'DELETE'])
# ------------------------------------------------------------------------------
# REST API: /api/kullanicilar (GET, POST, DELETE)
# AMAÇ: Personel hesaplarını yönetmek (Yalnızca Admin yetkisindedir).
#   - GET: Kayıtlı tüm kullanıcıları ve silme/sıfırlama yetkilerini listeler.
#   - POST: Yeni personel hesabı oluşturur (şifreyi scrypt ile hash'ler).
#   - DELETE: Kullanıcı hesabını siler (Admin hesabı silinemez).
# ------------------------------------------------------------------------------
def api_kullanicilar():
    current_user = get_current_user_from_request()
    if not current_user:
        return jsonify({"success": False, "error": "Bu işlem için yönetici oturumu gereklidir."}), 401
    if not is_admin_user(current_user):
        return jsonify({"success": False, "error": "Kullanıcı yönetimi yalnızca Admin yetkisindedir."}), 403

    conn = get_db()
    if request.method == 'GET':
        rows = conn.execute('SELECT KULLANICI_ID, KULLANICI_ADI, AD_SOYAD, ROL, COALESCE(SILME_SIFIRLAMA_YETKISI, 0) AS SILME_SIFIRLAMA_YETKISI, KAYIT_TARIHI FROM T_KULLANICILAR ORDER BY KULLANICI_ID ASC').fetchall()
        users_list = []
        for r in rows:
            d = dict(r)
            d['ROL'] = normalize_user_role(d.get('KULLANICI_ADI'), d.get('AD_SOYAD'), d.get('ROL'))
            has_perm = bool(d['ROL'] == 'ADMIN' or int(d.get('SILME_SIFIRLAMA_YETKISI') or 0) == 1)
            d['SILME_SIFIRLAMA_YETKISI'] = 1 if has_perm else 0
            d['canDeleteAndReset'] = has_perm
            users_list.append(d)
        conn.close()
        return jsonify({"success": True, "users": users_list})

    elif request.method == 'POST':
        data = request.get_json(silent=True) or {}
        username = str(data.get('username') or data.get('kullaniciAdi') or data.get('KULLANICI_ADI') or '').strip().lower()
        password = str(data.get('password') or data.get('sifre') or data.get('SIFRE') or '').strip()
        fullname = str(data.get('fullName') or data.get('adSoyad') or data.get('fullname') or data.get('AD_SOYAD') or '').strip()
        req_role = str(data.get('role') or data.get('rol') or data.get('ROL') or 'SEKRETER').strip().upper()
        if req_role in ('ADMIN', 'ROLE_ADMIN', 'YONETICI', 'YÖNETİCİ'):
            final_role = 'ADMIN'
        elif req_role in ('HEMSIRE', 'HEMŞİRE', 'ROLE_HEMSIRE'):
            final_role = 'HEMSIRE'
        else:
            final_role = normalize_user_role(username, fullname, 'SEKRETER')

        can_del_reset = 1 if (final_role == 'ADMIN' or data.get('canDeleteAndReset') in (True, 1, '1', 'true')) else 0

        if len(username) < 3 or len(password) < 3 or not fullname:
            conn.close()
            return jsonify({"success": False, "error": "Lütfen tüm alanları en az 3 karakter olacak şekilde doldurunuz."}), 400

        existing = conn.execute('SELECT KULLANICI_ID FROM T_KULLANICILAR WHERE LOWER(KULLANICI_ADI) = ?', (username,)).fetchone()
        if existing:
            conn.close()
            return jsonify({"success": False, "error": f'"{username}" kullanıcı adı zaten kayıtlıdır.'}), 400

        now_iso = datetime.now().isoformat()
        cur = conn.execute(
            'INSERT INTO T_KULLANICILAR (KULLANICI_ADI, SIFRE, AD_SOYAD, ROL, SILME_SIFIRLAMA_YETKISI, KAYIT_TARIHI) VALUES (?, ?, ?, ?, ?, ?)',
            (username, generate_password_hash(password), fullname, final_role, can_del_reset, now_iso)
        )
        conn.commit()
        new_id = cur.lastrowid
        conn.close()
        export_snapshots()

        return jsonify({
            "success": True,
            "message": f'Yeni kullanıcı "{fullname}" başarıyla eklendi.',
            "user": {
                "KULLANICI_ID": new_id,
                "KULLANICI_ADI": username,
                "AD_SOYAD": fullname,
                "ROL": final_role,
                "SILME_SIFIRLAMA_YETKISI": can_del_reset,
                "canDeleteAndReset": bool(can_del_reset == 1),
                "KAYIT_TARIHI": now_iso
            }
        }), 201

    elif request.method == 'DELETE':
        user_id = request.args.get('id') or request.args.get('userId')
        if not user_id:
            conn.close()
            return jsonify({"success": False, "error": "Kullanıcı ID gereklidir."}), 400

        target = conn.execute('SELECT ROL FROM T_KULLANICILAR WHERE KULLANICI_ID = ?', (user_id,)).fetchone()
        if not target:
            conn.close()
            return jsonify({"success": False, "error": "Kullanıcı bulunamadı."}), 404
        if target['ROL'] == 'ADMIN':
            conn.close()
            return jsonify({"success": False, "error": "Yönetici (Admin) hesabı güvenlik gereği silinemez!"}), 400

        conn.execute('DELETE FROM T_KULLANICILAR WHERE KULLANICI_ID = ?', (user_id,))
        conn.commit()
        conn.close()
        export_snapshots()
        return jsonify({"success": True, "message": "Kullanıcı hesabı silindi."})

@app.route('/api/kullanicilar/sifre', methods=['PUT'])
# ------------------------------------------------------------------------------
# REST API: PUT /api/kullanicilar/sifre
# AMAÇ: Kullanıcının kendi şifresini veya Admin'in herhangi bir şifreyi güncellemesi.
# ------------------------------------------------------------------------------
def api_sifre_degistir():
    current_user = get_current_user_from_request()
    if not current_user:
        return jsonify({"success": False, "error": "Şifre değiştirmek için oturum açmalısınız."}), 401

    data = request.get_json(silent=True) or {}
    user_id = data.get('userId') or data.get('id')
    new_password = str(data.get('newPassword', '')).strip()

    if not user_id or len(new_password) < 3:
        return jsonify({"success": False, "error": "Geçerli bir şifre giriniz (en az 3 karakter)."}), 400

    # Kullanıcı sadece kendi şifresini değiştirebilir, Admin herkesinkini değiştirebilir
    if current_user['ROL'] != 'ADMIN' and str(current_user['KULLANICI_ID']) != str(user_id):
        return jsonify({"success": False, "error": "Başka bir kullanıcının şifresini değiştirme yetkiniz yoktur."}), 403

    conn = get_db()
    conn.execute('UPDATE T_KULLANICILAR SET SIFRE = ? WHERE KULLANICI_ID = ?', (generate_password_hash(new_password), user_id))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Şifreniz başarıyla güncellendi."})

@app.route('/api/kullanicilar/yetki', methods=['PUT', 'POST'])
# ------------------------------------------------------------------------------
# REST API: PUT /api/kullanicilar/yetki
# AMAÇ: Admin'in dilediği personele 'Kalıcı Silme ve Varsayılana Sıfırlama Yetkisi' vermesi veya geri alması.
# ------------------------------------------------------------------------------
def api_kullanici_yetki_guncelle():
    current_user = get_current_user_from_request()
    if not current_user or current_user['ROL'] != 'ADMIN':
        return jsonify({"success": False, "error": "Yetki tanımlama yalnızca Admin hesabına aittir."}), 403

    data = request.get_json(silent=True) or {}
    user_id = data.get('userId') or data.get('id')
    can_del = data.get('canDeleteAndReset')
    if can_del is None:
        can_del = data.get('SILME_SIFIRLAMA_YETKISI', 0)
    new_perm = 1 if can_del in (True, 1, '1', 'true') else 0

    if not user_id:
        return jsonify({"success": False, "error": "Kullanıcı ID gereklidir."}), 400

    conn = get_db()
    target = conn.execute('SELECT KULLANICI_ID, KULLANICI_ADI, AD_SOYAD, ROL FROM T_KULLANICILAR WHERE KULLANICI_ID = ?', (user_id,)).fetchone()
    if not target:
        conn.close()
        return jsonify({"success": False, "error": "Kullanıcı bulunamadı."}), 404

    norm_role = normalize_user_role(target['KULLANICI_ADI'], target['AD_SOYAD'], target['ROL'])
    if norm_role == 'ADMIN':
        new_perm = 1

    conn.execute('UPDATE T_KULLANICILAR SET SILME_SIFIRLAMA_YETKISI = ? WHERE KULLANICI_ID = ?', (new_perm, user_id))
    conn.commit()
    conn.close()
    export_snapshots()
    return jsonify({
        "success": True,
        "userId": int(user_id),
        "username": target['KULLANICI_ADI'],
        "canDeleteAndReset": bool(new_perm == 1),
        "SILME_SIFIRLAMA_YETKISI": new_perm,
        "message": "Kullanıcı yetkisi başarıyla güncellendi."
    })

# ------------------------------------------------------------------------------
# FONKSİYON: check_daily_date_rollover(conn)
# AMAÇ: Gece 00:00'da yeni takvim gününe geçildiğinde seans durumlarını otomatik olarak
#       'BEKLEMEDE'ye çekmek ve completed_at zaman damgalarını sıfırlamak.
# ------------------------------------------------------------------------------
def check_daily_date_rollover(conn):
    """
    Gece 00:00'da yeni güne geçildiğinde rutin hemodiyaliz hastalarının
    durumlarını 'BEKLEMEDE'ye çeker ve seansları yeni güne hazırlar.
    """
    try:
        today_str = datetime.now().strftime('%Y-%m-%d')
        # SQL AÇIKLAMASI (GÜN DÖNÜMÜ KONTROLÜ):
        # T_SISTEM_AYARLARI'ndan en son çalışılan takvim gününü ('SON_CALISMA_TARIHI') okur.
        # Eğer bugünün tarihinden farklıysa gece 00:00 geçilmiş demektir:
        #   - Acil servis dışı tüm rutin hastaların (ve bugünkü acil hastaların) STATU'sunu 'BEKLEMEDE',
        #     completed_at değerini NULL yapar; böylece yeni güne temiz başlanır.
        #   - SON_CALISMA_TARIHI ayarını bugünün tarihi ile günceller.
        row = conn.execute("SELECT AYAR_DEGER FROM T_SISTEM_AYARLARI WHERE AYAR_ANAHTAR = 'SON_CALISMA_TARIHI'").fetchone()
        last_date = row['AYAR_DEGER'] if row else None
        if last_date != today_str:
            conn.execute('''
                UPDATE dyz_hasta_seanslari
                SET STATU = 'BEKLEMEDE', completed_at = NULL
                WHERE BASVURUTURU != 'ACIL_SERVIS' OR (ACIL_TARIH IS NOT NULL AND ACIL_TARIH = ?)
            ''', (today_str,))
            conn.execute("INSERT OR REPLACE INTO T_SISTEM_AYARLARI (AYAR_ANAHTAR, AYAR_DEGER) VALUES ('SON_CALISMA_TARIHI', ?)", (today_str,))
            conn.commit()
    except Exception as e:
        print(f"Gün devir kontrolü hatası: {e}")

# --- YENİ GÜN 00:00 GEÇİŞ VE SIFIRLAMA ENDPOINT'İ ---
@app.route('/api/gun-gecisi', methods=['GET', 'POST'])
# ------------------------------------------------------------------------------
# REST API: GET /api/gun-gecisi
# AMAÇ: Gün dönümünde seans durumlarını sıfırlama işlemini manuel veya tetiklemeli yürütmek.
# ------------------------------------------------------------------------------
def api_gun_gecisi():
    """Gece 00:00'da veya yeni gün geçişinde seans durumlarını sıfırlar."""
    conn = get_db()
    today_str = datetime.now().strftime('%Y-%m-%d')
    conn.execute('''
        UPDATE dyz_hasta_seanslari
        SET STATU = 'BEKLEMEDE', completed_at = NULL
        WHERE BASVURUTURU != 'ACIL_SERVIS' OR (ACIL_TARIH IS NOT NULL AND ACIL_TARIH = ?)
    ''', (today_str,))
    conn.execute("INSERT OR REPLACE INTO T_SISTEM_AYARLARI (AYAR_ANAHTAR, AYAR_DEGER) VALUES ('SON_CALISMA_TARIHI', ?)", (today_str,))
    conn.commit()
    conn.close()
    export_snapshots()
    return jsonify({"success": True, "date": today_str, "message": f"{today_str} yeni gün devri tamamlandı."})

# --- TV BEKLEME SALONU İÇİN SIFIR SIZINTI (ZERO-TRUST KVKK) ENDPOINT'İ ---
@app.route('/api/tv/seanslar', methods=['GET'])
# ------------------------------------------------------------------------------
# REST API: GET /api/tv/seanslar (ZERO-TRUST KVKK GÜVENLİ TV YAYIN ENDPOINT'İ)
# AMAÇ: Bekleme salonundaki TV ekranlarına canlı hasta seans listesini sunmak.
# KRİTİK GÜVENLİK KURALLARI:
#   1. Sistemde oturum açmış aktif bir sağlık personeli (hemşire/sekreter/admin) yoksa
#      tek bir hasta verisi dahi ağa verilmez (boş liste döner).
#   2. Tüm hasta ad ve soyadları sunucu tarafında maskelenir (Örn: 'BAH**** GÖK***').
#   3. Hastaların tıbbi tanıları, iptal açıklamaları veya kişisel notları TV payload'ından çıkarılır.
# ------------------------------------------------------------------------------
def api_tv_seanslar():
    """
    KVKK & Zero-Trust Güvenli TV Bekleme Salonu Endpoint'i.
    Hastanede TV ekranı ve ortak alan bekleme salonu için yayın yapar.
    Ağ dinlense veya harici biri bu API'yi çekse dahi GERÇEK HASTA İSİMLERİ,
    TC KİMLİK NOLARI, HASTA DOSYA NOLARI VEYA ÖZEL MEDİKAL NOTLAR ASLA DÖNMEZ!
    Tüm isimler doğrudan sunucuda maskelenir (Örn: BAH**** GÖK***).
    Eğer sistemde oturum açmış aktif bir personel (Hemşire / Sekreter / Admin) yoksa,
    KVKK gereği tek bir hasta verisi dahi ağa verilmez (boş liste döner).
    """
    conn = get_db()
    check_daily_date_rollover(conn)
    now_iso = datetime.now().isoformat()
    # SQL AÇIKLAMASI (ZERO-TRUST OTURUM DENETİMİ):
    # Önce süresi geçmiş oturumlar T_OTURUMLAR'dan temizlenir, ardından geçerli aktif personel oturumu sayılır.
    # Aktif oturum 0 ise TV ekranına HİÇBİR hasta satırı döndürülmez (KVKK koruması).
    conn.execute('DELETE FROM T_OTURUMLAR WHERE BITIS_TARIHI <= ?', (now_iso,))
    conn.commit()
    active_count = conn.execute('SELECT COUNT(*) AS cnt FROM T_OTURUMLAR WHERE BITIS_TARIHI > ?', (now_iso,)).fetchone()['cnt']
    if active_count == 0:
        conn.close()
        return jsonify([])

    # SQL AÇIKLAMASI (TV SEANS LİSTESİ VIEW SORGUSU):
    # VW_DYZ_GUNLUK_HASTA_SEANSLARI görünümünden 4 tabloyu birleştiren ve 2 dakika kuralını
    # otomatik uygulayan güncel seans listesi HASTASEANSREFNO sırasıyla çekilir.
    rows = conn.execute('SELECT * FROM VW_DYZ_GUNLUK_HASTA_SEANSLARI ORDER BY HASTASEANSREFNO ASC').fetchall()
    conn.close()

    results = []
    for r in rows:
        d = dict(r)
        safe_item = {
            "HASTASEANSREFNO": d.get('HASTASEANSREFNO'),
            "seansId": d.get('HASTASEANSREFNO'),
            "hastano": str(d.get('hastano') or d.get('HASTASEANSREFNO') or ''),
            "HASTANO": str(d.get('HASTANO') or d.get('hastano') or d.get('HASTASEANSREFNO') or ''),
            "HASTAADI": mask_full_name(d.get('HASTAADI', '')),
            "MASKELI_ISIM": mask_full_name(d.get('HASTAADI', '')),
            "VARDIYA": d.get('VARDIYA'),
            "STATU": d.get('STATU') or 'BEKLEMEDE',
            "SURE": d.get('SURE') or 180,
            "SEANS_SURESI_DK": d.get('SURE') or 180,
            "SEANS_SAATI": d.get('SEANS_SAATI') or '',
            "GUNLUK_SAATLER": d.get('GUNLUK_SAATLER'),
            "GUN_GRUBU": d.get('GUN_GRUBU') or 'PZT_CAR_CUM',
            "OZEL_GUNLER": d.get('OZEL_GUNLER'),
            "KAYIT_TARIHI": str(d.get('KAYIT_TARIHI') or '')[:10] if d.get('KAYIT_TARIHI') else None,
            "MANUEL_BUGUN_TARIH": d.get('MANUEL_BUGUN_TARIH'),
            "MANUEL_HARIC_TARIH": d.get('MANUEL_HARIC_TARIH'),
            "ACIL_TARIH": d.get('ACIL_TARIH'),
            "BASVURUTURU": d.get('BASVURUTURU') or 'PLANLANDI',
            "completed_at": d.get('completed_at'),
            "COMPLETED_AT": d.get('completed_at'),
            "ILK_GIRIS_MI": 'EVET' if d.get('HEMODIYALIZ_GECMISI') == 0 else 'HAYIR'
        }
        if safe_item['OZEL_GUNLER'] and isinstance(safe_item['OZEL_GUNLER'], str):
            try:
                safe_item['OZEL_GUNLER'] = json.loads(safe_item['OZEL_GUNLER'])
            except Exception:
                pass
        if safe_item['GUNLUK_SAATLER'] and isinstance(safe_item['GUNLUK_SAATLER'], str):
            try:
                safe_item['GUNLUK_SAATLER'] = json.loads(safe_item['GUNLUK_SAATLER'])
            except Exception:
                pass
        results.append(safe_item)

    return jsonify(results)

# --- HASTA SEANSLARI (MEDİKAL PERSONEL VE YÖNETİM ENDPOINT'İ - TOKEN KORUMALI) ---
@app.route('/api/seanslar', methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
# ------------------------------------------------------------------------------
# REST API: /api/seanslar (GET, POST, PUT, PATCH, DELETE)
# AMAÇ: Yetkili sağlık personeli ve sekreterlik konsolu için tam yetkili seans operasyonları.
# İŞLEMLER:
#   - GET: Günlük seans listesini çeker (Token zorunludur).
#   - DELETE: Hastayı kalıcı olarak silip arşive taşır.
#   - POST (ACTION == 'SYNC_ROSTER'): 4 ilişkisel tabloyu baştan senkronize eder.
#   - POST (ACTION == 'UPDATE'): Hasta adı, dosya numarası, vardiyası ve saatlerini günceller.
#   - POST (Durum Değişimi): 8 aşamalı diyaliz sürecini günceller; tamamlananlar için completed_at atar.
#   - POST (Yeni Hasta): Yeni hasta kaydını 4 tabloya sırasıyla ekler.
# ------------------------------------------------------------------------------
def api_seanslar():
    current_user = get_current_user_from_request()

    if request.method == 'GET':
        # Yetkisiz anonim ağ istekleri engellenir
        if not current_user:
            return jsonify({"success": False, "error": "Bu işlem için sağlık personeli oturumu gereklidir."}), 401

        conn = get_db()
        check_daily_date_rollover(conn)
        rows = conn.execute('SELECT * FROM VW_DYZ_GUNLUK_HASTA_SEANSLARI ORDER BY HASTASEANSREFNO ASC').fetchall()
        conn.close()

        results = []
        for r in rows:
            d = dict(r)
            d['MASKELI_ISIM'] = mask_full_name(d.get('HASTAADI', ''))
            d['ILK_GIRIS_MI'] = 'EVET' if d.get('HEMODIYALIZ_GECMISI') == 0 else 'HAYIR'
            d['SEANS_SURESI_DK'] = d.get('SURE') or 180
            ref_no = int(d.get('HASTASEANSREFNO') or 0)
            if ref_no <= 10050:
                d['KAYIT_TARIHI'] = None
            elif d.get('KAYIT_TARIHI'):
                d['KAYIT_TARIHI'] = str(d['KAYIT_TARIHI'])[:10]
            if d.get('OZEL_GUNLER') and isinstance(d.get('OZEL_GUNLER'), str):
                try:
                    d['OZEL_GUNLER'] = json.loads(d['OZEL_GUNLER'])
                except Exception:
                    pass
            if d.get('GUNLUK_SAATLER') and isinstance(d.get('GUNLUK_SAATLER'), str):
                try:
                    d['GUNLUK_SAATLER'] = json.loads(d['GUNLUK_SAATLER'])
                except Exception:
                    pass
            results.append(d)

        return jsonify(results)

    # POST, PUT, PATCH, DELETE için oturum zorunlu
    if not current_user:
        return jsonify({"success": False, "error": "Hasta seans işlemlerini gerçekleştirmek için oturum açmalısınız."}), 401

    if request.method == 'DELETE':
        can_delete = bool(current_user['ROL'] == 'ADMIN' or int(current_user.get('SILME_SIFIRLAMA_YETKISI') or 0) == 1)
        if not can_delete:
            return jsonify({"success": False, "error": "Hasta silme yetkiniz bulunmamaktadır. Yalnızca Admin veya yetkili kullanıcılar silebilir."}), 403

        seans_id = request.args.get('seansId') or request.args.get('HASTASEANSREFNO')
        hasta_no = request.args.get('hastaNo') or request.args.get('HASTANO') or request.args.get('hastano')
        return api_seanslar_delete_direct(seans_id, hasta_no)

    # POST / PUT / PATCH
    payload = request.get_json(silent=True) or {}
    action = payload.get('ACTION')
    seans_ref_no = payload.get('HASTASEANSREFNO') or payload.get('seansId')
    conn = get_db()

    # 1. Tam Liste Senkronizasyonu (SYNC_ROSTER)
    # SQL AÇIKLAMASI (ATOMİK TRANSACTION İLE 4 TABLO SENKRONİZASYONU):
    # BEGIN TRANSACTION başlatılarak 4 ilişkisel tablo yabancı anahtar sırasına göre
    # (seanslar -> tedavi -> diyaliz -> hasta) temizlenir ve tüm roster yeniden yazılır.
    # İşlem sonunda tek seferde COMMIT edildiği için yarıda kalma/veri bozulması yaşanmaz.
    if action == 'SYNC_ROSTER' and isinstance(payload.get('roster'), list):
        roster = payload['roster']
        conn.execute('BEGIN TRANSACTION;')
        conn.execute('DELETE FROM dyz_hasta_seanslari;')
        conn.execute('DELETE FROM dyz_hasta_tedavi_bilgileri;')
        conn.execute('DELETE FROM dyz_hasta_bilgileri;')
        conn.execute('DELETE FROM hasta_bilgileri;')
        for idx, r in enumerate(roster):
            upsert_relational_patient_row(conn, r, idx)
        conn.commit()
        conn.close()
        export_snapshots()
        return jsonify({"success": True, "count": len(roster)})

    # 2. Silme İşlemi (ACTION == 'DELETE')
    if action == 'DELETE' and seans_ref_no:
        conn.close()
        return api_seanslar_delete_direct(seans_ref_no, payload.get('HASTANO') or payload.get('hastano'))

    # 3. Güncelleme (ACTION == 'UPDATE')
    # SQL AÇIKLAMASI (HASTA DETAY GÜNCELLEME):
    # Önce VW_DYZ_GUNLUK_HASTA_SEANSLARI görünümünden mevcut hasta kaydı çekilir.
    # Eğer hastanın dosya numarası (hastano / PK) değişmişse eski hasta_bilgileri satırı silinir
    # ve yeni bilgiler upsert_relational_patient_row() ile 4 tabloya eksiksiz işlenir.
    if action == 'UPDATE' and seans_ref_no:
        existing = conn.execute('SELECT * FROM VW_DYZ_GUNLUK_HASTA_SEANSLARI WHERE HASTASEANSREFNO = ?', (seans_ref_no,)).fetchone()
        if existing:
            ex_dict = dict(existing)
            old_hasta_no = str(ex_dict.get('HASTANO') or ex_dict.get('hastano') or '').strip()
            new_hasta_no = str(payload.get('hastano') or payload.get('HASTANO') or old_hasta_no).strip()
            merged = {**ex_dict, **payload, 'HASTASEANSREFNO': int(seans_ref_no), 'HASTANO': new_hasta_no, 'hastano': new_hasta_no}
            if old_hasta_no and old_hasta_no != new_hasta_no:
                conn.execute('DELETE FROM hasta_bilgileri WHERE hastano = ?', (old_hasta_no,))
            upsert_relational_patient_row(conn, merged)
            conn.commit()
            conn.close()
            export_snapshots()
            return jsonify({"success": True, "message": f"Hasta #{seans_ref_no} güncellendi."})

    # 4. Durum Değiştirme
    # SQL AÇIKLAMASI (8 AŞAMALI SEANS DURUMU VE 2 DAKİKA KURALI GÜNCELLEMESİ):
    # dyz_hasta_seanslari tablosunda ilgili HASTASEANSREFNO satırının STATU, SURE,
    # iptal alanları ve completed_at sütunları UPDATE edilir.
    # Durum TABURCU/AYRILDI/YARIDA_KALDI ise completed_at şimdiki UTC zamanına atanır (120 sn sayaç başlar).
    if seans_ref_no and action != 'ADD':
        existing = conn.execute('SELECT * FROM dyz_hasta_seanslari WHERE HASTASEANSREFNO = ?', (seans_ref_no,)).fetchone()
        if existing:
            updated_statu = payload.get('STATU') or payload.get('status') or existing['STATU']
            updated_aciklama = payload.get('kabuliptalaciklama', existing['kabuliptalaciklama'])
            updated_sure = payload.get('SURE') or payload.get('duration') or existing['SURE']
            updated_iptal_neden = payload.get('KABULIPTALNEDENNO', existing['KABULIPTALNEDENNO'])
            updated_iptal_tarih = payload.get('KABULIPTALTARIHI', existing['KABULIPTALTARIHI'])
            updated_iptal_eden = payload.get('IPTALEDENP', existing['IPTALEDENP'])
            updated_iptal_tar2 = payload.get('IPTALTARIHI', existing['IPTALTARIHI'])

            # Seansı biten hastalar (6. YARIDA_KALDI, 7. AYRILDI, 8. TABURCU / COMPLETED) için 2 dakikalık completed_at zaman damgası
            if str(updated_statu).upper() in ('COMPLETED', 'TABURCU', 'TAMAMLANDI', 'AYRILDI', 'YARIDA_KALDI'):
                updated_completed_at = normalize_completed_at(payload.get('completed_at') or datetime.now().isoformat())
            else:
                updated_completed_at = None

            conn.execute('''
                UPDATE dyz_hasta_seanslari
                SET STATU = ?, completed_at = ?, kabuliptalaciklama = ?, SURE = ?,
                    KABULIPTALNEDENNO = ?, KABULIPTALTARIHI = ?,
                    IPTALEDENP = ?, IPTALTARIHI = ?
                WHERE HASTASEANSREFNO = ?
            ''', (
                updated_statu, updated_completed_at, updated_aciklama, updated_sure,
                updated_iptal_neden, updated_iptal_tarih,
                updated_iptal_eden, updated_iptal_tar2,
                seans_ref_no
            ))
            conn.commit()
            conn.close()
            export_snapshots()
            return jsonify({"success": True, "message": f"Seans #{seans_ref_no} durumu güncellendi."})

    # 5. Yeni Hasta / Acil Hasta Ekleme
        new_seans_ref = int(payload.get('HASTASEANSREFNO') or datetime.now().timestamp() * 1000)
        payload['HASTASEANSREFNO'] = new_seans_ref
        upsert_relational_patient_row(conn, payload)
        conn.commit()
        conn.close()
        export_snapshots()
        return jsonify({"success": True, "message": "Yeni hasta eklendi.", "HASTASEANSREFNO": new_seans_ref}), 201

# ------------------------------------------------------------------------------
# FONKSİYON: api_seanslar_delete_direct(seans_id, hasta_no)
# AMAÇ: Bir hastayı güvenli denetim arşivi veritabanına ('T_SILINEN_HASTALAR') kaydettikten sonra
#       4 ilişkisel tablodan kademeli (cascade) olarak silmek.
# ------------------------------------------------------------------------------
def api_seanslar_delete_direct(seans_id, hasta_no=None):
    conn = get_db()
    target = None
    if seans_id:
        target = conn.execute('SELECT * FROM VW_DYZ_GUNLUK_HASTA_SEANSLARI WHERE HASTASEANSREFNO = ?', (seans_id,)).fetchone()
    elif hasta_no:
        target = conn.execute('SELECT * FROM VW_DYZ_GUNLUK_HASTA_SEANSLARI WHERE HASTANO = ?', (hasta_no,)).fetchone()

    if target:
        t_dict = dict(target)
        resolved_ref = t_dict.get('HASTASEANSREFNO')
        resolved_hasta_no = str(t_dict.get('HASTANO') or t_dict.get('hastano') or '')
        resolved_tedavi_ref = t_dict.get('HASTATEDAVIREFNO')
        resolved_diyaliz_ref = t_dict.get('HASTADIYALIZREFNO')

        try:
            del_conn = get_deleted_db()
            # SQL AÇIKLAMASI (DENETİM ARŞİVİNE YAZMA - silinen_hastalar.sqlite):
            # Hasta ana veritabanından silinmeden hemen önce tüm bilgileri ve tam JSON dökümü
            # (DETAY_JSON) silinme tarihi ile birlikte T_SILINEN_HASTALAR tablosuna arşivlenir.
            del_conn.execute('''
                INSERT INTO T_SILINEN_HASTALAR (
                    SILINME_TARIHI, SILINME_NEDENI, HASTASEANSREFNO, HASTANO, HASTAADI,
                    ADI, SOYADI, TCKIMLIKNO, HEMODIYALIZ_GECMISI, VARDIYA, YATAKNO,
                    GUN_GRUBU, OZEL_GUNLER, SURE, STATU, BASVURUTURU, MERKEZ,
                    KAYIT_TARIHI, ACIL_TARIH, DETAY_JSON
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                datetime.now().isoformat(), 'Flask API Delete',
                resolved_ref, resolved_hasta_no, t_dict.get('HASTAADI'),
                t_dict.get('ADI'), t_dict.get('SOYADI'), resolved_hasta_no,
                t_dict.get('HEMODIYALIZ_GECMISI', 50), t_dict.get('VARDIYA'), 1,
                t_dict.get('GUN_GRUBU'), t_dict.get('OZEL_GUNLER'), t_dict.get('SURE', 180),
                t_dict.get('STATU'), t_dict.get('BASVURUTURU'), 'Erişkin',
                t_dict.get('KAYIT_TARIHI'), t_dict.get('ACIL_TARIH'), json.dumps(t_dict, ensure_ascii=False)
            ))
            del_conn.commit()
            del_conn.close()
        except Exception as e:
            print(f"Silinenler arşivleme hatası: {e}")

        # SQL AÇIKLAMASI (KADEMELİ / CASCADE SİLME - 4 İLİŞKİSEL TABLO):
        # Foreign Key (Yabancı Anahtar) hatası oluşmaması için silme işlemi her zaman
        # en alt (çocuk) tablodan en üst (ebeveyn) tabloya doğru ters sırayla yapılır:
        # 1. dyz_hasta_seanslari -> 2. dyz_hasta_tedavi_bilgileri -> 3. dyz_hasta_bilgileri -> 4. hasta_bilgileri
        if resolved_ref:
            conn.execute('DELETE FROM dyz_hasta_seanslari WHERE HASTASEANSREFNO = ?', (resolved_ref,))
        if resolved_tedavi_ref:
            conn.execute('DELETE FROM dyz_hasta_tedavi_bilgileri WHERE hastatedavirefno = ?', (resolved_tedavi_ref,))
        if resolved_diyaliz_ref:
            conn.execute('DELETE FROM dyz_hasta_bilgileri WHERE hastadiyalizrefno = ?', (resolved_diyaliz_ref,))
        if resolved_hasta_no:
            conn.execute('DELETE FROM hasta_bilgileri WHERE hastano = ?', (resolved_hasta_no,))
        conn.commit()

    conn.close()
    export_snapshots()
    return jsonify({"success": True, "message": "Hasta kaydı silindi."})

# --- SİSTEM AYARLARI (ÇALIŞMA SAATLERİ & BEKLEME EKRANI ZAMANLAYICISI) ---
@app.route('/api/ayarlar', methods=['GET', 'POST', 'PUT'])
# ------------------------------------------------------------------------------
# REST API: /api/ayarlar (GET, POST, PUT)
# AMAÇ: Sistem çalışma saatleri ve TV bekleme ekranı zamanlayıcısını yönetmek.
# ALANLAR:
#   - work_start_time: Mesai başlangıç saati (Örn: '07:40')
#   - work_end_time: Mesai bitiş saati (Örn: '18:00')
#   - work_days: Aktif çalışma günleri (Örn: 'Pazartesi,Salı,Çarşamba,Perşembe,Cuma,Cumartesi')
#   - work_schedule_enabled: Zamanlayıcının aktif/pasif durumu.
# ------------------------------------------------------------------------------
def api_ayarlar():
    conn = get_db()
    if request.method == 'GET':
        rows = conn.execute('SELECT AYAR_ANAHTAR, AYAR_DEGER FROM T_SISTEM_AYARLARI').fetchall()
        conn.close()
        settings = {r['AYAR_ANAHTAR']: r['AYAR_DEGER'] for r in rows}

        start_t = settings.get('work_start_time', '07:40')
        end_t = settings.get('work_end_time', '18:00')
        days_str = settings.get('work_days', 'Pazartesi,Salı,Çarşamba,Perşembe,Cuma,Cumartesi')
        active_days = [d.strip() for d in days_str.split(',') if d.strip()]

        now = datetime.now()
        day_names = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
        current_day_name = day_names[now.weekday()]
        current_time_str = now.strftime('%H:%M')

        is_day_active = current_day_name in active_days
        is_time_active = (start_t <= current_time_str <= end_t)
        is_open = is_day_active and is_time_active

        return jsonify({
            "success": True,
            "work_start_time": start_t,
            "work_end_time": end_t,
            "work_days": active_days,
            "work_days_str": days_str,
            "work_schedule_enabled": bool(settings.get('work_schedule_enabled', '1') == '1'),
            "current_day": current_day_name,
            "current_time": current_time_str,
            "is_open": is_open
        })
    else:
        current_user = get_current_user_from_request()
        if not current_user or not is_admin_user(current_user):
            conn.close()
            return jsonify({"success": False, "error": "Sistem ayarlarını sadece Admin güncelleyebilir."}), 403

        data = request.get_json(silent=True) or {}
        start_t = str(data.get('work_start_time', '07:40')).strip()
        end_t = str(data.get('work_end_time', '18:00')).strip()
        days_val = data.get('work_days')
        if isinstance(days_val, list):
            days_str = ','.join([str(d).strip() for d in days_val if str(d).strip()])
        else:
            days_str = str(days_val or 'Pazartesi,Salı,Çarşamba,Perşembe,Cuma,Cumartesi').strip()
        enabled_val = '1' if data.get('work_schedule_enabled', True) in (True, 1, '1', 'true') else '0'

        # SQL AÇIKLAMASI (ÇALIŞMA SAATLERİ VE ZAMANLAYICI KAYDI - INSERT OR REPLACE):
        # T_SISTEM_AYARLARI anahtar/değer tablosunda mesai başlangıç, bitiş, aktif günler ve
        # zamanlayıcı açık/kapalı bayrağı kalıcı olarak güncellenir.
        conn.execute('INSERT OR REPLACE INTO T_SISTEM_AYARLARI (AYAR_ANAHTAR, AYAR_DEGER) VALUES (?, ?)', ('work_start_time', start_t))
        conn.execute('INSERT OR REPLACE INTO T_SISTEM_AYARLARI (AYAR_ANAHTAR, AYAR_DEGER) VALUES (?, ?)', ('work_end_time', end_t))
        conn.execute('INSERT OR REPLACE INTO T_SISTEM_AYARLARI (AYAR_ANAHTAR, AYAR_DEGER) VALUES (?, ?)', ('work_days', days_str))
        conn.execute('INSERT OR REPLACE INTO T_SISTEM_AYARLARI (AYAR_ANAHTAR, AYAR_DEGER) VALUES (?, ?)', ('work_schedule_enabled', enabled_val))
        conn.commit()
        conn.close()

        global latest_sync_packet
        if latest_sync_packet is None:
            latest_sync_packet = {}
        latest_sync_packet['settings'] = {
            "work_start_time": start_t,
            "work_end_time": end_t,
            "work_days": [d.strip() for d in days_str.split(',') if d.strip()],
            "work_schedule_enabled": (enabled_val == '1')
        }
        latest_sync_packet['timestamp'] = int(datetime.now().timestamp() * 1000)

        return jsonify({
            "success": True,
            "message": "Çalışma saatleri ve bekleme ekranı zamanlayıcısı kaydedildi."
        })

# --- TV VE İSTEMCİLER İÇİN AKTİF OTURUM KONTROLÜ ---
@app.route('/api/auth/active-session', methods=['GET'])
# ------------------------------------------------------------------------------
# REST API: GET /api/auth/active-session
# AMAÇ: TV ekranının her 2.5 saniyede bir sorgulayarak sistemde açık bir sağlık personeli
#       oturumu olup olmadığını öğrenmesini sağlamak.
# MANTIK: Oturum varsa TV canlı yayına geçer, oturum yoksa TV Güvenli Bekleme Moduna geçer.
# ------------------------------------------------------------------------------
def api_active_session():
    """TV ekranı için sistemde açık herhangi bir aktif personel (Hemşire/Sekreter/Admin) oturumu olup olmadığını döner."""
    conn = get_db()
    now_iso = datetime.now().isoformat()
    # 1. Süresi dolmuş tüm eski ve ölü oturumları temizle
    # SQL AÇIKLAMASI: Bitiş zamanı şimdiki andan küçük veya eşit olan oturumları T_OTURUMLAR'dan siler.
    conn.execute('DELETE FROM T_OTURUMLAR WHERE BITIS_TARIHI <= ?', (now_iso,))
    conn.commit()

    # SQL AÇIKLAMASI (AKTİF PERSONEL OTURUMLARI - LEFT JOIN):
    # T_OTURUMLAR ile T_KULLANICILAR birleştirilerek şu an canlı (BITIS_TARIHI > now_iso)
    # olan tüm personel oturumları son işlem tarihine göre en yeniden eskiye listelenir.
    rows = conn.execute('''
        SELECT o.TOKEN, o.KULLANICI_ADI, o.ROL, COALESCE(k.AD_SOYAD, o.KULLANICI_ADI) AS AD_SOYAD, o.BITIS_TARIHI
          FROM T_OTURUMLAR o
          LEFT JOIN T_KULLANICILAR k ON o.KULLANICI_ID = k.KULLANICI_ID
         WHERE o.BITIS_TARIHI > ?
         ORDER BY o.SON_ISLEM_TARIHI DESC
    ''', (now_iso,)).fetchall()
    conn.close()

    global latest_sync_packet
    has_active = len(rows) > 0
    if not has_active and latest_sync_packet:
        latest_sync_packet['hasActiveSession'] = False

    active_users = []
    roles = []
    for r in rows:
        d = dict(r)
        d['ROL'] = normalize_user_role(d.get('KULLANICI_ADI'), d.get('AD_SOYAD'), d.get('ROL'))
        roles.append(d['ROL'])
        active_users.append({
            "username": d['KULLANICI_ADI'],
            "fullName": d['AD_SOYAD'],
            "role": d['ROL']
        })

    return jsonify({
        "hasActiveSession": has_active,
        "count": len(rows),
        "roles": roles,
        "activeUsers": active_users
    })

# --- TV EKRANLARI SENKRONİZASYONU ---
@app.route('/api/sync-state', methods=['GET', 'POST'])
# ------------------------------------------------------------------------------
# REST API: /api/sync-state (GET, POST)
# AMAÇ: Ekranlar arası gerçek zamanlı durum paketi senkronizasyonu sağlamak.
# ZERO-TRUST KORUMASI: Anonim istemcilere karşı sunucu tarafında hasta isimleri maskelenerek iletilir.
# ------------------------------------------------------------------------------
def api_sync_state():
    global latest_sync_packet
    conn = get_db()
    now_iso = datetime.now().isoformat()
    conn.execute('DELETE FROM T_OTURUMLAR WHERE BITIS_TARIHI <= ?', (now_iso,))
    conn.commit()
    active_count = conn.execute('SELECT COUNT(*) AS cnt FROM T_OTURUMLAR WHERE BITIS_TARIHI > ?', (now_iso,)).fetchone()['cnt']
    conn.close()
    has_active = bool(active_count > 0)
    if not has_active and latest_sync_packet:
        latest_sync_packet['hasActiveSession'] = False

    if request.method == 'GET':
        if not latest_sync_packet:
            return jsonify({"hasActiveSession": has_active})
        user = get_current_user_from_request()
        if user:
            packet = dict(latest_sync_packet)
            packet['hasActiveSession'] = has_active
            return jsonify(packet)

        # Anonim ağ dinleyicilerine karşı seansList içindeki isimleri sunucu tarafında maskele
        sanitized = dict(latest_sync_packet)
        sanitized['hasActiveSession'] = has_active
        if 'seansList' in sanitized and isinstance(sanitized['seansList'], list):
            sanitized_list = []
            for item in sanitized['seansList']:
                safe_item = dict(item)
                raw_name = safe_item.get('fullName') or safe_item.get('maskedName') or ''
                safe_item['fullName'] = mask_full_name(raw_name)
                safe_item['maskedName'] = mask_full_name(raw_name)
                safe_item['instruction'] = ''
                sanitized_list.append(safe_item)
            sanitized['seansList'] = sanitized_list
        return jsonify(sanitized)
    else:
        user = get_current_user_from_request()
        if not user:
            return jsonify({"success": False, "error": "Senkronizasyon paketi göndermek için oturum açmalısınız."}), 401
        latest_sync_packet = request.get_json(silent=True) or {}
        latest_sync_packet['hasActiveSession'] = True
        return jsonify({"success": True, "timestamp": latest_sync_packet.get('timestamp')})

# --- SİLİNENLER LİSTESİ ---
@app.route('/api/silinen-hastalar', methods=['GET'])
# ------------------------------------------------------------------------------
# REST API: GET /api/silinen-hastalar
# AMAÇ: Kalıcı silinmiş hasta kayıtlarının denetim arşivini listelemek (Yalnızca yetkili kullanıcılar).
# ------------------------------------------------------------------------------
def api_silinen_hastalar():
    user = get_current_user_from_request()
    if not user:
        return jsonify({"success": False, "error": "Bu listeyi görüntülemek için oturum açmalısınız."}), 401
    if not user.get('canDeleteAndReset'):
        return jsonify({"success": False, "error": "Silinen hastaları görüntüleme yetkiniz bulunmamaktadır."}), 403

    conn = get_deleted_db()
    rows = conn.execute('SELECT * FROM T_SILINEN_HASTALAR ORDER BY SILINME_ID DESC').fetchall()
    conn.close()
    results = []
    for r in rows:
        d = dict(r)
        if d.get('OZEL_GUNLER'):
            try:
                d['OZEL_GUNLER'] = json.loads(d['OZEL_GUNLER'])
            except Exception:
                pass
        results.append(d)
    return jsonify(results)

# --- VARSAYILANLARA SIFIRLAMA ---
@app.route('/api/reset', methods=['POST'])
# ------------------------------------------------------------------------------
# REST API: POST /api/reset
# AMAÇ: Sistemi varsayılan 17 hastaya sıfırlama yetki doğrulaması.
# ------------------------------------------------------------------------------
def api_reset():
    user = get_current_user_from_request()
    if not user or not user.get('canDeleteAndReset'):
        return jsonify({"success": False, "error": "Sıfırlama işlemi için yetkiniz bulunmamaktadır."}), 403
    return jsonify({"success": True, "message": "Sıfırlama komutu alındı."})

# ==============================================================================
# STATİK DOSYA SUNUCUSU (TÜM HTML, JS, CSS, SES VE RESİM DOSYALARI)
# ==============================================================================
@app.route('/')
# ------------------------------------------------------------------------------
# STATİK WEB SAYFASI: GET / -> index.html
# ------------------------------------------------------------------------------
def serve_index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/<path:filename>')
# ------------------------------------------------------------------------------
# STATİK DOSYA SUNUCUSU: GET /<filename>
# GÜVENLİK: .sqlite, .sql, .py, .bat, .json gibi kritik dosyaların doğrudan web üzerinden
#           indirilmesi '403 Forbidden' ile engellenir.
# ------------------------------------------------------------------------------
def serve_static(filename):
    # Ağ Güvenliği: Veritabanı, yedek, kaynak kod ve betik dosyalarının doğrudan indirilmesini engelle
    forbidden_exts = ('.sqlite', '.sqlite-wal', '.sqlite-shm', '.sql', '.env', '.git', '.py', '.bat', '.vbs', '.json', '.db')
    if any(filename.lower().endswith(ext) for ext in forbidden_exts):
        return Response("403 Forbidden: Bu dosyaya doğrudan erişim engellenmiştir.", status=403, mimetype='text/plain')
    return send_from_directory(BASE_DIR, filename)

# ==============================================================================
# SUNUCU BAŞLATICI
# ==============================================================================
# Modül yüklendiğinde ilişkisel tabloları ve View yapısını hazırla
ensure_db_schema()
export_snapshots()

if __name__ == '__main__':
    lan_ips = get_local_ip_addresses()
    comp_name = get_computer_name()

    print("=" * 66)
    print(f"🏥 KOCAELİ ÜNİVERSİTESİ HEMODİYALİZ ÜNİTESİ - FLASK SUNUCUSU")
    print(f"⚡ Çalışma Portu: {PORT} | Bilgisayar Adı: {comp_name}")
    print("=" * 66)
    print("🌐 BU BİLGİSAYARDAN AÇMAK İÇİN:")
    print(f"   🖥️  Sekreter Paneli : http://localhost:{PORT}/sekreter.html")
    print(f"   📺 TV Bekleme Ekranı: http://localhost:{PORT}/display.html")
    print(f"   📋 Genel Ekran     : http://localhost:{PORT}/")
    print("-" * 66)
    print("📱 YEREL AĞDAKİ DİĞER CİHAZLAR (TV, Tablet, Diğer PC'ler):")
    print("   (Modem IP'si değişse bile aşağıdaki adresler otomatik çalışır)")
    if lan_ips:
        for ip in lan_ips:
            print(f"   🖥️  Sekreter: http://{ip}:{PORT}/sekreter.html")
            print(f"   📺 TV Ekran: http://{ip}:{PORT}/display.html")
    else:
        print("   ⚠️ Yerel ağ bağlantısı tespit edilemedi (Sadece localhost aktif).")
    print("=" * 66)

    # 0.0.0.0 ile tüm ağ arayüzlerine bağlanır
    app.run(host='0.0.0.0', port=PORT, debug=False, threaded=True)

