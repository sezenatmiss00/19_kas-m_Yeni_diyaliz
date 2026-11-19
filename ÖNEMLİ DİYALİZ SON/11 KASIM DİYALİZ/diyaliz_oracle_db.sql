-- ============================================================================
-- 🏥 KOCAELİ ÜNİVERSİTESİ HASTANESİ HEMODİYALİZ ÜNİTESİ
-- ORACLE HBYS İLİŞKİSEL VERİTABANI ŞEMASI VE GÜNLÜK SEANS VIEW TANIMI
-- GÜNCELLEME: 2026-11-19T09:12:14.167747
-- ============================================================================
-- Bu dosya; hastane bilgi yönetim sistemi (HBYS) içerisindeki hemodiyaliz
-- seans yönetim mimarisinin 4 ilişkisel ana tablosunu ve bu tablolardan
-- bekleme salonu TV ekranları ile sekreterlik konsoluna anlık veri besleyen
-- 'VW_DYZ_GUNLUK_HASTA_SEANSLARI' SQL görünümünü (VIEW) tanımlar.
--
-- VERİ İLİŞKİ DİYAGRAMI VE MİMARİ HİYERARŞİ:
--   [hasta_bilgileri (hb)]              --> Ana hasta kimlik kaydı (hastano)
--             │ (1 - N)
--             ▼
--   [dyz_hasta_bilgileri (dhb)]         --> Diyaliz ünitesi hasta dosyası (hastadiyalizrefno)
--             │ (1 - N)
--             ▼
--   [dyz_hasta_tedavi_bilgileri (dhtb)] --> Hastanın diyaliz tedavi protokolü (hastatedavirefno)
--             │ (1 - N)
--             ▼
--   [dyz_hasta_seanslari (t)]           --> Günlük operasyonel seans hareketleri (HASTASEANSREFNO)
-- ============================================================================

-- 1. TABLO: hasta_bilgileri (hb) - Ana hasta kimlik kartı
CREATE TABLE hasta_bilgileri (
    hastano VARCHAR2(20) PRIMARY KEY, -- HBYS Dosya / Protokol No
    adi     VARCHAR2(50) NOT NULL,    -- Hasta Adı
    soyadi  VARCHAR2(50) NOT NULL     -- Hasta Soyadı
);

-- 2. TABLO: dyz_hasta_bilgileri (dhb) - Diyaliz ünitesi hasta dosyası
CREATE TABLE dyz_hasta_bilgileri (
    hastadiyalizrefno NUMBER PRIMARY KEY,                              -- Diyaliz takip ref no
    hastano           VARCHAR2(20) NOT NULL REFERENCES hasta_bilgileri(hastano) -- Hasta kimlik FK
);

-- 3. TABLO: dyz_hasta_tedavi_bilgileri (dhtb) - Tedavi protokol ve reçete kartı
CREATE TABLE dyz_hasta_tedavi_bilgileri (
    hastatedavirefno  NUMBER PRIMARY KEY,                                      -- Tedavi reçete ref no
    hastadiyalizrefno NUMBER NOT NULL REFERENCES dyz_hasta_bilgileri(hastadiyalizrefno) -- Diyaliz dosyası FK
);

-- 4. TABLO: dyz_hasta_seanslari (t) - Günlük fiili seans hareketleri
CREATE TABLE dyz_hasta_seanslari (
    HASTASEANSREFNO     NUMBER PRIMARY KEY,                                            -- Seans tekil anahtarı
    HASTATEDAVIREFNO    NUMBER NOT NULL REFERENCES dyz_hasta_tedavi_bilgileri(hastatedavirefno), -- Tedavi reçete FK
    KABULTARIHI         DATE,                                                          -- Üniteye kabul zamanı
    HASTABASVURUREFNO   NUMBER,                                                        -- HBYS başvuru numarası
    HASTAHIZMETREFNO    NUMBER,                                                        -- Hizmet / SGK fatura ref
    SEANSTARIHI         DATE,                                                          -- Seans takvim günü
    VARDIYATANIMNO      NUMBER(1) DEFAULT 1,                                           -- 1: Sabah, 2: Öğlen
    SEANSTURU           VARCHAR2(30) DEFAULT 'HEMODIYALIZ',                            -- Seans türü
    SURE                NUMBER(4) DEFAULT 180,                                         -- Seans süresi (dk)
    BASVURUTURU         VARCHAR2(30) DEFAULT 'PLANLANDI',                              -- Kabul tipi
    KABULIPTALNEDENNO   NUMBER,                                                        -- İptal gerekçe kodu
    KABULIPTALTARIHI    DATE,                                                          -- İptal zamanı
    kabuliptalaciklama  VARCHAR2(500),                                                 -- İptal / Durdurma açıklaması
    IPTALEDENP          VARCHAR2(50),                                                  -- İptal eden personel
    IPTALTARIHI         DATE,                                                          -- İptal anı
    STATU               VARCHAR2(30) DEFAULT 'BEKLEMEDE',                              -- 8 aşamalı klinik durum
    completed_at        TIMESTAMP                                                      -- 2 DAKİKA KURALI zaman damgası
);

-- GÜNLÜK HASTA SEANSLARI VIEW (GÖRÜNÜM): VW_DYZ_GUNLUK_HASTA_SEANSLARI
-- 4 tabloyu LEFT JOIN ile birleştirir; tamamlananları 2 dakika (120 sn) sonra otomatik eler.
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
 WHERE (t.STATU != 'COMPLETED' OR t.completed_at IS NULL OR t.completed_at >= SYSTIMESTAMP - INTERVAL '2' MINUTE);
