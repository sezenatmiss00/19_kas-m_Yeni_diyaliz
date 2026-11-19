// ============================================================================
// NUCLEUS HBYS ENTEGRASYONLU DİYALİZ DISPLAY & SEKRETER YÖNETİM MOTORU
// - YALNIZCA KISA, ZARİF VE HUZURLU BİR DİNG BİLDİRİM ZİLİ (CHIME)
// - PAZARTESİ-ÇARŞAMBA-CUMA (8 HASTA) VE SALI-PERŞEMBE-CUMARTESİ (9 HASTA) TAKVİM MOTORU
// - TAHMİNİ SEANS BİTİŞ SAATİ HESAPLAMA VE GÖSTERİMİ
// - VERİTABANI İLE TAM SENKRON HASTA EKLEME & HASTA SİLME YETKİSİ
// ============================================================================

// ============================================================================
// EKRAN MODU TESPİTİ VE YARDIMCI GÜVENLİK MOTORU
// ============================================================================
let currentScreenMode = (typeof window !== 'undefined' && (
  (window.location && window.location.pathname && window.location.pathname.includes('display.html')) ||
  (typeof document !== 'undefined' && document.body && document.body.getAttribute('data-screen-mode') === 'display')
)) ? 'display' : 'secretary';

// ----------------------------------------------------------------------------
// FONKSİYON: isDisplayScreenMode()
// AMAÇ: Mevcut çalışan sayfanın bekleme salonu TV ekranı (display.html) olup olmadığını tespit etmek.
// NEREDE KULLANILIR: Sekreter ve TV ekranlarının farklı davranması gereken durumlarda (örn. TV'den veritabanına yazmama koruması).
// ----------------------------------------------------------------------------
function isDisplayScreenMode() {
  if (typeof currentScreenMode !== 'undefined' && currentScreenMode === 'display') return true;
  if (typeof window !== 'undefined' && window.location && window.location.pathname && window.location.pathname.includes('display.html')) return true;
  if (typeof document !== 'undefined' && document.body && document.body.getAttribute('data-screen-mode') === 'display') return true;
  return false;
}

// ============================================================================
// FARKLI CİHAZLAR VE OTOMATİK IP ÇÖZÜMLEME (FLASK & LAN UYUMLU)
// Cihaz veya modem IP'si değiştiğinde hiçbir manuel ayar gerektirmez!
// ============================================================================
// ----------------------------------------------------------------------------
// FONKSİYON: resolveApiUrl(path)
// AMAÇ: API uç noktalarını o anki sunucu kök adresine (origin) dinamik olarak bağlamak.
// NEDEN YAPILDI: Sunucu veya modem IP'si değiştiğinde hiçbir istemcinin (TV/tablet) bağlantısının
//                kopmaması ve kodda sabit IP tutulmaması için göreceli origin çözümlemesi yapar.
// ----------------------------------------------------------------------------
function resolveApiUrl(path) {
  // Eğer tarayıcıda HTTP/HTTPS üzerinden çalışıyorsa (localhost, yerel LAN IP veya bilgisayar adı)
  // her zaman o anki sunucu kök dizinini (origin) kullan. Böylece IP değişse bile otomatik çalışır!
  if (typeof window !== 'undefined' && window.location && window.location.protocol && window.location.protocol.startsWith('http')) {
    return path;
  }
  // file:// protokolüyle doğrudan dosyadan açıldıysa varsayılan yerel port
  return 'http://localhost:5000' + path;
}

// ============================================================================
// ORACLE HBYS VIEW SORGUSU VE İLİŞKİSEL TABLO ŞEMASI (VW_DYZ_GUNLUK_HASTA_SEANSLARI)
//   SELECT hb.adi || ' ' || hb.soyadi AS HASTAADI,
//          dhb.hastano,
//          t.HASTASEANSREFNO,
//          t.HASTATEDAVIREFNO,
//          t.KABULTARIHI,
//          t.HASTABASVURUREFNO,
//          t.HASTAHIZMETREFNO,
//          t.SEANSTARIHI,
//          CASE WHEN t.VARDIYATANIMNO = 1 THEN 'SABAH' ELSE 'ÖGLEN' END AS VARDIYA,
//          t.SEANSTURU,
//          t.SURE,
//          t.BASVURUTURU,
//          t.KABULIPTALNEDENNO,
//          t.KABULIPTALTARIHI,
//          t.kabuliptalaciklama,
//          t.IPTALEDENP,
//          t.IPTALTARIHI,
//          t.STATU
//     FROM dyz_hasta_seanslari t
//     LEFT JOIN dyz_hasta_tedavi_bilgileri dhtb
//       ON t.hastatedavirefno = dhtb.hastatedavirefno
//     LEFT JOIN dyz_hasta_bilgileri dhb
//       ON dhtb.hastadiyalizrefno = dhb.hastadiyalizrefno
//     LEFT JOIN hasta_bilgileri hb ON dhb.hastano = hb.hastano
//    WHERE (t.seanstarihi >= TO_DATE('6/09/2026', 'DD/MM/YYYY') AND
//           t.seanstarihi < TO_DATE('19/10/2026', 'DD/MM/YYYY') + 1)
// ============================================================================

// ----------------------------------------------------------------------------
// FONKSİYON: resolveVardiyaTanimNo(vardiyaVal, vardiyaTanimNo)
// AMAÇ: HBYS ilişkisel veri tabanındaki sayısal vardiya kodunu (1: Sabah, 2: Öğlen) doğrulamak.
// ----------------------------------------------------------------------------
function resolveVardiyaTanimNo(vardiyaVal, vardiyaTanimNo = null) {
  if (vardiyaTanimNo === 1 || vardiyaTanimNo === '1') return 1;
  if (vardiyaTanimNo === 2 || vardiyaTanimNo === '2') return 2;
  const s = String(vardiyaVal || 'SABAH').trim().toLocaleUpperCase('tr-TR');
  return s === 'SABAH' ? 1 : 2;
}

// ----------------------------------------------------------------------------
// FONKSİYON: resolveVardiyaFromRow(row)
// AMAÇ: Veritabanı satırından vardiya etiketini ('SABAH' veya 'ÖGLEN') güvenle çözümlemek.
// ----------------------------------------------------------------------------
function resolveVardiyaFromRow(row) {
  if (!row) return 'SABAH';
  const rawVardiya = String(row.VARDIYA || row.vardiya || '').trim().toLocaleUpperCase('tr-TR');
  if (rawVardiya === 'BELIRTILMEMIS') return 'BELIRTILMEMIS';
  if (row.VARDIYATANIMNO !== undefined && row.VARDIYATANIMNO !== null) {
    return Number(row.VARDIYATANIMNO) === 1 ? 'SABAH' : 'ÖGLEN';
  }
  if (rawVardiya === 'SABAH') return 'SABAH';
  if (rawVardiya === 'ÖGLEN' || rawVardiya === 'OGLEN' || rawVardiya === 'ÖĞLEN' || rawVardiya === 'OGLE' || rawVardiya === 'ÖĞLE') {
    return 'ÖGLEN';
  }
  return 'SABAH';
}

// Veritabanında Tutulan Tek Gerçek Hasta Listesi (Toplam 17 Hasta: 8 Pzt-Çar-Cum + 9 Sal-Per-Cmt)
const DEFAULT_ORACLE_RAW_DATABASE = [
  // ==========================================================================
  // 1. GRUP: PAZARTESİ - ÇARŞAMBA - CUMA GELEN HASTALAR (8 HASTA)
  // ==========================================================================
  {
    HASTAADI: 'RIZA HALUK TOYGARLI',
    hastano: '6736616',
    HASTANO: '6736616',
    HASTASEANSREFNO: 10001,
    HASTATEDAVIREFNO: 50001,
    HASTADIYALIZREFNO: 20001,
    KABULTARIHI: new Date(),
    HASTABASVURUREFNO: 30001,
    HASTAHIZMETREFNO: 40001,
    SEANSTARIHI: new Date(),
    VARDIYATANIMNO: 1,
    VARDIYA: 'SABAH',
    SEANSTURU: 'HEMODIYALIZ',
    SURE: 180,
    BASVURUTURU: 'PLANLANDI',
    KABULIPTALNEDENNO: null,
    KABULIPTALTARIHI: null,
    kabuliptalaciklama: '',
    IPTALEDENP: null,
    IPTALTARIHI: null,
    STATU: 'BEKLEMEDE',
    GUN_GRUBU: 'PZT_CAR_CUM',
    HEMODIYALIZ_GECMISI: 142
  },
  {
    HASTAADI: 'AYNUR SAĞLAM',
    hastano: '6532204',
    HASTANO: '6532204',
    HASTASEANSREFNO: 10002,
    HASTATEDAVIREFNO: 50002,
    HASTADIYALIZREFNO: 20002,
    KABULTARIHI: new Date(),
    HASTABASVURUREFNO: 30002,
    HASTAHIZMETREFNO: 40002,
    SEANSTARIHI: new Date(),
    VARDIYATANIMNO: 1,
    VARDIYA: 'SABAH',
    SEANSTURU: 'HEMODIYALIZ',
    SURE: 180,
    BASVURUTURU: 'PLANLANDI',
    KABULIPTALNEDENNO: null,
    KABULIPTALTARIHI: null,
    kabuliptalaciklama: '',
    IPTALEDENP: null,
    IPTALTARIHI: null,
    STATU: 'BEKLEMEDE',
    GUN_GRUBU: 'PZT_CAR_CUM',
    HEMODIYALIZ_GECMISI: 96
  },
  {
    HASTAADI: 'İSMAİL GÖKCE',
    hastano: '6393894',
    HASTANO: '6393894',
    HASTASEANSREFNO: 10003,
    HASTATEDAVIREFNO: 50003,
    HASTADIYALIZREFNO: 20003,
    KABULTARIHI: new Date(),
    HASTABASVURUREFNO: 30003,
    HASTAHIZMETREFNO: 40003,
    SEANSTARIHI: new Date(),
    VARDIYATANIMNO: 1,
    VARDIYA: 'SABAH',
    SEANSTURU: 'HEMODIYALIZ',
    SURE: 180,
    BASVURUTURU: 'PLANLANDI',
    KABULIPTALNEDENNO: null,
    KABULIPTALTARIHI: null,
    kabuliptalaciklama: '',
    IPTALEDENP: null,
    IPTALTARIHI: null,
    STATU: 'BEKLEMEDE',
    GUN_GRUBU: 'PZT_CAR_CUM',
    HEMODIYALIZ_GECMISI: 88
  },
  {
    HASTAADI: 'ZEKİYE AKYOL',
    hastano: '6040445',
    HASTANO: '6040445',
    HASTASEANSREFNO: 10004,
    HASTATEDAVIREFNO: 50004,
    HASTADIYALIZREFNO: 20004,
    KABULTARIHI: new Date(),
    HASTABASVURUREFNO: 30004,
    HASTAHIZMETREFNO: 40004,
    SEANSTARIHI: new Date(),
    VARDIYATANIMNO: 1,
    VARDIYA: 'SABAH',
    SEANSTURU: 'HEMODIYALIZ',
    SURE: 180,
    BASVURUTURU: 'PLANLANDI',
    KABULIPTALNEDENNO: null,
    KABULIPTALTARIHI: null,
    kabuliptalaciklama: '',
    IPTALEDENP: null,
    IPTALTARIHI: null,
    STATU: 'BEKLEMEDE',
    GUN_GRUBU: 'PZT_CAR_CUM',
    HEMODIYALIZ_GECMISI: 215
  },
  {
    HASTAADI: 'ŞAZİMET TOKGÖZ',
    hastano: '1197043',
    HASTANO: '1197043',
    HASTASEANSREFNO: 10005,
    HASTATEDAVIREFNO: 50005,
    HASTADIYALIZREFNO: 20005,
    KABULTARIHI: new Date(),
    HASTABASVURUREFNO: 30005,
    HASTAHIZMETREFNO: 40005,
    SEANSTARIHI: new Date(),
    VARDIYATANIMNO: 1,
    VARDIYA: 'SABAH',
    SEANSTURU: 'HEMODIYALIZ',
    SURE: 180,
    BASVURUTURU: 'PLANLANDI',
    KABULIPTALNEDENNO: null,
    KABULIPTALTARIHI: null,
    kabuliptalaciklama: '',
    IPTALEDENP: null,
    IPTALTARIHI: null,
    STATU: 'BEKLEMEDE',
    GUN_GRUBU: 'PZT_CAR_CUM',
    HEMODIYALIZ_GECMISI: 64
  },
  {
    HASTAADI: 'SEVİLAY ORDUKAYA',
    hastano: '508095',
    HASTANO: '508095',
    HASTASEANSREFNO: 10006,
    HASTATEDAVIREFNO: 50006,
    HASTADIYALIZREFNO: 20006,
    KABULTARIHI: new Date(),
    HASTABASVURUREFNO: 30006,
    HASTAHIZMETREFNO: 40006,
    SEANSTARIHI: new Date(),
    VARDIYATANIMNO: 1,
    VARDIYA: 'SABAH',
    SEANSTURU: 'HEMODIYALIZ',
    SURE: 180,
    BASVURUTURU: 'PLANLANDI',
    KABULIPTALNEDENNO: null,
    KABULIPTALTARIHI: null,
    kabuliptalaciklama: '',
    IPTALEDENP: null,
    IPTALTARIHI: null,
    STATU: 'BEKLEMEDE',
    GUN_GRUBU: 'PZT_CAR_CUM',
    HEMODIYALIZ_GECMISI: 120
  },
  {
    HASTAADI: 'CENGİZ PEKCAN',
    hastano: '312299',
    HASTANO: '312299',
    HASTASEANSREFNO: 10007,
    HASTATEDAVIREFNO: 50007,
    HASTADIYALIZREFNO: 20007,
    KABULTARIHI: new Date(),
    HASTABASVURUREFNO: 30007,
    HASTAHIZMETREFNO: 40007,
    SEANSTARIHI: new Date(),
    VARDIYATANIMNO: 1,
    VARDIYA: 'SABAH',
    SEANSTURU: 'HEMODIYALIZ',
    SURE: 180,
    BASVURUTURU: 'PLANLANDI',
    KABULIPTALNEDENNO: null,
    KABULIPTALTARIHI: null,
    kabuliptalaciklama: '',
    IPTALEDENP: null,
    IPTALTARIHI: null,
    STATU: 'BEKLEMEDE',
    GUN_GRUBU: 'PZT_CAR_CUM',
    HEMODIYALIZ_GECMISI: 95
  },
  {
    HASTAADI: 'SEBAHATTİN ÖZTÜRK',
    hastano: '29684',
    HASTANO: '29684',
    HASTASEANSREFNO: 10008,
    HASTATEDAVIREFNO: 50008,
    HASTADIYALIZREFNO: 20008,
    KABULTARIHI: new Date(),
    HASTABASVURUREFNO: 30008,
    HASTAHIZMETREFNO: 40008,
    SEANSTARIHI: new Date(),
    VARDIYATANIMNO: 1,
    VARDIYA: 'SABAH',
    SEANSTURU: 'HEMODIYALIZ',
    SURE: 180,
    BASVURUTURU: 'PLANLANDI',
    KABULIPTALNEDENNO: null,
    KABULIPTALTARIHI: null,
    kabuliptalaciklama: '',
    IPTALEDENP: null,
    IPTALTARIHI: null,
    STATU: 'BEKLEMEDE',
    GUN_GRUBU: 'PZT_CAR_CUM',
    HEMODIYALIZ_GECMISI: 180
  },

  // ==========================================================================
  // 2. GRUP: SALI - PERŞEMBE - CUMARTESİ GELEN HASTALAR (9 HASTA)
  // ==========================================================================
  {
    HASTAADI: 'FATİH IŞIK',
    hastano: '6149044',
    HASTANO: '6149044',
    HASTASEANSREFNO: 10009,
    HASTATEDAVIREFNO: 50009,
    HASTADIYALIZREFNO: 20009,
    KABULTARIHI: new Date(),
    HASTABASVURUREFNO: 30009,
    HASTAHIZMETREFNO: 40009,
    SEANSTARIHI: new Date(),
    VARDIYATANIMNO: 1,
    VARDIYA: 'SABAH',
    SEANSTURU: 'HEMODIYALIZ',
    SURE: 180,
    BASVURUTURU: 'KABUL_EDILDI',
    KABULIPTALNEDENNO: null,
    KABULIPTALTARIHI: null,
    kabuliptalaciklama: '',
    IPTALEDENP: null,
    IPTALTARIHI: null,
    STATU: 'BEKLEMEDE',
    GUN_GRUBU: 'SAL_PER_CMT',
    HEMODIYALIZ_GECMISI: 110
  },
  {
    HASTAADI: 'DURSUN ÖNAL',
    hastano: '1188734',
    HASTANO: '1188734',
    HASTASEANSREFNO: 10010,
    HASTATEDAVIREFNO: 50010,
    HASTADIYALIZREFNO: 20010,
    KABULTARIHI: new Date(),
    HASTABASVURUREFNO: 30010,
    HASTAHIZMETREFNO: 40010,
    SEANSTARIHI: new Date(),
    VARDIYATANIMNO: 1,
    VARDIYA: 'SABAH',
    SEANSTURU: 'HEMODIYALIZ',
    SURE: 180,
    BASVURUTURU: 'KABUL_EDILDI',
    KABULIPTALNEDENNO: null,
    KABULIPTALTARIHI: null,
    kabuliptalaciklama: '',
    IPTALEDENP: null,
    IPTALTARIHI: null,
    STATU: 'BEKLEMEDE',
    GUN_GRUBU: 'SAL_PER_CMT',
    HEMODIYALIZ_GECMISI: 134
  },
  {
    HASTAADI: 'HAVA HIDIR',
    hastano: '1179170',
    HASTANO: '1179170',
    HASTASEANSREFNO: 10011,
    HASTATEDAVIREFNO: 50011,
    HASTADIYALIZREFNO: 20011,
    KABULTARIHI: new Date(),
    HASTABASVURUREFNO: 30011,
    HASTAHIZMETREFNO: 40011,
    SEANSTARIHI: new Date(),
    VARDIYATANIMNO: 1,
    VARDIYA: 'SABAH',
    SEANSTURU: 'HEMODIYALIZ',
    SURE: 180,
    BASVURUTURU: 'KABUL_EDILDI',
    KABULIPTALNEDENNO: null,
    KABULIPTALTARIHI: null,
    kabuliptalaciklama: '',
    IPTALEDENP: null,
    IPTALTARIHI: null,
    STATU: 'BEKLEMEDE',
    GUN_GRUBU: 'SAL_PER_CMT',
    HEMODIYALIZ_GECMISI: 82
  },
  {
    HASTAADI: 'MEHMET HENİFİ ÖZTEKİN',
    hastano: '606245',
    HASTANO: '606245',
    HASTASEANSREFNO: 10012,
    HASTATEDAVIREFNO: 50012,
    HASTADIYALIZREFNO: 20012,
    KABULTARIHI: new Date(),
    HASTABASVURUREFNO: 30012,
    HASTAHIZMETREFNO: 40012,
    SEANSTARIHI: new Date(),
    VARDIYATANIMNO: 1,
    VARDIYA: 'SABAH',
    SEANSTURU: 'HEMODIYALIZ',
    SURE: 180,
    BASVURUTURU: 'KABUL_EDILDI',
    KABULIPTALNEDENNO: null,
    KABULIPTALTARIHI: null,
    kabuliptalaciklama: '',
    IPTALEDENP: null,
    IPTALTARIHI: null,
    STATU: 'BEKLEMEDE',
    GUN_GRUBU: 'SAL_PER_CMT',
    HEMODIYALIZ_GECMISI: 156
  },
  {
    HASTAADI: 'EKREM YILDIZ',
    hastano: '533598',
    HASTANO: '533598',
    HASTASEANSREFNO: 10013,
    HASTATEDAVIREFNO: 50013,
    HASTADIYALIZREFNO: 20013,
    KABULTARIHI: new Date(),
    HASTABASVURUREFNO: 30013,
    HASTAHIZMETREFNO: 40013,
    SEANSTARIHI: new Date(),
    VARDIYATANIMNO: 1,
    VARDIYA: 'SABAH',
    SEANSTURU: 'HEMODIYALIZ',
    SURE: 180,
    BASVURUTURU: 'KABUL_EDILDI',
    KABULIPTALNEDENNO: null,
    KABULIPTALTARIHI: null,
    kabuliptalaciklama: '',
    IPTALEDENP: null,
    IPTALTARIHI: null,
    STATU: 'BEKLEMEDE',
    GUN_GRUBU: 'SAL_PER_CMT',
    HEMODIYALIZ_GECMISI: 92
  },
  {
    HASTAADI: 'MUSTAFA KIYAK',
    hastano: '266944',
    HASTANO: '266944',
    HASTASEANSREFNO: 10014,
    HASTATEDAVIREFNO: 50014,
    HASTADIYALIZREFNO: 20014,
    KABULTARIHI: new Date(),
    HASTABASVURUREFNO: 30014,
    HASTAHIZMETREFNO: 40014,
    SEANSTARIHI: new Date(),
    VARDIYATANIMNO: 1,
    VARDIYA: 'SABAH',
    SEANSTURU: 'HEMODIYALIZ',
    SURE: 180,
    BASVURUTURU: 'KABUL_EDILDI',
    KABULIPTALNEDENNO: null,
    KABULIPTALTARIHI: null,
    kabuliptalaciklama: '',
    IPTALEDENP: null,
    IPTALTARIHI: null,
    STATU: 'BEKLEMEDE',
    GUN_GRUBU: 'SAL_PER_CMT',
    HEMODIYALIZ_GECMISI: 148
  },
  {
    HASTAADI: 'BAHİNAR GÖKMEN',
    hastano: '178990',
    HASTANO: '178990',
    HASTASEANSREFNO: 10015,
    HASTATEDAVIREFNO: 50015,
    HASTADIYALIZREFNO: 20015,
    KABULTARIHI: new Date(),
    HASTABASVURUREFNO: 30015,
    HASTAHIZMETREFNO: 40015,
    SEANSTARIHI: new Date(),
    VARDIYATANIMNO: 1,
    VARDIYA: 'SABAH',
    SEANSTURU: 'HEMODIYALIZ',
    SURE: 180,
    BASVURUTURU: 'KABUL_EDILDI',
    KABULIPTALNEDENNO: null,
    KABULIPTALTARIHI: null,
    kabuliptalaciklama: '',
    IPTALEDENP: null,
    IPTALTARIHI: null,
    STATU: 'BEKLEMEDE',
    GUN_GRUBU: 'SAL_PER_CMT',
    HEMODIYALIZ_GECMISI: 105
  },
  {
    HASTAADI: 'SEVİM ZEYLAN',
    hastano: '141594',
    HASTANO: '141594',
    HASTASEANSREFNO: 10016,
    HASTATEDAVIREFNO: 50016,
    HASTADIYALIZREFNO: 20016,
    KABULTARIHI: new Date(),
    HASTABASVURUREFNO: 30016,
    HASTAHIZMETREFNO: 40016,
    SEANSTARIHI: new Date(),
    VARDIYATANIMNO: 1,
    VARDIYA: 'SABAH',
    SEANSTURU: 'HEMODIYALIZ',
    SURE: 180,
    BASVURUTURU: 'KABUL_EDILDI',
    KABULIPTALNEDENNO: null,
    KABULIPTALTARIHI: null,
    kabuliptalaciklama: '',
    IPTALEDENP: null,
    IPTALTARIHI: null,
    STATU: 'BEKLEMEDE',
    GUN_GRUBU: 'SAL_PER_CMT',
    HEMODIYALIZ_GECMISI: 164
  },
  {
    HASTAADI: 'ZEKİ YILDIZ',
    hastano: '117389',
    HASTANO: '117389',
    HASTASEANSREFNO: 10017,
    HASTATEDAVIREFNO: 50017,
    HASTADIYALIZREFNO: 20017,
    KABULTARIHI: new Date(),
    HASTABASVURUREFNO: 30017,
    HASTAHIZMETREFNO: 40017,
    SEANSTARIHI: new Date(),
    VARDIYATANIMNO: 1,
    VARDIYA: 'SABAH',
    SEANSTURU: 'HEMODIYALIZ',
    SURE: 180,
    BASVURUTURU: 'KABUL_EDILDI',
    KABULIPTALNEDENNO: null,
    KABULIPTALTARIHI: null,
    kabuliptalaciklama: '',
    IPTALEDENP: null,
    IPTALTARIHI: null,
    STATU: 'BEKLEMEDE',
    GUN_GRUBU: 'SAL_PER_CMT',
    HEMODIYALIZ_GECMISI: 190
  }
];

// Kalıcı Hasta Veritabanı Havuzu (Yıllarca Kullanım İçin localStorage Üzerinde Saklanır)
const MASTER_ROSTER_STORAGE_KEY = 'diyaliz_master_hasta_listesi_v3';
const STANDART_DIYALIZ_SURESI_DK = 180; // Her hasta için standart diyalize bağlama süresi: 3 Saat (180 dk)

// ----------------------------------------------------------------------------
// FONKSİYON: extractIsoDateFromTimestamp()
// AMAÇ: Verilen Date nesnesi veya zaman damgasından YYYY-MM-DD formatında ISO takvim tarihini ayrıştırmak.
// NEREDE KULLANILIR: Yeni eklenen hastaların KAYIT_TARIHI ve acil hastaların ACIL_TARIH alanlarını normalize ederken.
// ----------------------------------------------------------------------------
function extractIsoDateFromTimestamp(tsOrDate) {
  const d = tsOrDate ? new Date(tsOrDate) : new Date();
  if (isNaN(d.getTime())) return getTodayIsoString();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ----------------------------------------------------------------------------
// FONKSİYON: loadMasterRoster()
// AMAÇ: Yerel depolamadan (localStorage) ve veritabanından ana hasta listesini yüklemek.
// SELF-HEALING (KENDİ KENDİNİ ONARMA):
//   Eğer tarayıcı hafızası bozulmuşsa, hasta sayısı 17'nin altına düşmüşse veya tek bir hastaya
//   kilitlenmişse otomatik olarak varsayılan 17 hastayı (8 Pzt-Çar-Cum + 9 Sal-Per-Cmt) geri yükler.
// ----------------------------------------------------------------------------
function loadMasterRoster() {
  try {
    const saved = localStorage.getItem(MASTER_ROSTER_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Self-Healing: Eğer hafızadaki liste bozulmuş, 17 varsayılan hastanın altına düşmüşse
      // veya hasta isimleri tek bir hastaya kilitlenmişse (unique < 10) otomatik olarak 17 tam hastayı geri yükle.
      const uniqueNames = new Set((parsed || []).map(p => String(p.HASTAADI || p.firstName || '').trim()).filter(Boolean));
      if (Array.isArray(parsed) && parsed.length >= 17 && uniqueNames.size >= 10) {
        return parsed.map(r => {
          const isNewlyAddedPatient = Number(r.HASTASEANSREFNO) > 1000000000000;
          const rawKayit = isNewlyAddedPatient
            ? (r.KAYIT_TARIHI || extractIsoDateFromTimestamp(Number(r.HASTASEANSREFNO)))
            : null;
          const kayitTarihi = rawKayit ? String(rawKayit).slice(0, 10) : null;
          const rawNoDigits = String(r.hastano ?? r.HASTANO ?? '').replace(/[^0-9]/g, '');
          const normalizedNo = rawNoDigits === '029684'
            ? '29684'
            : (rawNoDigits.length > 8 ? rawNoDigits.slice(0, 8) : rawNoDigits);

          let cleanName = String(r.HASTAADI || '').trim();
          // KVKK Sızıntı Koruması (Self-Healing): Eğer TV ekranından yanlışlıkla yıldızlı/maskeli isim
          // önbelleğe sızdıysa, varsayılan listeden hastanın gerçek tam adını otomatik olarak geri yükle.
          if (cleanName.includes('*')) {
            const origDefault = DEFAULT_ORACLE_RAW_DATABASE.find(
              d => String(d.HASTASEANSREFNO) === String(r.HASTASEANSREFNO) || String(d.HASTANO) === String(normalizedNo || r.hastano || r.HASTANO)
            );
            if (origDefault && origDefault.HASTAADI) {
              cleanName = origDefault.HASTAADI;
            }
          }
          if (Number(r.HASTASEANSREFNO) === 10005 && (cleanName.includes('gjgj') || cleanName.includes('fsafs'))) {
            cleanName = 'ŞAZİMET TOKGÖZ';
          } else if (Number(r.HASTASEANSREFNO) === 10007 && (cleanName === 'CENG PEKCAN' || cleanName.includes('kjh') || cleanName.includes('asdf') || cleanName.includes('hgg'))) {
            cleanName = 'CENGİZ PEKCAN';
          } else if (Number(r.HASTASEANSREFNO) === 10010 && cleanName.includes('kkk')) {
            cleanName = 'DURSUN ÖNAL';
          }

          // Her gün seçildiği halde acil gibi BUGUN atanmış rutin hastaları otomatik onar
          let fixedGunGrubu = r.GUN_GRUBU;
          if (r.BASVURUTURU !== 'ACIL_SERVIS') {
            if (Array.isArray(r.OZEL_GUNLER) && r.OZEL_GUNLER.length === 6) {
              fixedGunGrubu = 'HER_GUN';
            } else if (r.GUN_GRUBU === 'BUGUN' && Array.isArray(r.OZEL_GUNLER) && r.OZEL_GUNLER.length > 0) {
              fixedGunGrubu = r.OZEL_GUNLER.length === 6 ? 'HER_GUN' : r.OZEL_GUNLER.join('_');
            }
          }

          const rawSure = Number(r.SURE);
          const sureVal = (rawSure && rawSure >= 60 && rawSure !== 145) ? rawSure : STANDART_DIYALIZ_SURESI_DK;
          const resolvedVardiya = resolveVardiyaFromRow(r);
          const resolvedVardiyaTanimNo = resolveVardiyaTanimNo(resolvedVardiya, r.VARDIYATANIMNO);
          const finalHastaNo = normalizedNo || r.hastano || r.HASTANO;

          return {
            ...r,
            HASTAADI: cleanName || r.HASTAADI,
            hastano: finalHastaNo,
            HASTANO: finalHastaNo,
            VARDIYATANIMNO: resolvedVardiyaTanimNo,
            VARDIYA: resolvedVardiya,
            KABULIPTALNEDENNO: r.KABULIPTALNEDENNO ?? null,
            KABULIPTALTARIHI: r.KABULIPTALTARIHI ?? null,
            kabuliptalaciklama: r.kabuliptalaciklama ?? '',
            IPTALEDENP: r.IPTALEDENP ?? null,
            IPTALTARIHI: r.IPTALTARIHI ?? null,
            GUN_GRUBU: fixedGunGrubu,
            KAYIT_TARIHI: kayitTarihi,
            SURE: sureVal
          };
        });
      }
    }
  } catch (e) {
    console.warn('Kalıcı hasta listesi okunamadı:', e);
  }
  const initial = DEFAULT_ORACLE_RAW_DATABASE.map(r => ({ ...r, SURE: STANDART_DIYALIZ_SURESI_DK }));
  saveMasterRoster(initial);
  try {
    localStorage.removeItem(SYNC_STORAGE_KEY);
  } catch (_) { }
  return initial;
}

// Güvenli Kimlik Doğrulama Başlık Yöneticisi (Bearer Token)
// ----------------------------------------------------------------------------
// FONKSİYON: getAuthHeaders(customHeaders)
// AMAÇ: Backend API isteklerine 'Authorization: Bearer <TOKEN>' başlığını eklemek.
// ----------------------------------------------------------------------------
function getAuthHeaders(customHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=UTF-8',
    'Accept': 'application/json',
    ...customHeaders
  };
  const token = localStorage.getItem('diyaliz_auth_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ----------------------------------------------------------------------------
// FONKSİYON: saveMasterRoster(roster)
// AMAÇ: Hasta listesindeki değişiklikleri hem localStorage'a hem de Flask backend API'sine
//       ('ACTION: SYNC_ROSTER') eşzamanlı olarak yazmak.
// GÜVENLİK: TV bekleme ekranının (display.html) istemeden ana veritabanını ezmesini engeller.
// ----------------------------------------------------------------------------
function saveMasterRoster(roster) {
  if (isDisplayScreenMode()) {
    return Promise.resolve();
  }
  // Güvenlik: Maskeli (*) hasta isimlerinin localStorage veya SQLite veritabanına yazılmasını engelle
  const safeRoster = Array.isArray(roster) ? roster.map(r => {
    const rawName = String(r.HASTAADI || '').trim();
    if (rawName.includes('*')) {
      const origDefault = DEFAULT_ORACLE_RAW_DATABASE.find(
        d => String(d.HASTASEANSREFNO) === String(r.HASTASEANSREFNO) || String(d.HASTANO) === String(r.HASTANO || r.hastano || '')
      );
      if (origDefault && origDefault.HASTAADI) {
        return { ...r, HASTAADI: origDefault.HASTAADI };
      }
    }
    return r;
  }) : roster;
  try {
    localStorage.setItem(MASTER_ROSTER_STORAGE_KEY, JSON.stringify(safeRoster));
  } catch (e) {
    console.warn('Kalıcı hasta listesi kaydedilemedi:', e);
  }
  // Ekranda yapılan her değişikliği anında diske (diyaliz_database.json ve diyaliz_oracle_db.sql) yaz
  const targetUrl = resolveApiUrl('/api/seanslar');
  return fetch(targetUrl, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ ACTION: 'SYNC_ROSTER', roster: safeRoster })
  }).catch(() => { });
}

let ORACLE_RAW_DATABASE = loadMasterRoster();

// ============================================================================
// SÜRE GÖSTERİMİ AÇMA / KAPATMA KONTROLÜ (VARSAYILAN: KAPALI - SADECE ADMIN AÇIP KAPATABİLİR)
// ============================================================================
const TIMER_FEATURE_STORAGE_KEY = 'diyaliz_timer_feature_enabled_v1';
let isTimerFeatureEnabled = localStorage.getItem(TIMER_FEATURE_STORAGE_KEY) === 'true';

// KVKK İsim Maskeleme (Her ad ve soyadın ilk 3 harfi açık, kalanı *; 3 harften kısaysa tamamı gösterilir)
// Örn: 'Ahmet Yıldız' -> 'Ahm*** Yıl***', 'Mehmet Ali Demir' -> 'Meh*** Ali*** Dem***'
function maskFullName(fullName) {
  if (!fullName) return '***';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.map(p => {
    if (p.length <= 3) {
      return p + '***';
    }
    return p.substring(0, 3) + '*'.repeat(p.length - 3);
  }).join(' ');
}

// Oracle SQL satırlarını Ekran Nesnelerine Dönüştüren Çevirici Fonksiyon
// ----------------------------------------------------------------------------
// FONKSİYON: mapOracleRowToActiveSeans(row)
// AMAÇ: Oracle HBYS View'ından ('VW_DYZ_GUNLUK_HASTA_SEANSLARI') gelen satırı
//       frontend seans yönetim motorunun nesne yapısına dönüştürmek.
// ALANLAR: Seans id, protokol no, hasta adı, maskeli isim, süre, durum ve completed_at.
// ----------------------------------------------------------------------------
function mapOracleRowToActiveSeans(row) {
  const parts = (row.HASTAADI || 'Hasta İsimsiz').split(' ');
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ') || '';
  const isFirst = (row.HEMODIYALIZ_GECMISI === 0);
  const status = row.STATU || 'BEKLEMEDE';

  let statusText = 'Bekleme Salonunda';
  let badgeClass = 'badge-blue';
  let slideGroup = 'BEKLEME';
  let instruction = '';
  let countdownEndsAt = row.COUNTDOWN_ENDS_AT ? new Date(row.COUNTDOWN_ENDS_AT) : null;
  let countdownType = null;
  let isUrgentCall = (status === 'ODAYA_CAGRILDI');
  let isFamilyCall = (status === 'YAKINI_CAGRILIYOR');
  let isAborted = (status === 'YARIDA_KALDI');

  const plannedDuration = (Number(row.SURE) && Number(row.SURE) >= 60) ? Number(row.SURE) : STANDART_DIYALIZ_SURESI_DK;

  if (status === 'ODAYA_CAGRILDI') {
    statusText = 'Hazırlık Odasına Geçiniz';
    badgeClass = 'badge-blue';
    slideGroup = 'BEKLEME';
    instruction = 'Lütfen Diyaliz Hazırlık Odasına Geçiniz.';
    if (!countdownEndsAt || countdownEndsAt.getTime() <= Date.now()) {
      countdownEndsAt = new Date(Date.now() + 3 * 60 * 1000);
    }
    countdownType = 'HAZIRLIK';
  } else if (status === 'KATETER_TAKILIYOR') {
    statusText = isTimerFeatureEnabled ? 'Kateter Hazırlığı (45 dk)' : 'Kateter Hazırlığı';
    badgeClass = 'badge-teal';
    slideGroup = 'BEKLEME';
    instruction = '';
    if (!countdownEndsAt || countdownEndsAt.getTime() <= Date.now()) {
      countdownEndsAt = new Date(Date.now() + 45 * 60 * 1000);
    }
    countdownType = 'KATETER';
  } else if (status === 'BAGLANDI' || status === 'TEDAVI_SURUYOR') {
    statusText = 'Seans Devam Ediyor';
    badgeClass = 'badge-purple';
    slideGroup = 'DIYALIZ';
    instruction = '';
    if (!countdownEndsAt || countdownEndsAt.getTime() <= Date.now()) {
      countdownEndsAt = new Date(Date.now() + plannedDuration * 60 * 1000);
    }
    countdownType = 'DIYALIZ';
  } else if (status === 'YAKINI_CAGRILIYOR') {
    statusText = '🔔 Hasta Yakını Çağrısı (Danışma)';
    badgeClass = 'badge-family-call';
    slideGroup = 'BEKLEME';
    instruction = 'Hasta Yakınının Danışmaya Uğraması Rica Olunur.';
  } else if (status === 'YARIDA_KALDI') {
    statusText = 'Hekim Kararıyla Erken Durdurma';
    badgeClass = 'badge-soft-amber';
    slideGroup = 'CIKIS';
    instruction = '';
    countdownEndsAt = null;
  } else if (status === 'AYRILDI') {
    statusText = 'Dinlenme & Tansiyon Kontrolü';
    badgeClass = 'badge-teal';
    slideGroup = 'CIKIS';
    instruction = 'Diyaliz tamamlandı. Hastamız dinlenme alanında tansiyon ve pansuman takibindedir.';
    if (!countdownEndsAt || countdownEndsAt.getTime() <= Date.now()) {
      countdownEndsAt = new Date(Date.now() + 15 * 60 * 1000);
    }
    countdownType = 'DINLENME';
  } else if (status === 'TABURCU') {
    statusText = 'Seans Tamamlandı';
    badgeClass = 'badge-green';
    slideGroup = 'CIKIS';
    instruction = '';
    countdownEndsAt = null;
  }

  let parsedGunlukSaatler = null;
  if (row.GUNLUK_SAATLER) {
    if (typeof row.GUNLUK_SAATLER === 'object') {
      parsedGunlukSaatler = row.GUNLUK_SAATLER;
    } else if (typeof row.GUNLUK_SAATLER === 'string') {
      try { parsedGunlukSaatler = JSON.parse(row.GUNLUK_SAATLER); } catch (_) { }
    }
  }

  const resolvedHastaNo = String(row.hastano ?? row.HASTANO ?? '10000000000');
  const resolvedVardiya = resolveVardiyaFromRow(row);
  const resolvedVardiyaTanimNo = resolveVardiyaTanimNo(resolvedVardiya, row.VARDIYATANIMNO);

  return {
    seansId: row.HASTASEANSREFNO || Date.now(),
    hastaTedaviRefNo: row.HASTATEDAVIREFNO || null,
    hastaBasvuruRefNo: row.HASTABASVURUREFNO || null,
    hastaHizmetRefNo: row.HASTAHIZMETREFNO || null,
    kabulTarihi: row.KABULTARIHI || null,
    seansTarihi: row.SEANSTARIHI || null,
    seansTuru: row.SEANSTURU || 'HEMODIYALIZ',
    kabulIptalNedenNo: row.KABULIPTALNEDENNO ?? null,
    kabulIptalTarihi: row.KABULIPTALTARIHI ?? null,
    kabulIptalAciklama: row.kabuliptalaciklama ?? '',
    iptalEdenP: row.IPTALEDENP ?? null,
    iptalTarihi: row.IPTALTARIHI ?? null,
    protokolNo: `PRT-2026-${String(row.HASTASEANSREFNO || 0).slice(-4)}`,
    tcNo: resolvedHastaNo,
    hastano: resolvedHastaNo,
    firstName: firstName,
    lastName: lastName,
    maskedName: maskFullName(row.HASTAADI),
    dialysisHistory: row.HEMODIYALIZ_GECMISI ?? 50,
    isFirstDialysis: isFirst,
    bedNo: null,
    seansSaat: row.SEANS_SAATI || '',
    gunlukSaatler: parsedGunlukSaatler,
    gelisTipi: row.BASVURUTURU || 'PLANLANDI',
    gunGrubu: row.GUN_GRUBU || 'PZT_CAR_CUM',
    ozelGunler: Array.isArray(row.OZEL_GUNLER) ? row.OZEL_GUNLER : null,
    plannedDurationMinutes: plannedDuration,
    status: status,
    statusText: statusText,
    badgeClass: badgeClass,
    slideGroup: slideGroup,
    instruction: instruction,
    countdownEndsAt: countdownEndsAt,
    countdownType: countdownType,
    isUrgentCall: isUrgentCall,
    isFamilyCall: isFamilyCall,
    isAborted: isAborted,
    vardiyaTanimNo: resolvedVardiyaTanimNo,
    vardiya: resolvedVardiya,
    completed_at: (() => {
      if (row.completed_at || row.COMPLETED_AT) return row.completed_at || row.COMPLETED_AT;
      if (isSessionCompletedStatus(status)) {
        const existing = activeSeansList.find(s => String(s.seansId) === String(row.HASTASEANSREFNO));
        return (existing && existing.completed_at) ? existing.completed_at : new Date().toISOString();
      }
      return null;
    })(),
    updatedAt: new Date()
  };
}

// Aktif Seans Listesi (Veritabanından veya Senkronize Durumdan otomatik yüklenir)
let activeSeansList = [];

// ============================================================================
// SEANSI BİTEN HASTALARIN (6. YARIDA_KALDI, 7. AYRILDI, 8. TABURCU)
// 2 DAKİKA (120 SANİYE) SONRA LİSTEDEN OTOMATİK SİLİNMESİ
// ============================================================================
// ----------------------------------------------------------------------------
// FONKSİYON: isSessionCompletedStatus(statusVal)
// AMAÇ: Bir hastanın seansının sonlanıp sonlanmadığını kontrol etmek.
// KAPSAM: 'TABURCU', 'COMPLETED', 'TAMAMLANDI', 'AYRILDI' (7. Dinlenme) ve 'YARIDA_KALDI' (6. Erken Durdurma).
// ----------------------------------------------------------------------------
function isSessionCompletedStatus(statusVal) {
  const s = String(statusVal || '').toUpperCase();
  return s === 'TABURCU' || s === 'COMPLETED' || s === 'TAMAMLANDI' || s === 'AYRILDI' || s === 'YARIDA_KALDI';
}

// ----------------------------------------------------------------------------
// FONKSİYON: parseCompletedAtTimestamp(raw)
// AMAÇ: Farklı biçimlerde gelebilen tamamlanma zaman damgalarını milisaniye cinsinden epoch sayısına çevirmek.
// ----------------------------------------------------------------------------
function parseCompletedAtTimestamp(raw) {
  if (!raw) return null;
  if (typeof raw === 'number') return raw;
  const str = String(raw).trim();
  if (!str) return null;
  if (/^\d{10,13}$/.test(str)) return Number(str);
  let t = Date.parse(str);
  if (!isNaN(t)) return t;
  const normalized = (str.includes(' ') && !str.includes('T')) ? str.replace(' ', 'T') : str;
  t = Date.parse(normalized);
  if (!isNaN(t)) return t;
  t = new Date(normalized).getTime();
  return isNaN(t) ? null : t;
}

// ----------------------------------------------------------------------------
// FONKSİYON: isPatientCompletedAndExpired(patient)
// AMAÇ: 2 DAKİKA KURALI (120 SANİYE):
//       Seansı biten hastanın tamamlanma anından itibaren 120 saniye (120.000 ms) geçip
//       geçmediğini hesaplar. 120 saniyeyi geçen hastalar için 'true' döner.
// ----------------------------------------------------------------------------
function isPatientCompletedAndExpired(patient) {
  if (!patient) return false;
  const stat = String(patient.status || patient.STATU || '').toUpperCase();
  if (isSessionCompletedStatus(stat)) {
    if (patient.completed_at) {
      const compTime = parseCompletedAtTimestamp(patient.completed_at);
      if (compTime && (Date.now() - compTime >= 120000)) { // 2 dakika / 120.000 ms doldu
        return true;
      }
      return false; // Henüz 2 dakika dolmadı, listede kalmalı!
    }
    // completed_at henüz yoksa hemen şimdi başlat ve silme
    patient.completed_at = new Date().toISOString();
    return false;
  }
  return false;
}

// ----------------------------------------------------------------------------
// FONKSİYON: purgeExpiredCompletedPatients()
// AMAÇ: Seansı bitip 120 saniyesi (2 dakikası) dolmuş hastaları aktif seans listesinden
//       otomatik olarak filtreleyip temizlemek (purge).
// ----------------------------------------------------------------------------
function purgeExpiredCompletedPatients() {
  const originalLen = activeSeansList.length;
  activeSeansList = activeSeansList.filter(s => !isPatientCompletedAndExpired(s));
  return activeSeansList.length !== originalLen;
}

// Sekreter panelindeki tamamlanan hastaların 120 saniyelik geri sayım rozetlerini saniye saniye canlı güncelleyen motor
// ----------------------------------------------------------------------------
// FONKSİYON: tickCompletedPatientCountdowns()
// AMAÇ: Sekreterlik panelinde seansı biten hastaların kartında canlı olarak saniye saniye
//       geri sayım rozetini güncellemek (Örn: '⏳ 2 dk içinde listeden kaldırılacak (118 sn)').
// ÇALIŞMA SIKLIĞI: Her 1000 ms (1 saniye).
// ----------------------------------------------------------------------------
function tickCompletedPatientCountdowns() {
  if (isDisplayScreenMode()) return;
  const now = Date.now();

  for (let i = 0; i < activeSeansList.length; i++) {
    const patient = activeSeansList[i];
    const statCode = String(patient.status || '').toUpperCase();
    if (isSessionCompletedStatus(statCode)) {
      if (!patient.completed_at) {
        patient.completed_at = new Date().toISOString();
      }
      const compTime = parseCompletedAtTimestamp(patient.completed_at);
      if (compTime) {
        const elapsed = now - compTime;
        const remainingSec = Math.min(120, Math.max(0, Math.ceil((120000 - elapsed) / 1000)));
        const secSpan = document.getElementById(`completed-sec-${patient.seansId}`);
        const badgeEl = document.getElementById(`completed-countdown-${patient.seansId}`);
        if (secSpan) {
          secSpan.textContent = remainingSec;
        } else if (badgeEl) {
          badgeEl.innerHTML = `⏳ 2 dk içinde listeden kaldırılacak (<span id="completed-sec-${patient.seansId}">${remainingSec}</span> sn)`;
        }
      }
    }
  }
}

// ============================================================================
// EKRANLAR ARASI CANLI SENKRONİZASYON MOTORU
// (Sekreter Ekranı -> TV Bekleme Ekranı Anlık Yansıma)
// BroadcastChannel + localStorage + REST API (/api/sync-state)
// ============================================================================
const SYNC_STORAGE_KEY = 'diyaliz_shared_seans_state_v3';
const INSTANCE_ID = 'inst_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
let lastAppliedSyncTimestamp = 0;

// ============================================================================
// YILLARCA KULLANILABİLİR OTOMATİK TAKVİM & ESNEK GÜN SEÇİM MOTORU
// ============================================================================
const DAY_SHORT_NAMES = {
  PZT: 'Pzt',
  SAL: 'Sal',
  CAR: 'Çar',
  PER: 'Per',
  CUM: 'Cum',
  CMT: 'Cmt'
};

// ----------------------------------------------------------------------------
// FONKSİYON: getPatientDaysArray(gunGrubu, ozelGunler)
// AMAÇ: Hastanın rutin seans günlerini ('PZT_CAR_CUM', 'SAL_PER_CMT', 'HER_GUN', 'BUGUN' vb.)
//       kısa gün kodları dizisine ('PZT', 'SAL' vb.) dönüştürmek.
// ----------------------------------------------------------------------------
function getPatientDaysArray(gunGrubu, ozelGunler = null) {
  const code = String(gunGrubu || 'PZT_CAR_CUM').toUpperCase();
  if (code === 'BUGUN') {
    return [];
  }
  if (code === 'HER_GUN') {
    return ['PZT', 'SAL', 'CAR', 'PER', 'CUM', 'CMT'];
  }
  if (Array.isArray(ozelGunler) && ozelGunler.length > 0) {
    return ozelGunler;
  }
  if (code === 'PZT_CAR_CUM') return ['PZT', 'CAR', 'CUM'];
  if (code === 'SAL_PER_CMT') return ['SAL', 'PER', 'CMT'];
  if (code === 'PZT_CAR_CMT') return ['PZT', 'CAR', 'CMT'];
  if (code === 'PZT_CAR_PER') return ['PZT', 'CAR', 'PER'];
  // Özel format (Örn: "PZT_CAR_CMT" veya "SAL_CUMA")
  const validDays = ['PZT', 'SAL', 'CAR', 'PER', 'CUM', 'CMT'];
  const parts = code.split('_').filter(d => validDays.includes(d));
  return parts.length > 0 ? parts : ['PZT', 'CAR', 'CUM'];
}

// ----------------------------------------------------------------------------
// FONKSİYON: formatDayGroupShort(gunGrubu, ozelGunler, isEmergency)
// AMAÇ: Hastanın seans günlerini sekreter ve hasta kartında gösterilecek kısa metne ('Pzt - Çar - Cum') çevirmek.
// ----------------------------------------------------------------------------
function formatDayGroupShort(gunGrubu, ozelGunler = null, isEmergency = false) {
  if (isEmergency || gunGrubu === 'BUGUN') return 'Bugün';
  if (gunGrubu === 'HER_GUN') return 'Her Gün';
  const days = getPatientDaysArray(gunGrubu, ozelGunler);
  if (days.length === 6) return 'Her Gün';
  if (days.length === 0) return 'Bugün';
  return days.map(d => DAY_SHORT_NAMES[d] || d).join(' - ');
}

const SESSION_TIME_OPTIONS = ['08.00', '10.00', '12.00', '14.00', '16.00'];

// ----------------------------------------------------------------------------
// FONKSİYON: normalizeGunlukSaatler(rawMap)
// AMAÇ: Güne özel seans saatleri haritasını JSON string veya nesne formatından güvenli JavaScript objesine çevirmek.
// ----------------------------------------------------------------------------
function normalizeGunlukSaatler(rawMap) {
  if (!rawMap) return {};
  if (typeof rawMap === 'string') {
    try {
      const parsed = JSON.parse(rawMap);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return typeof rawMap === 'object' ? { ...rawMap } : {};
}

// Hastanın seçili tarihteki (veya bugünkü) seans saatini döndürür (Önce güne özel saate, yoksa genel saate bakar)
// ----------------------------------------------------------------------------
// FONKSİYON: getPatientSessionTimeForDate(rowOrPatient, isoDateStr)
// AMAÇ: Hastanın seçilen takvim tarihindeki seans saatini bulmak (Varsa güne özel saat, yoksa genel saat).
// ----------------------------------------------------------------------------
function getPatientSessionTimeForDate(rowOrPatient, isoDateStr = currentSelectedDateIso) {
  if (!rowOrPatient) return '';
  const weekday = getWeekdayCodeFromIsoDate(isoDateStr);
  const dayMap = normalizeGunlukSaatler(rowOrPatient.GUNLUK_SAATLER ?? rowOrPatient.gunlukSaatler);
  if (weekday && dayMap[weekday]) {
    return String(dayMap[weekday]).trim();
  }
  return String(rowOrPatient.SEANS_SAATI ?? rowOrPatient.seansSaat ?? '').trim();
}

// Takvim / Gün Değiştirme listesi için hastanın seans saati özetini döndürür
function formatPatientScheduleHoursSummary(rowOrPatient) {
  if (!rowOrPatient) return '';
  const defaultHour = String(rowOrPatient.SEANS_SAATI ?? rowOrPatient.seansSaat ?? '').trim();
  const dayMap = normalizeGunlukSaatler(rowOrPatient.GUNLUK_SAATLER ?? rowOrPatient.gunlukSaatler);
  const rawGroup = rowOrPatient.GUN_GRUBU ?? rowOrPatient.gunGrubu;
  const ozelGunler = rowOrPatient.OZEL_GUNLER ?? rowOrPatient.ozelGunler;
  const isEmergency = (rowOrPatient.BASVURUTURU ?? rowOrPatient.gelisTipi) === 'ACIL_SERVIS' || rawGroup === 'BUGUN';

  if (isEmergency) {
    return defaultHour;
  }

  const days = getPatientDaysArray(rawGroup, ozelGunler);
  const dayHours = days
    .map(d => ({ day: d, hour: String(dayMap[d] || defaultHour || '').trim() }))
    .filter(item => Boolean(item.hour));

  if (dayHours.length === 0) return defaultHour;

  const uniqueHours = Array.from(new Set(dayHours.map(x => x.hour)));
  if (uniqueHours.length === 1 && dayHours.length === days.length) {
    return uniqueHours[0];
  }
  return dayHours.map(x => `${DAY_SHORT_NAMES[x.day] || x.day}: ${x.hour}`).join(' • ');
}

// ----------------------------------------------------------------------------
// FONKSİYON: getWeekdayCodeFromIsoDate()
// AMAÇ: YYYY-MM-DD tarihinin haftanın hangi günü olduğunu (PZT, SAL, CAR, PER, CUM, CMT, PAZ) döndürmek.
// NEREDE KULLANILIR: Rutin diyaliz gün gruplarının (Pzt-Çar-Cum / Sal-Per-Cmt) takvimle eşleştirilmesinde.
// ----------------------------------------------------------------------------
function getWeekdayCodeFromIsoDate(isoDateStr) {
  const d = isoDateStr ? new Date(isoDateStr + 'T12:00:00') : new Date();
  const day = d.getDay(); // 0=Pazar, 1=Pzt, 2=Sal, 3=Çar, 4=Per, 5=Cum, 6=Cmt
  const map = ['PAZ', 'PZT', 'SAL', 'CAR', 'PER', 'CUM', 'CMT'];
  return map[day] || 'PZT';
}

// ----------------------------------------------------------------------------
// FONKSİYON: getTodayIsoString()
// AMAÇ: Cihazın yerel saatine göre bugünün tarihini YYYY-MM-DD (ISO) formatında döndürmek.
// NEDEN?: UTC kaymasından etkilenmeden gece 00:00 gün geçişlerini doğru yakalamak için.
// ----------------------------------------------------------------------------
function getTodayIsoString() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ----------------------------------------------------------------------------
// FONKSİYON: formatDateTR()
// AMAÇ: YYYY-MM-DD tarihini Türkiye standardında okunabilir biçime (GG.AA.YYYY) çevirmek.
// NEREDE KULLANILIR: Takvim bilgi çubuğu, sekreter başlığı ve hasta detay özetlerinde.
// ----------------------------------------------------------------------------
function formatDateTR(isoDateStr) {
  if (!isoDateStr) return '-';
  const parts = isoDateStr.split('-');
  if (parts.length !== 3) return isoDateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// ----------------------------------------------------------------------------
// FONKSİYON: getWeekdayFullNameTR()
// AMAÇ: YYYY-MM-DD tarihinin Türkçe tam gün adını (Pazartesi, Salı, ..., Pazar) döndürmek.
// ----------------------------------------------------------------------------
function getWeekdayFullNameTR(isoDateStr) {
  const code = getWeekdayCodeFromIsoDate(isoDateStr);
  const fullNames = {
    PZT: 'Pazartesi',
    SAL: 'Salı',
    CAR: 'Çarşamba',
    PER: 'Perşembe',
    CUM: 'Cuma',
    CMT: 'Cumartesi',
    PAZ: 'Pazar'
  };
  return fullNames[code] || code;
}

// ----------------------------------------------------------------------------
// FONKSİYON: getDayGroupFromIsoDate()
// AMAÇ: Seçili tarihin hangi rutin diyaliz grubuna (PZT_CAR_CUM, SAL_PER_CMT veya PAZAR) düştüğünü bulmak.
// ----------------------------------------------------------------------------
function getDayGroupFromIsoDate(isoDateStr) {
  const d = isoDateStr ? new Date(isoDateStr + 'T12:00:00') : new Date();
  const day = d.getDay(); // 0=Pazar, 1=Pzt, 2=Sal, 3=Çar, 4=Per, 5=Cum, 6=Cmt
  if (day === 1 || day === 3 || day === 5) return 'PZT_CAR_CUM';
  if (day === 2 || day === 4 || day === 6) return 'SAL_PER_CMT';
  return 'PZT_CAR_CUM';
}

// ----------------------------------------------------------------------------
// FONKSİYON: getDayGroupLabel()
// AMAÇ: Dahili gün grubu kodunu (PZT_CAR_CUM, SAL_PER_CMT vb.) kullanıcı dostu Türkçe etikete dönüştürmek.
// ----------------------------------------------------------------------------
function getDayGroupLabel(groupCode) {
  return `${getWeekdayFullNameTR(currentSelectedDateIso)} Seans Listesi`;
}

// ----------------------------------------------------------------------------
// FONKSİYON: doesRowMatchSelectedFilter(row)
// AMAÇ: Hastanın seçilen gün (Pzt-Çar-Cum / Sal-Per-Cmt) veya takvim filtresine uyup uymadığını denetlemek.
// ----------------------------------------------------------------------------
function doesRowMatchSelectedFilter(row) {
  // Sekreter bu hastayı sadece seçili tarih için listeden gizlediyse gösterme
  if (row.MANUEL_HARIC_TARIH === currentSelectedDateIso) return false;

  // Acilden gelen hastalar sadece 1 kerelik ("Bugün") gelir
  if (row.BASVURUTURU === 'ACIL_SERVIS' || row.GUN_GRUBU === 'BUGUN') {
    const acilDate = row.ACIL_TARIH || row.KAYIT_TARIHI;
    if (acilDate) {
      return acilDate === currentSelectedDateIso;
    }
    return true;
  }

  // Sekreter bu hastayı bu tarih için manuel olarak listeye eklediyse göster
  if (row.MANUEL_BUGUN_TARIH === currentSelectedDateIso) return true;

  // Sadece sonradan yeni eklenen hastalar eklendikleri tarihten itibaren görünür;
  // Varsayılan 17 ana hasta (10001-10017) geçmiş, bugün ve gelecek tüm tarihlerde kendi günlerinde görünür!
  const isNewlyAdded = Number(row.HASTASEANSREFNO) > 1000000000000;
  const rowRegDate = (isNewlyAdded && row.KAYIT_TARIHI) ? String(row.KAYIT_TARIHI).slice(0, 10) : null;
  if (rowRegDate && currentSelectedDateIso < rowRegDate) {
    return false;
  }

  const selectedWeekday = getWeekdayCodeFromIsoDate(currentSelectedDateIso);
  if (selectedWeekday === 'PAZ') return false;

  // Her gün gelen rutin hasta Pazar hariç her gün gelir
  if (row.GUN_GRUBU === 'HER_GUN') return true;

  const patientDays = getPatientDaysArray(row.GUN_GRUBU, row.OZEL_GUNLER);
  return patientDays.includes(selectedWeekday);
}

let currentSelectedDateIso = getTodayIsoString();
let currentSelectedDayGroup = getDayGroupFromIsoDate(currentSelectedDateIso);
let lastCalendarAutoCheckDate = getTodayIsoString();
let lastMidnightTriggerDate = getTodayIsoString();
let isMidnightTransitionInProgress = false;
let midnightTimerId = null;

// ----------------------------------------------------------------------------
// FONKSİYON: updateCalendarInfoBar()
// AMAÇ: Sekreter paneli ve yan menüdeki tarih, gün adı ve aktif rutin grup rozetlerini senkronize güncellemek.
// NEREDE KULLANILIR: Takvim tarihi değiştirildiğinde veya sayfa ilk yüklendiğinde.
// ----------------------------------------------------------------------------
function updateCalendarInfoBar() {
  const dateInp = document.getElementById('inp-session-date');
  if (dateInp && dateInp.value !== currentSelectedDateIso) {
    dateInp.value = currentSelectedDateIso;
  }

  const sDateInp = document.getElementById('sidebar-session-date');
  if (sDateInp && sDateInp.value !== currentSelectedDateIso) {
    sDateInp.value = currentSelectedDateIso;
  }

  const syncBadge = document.getElementById('calendar-auto-sync-status');
  if (syncBadge) {
    syncBadge.textContent = `📅 ${formatDateTR(currentSelectedDateIso)} • ${getWeekdayFullNameTR(currentSelectedDateIso)} Seans Listesi`;
  }
}

// Saat 00:00'da Yeni Güne Geçildiğinde Otomatik Tetiklenen ve Tüm Ekranları Yenileyen Motor
async function triggerMidnightDateTransition(targetDateIso = null) {
  const newDateIso = targetDateIso || getTodayIsoString();
  if (isMidnightTransitionInProgress) return;
  isMidnightTransitionInProgress = true;
  try {
    lastMidnightTriggerDate = newDateIso;
    lastCalendarAutoCheckDate = newDateIso;
    currentSelectedDateIso = newDateIso;
    currentSelectedDayGroup = getDayGroupFromIsoDate(newDateIso);

    console.log(`[00:00 Gece Gün Devri] Yeni gün başladı: ${newDateIso} (${getDayGroupLabel(currentSelectedDayGroup)})`);

    // 1. Arayüz takvim inputlarını yeni güne ayarla
    const dateInp = document.getElementById('inp-session-date');
    if (dateInp) dateInp.value = newDateIso;
    const sDateInp = document.getElementById('sidebar-session-date');
    if (sDateInp) sDateInp.value = newDateIso;

    // 2. Bekleyen kaydedilmemiş durumları temizle
    if (typeof unsavedPatientStatusIds !== 'undefined' && unsavedPatientStatusIds.clear) {
      unsavedPatientStatusIds.clear();
    }
    if (typeof pendingPatientStatuses !== 'undefined') {
      pendingPatientStatuses = {};
    }

    // 3. Önceki günden kalan senkron önbelleğini temizle
    try {
      const savedRaw = localStorage.getItem(SYNC_STORAGE_KEY);
      if (savedRaw) {
        const savedPacket = JSON.parse(savedRaw);
        if (savedPacket && savedPacket.calendarDate && savedPacket.calendarDate !== newDateIso) {
          localStorage.removeItem(SYNC_STORAGE_KEY);
        }
      }
    } catch (_) { }

    // 4. Sunucu tarafında gün devri API'sini tetikle (rutin hastaların durumu BEKLEMEDE'ye alınır)
    try {
      await fetch(resolveApiUrl('/api/gun-gecisi'), {
        method: 'POST',
        headers: getAuthHeaders()
      });
    } catch (_) { }

    // 5. Takvim bilgi çubuğunu güncelle
    updateCalendarInfoBar();

    // 6. Yeni günün seans listesini veritabanından çek ve ekranları yenile
    await executeDailyOracleQuery(true);

    // 7. Kullanıcıya net bildirim ver
    showToast(`📅 Saat 00:00: Yeni gün (${formatDateTR(newDateIso)} ${getWeekdayFullNameTR(newDateIso)}) seans listesi yüklendi.`);

    // 8. Diğer ekranlara ve TV bekleme ekranına anında haber ver
    broadcastSyncState({
      action: 'MIDNIGHT_DATE_TRANSITION',
      calendarDate: newDateIso,
      dayGroup: currentSelectedDayGroup,
      toastMessage: `📅 Saat 00:00: Yeni gün (${formatDateTR(newDateIso)}) seans listesi yüklendi.`
    });
  } catch (err) {
    console.error('00:00 Gün geçiş hatası:', err);
  } finally {
    isMidnightTransitionInProgress = false;
  }
}

// Gece tam 00:00:00.050'de milisaniye hassasiyetli zamanlayıcı
function scheduleExactMidnightAutoRefresh() {
  if (midnightTimerId) {
    clearTimeout(midnightTimerId);
    midnightTimerId = null;
  }
  const now = new Date();
  const tomorrowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 50);
  const msUntilMidnight = Math.max(100, tomorrowMidnight.getTime() - now.getTime());

  console.log(`[00:00 Zamanlayıcı] Gece 00:00'a kalan süre: ${Math.round(msUntilMidnight / 1000)} saniye.`);

  midnightTimerId = setTimeout(async () => {
    await triggerMidnightDateTransition(getTodayIsoString());
    scheduleExactMidnightAutoRefresh(); // Bir sonraki gece için tekrar zamanla
  }, msUntilMidnight);
}

// ----------------------------------------------------------------------------
// FONKSİYON: onCalendarDateChange()
// AMAÇ: Üst takvim tarih seçicisi (date input) değiştirildiğinde seçili günün hasta listesini yeniden sorgulamak.
// ----------------------------------------------------------------------------
function onCalendarDateChange() {
  const dateInp = document.getElementById('inp-session-date');
  if (!dateInp || !dateInp.value) return;
  currentSelectedDateIso = dateInp.value;
  currentSelectedDayGroup = getDayGroupFromIsoDate(currentSelectedDateIso);

  secretarySearchTerm = '';
  const searchInput = document.getElementById('secretary-search');
  if (searchInput) searchInput.value = '';

  const sDateInp = document.getElementById('sidebar-session-date');
  if (sDateInp) sDateInp.value = currentSelectedDateIso;

  updateCalendarInfoBar();
  executeDailyOracleQuery(true);
}

// ----------------------------------------------------------------------------
// FONKSİYON: onSidebarDateChange()
// AMAÇ: Sol kenar çubuğundaki tarih seçici değiştiğinde ana takvimle eşitleyip listeyi yenilemek.
// ----------------------------------------------------------------------------
function onSidebarDateChange(val) {
  if (!val) return;
  currentSelectedDateIso = val;
  currentSelectedDayGroup = getDayGroupFromIsoDate(currentSelectedDateIso);

  secretarySearchTerm = '';
  const searchInput = document.getElementById('secretary-search');
  if (searchInput) searchInput.value = '';

  const mainDateInp = document.getElementById('inp-session-date');
  if (mainDateInp) mainDateInp.value = val;

  updateCalendarInfoBar();
  executeDailyOracleQuery(true);
  showToast(`📅 Seans Tarihi Değiştirildi: ${formatDateTR(val)} (${getWeekdayFullNameTR(val)})`);
}

// ----------------------------------------------------------------------------
// FONKSİYON: selectQuickDayOffset()
// AMAÇ: Dün (-1), Bugün (0) veya Yarın (+1) hızlı tarih butonlarıyla seçili takvim gününü kaydırmak.
// ----------------------------------------------------------------------------
function selectQuickDayOffset(dayOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const iso = d.toISOString().split('T')[0];
  onSidebarDateChange(iso);
}

// ----------------------------------------------------------------------------
// FONKSİYON: onDayGroupFilterChange()
// AMAÇ: Rutin gün grubu filtresi (Tümü / Pzt-Çar-Cum / Sal-Per-Cmt) değiştiğinde seans listesini yeniden filtrelemek.
// ----------------------------------------------------------------------------
function onDayGroupFilterChange() {
  onCalendarDateChange();
}

const syncChannel = (typeof BroadcastChannel !== 'undefined')
  ? new BroadcastChannel('diyaliz_ekran_senkron_kanali')
  : null;

// ----------------------------------------------------------------------------
// FONKSİYON: getStandardizedStatusLabel()
// AMAÇ: 8 aşamalı klinik durum kodunu (BEKLEMEDE, ODAYA_CAGRILDI, BAGLANDI vb.) standart Türkçe açıklamaya çevirmek.
// ----------------------------------------------------------------------------
function getStandardizedStatusLabel(status, fallbackText) {
  const s = String(status || '').toUpperCase();
  if (s === 'TABURCU' || s === 'COMPLETED' || s === 'TAMAMLANDI') return 'Seans Tamamlandı';
  if (s === 'AYRILDI') return 'Dinlenme & Tansiyon Kontrolü';
  if (s === 'YARIDA_KALDI') return 'Hekim Kararıyla Erken Durdurma';
  if (s === 'BEKLEMEDE') return 'Bekleme Salonunda';
  if (s === 'ODAYA_CAGRILDI') return 'Hazırlık Odasına Geçiniz';
  if (s === 'KATETER_TAKILIYOR') return isTimerFeatureEnabled ? 'Kateter Hazırlığı (45 dk)' : 'Kateter Hazırlığı';
  if (s === 'BAGLANDI' || s === 'TEDAVI_SURUYOR') return 'Seans Devam Ediyor';
  if (s === 'YAKINI_CAGRILIYOR') return 'Hasta Yakını Çağrısı (Danışma)';
  return fallbackText || 'Bekleme Salonunda';
}

// ----------------------------------------------------------------------------
// FONKSİYON: hydrateSeansItem()
// AMAÇ: Senkronizasyon paketinden veya localStorage'dan gelen ham seans nesnesinin Date ve sayısal alanlarını yeniden canlandırmak.
// ----------------------------------------------------------------------------
function hydrateSeansItem(item) {
  const safeDuration = (Number(item.plannedDurationMinutes) && Number(item.plannedDurationMinutes) >= 60)
    ? Number(item.plannedDurationMinutes)
    : STANDART_DIYALIZ_SURESI_DK;
  const resolvedStatusText = getStandardizedStatusLabel(item.status, item.statusText);
  return {
    ...item,
    statusText: resolvedStatusText,
    plannedDurationMinutes: safeDuration,
    instruction: item.status === 'BEKLEMEDE' || item.status === 'BAGLANDI' || item.status === 'TABURCU' ? '' : (item.instruction || ''),
    completed_at: item.completed_at || (isSessionCompletedStatus(item.status) ? new Date().toISOString() : null),
    countdownEndsAt: item.countdownEndsAt ? new Date(item.countdownEndsAt) : null,
    updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date()
  };
}

// ----------------------------------------------------------------------------
// FONKSİYON: broadcastSyncState()
// AMAÇ: Sekreter ekranında yapılan her değişikliği 3 kanaldan (BroadcastChannel, localStorage ve /api/sync-state) TV ekranlarına anlık yayınlamak.
// NEDEN 3 KANAL?: Aynı bilgisayardaki sekmeler anında, yerel ağdaki Akıllı TV'ler ise REST API üzerinden milisaniyeler içinde güncellenir.
// ----------------------------------------------------------------------------
function broadcastSyncState(options = {}) {
  if (isDisplayScreenMode()) {
    return; // TV Bekleme Ekranı pasif izleyicidir; sekreter panelinin durumunu ezemez.
  }
  const tickerEl = document.getElementById('tv-ticker-text');
  const packet = {
    timestamp: Date.now(),
    senderId: INSTANCE_ID,
    calendarDate: currentSelectedDateIso,
    dayGroup: currentSelectedDayGroup,
    timerFeatureEnabled: isTimerFeatureEnabled,
    soundEnabled: typeof options.soundEnabled === 'boolean' ? options.soundEnabled : soundEnabled,
    userDeleteResetPermissions: getLocalDeleteResetPermissionsMap(),
    seansList: activeSeansList,
    targetSlideIndex: typeof options.targetSlideIndex === 'number' ? options.targetSlideIndex : null,
    tickerMessage: DEFAULT_PERMANENT_TICKER_TEXT,
    playChime: Boolean(options.playChime),
    playFamilyChime: Boolean(options.playFamilyChime),
    toastMessage: options.toastMessage || null,
    hasActiveSession: typeof options.hasActiveSession === 'boolean'
      ? options.hasActiveSession
      : Boolean(isSecretaryLoggedIn || localStorage.getItem('diyaliz_logged_user') || localStorage.getItem('diyaliz_auth_token') || localStorage.getItem('diyaliz_active_session') === 'true'),
    settings: options.settings || currentSystemSettings
  };

  lastAppliedSyncTimestamp = packet.timestamp;

  // 1. localStorage üzerine kaydet (Diğer sekmelerde 'storage' eventini tetikler ve kalıcılık sağlar)
  try {
    localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(packet));
  } catch (e) {
    console.warn('localStorage senkronizasyon kaydı hatası:', e);
  }

  // 2. BroadcastChannel üzerinden açık olan tüm TV Bekleme ve Sekreter pencerelerine anında ilet
  if (syncChannel) {
    try {
      syncChannel.postMessage(packet);
    } catch (e) {
      console.warn('BroadcastChannel gönderim hatası:', e);
    }
  }

  // 3. Sunucu çalışıyorsa (/api/sync-state) farklı tarayıcı/cihazlar için sunucu belleğini de güncelle
  fetch(resolveApiUrl('/api/sync-state'), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(packet)
  }).catch(() => { });
}

// ----------------------------------------------------------------------------
// FONKSİYON: applyIncomingSyncPacket()
// AMAÇ: Diğer sekmeden veya sunucudan gelen senkronizasyon paketini doğrulayıp yerel seans listesine ve TV slaytlarına uygulamak.
// ----------------------------------------------------------------------------
function applyIncomingSyncPacket(packet) {
  if (!packet) return;
  if (packet.senderId === INSTANCE_ID) return;
  if (packet.timestamp && packet.timestamp <= lastAppliedSyncTimestamp) return;

  lastAppliedSyncTimestamp = packet.timestamp || Date.now();

  // TV Bekleme Ekranı Oturum & Zamanlayıcı Değişikliklerini Anında Uygula
  if (packet.hasActiveSession !== undefined) {
    serverActiveSessionState = Boolean(packet.hasActiveSession);
    checkTvScreenSessionAndSchedule();
  }
  if (packet.settings) {
    currentSystemSettings = packet.settings;
    checkTvScreenSessionAndSchedule();
  }
  if (packet.userLoggedIn || packet.userLoggedOut) {
    checkTvScreenSessionAndSchedule();
  }

  // 00:00 Gün Geçiş Sinyali (BroadcastChannel ile anında tüm ekranlara yayılır)
  if (packet.action === 'MIDNIGHT_DATE_TRANSITION' || packet.isDateTransition) {
    if (packet.calendarDate && (packet.calendarDate !== currentSelectedDateIso || packet.calendarDate !== lastCalendarAutoCheckDate)) {
      triggerMidnightDateTransition(packet.calendarDate);
      return;
    }
  }

  // Paket seans listesi içermiyorsa (yalnızca oturum veya sistem ayar bildirimi ise) seans işlemlerini atla
  if (!Array.isArray(packet.seansList)) {
    if (packet.toastMessage) showToast(packet.toastMessage);
    return;
  }
  if (isDisplayScreenMode()) {
    if (packet.calendarDate) currentSelectedDateIso = packet.calendarDate;
    if (packet.dayGroup) currentSelectedDayGroup = packet.dayGroup;
  } else {
    // Sekreter farklı bir takvim gününü inceliyorsa takvim gününü zorla değiştirme
    if (packet.calendarDate && packet.calendarDate !== currentSelectedDateIso) {
      return;
    }
  }
  if (typeof packet.timerFeatureEnabled === 'boolean') {
    isTimerFeatureEnabled = packet.timerFeatureEnabled;
    try {
      localStorage.setItem(TIMER_FEATURE_STORAGE_KEY, isTimerFeatureEnabled ? 'true' : 'false');
    } catch (e) { }
    updateTimerFeatureAdminUI();
  }
  if (typeof packet.soundEnabled === 'boolean') {
    soundEnabled = packet.soundEnabled;
    try {
      localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, soundEnabled ? 'true' : 'false');
    } catch (e) { }
    updateSoundUI();
  }
  if (packet.userDeleteResetPermissions && typeof packet.userDeleteResetPermissions === 'object') {
    saveLocalDeleteResetPermissionsMap(packet.userDeleteResetPermissions);
    if (currentSecretaryUser && currentSecretaryUser.username) {
      const uKey = String(currentSecretaryUser.username).trim().toLocaleLowerCase('tr-TR');
      if (Object.prototype.hasOwnProperty.call(packet.userDeleteResetPermissions, uKey)) {
        const hasPerm = Boolean(packet.userDeleteResetPermissions[uKey]);
        currentSecretaryUser.canDeleteAndReset = hasPerm;
        currentSecretaryUser.SILME_SIFIRLAMA_YETKISI = hasPerm ? 1 : 0;
        try {
          localStorage.setItem('diyaliz_logged_user', JSON.stringify(currentSecretaryUser));
        } catch (e) { }
      }
    }
    updateDeleteResetPermissionUI();
    renderDeletePatientModalList();
  }
  if (Array.isArray(packet.seansList) && (packet.seansList.length >= 5 || activeSeansList.length === 0 || isDisplayScreenMode())) {
    activeSeansList = packet.seansList.map(hydrateSeansItem);
  }

  if (packet.tickerMessage) {
    updateTickerMessage(packet.tickerMessage);
  }

  updateCalendarInfoBar();
  renderSecretaryPanel(true);
  renderTvSlides();

  if (typeof packet.targetSlideIndex === 'number') {
    goToSlide(packet.targetSlideIndex);
    startSlideAutomation();
  }

  if (packet.hasActiveSession !== undefined) {
    serverActiveSessionState = Boolean(packet.hasActiveSession);
    checkTvScreenSessionAndSchedule();
  }
  if (packet.settings) {
    currentSystemSettings = packet.settings;
    checkTvScreenSessionAndSchedule();
  }

  if (packet.playFamilyChime) {
    playFamilyCallChime();
  } else if (packet.playChime) {
    playGentleChime();
  }

  if (packet.toastMessage) {
    showToast(packet.toastMessage);
  }
}

// BroadcastChannel dinleyicisi
if (syncChannel) {
  syncChannel.onmessage = (event) => {
    if (event && event.data) {
      applyIncomingSyncPacket(event.data);
    }
  };
}

// localStorage 'storage' eventi dinleyicisi (Sekmeler arası anlık bildirim)
window.addEventListener('storage', (event) => {
  if (event.key === SOUND_ENABLED_STORAGE_KEY && event.newValue !== null) {
    soundEnabled = event.newValue !== 'false';
    updateSoundUI();
  }
  if (event.key === SYNC_STORAGE_KEY && event.newValue) {
    try {
      const packet = JSON.parse(event.newValue);
      applyIncomingSyncPacket(packet);
    } catch (e) {
      console.warn('Senkronizasyon verisi okunamadı:', e);
    }
  }
});

// Periyodik kontrol (file:// protokolü veya farklı tarayıcılar için yedek senkronizasyon)
setInterval(() => {
  try {
    const raw = localStorage.getItem(SYNC_STORAGE_KEY);
    if (raw) {
      const packet = JSON.parse(raw);
      if (packet && packet.timestamp > lastAppliedSyncTimestamp) {
        applyIncomingSyncPacket(packet);
      }
    }
  } catch (e) { }
}, 500);

// Sunucu (/api/sync-state) üzerinden farklı tarayıcı / cihazlar arası canlı senkronizasyon
if (window.location.protocol.startsWith('http')) {
  setInterval(async () => {
    try {
      const resp = await fetch(resolveApiUrl('/api/sync-state'), {
        headers: getAuthHeaders(),
        cache: 'no-store'
      });
      if (resp.ok) {
        const packet = await resp.json();
        if (packet && packet.timestamp && packet.timestamp > lastAppliedSyncTimestamp) {
          applyIncomingSyncPacket(packet);
        }
      }
    } catch (e) { }
  }, 1500);
}

// EKRAN MODU YÖNETİMİ (Sekreter Ekranı / TV Bekleme Ekranı Ayrımı)
function switchScreenMode(mode) {
  const validMode = (mode === 'display') ? 'display' : 'secretary';
  document.body.setAttribute('data-screen-mode', validMode);

  const btnSec = document.getElementById('btn-switch-secretary');
  const btnDisp = document.getElementById('btn-switch-display');
  if (btnSec) btnSec.classList.toggle('active', validMode === 'secretary');
  if (btnDisp) btnDisp.classList.toggle('active', validMode === 'display');

  renderSecretaryPanel(true);
  renderTvSlides();
}

// Kalıcı Takvim ve Veritabanı Sorgusunu Çalıştıran Fonksiyon
async function executeDailyOracleQuery(isManualSync = false) {
  try {
    const isTvDisplay = isDisplayScreenMode();
    const targetUrl = resolveApiUrl(isTvDisplay ? '/api/tv/seanslar' : '/api/seanslar');
    let fetchedFromServer = false;

    // Merkezi SQLite sunucusundan güncel seans ve hasta listesini çek
    try {
      const resp = await fetch(targetUrl, {
        headers: getAuthHeaders(),
        cache: 'no-store'
      });
      if (resp.ok) {
        const sqliteRows = await resp.json();
        if (Array.isArray(sqliteRows) && sqliteRows.length > 0) {
          ORACLE_RAW_DATABASE = isTvDisplay
            ? sqliteRows
            : sqliteRows.map(r => {
                const rawName = String(r.HASTAADI || '').trim();
                if (rawName.includes('*')) {
                  const origDefault = DEFAULT_ORACLE_RAW_DATABASE.find(
                    d => String(d.HASTASEANSREFNO) === String(r.HASTASEANSREFNO) || String(d.HASTANO) === String(r.HASTANO || r.hastano || '')
                  );
                  if (origDefault && origDefault.HASTAADI) {
                    return { ...r, HASTAADI: origDefault.HASTAADI };
                  }
                }
                return r;
              });
          fetchedFromServer = true;
          // KRİTİK KVKK İZOLASYONU: TV bekleme ekranı (/api/tv/seanslar) maskeli (*) isimler döndürdüğü için
          // ortak localStorage'daki MASTER_ROSTER_STORAGE_KEY'i ASLA ezmemelidir!
          if (!isTvDisplay) {
            try {
              localStorage.setItem(MASTER_ROSTER_STORAGE_KEY, JSON.stringify(ORACLE_RAW_DATABASE));
            } catch (_) { }
          }
        } else if (isTvDisplay && Array.isArray(sqliteRows) && sqliteRows.length === 0) {
          // TV ekranı ve aktif oturum yok (Zero-Trust KVKK) -> hasta listesi sıfır
          ORACLE_RAW_DATABASE = [];
          activeSeansList = [];
          renderTvSlides();
          return;
        }
      } else if (resp.status === 401 && !isTvDisplay) {
        // Oturum süresi dolmuş veya geçersiz
        isSecretaryLoggedIn = false;
        currentSecretaryUser = null;
        stopSessionHeartbeat();
        localStorage.removeItem('diyaliz_auth_token');
        localStorage.removeItem('diyaliz_logged_user');
        updateAuthUI();
      }
    } catch (_) { }

    if (!fetchedFromServer) {
      ORACLE_RAW_DATABASE = loadMasterRoster();
    }
    if (!isDisplayScreenMode()) {
      saveMasterRoster(ORACLE_RAW_DATABASE);
    }
    updateCalendarInfoBar();

    // Kalıcı Takvim & Esnek Gün Filtresi (Pzt-Çar-Cum, Sal-Per-Cmt veya Pzt-Çar-Cmt gibi özel günler)
    const filteredRows = ORACLE_RAW_DATABASE.filter(row => doesRowMatchSelectedFilter(row));
    let baseList = filteredRows.map(mapOracleRowToActiveSeans);

    // Eğer tarayıcıda sekreterin anlık yaptığı seans değişiklikleri varsa, güncel veritabanı kayıtlarının üzerine birleştir
    if (!isManualSync) {
      try {
        const savedRaw = localStorage.getItem(SYNC_STORAGE_KEY);
        if (savedRaw) {
          const savedPacket = JSON.parse(savedRaw);
          if (
            savedPacket &&
            Array.isArray(savedPacket.seansList) &&
            savedPacket.calendarDate === currentSelectedDateIso &&
            (!savedPacket.dayGroup || savedPacket.dayGroup === currentSelectedDayGroup)
          ) {
            const savedMap = new Map();
            savedPacket.seansList.forEach(item => {
              if (item && item.seansId) savedMap.set(String(item.seansId), item);
            });

            baseList = baseList.map(baseItem => {
              const liveOverride = savedMap.get(String(baseItem.seansId));
              if (liveOverride) {
                return {
                  ...baseItem,
                  status: liveOverride.status || baseItem.status,
                  statusText: liveOverride.statusText || baseItem.statusText,
                  badgeClass: liveOverride.badgeClass || baseItem.badgeClass,
                  instruction: liveOverride.instruction !== undefined ? liveOverride.instruction : baseItem.instruction,
                  completed_at: liveOverride.completed_at || baseItem.completed_at,
                  slideGroup: liveOverride.slideGroup || baseItem.slideGroup
                };
              }
              return baseItem;
            });
          }
        }
      } catch (e) {
        console.warn('Senkron birleştirme hatası:', e);
      }
    }

    activeSeansList = baseList;
    purgeExpiredCompletedPatients();
    sortActiveSeansList();

    if (isManualSync) {
      showToast(`🔄 ${formatDateTR(currentSelectedDateIso)} (${getDayGroupLabel(currentSelectedDayGroup)}) için ${activeSeansList.length} hasta yüklendi.`);
      broadcastSyncState({
        toastMessage: `🔄 Takvim listesi güncellendi (${activeSeansList.length} hasta).`
      });
    }

  } catch (err) {
    console.error('Veritabanı veri çekme hatası:', err);
  } finally {
    renderSecretaryPanel(true);
    renderTvSlides();
  }
}

// Belli Zaman Aralıklarıyla ve Gün Geçişlerinde Otomatik Güncelleme Motoru (Yıllarca Kullanım)
function startMultiYearCalendarAutoRefresh() {
  // 1. Gece tam 00:00:00.050'de milisaniye hassasiyetli zamanlayıcıyı kur
  scheduleExactMidnightAutoRefresh();

  // 2. Her 10 saniyede bir gün kontrolü yap (Bilgisayar uyku modundan uyandığında veya saat değiştirildiğinde)
  setInterval(() => {
    const todayIso = getTodayIsoString();
    if (todayIso !== lastCalendarAutoCheckDate) {
      triggerMidnightDateTransition(todayIso);
    } else {
      updateCalendarInfoBar();
    }
  }, 10 * 1000);

  // 3. Her 15 dakikada bir periyodik otomatik takvim/veritabanı senkronizasyonu
  setInterval(() => {
    updateCalendarInfoBar();
    ORACLE_RAW_DATABASE = loadMasterRoster();
  }, 15 * 60 * 1000);
}

// ============================================================================
// REST APİ İLE VERİTABANI MOTORUNA (database_engine.js) ANLIK SENKRONİZASYON
// ============================================================================
async function syncPatientChangeToApi(payload) {
  const targetUrl = resolveApiUrl('/api/seanslar');
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    // Sunucu kapalıysa yerel veritabanı (localStorage) zaten güncellenmiştir
  }
  return null;
}


// ============================================================================
// SADECE UFAK ZİL SESİ (ZARİF MEDİKAL DING SESİ)
// Konuşma veya sesli anons tamamen kaldırıldı!
// Bildirim zili açma/kapama ayarı kalıcıdır ve Sekreter ekranından yönetilir
// ============================================================================
let audioCtx = null;
const SOUND_ENABLED_STORAGE_KEY = 'diyaliz_sound_enabled';
let soundEnabled = (function () {
  try {
    return localStorage.getItem(SOUND_ENABLED_STORAGE_KEY) !== 'false';
  } catch (e) {
    return true;
  }
})();

// ----------------------------------------------------------------------------
// FONKSİYON: initAudioContext()
// AMAÇ: Tarayıcının Web Audio API ses bağlamını (AudioContext) ilk kullanıcı etkileşiminde güvenli biçimde başlatmak.
// ----------------------------------------------------------------------------
function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Tarayıcıda AudioContext askıda kalsa bile kesin ses çıkması için bellek içi WAV üretici
function createSynthesizedWavDataUri(notes, totalDurationSec = 1.6) {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * totalDurationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // ----------------------------------------------------------------------------
  // FONKSİYON: writeStr()
  // AMAÇ: WAV ses tamponu (DataView) oluştururken ASCII başlık baytlarını (RIFF, WAVE, fmt, data) bellek ofsetine yazmak.
  // ----------------------------------------------------------------------------
  function writeStr(offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;
    for (let n = 0; n < notes.length; n++) {
      const note = notes[n];
      if (t >= note.start && t <= note.start + note.duration) {
        const localT = t - note.start;
        const attack = Math.min(1, localT / 0.02);
        const decay = Math.exp(-3.5 * (localT / note.duration));
        const env = attack * decay * (note.gain || 0.55);
        // Zengin hastane anons zili harmonikleri
        const wave = Math.sin(2 * Math.PI * note.freq * localT)
          + 0.35 * Math.sin(2 * Math.PI * (note.freq * 2) * localT)
          + 0.12 * Math.sin(2 * Math.PI * (note.freq * 3) * localT);
        sample += wave * env;
      }
    }
    const clamped = Math.max(-0.98, Math.min(0.98, sample));
    view.setInt16(44 + i * 2, Math.floor(clamped * 32767), true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}

let cachedGentleWavUri = null;
let cachedFamilyWavUri = null;

// ----------------------------------------------------------------------------
// FONKSİYON: playNotesWithWebAudio()
// AMAÇ: Verilen nota frekansları dizisini yumuşak zarflı (ADSR) zarif bir hastane bildirim zili olarak Web Audio ile çalmak.
// ----------------------------------------------------------------------------
function playNotesWithWebAudio(notes) {
  initAudioContext();
  const runOscillators = () => {
    const now = audioCtx.currentTime;
    notes.forEach(note => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.freq, now + note.start);
      gain.gain.setValueAtTime(0.001, now + note.start);
      gain.gain.linearRampToValueAtTime(note.gain || 0.5, now + note.start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + note.start);
      osc.stop(now + note.start + note.duration);
    });
  };

  if (audioCtx.state === 'suspended') {
    audioCtx.resume().then(runOscillators).catch(() => { });
  } else {
    runOscillators();
  }
}

// Hastayı Odaya Çağırma Zili: Klasik Zarif 2 Tonlu "Ding - Dong" (1 kere çalar)
function playGentleChime() {
  if (!soundEnabled) return;
  const notes = [
    { freq: 880.00, start: 0.0, duration: 0.55, gain: 0.60 }, // "Ding" (A5)
    { freq: 659.25, start: 0.38, duration: 0.95, gain: 0.65 }  // "Dong" (E5)
  ];
  try {
    if (!cachedGentleWavUri) {
      cachedGentleWavUri = createSynthesizedWavDataUri(notes, 1.45);
    }
    const audio = new Audio(cachedGentleWavUri);
    audio.volume = 0.90;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        playNotesWithWebAudio(notes);
      });
    }
  } catch (e) {
    try { playNotesWithWebAudio(notes); } catch (_) { }
  }
}

// Hasta Yakını / Danışma Çağrısı İçin Dikkat Çekici 3 Tonlu Anons Zili (Ding - Dong - Ding)
function playFamilyCallChime() {
  if (!soundEnabled) return;
  const notes = [
    { freq: 1046.50, start: 0.0, duration: 0.48, gain: 0.65 }, // C6 (Ding)
    { freq: 783.99, start: 0.36, duration: 0.52, gain: 0.65 }, // G5 (Dong)
    { freq: 1318.51, start: 0.76, duration: 0.85, gain: 0.72 }  // E6 (Parlak Ding)
  ];
  try {
    if (!cachedFamilyWavUri) {
      cachedFamilyWavUri = createSynthesizedWavDataUri(notes, 1.7);
    }
    const audio = new Audio(cachedFamilyWavUri);
    audio.volume = 1.0;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        playNotesWithWebAudio(notes);
      });
    }
  } catch (e) {
    try { playNotesWithWebAudio(notes); } catch (_) { }
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: updateSoundUI()
// AMAÇ: Sekreter panelindeki bildirim zili açma/kapama butonunun ikonunu ve etiketini mevcut ses durumuna göre güncellemek.
// ----------------------------------------------------------------------------
function updateSoundUI() {
  const btn = document.getElementById('sound-toggle-btn');
  if (!btn) return;
  btn.classList.toggle('active', soundEnabled);
  btn.innerHTML = soundEnabled ? `
    <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
    </svg>
    <span>Bildirim Zili: Açık</span>
  ` : `
    <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"></path>
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"></path>
    </svg>
    <span>Bildirim Zili: Kapalı</span>
  `;
}

// ----------------------------------------------------------------------------
// FONKSİYON: toggleSound()
// AMAÇ: Hasta çağrı bildirim zilini sekreter ekranından tek tıkla açmak veya sessize almak.
// ----------------------------------------------------------------------------
function toggleSound() {
  soundEnabled = !soundEnabled;
  try {
    localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, soundEnabled ? 'true' : 'false');
  } catch (e) { }
  updateSoundUI();
  broadcastSyncState({ soundEnabled });
  showToast(soundEnabled ? '🔔 Bildirim zili AÇILDI.' : '🔕 Bildirim zili KAPATILDI.');
}

// ============================================================================
// CANLI GERİ SAYIM VE TAHMİNİ SEANS BİTİŞ SAATİ MOTORU (KLİNİK GÜVENLİK TAMPONLU)
// ============================================================================
function formatRemainingTime(targetDate, countdownType = null) {
  if (!targetDate) return null;
  const diffMs = new Date(targetDate) - new Date();

  // Süre dolduğunda panik yaratan '00:00' yerine sakinleştirici medikal süreç durumu gösterilir
  if (diffMs <= 0) {
    if (countdownType === 'KATETER') {
      return 'Bağlantı Hazırlığında';
    }
    if (countdownType === 'DINLENME') {
      return 'Son Dinlenme (~5 dk)';
    }
    return 'Çıkış Hazırlığında (~10 dk)';
  }

  const totalMinutes = Math.max(1, Math.round(diffMs / (60 * 1000)));

  // Son 10 dakikaya girildiğinde hasta yakınlarının endişelenmemesi için "Son Aşamada" ifadesi
  if (totalMinutes <= 10 && countdownType === 'DIYALIZ') {
    return 'Son Aşamada (~5-10 dk)';
  }

  // Süreleri 5'in en yakın katına yuvarla (Örn: 143 dk -> ~145 dk, 12 dk -> ~10 dk, min 5 dk)
  const roundedMinutes = totalMinutes < 5 ? 5 : Math.round(totalMinutes / 5) * 5;
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  const pad = (n) => String(n).padStart(2, '0');

  if (hours > 0) {
    return minutes > 0 ? `~${pad(hours)}sa ${pad(minutes)}dk` : `~${pad(hours)}sa`;
  }
  return `~${minutes} dk`;
}

// Tahmini Seans Bitiş / Çıkış Saati Hesaplayıcı (Örn: "~11:30 - 11:45")
function formatEstimatedEndTime(targetDate, countdownType = null) {
  if (!targetDate) return null;
  const end = new Date(targetDate);
  if (isNaN(end.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');

  if (countdownType === 'KATETER') {
    return `~${pad(end.getHours())}:${pad(end.getMinutes())}`;
  }

  // Diyaliz seanslarında tansiyon, dinlenme ve pansuman payı (+15 dk) ekleyerek tahmini çıkış aralığı ver
  const endPlus15 = new Date(end.getTime() + 15 * 60 * 1000);
  return `~${pad(end.getHours())}:${pad(end.getMinutes())} - ${pad(endPlus15.getHours())}:${pad(endPlus15.getMinutes())}`;
}

// SÜRE DOLDUĞUNDA OTOMATİK BİR SONRAKİ AŞAMAYA GEÇİRME MOTORU
function checkPatientTimersAndAdvanceFlow() {
  // Süre gösterimi kapalıysa otomatik süre bitimi geçişi çalışmaz
  if (!isTimerFeatureEnabled) return;

  const now = Date.now();
  let hasChanges = false;
  let targetSlideOnAdvance = null;

  activeSeansList.forEach(patient => {
    // Sadece aktif geri sayımı olan ve iptal edilmemiş hastalar
    if (!patient.countdownEndsAt || patient.isAborted) return;

    const diff = new Date(patient.countdownEndsAt).getTime() - now;
    if (diff <= 0) {
      // Süre doldu! Durumuna göre bir sonraki aşamaya otomatik geçir:
      hasChanges = true;

      if (patient.status === 'ODAYA_CAGRILDI') {
        // 1. Muayene / Hazırlık Çağrısı Süresi Doldu:
        if (patient.isFirstDialysis) {
          patient.status = 'KATETER_TAKILIYOR';
          patient.statusText = 'Kateter Hazırlığı (45 dk)';
          patient.badgeClass = 'badge-teal';
          patient.slideGroup = 'BEKLEME';
          patient.instruction = '';
          patient.countdownEndsAt = new Date(Date.now() + 45 * 60 * 1000);
          patient.countdownType = 'KATETER';
          patient.isUrgentCall = false;
          targetSlideOnAdvance = 0;
          showToast(`⏳ ${patient.maskedName}: Kateter hazırlığına (45 dk) geçildi.`);
        } else {
          const durMin = STANDART_DIYALIZ_SURESI_DK; // 3 Saat (180 dk)
          patient.plannedDurationMinutes = durMin;
          patient.status = 'BAGLANDI';
          patient.statusText = 'Seans Devam Ediyor';
          patient.badgeClass = 'badge-purple';
          patient.slideGroup = 'DIYALIZ';
          patient.instruction = '';
          patient.countdownEndsAt = new Date(Date.now() + durMin * 60 * 1000);
          patient.countdownType = 'DIYALIZ';
          patient.isUrgentCall = false;
          targetSlideOnAdvance = 1;
          showToast(`🔌 ${patient.maskedName}: Diyaliz seansı (3 saat) otomatik başlatıldı.`);
        }
        playGentleChime();

      } else if (patient.status === 'KATETER_TAKILIYOR') {
        // 2. Kateter Hazırlığı (45 dk) Süresi Doldu -> Diyalize Bağla (3 Saat = 180 dk)
        const durMin = STANDART_DIYALIZ_SURESI_DK;
        patient.plannedDurationMinutes = durMin;
        patient.status = 'BAGLANDI';
        patient.statusText = 'Seans Devam Ediyor';
        patient.badgeClass = 'badge-purple';
        patient.slideGroup = 'DIYALIZ';
        patient.instruction = '';
        patient.countdownEndsAt = new Date(Date.now() + durMin * 60 * 1000);
        patient.countdownType = 'DIYALIZ';
        patient.isUrgentCall = false;
        targetSlideOnAdvance = 1;
        showToast(`🔌 ${patient.maskedName}: 45 dk kateter hazırlığı tamamlandı, diyaliz seansına (3 saat) geçildi.`);
        // Alt bantta duyuru gösterilmez
        playGentleChime();

      } else if (patient.status === 'BAGLANDI' || patient.status === 'TEDAVI_SURUYOR') {
        // 3. Diyaliz Makine Süresi (3 Saat) Tamamlandı!
        // Doğrudan Taburcu etmek yerine, Seans Sonu / Dinlenme & Tansiyon Kontrolü aşamasına geçir!
        patient.status = 'AYRILDI';
        patient.statusText = 'Dinlenme & Tansiyon Kontrolü';
        patient.badgeClass = 'badge-teal';
        patient.slideGroup = 'CIKIS';
        patient.instruction = 'Diyaliz tamamlandı. Pansuman, dinlenme ve tansiyon kontrolü yapılıyor.';
        patient.countdownEndsAt = new Date(Date.now() + 15 * 60 * 1000);
        patient.countdownType = 'DINLENME';
        patient.isUrgentCall = false;
        patient.isFamilyCall = false;
        targetSlideOnAdvance = 2;
        showToast(`🩺 ${patient.maskedName}: Diyaliz tamamlandı. Tansiyon ölçümü ve dinlenmeye geçildi.`);
        updateTickerMessage(`Bilgilendirme: ${patient.maskedName} için seans sonu dinlenme ve tansiyon kontrolü yapılmaktadır.`);
        playGentleChime();

      } else if (patient.status === 'AYRILDI') {
        // 4. Dinlenme Süresi (15 dk) Tamamlandı -> Seans Tamamlandı / Taburcu (2 dk sonra listeden silinir)
        patient.status = 'TABURCU';
        patient.statusText = 'Seans Tamamlandı';
        patient.completed_at = new Date().toISOString();
        patient.badgeClass = 'badge-green';
        patient.slideGroup = 'CIKIS';
        patient.instruction = 'Seans tamamlanmıştır. Hasta refakatçisi eşliğinde ayrılabilir.';
        patient.countdownEndsAt = null;
        patient.countdownType = null;
        patient.isUrgentCall = false;
        patient.isFamilyCall = false;
        targetSlideOnAdvance = 2;
        showToast(`✅ ${patient.maskedName}: Dinlenme süresi tamamlandı, Seans Tamamlandı olarak işaretlendi.`);
        // Alt bantta duyuru gösterilmez
        playGentleChime();
      }

      // Kalıcı veritabanı kaydındaki STATU ve COUNTDOWN_ENDS_AT alanlarını güncelle
      ORACLE_RAW_DATABASE = loadMasterRoster().map(r => {
        if (String(r.HASTASEANSREFNO) === String(patient.seansId) || String(r.HASTANO) === String(patient.tcNo)) {
          return {
            ...r,
            STATU: patient.status,
            COUNTDOWN_ENDS_AT: patient.countdownEndsAt ? patient.countdownEndsAt.toISOString() : null
          };
        }
        return r;
      });
      saveMasterRoster(ORACLE_RAW_DATABASE);

      syncPatientChangeToApi({
        HASTASEANSREFNO: patient.seansId,
        STATU: patient.status,
        PRESENCE: patient.presence || 'GELDI',
        SURE: STANDART_DIYALIZ_SURESI_DK
      });
    }
  });

  if (hasChanges) {
    renderSecretaryPanel(true);
    renderTvSlides();
    broadcastSyncState({
      targetSlideIndex: targetSlideOnAdvance,
      playChime: true
    });
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: updateCountdownDisplays()
// AMAÇ: Diyaliz veya kateter hazırlığındaki hastaların kalan tahmini süre sayaçlarını ekranda her saniye canlı güncellemek.
// ----------------------------------------------------------------------------
function updateCountdownDisplays() {
  document.querySelectorAll('[data-countdown-id]').forEach(el => {
    const sId = parseInt(el.getAttribute('data-countdown-id'));
    const seans = activeSeansList.find(s => String(s.seansId) === String(sId));
    if (seans && seans.countdownEndsAt) {
      el.textContent = formatRemainingTime(seans.countdownEndsAt, seans.countdownType);
    }
  });

  document.querySelectorAll('[data-sec-countdown-id]').forEach(el => {
    const sId = parseInt(el.getAttribute('data-sec-countdown-id'));
    const seans = activeSeansList.find(s => String(s.seansId) === String(sId));
    if (seans && seans.countdownEndsAt) {
      el.textContent = `⏱ Kalan: ${formatRemainingTime(seans.countdownEndsAt, seans.countdownType)} • 🏁 Tahmini Çıkış: ${formatEstimatedEndTime(seans.countdownEndsAt, seans.countdownType)}`;
    }
  });

  if (editingScheduleSeansId) {
    updateDetailModalTimeSummary(editingScheduleSeansId);
  }
}

// 1. Otomatik Süreç Kontrolü (Aşama geçişleri için her saniye kontrol eder)
setInterval(() => {
  checkPatientTimersAndAdvanceFlow();
}, 1000);

// 2. Ekrandaki kalan sürelerin düzenli güncellenmesi (Her 15 saniyede bir yenilenir)
setInterval(() => {
  updateCountdownDisplays();
}, 15000);

// ============================================================================
// CAROUSEL & SLAYT MOTORU (MAX 4 HASTA SAYFALAMASI & OTOMATİK GEÇİŞ)
// ============================================================================
let currentSlideIndex = 0;
let totalTvSlidesCount = 1;
let tvSlideDataList = [];
let countdownSeconds = 15;
let countdownInterval = null;

// Slayt kategorisi tanımları (Sadeleştirilmiş, gereksiz alt yazılar kaldırıldı)
const SLIDE_GROUP_DEFINITIONS = [
  {
    group: 'BEKLEME',
    title: '1. BEKLEME & ÇAĞRI LİSTESİ',
    subtitle: '',
    bannerClass: 'banner-waiting',
    iconSvg: `<svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
  },
  {
    group: 'DIYALIZ',
    title: '2. DİYALİZ SEANSI DEVAM EDENLER',
    subtitle: '',
    bannerClass: 'banner-dialysis',
    iconSvg: `<svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>`
  },
  {
    group: 'CIKIS',
    title: '3. SEANSI TAMAMLANANLAR',
    subtitle: '',
    bannerClass: 'banner-discharge',
    iconSvg: `<svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
  }
];

// Aktif slaytın hasta sayısına göre dinamik süresini hesapla
// Kural: Hasta yoksa 4 sn, hasta varsa her hasta için 5 sn (örn: 2 hasta = 10 sn), maksimum 25 sn
function getDynamicSlideDuration(slideIdx) {
  const urlParams = new URLSearchParams(window.location.search);
  const isFixedTvUnit = (urlParams.get('sabit') === '1' || urlParams.get('lock') === '1') && selectedTvUnitParam;
  if (isFixedTvUnit) {
    return 10; // Sabit TV modunda otomatik kaydırma durdurulur
  }
  if (!tvSlideDataList || tvSlideDataList.length === 0) return 4;
  const slide = tvSlideDataList[slideIdx] || tvSlideDataList[0];
  const count = (slide && slide.patients) ? slide.patients.length : 0;
  if (count === 0) return 4;
  return Math.min(25, count * 5);
}

// ----------------------------------------------------------------------------
// FONKSİYON: goToSlide()
// AMAÇ: TV bekleme ekranı karuselini belirtilen slayt indeksine kaydırmak, nokta göstergesini ve dinamik geri sayımı yenilemek.
// ----------------------------------------------------------------------------
function goToSlide(index, resetCountdown = true) {
  if (totalTvSlidesCount <= 0) return;
  currentSlideIndex = (index + totalTvSlidesCount) % totalTvSlidesCount;

  const track = document.getElementById('tv-carousel-track');
  if (track) {
    const offsetPercent = (100 / totalTvSlidesCount) * currentSlideIndex;
    track.style.transform = `translateX(-${offsetPercent}%)`;
  }

  document.querySelectorAll('#tv-slide-dots .slide-dot').forEach((dot, idx) => {
    dot.classList.toggle('active', idx === currentSlideIndex);
  });

  if (resetCountdown) {
    countdownSeconds = getDynamicSlideDuration(currentSlideIndex);
  }
  updateTimerPill();
}

// ----------------------------------------------------------------------------
// FONKSİYON: nextSlide()
// AMAÇ: TV karuselinde bir sonraki slayta (döngüsel olarak başa sararak) geçmek.
// ----------------------------------------------------------------------------
function nextSlide() {
  goToSlide(currentSlideIndex + 1);
}

// ----------------------------------------------------------------------------
// FONKSİYON: updateTimerPill()
// AMAÇ: TV ekranı sağ üst köşesindeki "Sonraki Ekran: Xs" geri sayım hapını saniye saniye güncellemek.
// ----------------------------------------------------------------------------
function updateTimerPill() {
  const pill = document.getElementById('timer-pill');
  if (pill) {
    const totalSec = getDynamicSlideDuration(currentSlideIndex);
    pill.textContent = `Sonraki Ekran: ${countdownSeconds}s (${totalSec}s)`;
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: startSlideAutomation()
// AMAÇ: TV ekranındaki slaytların otomatik geçiş döngüsünü başlatmak.
// DİNAMİK SÜRE HESABI:
//   - Liste boşsa: 4 saniyede hızlı geçiş.
//   - Liste doluysa: Hasta sayısı x 5 saniye (en fazla 25 saniye).
// ----------------------------------------------------------------------------
function startSlideAutomation() {
  const urlParams = new URLSearchParams(window.location.search);
  const isFixedTvUnit = (urlParams.get('sabit') === '1' || urlParams.get('lock') === '1') && selectedTvUnitParam;
  if (isFixedTvUnit) {
    // Sabit TV Ünitesi (TV 1 Bekleme, TV 2 Diyaliz veya TV 3 Çıkış) modunda slayt döngüsü çalışmaz, sabit kalır
    const pill = document.getElementById('timer-pill');
    if (pill) {
      const tvNames = {
        '1': '📺 TV 1: Bekleme & Çağrı Salonu',
        '2': '📺 TV 2: Diyaliz Tedavi Ünitesi',
        '3': '📺 TV 3: Çıkış / Taburcu Alanı'
      };
      pill.textContent = tvNames[selectedTvUnitParam] || '📺 Özel TV Ünitesi';
      pill.style.background = '#0369a1';
    }
    return;
  }
  if (countdownInterval) clearInterval(countdownInterval);
  countdownSeconds = getDynamicSlideDuration(currentSlideIndex);
  updateTimerPill();

  countdownInterval = setInterval(() => {
    countdownSeconds--;
    if (countdownSeconds <= 0) {
      nextSlide();
    } else {
      updateTimerPill();
    }
  }, 1000);
}

// ============================================================================
// TV DISPLAY EKRANI RENDER (HASTA SAYISI ARTIŞINA DUYARLI DİNAMİK SAYFALAMA)
// ============================================================================
function getDynamicPatientsPerScreen() {
  return 5;
}

// ============================================================================
// HASTA LİSTESİ SIRALAMA MOTORU:
// 1. Acilden gelen hastalar (ACIL_SERVIS) HER ZAMAN en üstte
// 2. Vardiyasına göre: Önce SABAH, sonra ÖĞLEN, sonra Vardiya Belirtilmemiş
// 3. Aynı vardiya içinde veya vardiya belirtilmemişse ALFABETİK (A -> Z, Türkçe)
// ============================================================================
function getVardiyaSortRank(vardiyaVal) {
  const s = String(vardiyaVal || '').trim().toLocaleUpperCase('tr-TR');
  if (s === 'SABAH' || s === '1') return 1;
  if (s === 'ÖGLEN' || s === 'OGLEN' || s === 'ÖĞLEN' || s === 'OGLE' || s === 'ÖĞLE' || s === '2') return 2;
  return 3; // Belirtilmemiş
}

// ----------------------------------------------------------------------------
// FONKSİYON: formatVardiyaBadgeLabel()
// AMAÇ: Hastanın vardiya bilgisini (Sabah / Öğlen / Acil) kartlarda gösterilecek kısa rozet metnine dönüştürmek.
// ----------------------------------------------------------------------------
function formatVardiyaBadgeLabel(vardiyaVal, isEmergency = false) {
  if (isEmergency) return '🚨 Acil';
  const s = String(vardiyaVal || '').trim().toLocaleUpperCase('tr-TR');
  if (s === 'SABAH' || s === '1') return '🌅 Sabah';
  if (s === 'ÖGLEN' || s === 'OGLEN' || s === 'ÖĞLEN' || s === 'OGLE' || s === 'ÖĞLE' || s === '2') return '☀️ Öğlen';
  return '';
}

// Durum / Aşama Sıralama Önceliği (Aynı tür olan hastalar bekleme ve seans ekranında mutlaka alt alta listelenir)
function getStatusSortRank(statusVal) {
  const s = String(statusVal || '').toUpperCase();
  switch (s) {
    case 'BEKLEMEDE':
      return 1;
    case 'ODAYA_CAGRILDI':
      return 2;
    case 'KATETER_TAKILIYOR':
      return 3;
    case 'YAKINI_CAGRILIYOR':
      return 4;
    case 'BAGLANDI':
    case 'TEDAVI_SURUYOR':
      return 5;
    case 'AYRILDI':
      return 6;
    case 'TABURCU':
    case 'COMPLETED':
    case 'TAMAMLANDI':
      return 7;
    case 'YARIDA_KALDI':
      return 8;
    default:
      return 9;
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: comparePatientsByPriority()
// AMAÇ: Hasta listesini klinik önceliğe (yakını çağrılanlar, odaya çağrılanlar, saat sırası ve ad sırası) göre sıralamak.
// ----------------------------------------------------------------------------
function comparePatientsByPriority(a, b) {
  const isEmergA = (a.gelisTipi || a.BASVURUTURU) === 'ACIL_SERVIS' || (a.gunGrubu || a.GUN_GRUBU) === 'BUGUN';
  const isEmergB = (b.gelisTipi || b.BASVURUTURU) === 'ACIL_SERVIS' || (b.gunGrubu || b.GUN_GRUBU) === 'BUGUN';

  // 1. Acil hastalar her zaman listenin en üstünde
  if (isEmergA !== isEmergB) {
    return isEmergA ? -1 : 1;
  }

  // 2. Aynı tür / durum olan hastalar mutlaka alt alta gösterilir (Bekleme, Odaya Çağrı, Kateter, Danışma vb.)
  const statusA = a.status || a.STATU || 'BEKLEMEDE';
  const statusB = b.status || b.STATU || 'BEKLEMEDE';
  const rankStatusA = getStatusSortRank(statusA);
  const rankStatusB = getStatusSortRank(statusB);
  if (rankStatusA !== rankStatusB) {
    return rankStatusA - rankStatusB;
  }

  // 3. Aynı tür içinde vardiyasına göre sıralama (Önce Sabah = 1, Sonra Öğlen = 2, Belirtilmemiş = 3)
  const rankA = getVardiyaSortRank(a.vardiya ?? a.VARDIYA);
  const rankB = getVardiyaSortRank(b.vardiya ?? b.VARDIYA);
  if (rankA !== rankB) {
    return rankA - rankB;
  }

  // 4. Aynı tür ve aynı vardiya içinde Alfabetik sıralama (Türkçe A -> Z)
  const nameA = (a.HASTAADI || `${a.firstName || ''} ${a.lastName || ''}`).trim();
  const nameB = (b.HASTAADI || `${b.firstName || ''} ${b.lastName || ''}`).trim();
  return nameA.localeCompare(nameB, 'tr-TR', { sensitivity: 'base' });
}

// ----------------------------------------------------------------------------
// FONKSİYON: sortActiveSeansList()
// AMAÇ: Aktif seans listesini klinik öncelik sırasına göre sıralamak:
//       1. Odaya çağrılan ve hazırlananlar
//       2. Seansı devam edenler
//       3. Bekleyenler
//       4. Seansı tamamlananlar (en altta 2 dk bekler)
// ----------------------------------------------------------------------------
function sortActiveSeansList() {
  purgeExpiredCompletedPatients();
  activeSeansList.sort(comparePatientsByPriority);
}

let selectedTvUnitParam = null; // '1' (Bekleme), '2' (Diyaliz), '3' (Taburcu)

// ----------------------------------------------------------------------------
// FONKSİYON: renderTvSlides()
// AMAÇ: Bekleme salonu TV ekranı (display.html) için 4 slaytlık tam ekran karuseli render etmek:
//   Slayt 1: 1. Bekleme & Çağrı Listesi (Sayfa 1 - 5 Hasta)
//   Slayt 2: 1. Bekleme & Çağrı Listesi (Sayfa 2 - 5 Hasta)
//   Slayt 3: 2. Diyaliz Seansı Devam Edenler (5 Hasta)
//   Slayt 4: 3. Seansı Tamamlananlar (5 Hasta - 2 dakika kuralı)
// ----------------------------------------------------------------------------
function renderTvSlides() {
  const track = document.getElementById('tv-carousel-track');
  const dotsContainer = document.getElementById('tv-slide-dots');
  if (!track) return;

  sortActiveSeansList();
  const perScreen = getDynamicPatientsPerScreen();

  // URL'den veya parametreden sabit TV ünitesi seçimi:
  // Yalnızca ?sabit=1 veya ?lock=1 varsa tek ekrana kilitlenir; varsayılanda tüm kategoriler (Bekleme, Diyaliz, Çıkış) sırayla akar.
  const urlParams = new URLSearchParams(window.location.search);
  const isFixedTvUnit = (urlParams.get('sabit') === '1' || urlParams.get('lock') === '1') && selectedTvUnitParam;
  let activeDefinitions = SLIDE_GROUP_DEFINITIONS;
  if (isFixedTvUnit) {
    if (selectedTvUnitParam === '1') {
      activeDefinitions = [SLIDE_GROUP_DEFINITIONS[0]];
    } else if (selectedTvUnitParam === '2') {
      activeDefinitions = [SLIDE_GROUP_DEFINITIONS[1]];
    } else if (selectedTvUnitParam === '3') {
      activeDefinitions = [SLIDE_GROUP_DEFINITIONS[2]];
    }
  }

  // 1. Slayt Veri Listesini Üret
  tvSlideDataList = [];

  activeDefinitions.forEach(def => {
    const groupPatients = activeSeansList.filter(s => s.slideGroup === def.group);
    const totalCount = groupPatients.length;

    if (totalCount === 0) {
      tvSlideDataList.push({
        group: def.group,
        title: def.title,
        subtitle: def.subtitle,
        bannerClass: def.bannerClass,
        iconSvg: def.iconSvg,
        patients: [],
        totalCount: 0,
        pageNum: 1,
        totalPages: 1
      });
    } else {
      const totalPages = Math.ceil(totalCount / perScreen);
      for (let p = 0; p < totalPages; p++) {
        const slice = groupPatients.slice(p * perScreen, (p + 1) * perScreen);
        tvSlideDataList.push({
          group: def.group,
          title: totalPages > 1 ? `${def.title} (${p + 1}/${totalPages})` : def.title,
          subtitle: def.subtitle,
          bannerClass: def.bannerClass,
          iconSvg: def.iconSvg,
          patients: slice,
          totalCount: totalCount,
          pageNum: p + 1,
          totalPages: totalPages
        });
      }
    }
  });

  totalTvSlidesCount = tvSlideDataList.length;
  track.style.width = `${totalTvSlidesCount * 100}%`;

  // 2. Slayt HTML'lerini oluştur
  track.innerHTML = tvSlideDataList.map((slide) => {
    const slideWidthPercent = 100 / totalTvSlidesCount;

    return `
      <div class="tv-slide" style="flex: 0 0 ${slideWidthPercent}%; width: ${slideWidthPercent}%; max-width: ${slideWidthPercent}%;">
        <div class="slide-banner ${slide.bannerClass}">
          <div class="slide-banner-info">
            <div class="banner-icon">
              ${slide.iconSvg}
            </div>
            <div class="banner-title-text">
              <h2>${slide.title}</h2>
            </div>
          </div>
          <div class="banner-count-badge">
            ${slide.totalCount} Hasta ${slide.totalPages > 1 ? `• [${slide.pageNum}/${slide.totalPages}]` : ''}
          </div>
        </div>

        <div class="tv-patient-grid" data-row-count="${slide.patients.length}">
          ${slide.patients.length === 0 ? `
            <div style="flex: 0 0 calc((100% - 48px) / 5); height: calc((100% - 48px) / 5); max-height: calc((100% - 48px) / 5); display: flex; align-items: center; justify-content: center; background: #ffffff; border: 1.5px dashed #cbd5e1; border-radius: var(--radius-md); padding: 0 20px; text-align: center; color: var(--text-dim); font-size: clamp(18px, 1.5vw, 24px); font-weight: 700; box-sizing: border-box;">
              Bu aşamada hasta bulunmamaktadır.
            </div>
          ` : slide.patients.map(p => {
      const isFamilyCallRow = Boolean(p.isFamilyCall || p.status === 'YAKINI_CAGRILIYOR');
      let alertClass = '';
      if (p.isUrgentCall) alertClass = 'calling-urgent-active';
      else if (isFamilyCallRow) alertClass = 'family-call-active';
      else if (p.isAborted) alertClass = 'aborted-active';

      const estEndTime = p.countdownEndsAt ? formatEstimatedEndTime(p.countdownEndsAt, p.countdownType) : null;

      // Sadece Bekleme Ekranında (TV Display) hasta yakını çağrılırken dikkat çekici TURUNCU renk kullanılır
      const familyRowInlineStyle = isFamilyCallRow
        ? 'background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 50%, #fed7aa 100%); border: 2.5px solid #f97316; border-left: 8px solid #ea580c; box-shadow: 0 6px 22px rgba(249, 115, 22, 0.32);'
        : '';
      const familyNameInlineStyle = isFamilyCallRow ? 'color: #9a3412;' : '';
      const familySubtextInlineStyle = isFamilyCallRow ? 'color: #c2410c; font-weight: 800;' : '';
      const familyBadgeInlineStyle = isFamilyCallRow
        ? 'background: linear-gradient(135deg, #f97316, #ea580c); color: #ffffff; border: 2px solid #c2410c; box-shadow: 0 3px 12px rgba(249, 115, 22, 0.38);'
        : '';

      const cleanSubtext = p.instruction ? p.instruction.trim() : '';

      return `
              <div class="tv-patient-row ${alertClass}" style="${familyRowInlineStyle}">
                <div class="tv-patient-name-block">
                  <div class="tv-patient-text-group">
                    <div class="masked-name-text">
                      <span class="patient-masked-name" style="${familyNameInlineStyle}">${p.maskedName}</span>
                    </div>
                    ${cleanSubtext ? `
                      <div class="masked-subtext" style="${familySubtextInlineStyle}">
                        <span>${cleanSubtext}</span>
                      </div>
                    ` : ''}
                  </div>
                </div>

                <div class="tv-right-info">
                  ${(isTimerFeatureEnabled && p.countdownEndsAt) ? `
                    <div class="tv-timer-display ${p.countdownType === 'KATETER' ? 'catheter-style' : ''}">
                      <span class="time-val" data-countdown-id="${p.seansId}">
                        ${formatRemainingTime(p.countdownEndsAt, p.countdownType)}
                      </span>
                      <span class="time-lbl">
                        ${p.countdownType === 'HAZIRLIK' ? 'Ön Hazırlık' : (p.countdownType === 'KATETER' ? 'Kateter (45 dk)' : (p.countdownType === 'DINLENME' ? 'Tansiyon & Pansuman' : 'Tahmini Kalan'))}
                      </span>
                      ${estEndTime ? `
                        <span class="time-end-estimate" style="display: block; margin-top: 3px; font-size: 11px; font-weight: 800; color: #0f766e; background: rgba(13, 148, 136, 0.12); padding: 2px 7px; border-radius: 4px;">
                          🏁 Tahmini Çıkış: ${estEndTime}
                        </span>
                      ` : ''}
                    </div>
                  ` : ''}

                  <div class="tv-status-badge ${p.badgeClass}" style="${familyBadgeInlineStyle}">
                    <span>●</span>
                    <span>${getStandardizedStatusLabel(p.status, p.statusText)}</span>
                  </div>
                </div>
              </div>
            `;
    }).join('')}
        </div>
      </div>
    `;
  }).join('');

  // 3. Slide Gösterge Noktalarını (Dots) güncelle
  if (dotsContainer) {
    dotsContainer.innerHTML = tvSlideDataList.map((slide, idx) => `
      <div class="slide-dot ${idx === currentSlideIndex ? 'active' : ''}" 
           title="${slide.title}" 
           onclick="goToSlide(${idx})"></div>
    `).join('');
  }

  if (currentSlideIndex >= totalTvSlidesCount) {
    currentSlideIndex = 0;
  }
  goToSlide(currentSlideIndex, false);
}

// ============================================================================
// SEKRETER KONTROL PANELİ RENDER (SADE, ANLAŞILIR VE HIZLI ARAYÜZ)
// ============================================================================
let secretarySearchTerm = '';

// ----------------------------------------------------------------------------
// FONKSİYON: formatDurationLabel()
// AMAÇ: Dakika cinsinden süreyi okunabilir biçime (örn. "3 sa 00 dk" veya "45 dk") çevirmek.
// ----------------------------------------------------------------------------
function formatDurationLabel(minutes) {
  const m = Number(minutes) || 180;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h > 0 && rem > 0) return `${h} sa ${rem} dk`;
  if (h > 0) return `${h} saat`;
  return `${rem} dk`;
}

let secretaryCategoryFilter = 'ALL'; // 'ALL', 'BEKLEME', 'DIYALIZ', 'CIKIS'
const unsavedPatientStatusIds = new Set();
const savedPatientStatusIds = new Set();
const pendingPatientStatuses = {};

// Durum Koduna Göre Kategori Grubu ve Rozet Bilgisi
function getCategoryInfoForStatus(status) {
  if (status === 'BAGLANDI' || status === 'TEDAVI_SURUYOR') {
    return {
      group: 'DIYALIZ',
      className: 'cat-badge-diyaliz',
      label: '🔌 2. Diyaliz'
    };
  }
  if (status === 'AYRILDI' || status === 'TABURCU' || status === 'YARIDA_KALDI') {
    return {
      group: 'CIKIS',
      className: 'cat-badge-cikis',
      label: '✅ 3. Çıkış'
    };
  }
  return {
    group: 'BEKLEME',
    className: 'cat-badge-bekleme',
    label: '⏳ 1. Bekleme'
  };
}


// ----------------------------------------------------------------------------
// FONKSİYON: setSecretaryCategoryFilter()
// AMAÇ: Sekreter panelindeki kategori sekme filtresini (Tümü / Bekleyenler / Seanstakiler / Tamamlananlar) değiştirmek.
// ----------------------------------------------------------------------------
function setSecretaryCategoryFilter(cat) {
  secretaryCategoryFilter = cat;
  document.querySelectorAll('#secretary-category-tabs .cat-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-cat') === cat);
  });
  renderSecretaryPanel(true);
}

// ----------------------------------------------------------------------------
// FONKSİYON: renderSecretaryPanel()
// AMAÇ: Sekreter/hemşire yönetim ekranındaki tüm hasta kartlarını, durum dropdown'larını, yeşil Kaydet butonunu ve 120 sn sayaçlarını DOM'a çizmek.
// NEREDE KULLANILIR: Durum güncellemesi, arama, tarih değişimi ve veritabanı senkronizasyonu sonrasında.
// ----------------------------------------------------------------------------
function renderSecretaryPanel(force = false) {
  const container = document.getElementById('secretary-patient-list');
  if (!container) return;

  // Sekreter dropdown seçerken veya arama/yazı yazarken DOM'un birden yok olup sıfırlanmasını önle
  if (!force) {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'SELECT' || activeEl.tagName === 'INPUT') && activeEl.closest('#secretary-patient-list')) {
      return;
    }
  }

  // Her zaman: 1) Acil hastalar en üstte, 2) Önce Sabah sonra Öğlen vardiyası, 3) Alfabetik (A-Z)
  sortActiveSeansList();

  // Kategori sekme sayaçlarını güncelle
  const countAll = activeSeansList.length;
  const countBekleme = activeSeansList.filter(s => s.slideGroup === 'BEKLEME').length;
  const countDiyaliz = activeSeansList.filter(s => s.slideGroup === 'DIYALIZ').length;
  const countCikis = activeSeansList.filter(s => s.slideGroup === 'CIKIS').length;

  const elAll = document.getElementById('cat-count-all');
  if (elAll) elAll.textContent = countAll;
  const elBekleme = document.getElementById('cat-count-bekleme');
  if (elBekleme) elBekleme.textContent = countBekleme;
  const elDiyaliz = document.getElementById('cat-count-diyaliz');
  if (elDiyaliz) elDiyaliz.textContent = countDiyaliz;
  const elCikis = document.getElementById('cat-count-cikis');
  if (elCikis) elCikis.textContent = countCikis;

  const filtered = activeSeansList.filter(s => {
    if (secretaryCategoryFilter !== 'ALL' && s.slideGroup !== secretaryCategoryFilter) {
      return false;
    }
    const target = `${s.firstName} ${s.lastName} ${s.maskedName} ${s.protokolNo} ${s.tcNo}`.toLowerCase();
    return target.includes(secretarySearchTerm.toLowerCase());
  });

  const totalCountEl = document.getElementById('secretary-total-count');
  if (totalCountEl) {
    const emergencyCount = activeSeansList.filter(s => s.gelisTipi === 'ACIL_SERVIS').length;
    totalCountEl.textContent = emergencyCount > 0
      ? `${filtered.length} / ${activeSeansList.length} Hasta (${emergencyCount} Acil)`
      : `${filtered.length} / ${activeSeansList.length} Hasta`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="background: #ffffff; border: 1.5px dashed #cbd5e1; border-radius: var(--radius-md); padding: 36px 20px; text-align: center; color: var(--text-dim); font-size: 14px; font-weight: 600;">
        Seçili kategori veya arama kriterine uygun hasta bulunamadı.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(patient => {
    const isEmergency = patient.gelisTipi === 'ACIL_SERVIS' || patient.gunGrubu === 'BUGUN';
    const sessionHourToday = getPatientSessionTimeForDate(patient, currentSelectedDateIso);
    const isUnsaved = unsavedPatientStatusIds.has(String(patient.seansId));
    const currentStatusVal = (isUnsaved && pendingPatientStatuses[String(patient.seansId)]) || patient.status;
    const btnClass = isUnsaved ? 'btn-status-unsaved' : 'btn-status-saved';
    const catInfo = getCategoryInfoForStatus(currentStatusVal);

    let completedBadge = '';
    const statCode = String(patient.status || '').toUpperCase();
    if (isSessionCompletedStatus(statCode)) {
      const compTime = parseCompletedAtTimestamp(patient.completed_at) || Date.now();
      const elapsed = Date.now() - compTime;
      const remainingSec = Math.min(120, Math.max(0, Math.ceil((120000 - elapsed) / 1000)));
      completedBadge = `<div id="completed-countdown-${patient.seansId}" class="patient-completed-countdown-badge" data-seans-id="${patient.seansId}">⏳ 2 dk içinde listeden kaldırılacak (<span id="completed-sec-${patient.seansId}">${remainingSec}</span> sn)</div>`;
    }

    return `
    <div class="secretary-patient-card ${isEmergency ? 'card-emergency-patient' : ''}" id="sec-card-${patient.seansId}">
      <!-- SOL BÖLÜM: Hastanın Maskeli Adı Soyadı, Hasta No, Saat ve Acil -->
      <div class="card-top">
        <div class="patient-info-left">
          <button type="button" class="patient-name-clickable" onclick="openPatientScheduleModal(${patient.seansId})" title="KVKK Detay: Hastanın tam adını, seans saatini, vardiya ve günlerini düzenlemek için tıklayınız">
            <span>${patient.maskedName}</span>
            <span class="name-detail-hint">Detay ▸</span>
          </button>
          <span class="patient-id-badge">Hasta No: ${patient.tcNo || '-'}</span>
          ${sessionHourToday ? `<span class="patient-time-badge">🕒 ${sessionHourToday}</span>` : ''}
          ${isEmergency ? `<span class="patient-shift-badge shift-badge-emergency">🚨 Acil</span>` : ''}
          ${completedBadge}
        </div>
      </div>

      <!-- SAĞ BÖLÜM: Kategori Rozeti (Sağa Taşındı), Durum Seçimi ve Kaydet Butonu -->
      <div class="card-unified-controls">
        <div class="status-control-group">
          <span id="cat-badge-${patient.seansId}" class="patient-category-badge ${catInfo.className}" style="flex-shrink: 0;">
            ${catInfo.label}
          </span>

          <div class="custom-select-container">
            <select id="sel-status-${patient.seansId}" class="status-combobox" onchange="onStatusDropdownChange('${patient.seansId}')">
              <option value="BEKLEMEDE" ${currentStatusVal === 'BEKLEMEDE' ? 'selected' : ''}>⏳ 1. Bekleme Salonunda</option>
              <option value="ODAYA_CAGRILDI" ${currentStatusVal === 'ODAYA_CAGRILDI' ? 'selected' : ''}>🔔 2. Odaya Çağır (Hazırlık)</option>
              <option value="KATETER_TAKILIYOR" ${currentStatusVal === 'KATETER_TAKILIYOR' ? 'selected' : ''}>${isTimerFeatureEnabled ? '⏱️ 3. Kateter Hazırlığı (45 dk)' : '⏱️ 3. Kateter Hazırlığı'}</option>
              <option value="BAGLANDI" ${currentStatusVal === 'BAGLANDI' ? 'selected' : ''}>${isTimerFeatureEnabled ? '🔌 4. Diyalize Bağla (3 saat)' : '🔌 4. Diyalize Bağla'}</option>
              <option value="YAKINI_CAGRILIYOR" ${currentStatusVal === 'YAKINI_CAGRILIYOR' ? 'selected' : ''}>ℹ️ 5. Danışma / Yakını Çağrısı</option>
              <option value="YARIDA_KALDI" ${currentStatusVal === 'YARIDA_KALDI' ? 'selected' : ''}>📋 6. Hekim Kararıyla Erken Durdurma</option>
              <option value="AYRILDI" ${currentStatusVal === 'AYRILDI' ? 'selected' : ''}>🩺 7. Seans Sonu / Dinlenme & Tansiyon Kontrolü</option>
              <option value="TABURCU" ${currentStatusVal === 'TABURCU' ? 'selected' : ''}>✅ 8. Seans Tamamlandı / Taburcu</option>
            </select>
            <div class="select-chevron">
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </div>
          </div>

          <button type="button" class="btn-save-status ${btnClass}" id="btn-save-${patient.seansId}" onclick="savePatientStatusChange('${patient.seansId}')" title="Durumu Kaydet">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span>Kaydet</span>
          </button>
        </div>
      </div>
    </div>
    `;
  }).join('');
}

// Dropdown seçimi değiştiğinde: OTOMATİK KAYDETMEZ! Kaydet butonunu KIRMIZI yapar
function onStatusDropdownChange(seansId) {
  const selectEl = document.getElementById(`sel-status-${seansId}`);
  if (!selectEl) return;
  const chosenStatus = selectEl.value;

  // Kaydedilmedi olarak işaretle
  unsavedPatientStatusIds.add(String(seansId));
  pendingPatientStatuses[String(seansId)] = chosenStatus;

  // Kaydet butonunun rengini KIRMIZI yap (btn-status-unsaved)
  const btn = document.getElementById(`btn-save-${seansId}`);
  if (btn) {
    btn.classList.remove('btn-status-saved');
    btn.classList.add('btn-status-unsaved');
  }

  // Solundaki kategori rozetini anında önizleme olarak güncelle
  const catInfo = getCategoryInfoForStatus(chosenStatus);
  const badgeEl = document.getElementById(`cat-badge-${seansId}`);
  if (badgeEl) {
    badgeEl.className = `patient-category-badge ${catInfo.className}`;
    badgeEl.textContent = catInfo.label;
  }
}

// "KAYDET" butonuna tıklandığında: Seçilen durumu TV ekranına ve sisteme kaydeder, butonu YEŞİL yapar
function savePatientStatusChange(seansId) {
  if (!isSecretaryLoggedIn) {
    openLoginModal();
    return;
  }

  const selectEl = document.getElementById(`sel-status-${seansId}`);
  const chosenStatus = (selectEl && selectEl.value) || pendingPatientStatuses[String(seansId)];
  if (!chosenStatus) return;

  // Kaydedildi: Kırmızı durumu kaldır, YEŞİL yap
  unsavedPatientStatusIds.delete(String(seansId));
  delete pendingPatientStatuses[String(seansId)];

  const btn = document.getElementById(`btn-save-${seansId}`);
  if (btn) {
    btn.classList.remove('btn-status-unsaved');
    btn.classList.add('btn-status-saved');
  }

  // Rozeti de anında senkronize et
  const catInfo = getCategoryInfoForStatus(chosenStatus);
  const badgeEl = document.getElementById(`cat-badge-${seansId}`);
  if (badgeEl) {
    badgeEl.className = `patient-category-badge ${catInfo.className}`;
    badgeEl.textContent = catInfo.label;
  }

  // Seçilen duruma göre ilgili motor fonksiyonlarını çalıştır
  switch (chosenStatus) {
    case 'BEKLEMEDE':
      setPatientStatus(seansId, 'BEKLEMEDE');
      break;
    case 'ODAYA_CAGRILDI':
      triggerCallPatientToRoom(seansId);
      break;
    case 'KATETER_TAKILIYOR':
      triggerCatheterCountdown(seansId);
      break;
    case 'BAGLANDI':
      triggerDialysisCountdown(seansId);
      break;
    case 'YAKINI_CAGRILIYOR':
      triggerCallFamily(seansId);
      break;
    case 'YARIDA_KALDI':
      triggerEarlyStopByDoctor(seansId);
      break;
    case 'AYRILDI':
      setPatientStatus(seansId, 'AYRILDI');
      break;
    case 'TABURCU':
      setPatientStatus(seansId, 'TABURCU');
      break;
    default:
      setPatientStatus(seansId, chosenStatus);
      break;
  }
}

// 1. Standart Durum Değiştirme
function setPatientStatus(seansId, statusCode) {
  const patient = activeSeansList.find(s => String(s.seansId) === String(seansId));
  if (!patient) return;

  patient.status = statusCode;
  patient.isUrgentCall = false;
  patient.isFamilyCall = false;
  patient.isAborted = false;
  patient.abortReason = '';
  patient.countdownEndsAt = null;
  patient.countdownType = null;

  if (statusCode === 'BEKLEMEDE') {
    patient.statusText = 'Bekleme Salonunda';
    patient.badgeClass = 'badge-blue';
    patient.slideGroup = 'BEKLEME';
    patient.instruction = 'Hazırlık sırası bekleniyor.';
    patient.completed_at = null;
  } else if (statusCode === 'BAGLANDI' || statusCode === 'TEDAVI_SURUYOR') {
    patient.statusText = 'Seans Devam Ediyor';
    patient.badgeClass = 'badge-purple';
    patient.slideGroup = 'DIYALIZ';
    patient.instruction = '';
    patient.completed_at = null;
  } else if (statusCode === 'AYRILDI') {
    patient.statusText = 'Dinlenme / Gözlem';
    patient.badgeClass = 'badge-teal';
    patient.slideGroup = 'CIKIS';
    patient.instruction = 'Seans tamamlanmıştır. Hastamız dinlenme alanında tansiyon takibindedir.';
    // 7. Seans Sonu / Dinlenme (2 dakika sonra listeden silinir)
    patient.completed_at = new Date().toISOString();
  } else if (statusCode === 'TABURCU') {
    patient.statusText = 'Seans Tamamlandı';
    patient.badgeClass = 'badge-green';
    patient.slideGroup = 'CIKIS';
    patient.instruction = 'Bugünkü tedavi başarıyla tamamlanmıştır.';
    // 8. Seans Tamamlandı / Taburcu (2 dakika sonra listeden silinir)
    patient.completed_at = new Date().toISOString();
  } else if (statusCode === 'YARIDA_KALDI') {
    patient.statusText = 'Hekim Kararıyla Erken Durdurma';
    patient.badgeClass = 'badge-soft-amber';
    patient.slideGroup = 'CIKIS';
    patient.instruction = 'Hekim değerlendirmesi neticesinde bugünkü seans tamamlanmıştır.';
    // 6. Hekim Kararıyla Erken Durdurma (2 dakika sonra listeden silinir)
    patient.completed_at = new Date().toISOString();
  } else {
    patient.slideGroup = 'BEKLEME';
    patient.completed_at = null;
  }

  // Durum değişikliğini kalıcı hafızaya ve SQLite'a yansıt
  ORACLE_RAW_DATABASE = loadMasterRoster().map(r => {
    if (String(r.HASTASEANSREFNO) === String(seansId) || String(r.HASTANO) === String(patient.tcNo)) {
      return {
        ...r,
        STATU: statusCode,
        completed_at: patient.completed_at,
        COUNTDOWN_ENDS_AT: null
      };
    }
    return r;
  });
  saveMasterRoster(ORACLE_RAW_DATABASE);

  renderSecretaryPanel(true);
  renderTvSlides();
  const targetSlide = (patient.slideGroup === 'CIKIS') ? 2 : (patient.slideGroup === 'DIYALIZ' ? 1 : 0);
  goToSlide(targetSlide);
  showToast(`${patient.maskedName} durumu güncellendi.`);

  broadcastSyncState({
    targetSlideIndex: targetSlide,
    toastMessage: `🔄 ${patient.maskedName}: ${patient.statusText}`
  });

  // REST API ile sekreter ekranından TV Display'e veri gönder
  syncPatientChangeToApi({
    HASTASEANSREFNO: patient.seansId,
    STATU: statusCode,
    completed_at: patient.completed_at,
    PRESENCE: patient.presence || 'GELDI'
  });
}

// 2. Odaya Çağrı (Hazırlık Odasına Geçiş Süreci - Süre bitince otomatik sonraki aşamaya geçer)
function triggerCallPatientToRoom(seansId) {
  const patient = activeSeansList.find(s => String(s.seansId) === String(seansId));
  if (!patient) return;

  patient.status = 'ODAYA_CAGRILDI';
  patient.statusText = 'Hazırlık Odasına Geçiniz';
  patient.badgeClass = 'badge-blue';
  patient.slideGroup = 'BEKLEME';
  patient.isUrgentCall = true;
  patient.isFamilyCall = false;
  patient.isAborted = false;
  patient.abortReason = '';
  // Muayene / Tartı & Ön Hazırlık çağrısı için otomatik 3 dakikalık intikal ve hazırlık süresi
  patient.countdownEndsAt = new Date(Date.now() + 3 * 60 * 1000);
  patient.countdownType = 'HAZIRLIK';
  patient.instruction = 'Lütfen Diyaliz Hazırlık Odasına Geçiniz (Tartı ve Ön Kontrol).';

  ORACLE_RAW_DATABASE = loadMasterRoster().map(r => {
    if (String(r.HASTASEANSREFNO) === String(seansId) || String(r.HASTANO) === String(patient.tcNo)) {
      return {
        ...r,
        STATU: 'ODAYA_CAGRILDI',
        COUNTDOWN_ENDS_AT: patient.countdownEndsAt.toISOString()
      };
    }
    return r;
  });
  saveMasterRoster(ORACLE_RAW_DATABASE);

  goToSlide(0);

  // SADECE ZARİF BİR ZİL ÇALAR
  playGentleChime();

  const tickerMsg = `Bilgilendirme: ${patient.maskedName} hazırlık için davet edildi.`;
  renderSecretaryPanel(true);
  renderTvSlides();
  // Alt bantta duyuru gösterilmez
  showToast(`🔔 ${patient.maskedName} odaya çağrıldı (Ön hazırlık süresi başladı).`);

  broadcastSyncState({
    targetSlideIndex: 0,
    tickerMessage: tickerMsg,
    playChime: true,
    toastMessage: `🔔 ${patient.maskedName} hazırlık odasına çağrıldı.`
  });

  syncPatientChangeToApi({
    HASTASEANSREFNO: patient.seansId,
    STATU: 'ODAYA_CAGRILDI',
    PRESENCE: patient.presence || 'GELDI'
  });
}

// 3. Kateter Takılıyor (45 Dakika - Süre açıkken süre bitince otomatik 3 saat diyaliz seansına geçer)
function triggerCatheterCountdown(seansId) {
  const patient = activeSeansList.find(s => String(s.seansId) === String(seansId));
  if (!patient) return;

  patient.status = 'KATETER_TAKILIYOR';
  patient.statusText = isTimerFeatureEnabled ? 'Kateter Hazırlığı (45 dk)' : 'Kateter Hazırlığı';
  patient.badgeClass = 'badge-teal';
  patient.slideGroup = 'BEKLEME';
  patient.instruction = '';
  patient.countdownEndsAt = new Date(Date.now() + 45 * 60 * 1000);
  patient.countdownType = 'KATETER';
  patient.isUrgentCall = false;
  patient.isFamilyCall = false;
  patient.isAborted = false;
  patient.abortReason = '';

  ORACLE_RAW_DATABASE = loadMasterRoster().map(r => {
    if (String(r.HASTASEANSREFNO) === String(seansId) || String(r.HASTANO) === String(patient.tcNo)) {
      return { ...r, STATU: 'KATETER_TAKILIYOR', COUNTDOWN_ENDS_AT: patient.countdownEndsAt.toISOString() };
    }
    return r;
  });
  saveMasterRoster(ORACLE_RAW_DATABASE);

  goToSlide(0);
  renderSecretaryPanel(true);
  renderTvSlides();
  showToast(isTimerFeatureEnabled
    ? `⏳ ${patient.maskedName} için 45 dakikalık kateter hazırlığı başladı.`
    : `⏳ ${patient.maskedName} için kateter hazırlığı başladı.`);

  broadcastSyncState({
    targetSlideIndex: 0,
    toastMessage: isTimerFeatureEnabled
      ? `⏳ ${patient.maskedName} kateter hazırlığı başladı (45 dk).`
      : `⏳ ${patient.maskedName} kateter hazırlığı başladı.`
  });

  syncPatientChangeToApi({
    HASTASEANSREFNO: patient.seansId,
    STATU: 'KATETER_TAKILIYOR',
    PRESENCE: patient.presence || 'GELDI'
  });
}

// 4. Makineye Bağlandı (Her Hasta İçin Standart 3 Saat = 180 Dk; Süre açıkken bitince Seans Tamamlandı aşamasına geçer)
function triggerDialysisCountdown(seansId) {
  const patient = activeSeansList.find(s => String(s.seansId) === String(seansId));
  if (!patient) return;

  const durationMinutes = STANDART_DIYALIZ_SURESI_DK; // 180 dk (3 saat)
  patient.plannedDurationMinutes = durationMinutes;
  patient.status = 'BAGLANDI';
  patient.statusText = 'Seans Devam Ediyor';
  patient.badgeClass = 'badge-purple';
  patient.slideGroup = 'DIYALIZ';
  patient.instruction = '';
  patient.countdownEndsAt = new Date(Date.now() + durationMinutes * 60 * 1000);
  patient.countdownType = 'DIYALIZ';
  patient.isUrgentCall = false;
  patient.isFamilyCall = false;
  patient.isAborted = false;

  ORACLE_RAW_DATABASE = loadMasterRoster().map(r => {
    if (String(r.HASTASEANSREFNO) === String(seansId) || String(r.HASTANO) === String(patient.tcNo)) {
      return {
        ...r,
        STATU: 'BAGLANDI',
        SURE: durationMinutes,
        COUNTDOWN_ENDS_AT: patient.countdownEndsAt.toISOString()
      };
    }
    return r;
  });
  saveMasterRoster(ORACLE_RAW_DATABASE);

  goToSlide(1);
  renderSecretaryPanel(true);
  renderTvSlides();
  showToast(isTimerFeatureEnabled
    ? `🔌 ${patient.maskedName} diyalize bağlandı (3 saat).`
    : `🔌 ${patient.maskedName} diyalize bağlandı.`);

  broadcastSyncState({
    targetSlideIndex: 1,
    toastMessage: isTimerFeatureEnabled
      ? `🔌 ${patient.maskedName} diyalize bağlandı (3 saat).`
      : `🔌 ${patient.maskedName} diyalize bağlandı.`
  });

  syncPatientChangeToApi({
    HASTASEANSREFNO: patient.seansId,
    STATU: 'BAGLANDI',
    PRESENCE: patient.presence || 'GELDI',
    SURE: durationMinutes
  });
}

// 5. Danışma / Hasta Yakını Çağrısı (Dikkat Çekici Renk + Belirgin 3 Tonlu Çağrı Zili)
function triggerCallFamily(seansId) {
  const patient = activeSeansList.find(s => String(s.seansId) === String(seansId));
  if (!patient) return;

  patient.status = 'YAKINI_CAGRILIYOR';
  patient.statusText = '🔔 Hasta Yakını Çağrısı (Danışma)';
  patient.badgeClass = 'badge-family-call';
  patient.slideGroup = 'BEKLEME';
  patient.isFamilyCall = true;
  patient.isUrgentCall = false;
  patient.isAborted = false;
  patient.instruction = `🔔 DİKKAT: ${patient.maskedName} Hasta Yakınının Danışmaya Uğraması Rica Olunur.`;

  ORACLE_RAW_DATABASE = loadMasterRoster().map(r => {
    if (String(r.HASTASEANSREFNO) === String(seansId) || String(r.HASTANO) === String(patient.tcNo)) {
      return {
        ...r,
        STATU: 'YAKINI_CAGRILIYOR'
      };
    }
    return r;
  });
  saveMasterRoster(ORACLE_RAW_DATABASE);

  goToSlide(0);

  // HASTA YAKINI ÇAĞRISINA ÖZEL BELİRGİN 3 TONLU BİLDİRİM ZİLİ ÇALAR
  playFamilyCallChime();

  const tickerMsg = `🔔 DANIŞMA ÇAĞRISI: ${patient.maskedName} hasta yakınının danışmaya uğraması rica olunur.`;
  renderSecretaryPanel(true);
  renderTvSlides();
  // Alt bantta duyuru gösterilmez
  showToast(`🔔 ${patient.maskedName} hasta yakını danışmaya çağrıldı (Sesli bildirim çalındı).`);

  broadcastSyncState({
    targetSlideIndex: 0,
    tickerMessage: tickerMsg,
    playChime: true,
    playFamilyChime: true,
    toastMessage: `🔔 ${patient.maskedName} yakını danışmaya davet edildi.`
  });

  syncPatientChangeToApi({
    HASTASEANSREFNO: patient.seansId,
    STATU: 'YAKINI_CAGRILIYOR',
    PRESENCE: patient.presence || 'GELDI'
  });
}

// 6. Hekim Kararıyla Erken Durdurma (KVKK Uyumlu: Neden Sorulmaz ve TV'de Tıbbi Gerekçe Gösterilmez)
function triggerEarlyStopByDoctor(seansId) {
  const patient = activeSeansList.find(s => String(s.seansId) === String(seansId));
  if (!patient) return;

  patient.status = 'YARIDA_KALDI';
  patient.statusText = 'Hekim Kararıyla Erken Durdurma';
  patient.badgeClass = 'badge-soft-amber';
  patient.slideGroup = 'CIKIS';
  patient.isAborted = true;
  patient.isUrgentCall = false;
  patient.isFamilyCall = false;
  patient.instruction = 'Hekim değerlendirmesi neticesinde bugünkü seans tamamlanmıştır.';
  patient.countdownEndsAt = null;
  patient.countdownType = null;
  // 6. Hekim Kararıyla Erken Durdurma (2 dakika sonra listeden silinir)
  patient.completed_at = new Date().toISOString();

  ORACLE_RAW_DATABASE = loadMasterRoster().map(r => {
    if (String(r.HASTASEANSREFNO) === String(seansId) || String(r.HASTANO) === String(patient.tcNo)) {
      return {
        ...r,
        STATU: 'YARIDA_KALDI',
        completed_at: patient.completed_at,
        COUNTDOWN_ENDS_AT: null
      };
    }
    return r;
  });
  saveMasterRoster(ORACLE_RAW_DATABASE);

  goToSlide(2);
  renderSecretaryPanel(true);
  renderTvSlides();

  const tickerMsg = `Bilgilendirme: ${patient.maskedName} bugünkü seansı hekim kontrolünde tamamlanmıştır.`;
  // Alt bantta duyuru gösterilmez
  showToast(`📋 ${patient.maskedName}: Hekim kararıyla erken durdurma uygulandı.`);

  broadcastSyncState({
    targetSlideIndex: 2,
    tickerMessage: tickerMsg,
    toastMessage: `📋 ${patient.maskedName}: Hekim kararıyla erken durdurma`
  });

  syncPatientChangeToApi({
    HASTASEANSREFNO: patient.seansId,
    STATU: 'YARIDA_KALDI',
    completed_at: patient.completed_at,
    PRESENCE: patient.presence || 'GELDI'
  });
}

// 7. Sekreter Yetkisiyle Diyaliz Süresini Uzatma / Değiştirme (+15 dk, +30 dk, +60 dk, -15 dk)
function extendPatientSessionTime(seansId, deltaMinutes) {
  if (!isSecretaryLoggedIn) {
    openLoginModal();
    return;
  }

  const patient = activeSeansList.find(s => String(s.seansId) === String(seansId));
  if (!patient) return;

  const deltaMs = deltaMinutes * 60 * 1000;

  if (patient.countdownEndsAt) {
    // Aktif geri sayım varsa bitiş saatini doğrudan uzat/kısalt (En az 5 dk kalsın)
    const currentEndMs = new Date(patient.countdownEndsAt).getTime();
    const minEndMs = Date.now() + 5 * 60 * 1000;
    const newEndMs = Math.max(minEndMs, currentEndMs + deltaMs);
    patient.countdownEndsAt = new Date(newEndMs);

    if (patient.countdownType === 'DIYALIZ') {
      const remainingMin = Math.max(60, Math.round((newEndMs - Date.now()) / (60 * 1000)));
      patient.plannedDurationMinutes = remainingMin;
    }
  } else {
    // Henüz seans başlamadıysa planlanan diyaliz süresini güncelle (En az 60 dk, en fazla 360 dk)
    const currentPlanned = (Number(patient.plannedDurationMinutes) && Number(patient.plannedDurationMinutes) >= 60)
      ? Number(patient.plannedDurationMinutes)
      : STANDART_DIYALIZ_SURESI_DK;
    patient.plannedDurationMinutes = Math.min(360, Math.max(60, currentPlanned + deltaMinutes));
  }

  // Kalıcı veritabanı kaydındaki SURE ve COUNTDOWN_ENDS_AT alanlarını da güncelle
  ORACLE_RAW_DATABASE = loadMasterRoster().map(r => {
    if (String(r.HASTASEANSREFNO) === String(seansId) || String(r.HASTANO) === String(patient.tcNo)) {
      return {
        ...r,
        SURE: patient.plannedDurationMinutes,
        COUNTDOWN_ENDS_AT: patient.countdownEndsAt ? patient.countdownEndsAt.toISOString() : null
      };
    }
    return r;
  });
  saveMasterRoster(ORACLE_RAW_DATABASE);

  const estEnd = patient.countdownEndsAt ? formatEstimatedEndTime(patient.countdownEndsAt) : null;
  const signLabel = deltaMinutes > 0 ? `+${deltaMinutes} dk uzatıldı` : `${deltaMinutes} dk kısaltıldı`;

  renderSecretaryPanel(true);
  renderTvSlides();

  showToast(`⏱️ ${patient.maskedName}: Seans süresi ${signLabel}${estEnd ? ` (Yeni Tahmini Bitiş: ${estEnd})` : ` (Yeni Süre: ${formatDurationLabel(patient.plannedDurationMinutes)})`}.`);

  broadcastSyncState({
    toastMessage: `⏱️ ${patient.maskedName} seans süresi güncellendi${estEnd ? ` • Tahmini Bitiş: ${estEnd}` : ''}`
  });

  syncPatientChangeToApi({
    HASTASEANSREFNO: patient.seansId,
    STATU: patient.status,
    SURE: patient.plannedDurationMinutes
  });
}

// YARDIMCI BİLEŞENLER
const DEFAULT_PERMANENT_TICKER_TEXT = "Bilgilendirme: Ekrandaki süreler tahmini diyaliz süresi olup; seans bitiminde tansiyon takibi, pansuman ve dinlenme işlemleri nedeniyle çıkışlar 10-15 dakika sürebilmektedir. Diyaliz süresi yaklaşık olarak 3 saat sürmektedir . Hastalarımız sağlık personeli gözetimindedir.";
let tickerRestoreTimeout = null;

// ----------------------------------------------------------------------------
// FONKSİYON: updateTickerMessage()
// AMAÇ: TV alt bilgi kayan yazı şeridini (marquee ticker) standart kurumsal bilgilendirme metniyle kilitli tutmak.
// ----------------------------------------------------------------------------
function updateTickerMessage(msg, isPermanent = false) {
  const ticker = document.getElementById('tv-ticker-text');
  if (!ticker) return;

  if (tickerRestoreTimeout) {
    clearTimeout(tickerRestoreTimeout);
    tickerRestoreTimeout = null;
  }

  // Kullanıcı talebi: Aşağıdaki bantta SADECE standart bilgilendirme yazısı gösterilir. Herhangi bir duyuru, çağrı veya anons altta yer almaz.
  ticker.textContent = DEFAULT_PERMANENT_TICKER_TEXT;
}

// ----------------------------------------------------------------------------
// FONKSİYON: showToast()
// AMAÇ: Ekran köşesinde kısa süreli, kendiliğinden kaybolan bildirim mesajı (toast) göstermek.
// ----------------------------------------------------------------------------
function showToast(text) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = text;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3200);
}

// ----------------------------------------------------------------------------
// FONKSİYON: startClock()
// AMAÇ: Üst bilgi çubuğundaki canlı dijital saat ve tarih göstergesini her saniye güncelleyecek zamanlayıcıyı başlatmak.
// ----------------------------------------------------------------------------
function startClock() {
  const timeEl = document.getElementById('live-time');
  const dateEl = document.getElementById('live-date');
  // ----------------------------------------------------------------------------
  // FONKSİYON: tick()
  // AMAÇ: Canlı saat (HH:MM:SS) ve Türkçe tam tarih metnini anlık olarak DOM elemanlarına yazmak.
  // ----------------------------------------------------------------------------
  function tick() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();

    if (timeEl) timeEl.textContent = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    if (dateEl) dateEl.textContent = now.toLocaleDateString('tr-TR', { weekday: 'short', month: 'long', day: 'numeric' });

    // Saat tam yeni güne başlayan 00:00:00 olduğunda veya takvim günü değiştiğinde anında yeni günün listesini yükle
    const todayIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    if (todayIso !== lastCalendarAutoCheckDate || (hours === 0 && minutes === 0 && seconds === 0)) {
      if (lastMidnightTriggerDate !== todayIso) {
        triggerMidnightDateTransition(todayIso);
      }
    }
  }
  tick();
  setInterval(tick, 1000);
}

// ============================================================================
// KULLANICI GİRİŞİ, HESAP YÖNETİMİ & OTURUM YÖNETİMİ (ADMIN & SEKRETER)
// ============================================================================
let isSecretaryLoggedIn = false;
let currentSecretaryUser = null;
let currentMainView = 'patients'; // 'patients' | 'account'

// Çevrimdışı / Yerel Yedek Kullanıcı Doğrulaması
const DEFAULT_FALLBACK_USERS = [
  { id: 1, username: 'admin', password: '1234', fullName: 'Sistem Yöneticisi', role: 'ADMIN', createdAt: new Date().toISOString() },
  { id: 2, username: 'sekreter', password: '1234', fullName: 'Özgül Bedge', role: 'SEKRETER', createdAt: new Date().toISOString() },
  { id: 3, username: 'hemsire', password: '1234', fullName: 'Nöbetçi Hemşire', role: 'HEMSIRE', createdAt: new Date().toISOString() }
];

// ----------------------------------------------------------------------------
// FONKSİYON: normalizeUserRole()
// AMAÇ: Kullanıcı nesnesindeki rol bilgisini (ADMIN, HEMSIRE, SEKRETER) tutarlı standart koda normalize etmek.
// ----------------------------------------------------------------------------
function normalizeUserRole(userObj) {
  if (!userObj) return 'SEKRETER';
  const rawRole = String(userObj.role || userObj.ROL || '').trim().toUpperCase();
  const uName = String(userObj.username || userObj.KULLANICI_ADI || '').trim().toLocaleLowerCase('tr-TR');
  const fName = String(userObj.fullName || userObj.AD_SOYAD || '').trim().toLocaleLowerCase('tr-TR');

  if (rawRole === 'ADMIN' || rawRole === 'ROLE_ADMIN' || rawRole === 'YONETICI' || rawRole === 'YÖNETİCİ' || uName === 'admin') {
    return 'ADMIN';
  }
  if (
    rawRole === 'HEMSIRE' ||
    rawRole === 'HEMŞİRE' ||
    rawRole === 'ROLE_HEMSIRE' ||
    uName.includes('hemsire') ||
    uName.includes('hemşire') ||
    fName.includes('hemşire') ||
    fName.includes('hemsire')
  ) {
    return 'HEMSIRE';
  }
  return 'SEKRETER';
}

// ----------------------------------------------------------------------------
// FONKSİYON: getRoleDisplayLabel()
// AMAÇ: Rol kodunu arayüzde gösterilecek Türkçe unvana (Sistem Yöneticisi / Nöbetçi Hemşire / Sekreter) çevirmek.
// ----------------------------------------------------------------------------
function getRoleDisplayLabel(roleCode) {
  if (roleCode === 'ADMIN') return 'Yönetici (Admin)';
  if (roleCode === 'HEMSIRE') return 'Hemşire';
  return 'Sekreter';
}

const USER_DELETE_RESET_PERMS_STORAGE_KEY = 'diyaliz_user_delete_reset_perms_v1';

// ----------------------------------------------------------------------------
// FONKSİYON: getLocalDeleteResetPermissionsMap()
// AMAÇ: Tarayıcı önbelleğindeki yerel silme/sıfırlama delegasyon yetki haritasını okumak.
// ----------------------------------------------------------------------------
function getLocalDeleteResetPermissionsMap() {
  try {
    const raw = localStorage.getItem(USER_DELETE_RESET_PERMS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) { }
  return { admin: true };
}

// ----------------------------------------------------------------------------
// FONKSİYON: saveLocalDeleteResetPermissionsMap()
// AMAÇ: Admin tarafından güncellenen kullanıcı silme/sıfırlama delegasyon haritasını yerel önbelleğe kaydetmek.
// ----------------------------------------------------------------------------
function saveLocalDeleteResetPermissionsMap(mapObj) {
  try {
    localStorage.setItem(USER_DELETE_RESET_PERMS_STORAGE_KEY, JSON.stringify(mapObj || { admin: true }));
  } catch (e) { }
}

// ----------------------------------------------------------------------------
// FONKSİYON: doesUserHaveDeleteResetPermission()
// AMAÇ: Verilen kullanıcının kalıcı hasta silme ve varsayılan 17 hastaya sıfırlama yetkisine sahip olup olmadığını denetlemek.
// ----------------------------------------------------------------------------
function doesUserHaveDeleteResetPermission(userObj) {
  if (!userObj) return false;
  const roleType = normalizeUserRole(userObj);
  if (roleType === 'ADMIN') return true;
  const uName = String(userObj.username || userObj.KULLANICI_ADI || '').trim().toLocaleLowerCase('tr-TR');
  const localMap = getLocalDeleteResetPermissionsMap();
  if (uName && Object.prototype.hasOwnProperty.call(localMap, uName)) {
    return Boolean(localMap[uName]);
  }
  return Boolean(userObj.canDeleteAndReset === true || Number(userObj.SILME_SIFIRLAMA_YETKISI) === 1);
}

// ----------------------------------------------------------------------------
// FONKSİYON: canCurrentUserDeleteAndReset()
// AMAÇ: O an oturumu açık olan personelin kalıcı silme/sıfırlama yetkisi taşıyıp taşımadığını döndürmek.
// ----------------------------------------------------------------------------
function canCurrentUserDeleteAndReset() {
  if (!isSecretaryLoggedIn || !currentSecretaryUser) return false;
  return doesUserHaveDeleteResetPermission(currentSecretaryUser);
}

// ----------------------------------------------------------------------------
// FONKSİYON: updateDeleteResetPermissionUI()
// AMAÇ: Kalıcı Silme Kilidi ve Varsayılan 17 Hasta butonlarını yalnızca yetkili kullanıcılar için görünür kılmak.
// ----------------------------------------------------------------------------
function updateDeleteResetPermissionUI() {
  const canUseDangerControls = canCurrentUserDeleteAndReset();
  const dangerContainer = document.getElementById('schedule-danger-controls');
  if (dangerContainer) {
    dangerContainer.style.display = canUseDangerControls ? 'flex' : 'none';
  }
  if (!canUseDangerControls) {
    isDeleteSafetyUnlocked = false;
    const chk = document.getElementById('chk-unlock-delete');
    if (chk) chk.checked = false;
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: refreshCurrentUserPermissionsFromApi()
// AMAÇ: /api/auth/me uç noktasından aktif kullanıcının en güncel rol ve delegasyon yetkilerini sunucudan doğrulamak.
// ----------------------------------------------------------------------------
async function refreshCurrentUserPermissionsFromApi() {
  if (!isSecretaryLoggedIn || !currentSecretaryUser) return;
  try {
    const res = await fetch(resolveApiUrl('/api/kullanicilar'), {
      headers: getAuthHeaders(),
      cache: 'no-store'
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.success && Array.isArray(data.users)) {
      const permMap = getLocalDeleteResetPermissionsMap();
      data.users.forEach(u => {
        const uKey = String(u.KULLANICI_ADI || u.username || '').trim().toLocaleLowerCase('tr-TR');
        if (uKey) {
          permMap[uKey] = Boolean(normalizeUserRole(u) === 'ADMIN' || u.canDeleteAndReset === true || Number(u.SILME_SIFIRLAMA_YETKISI) === 1);
        }
      });
      saveLocalDeleteResetPermissionsMap(permMap);

      const curKey = String(currentSecretaryUser.username || '').trim().toLocaleLowerCase('tr-TR');
      if (curKey && Object.prototype.hasOwnProperty.call(permMap, curKey)) {
        currentSecretaryUser.canDeleteAndReset = Boolean(permMap[curKey]);
        currentSecretaryUser.SILME_SIFIRLAMA_YETKISI = permMap[curKey] ? 1 : 0;
        localStorage.setItem('diyaliz_logged_user', JSON.stringify(currentSecretaryUser));
      }
      updateDeleteResetPermissionUI();
      if (currentMainView === 'schedule') {
        renderDeletePatientModalList();
      }
    }
  } catch (e) { }
}

let sessionHeartbeatTimer = null;

// ----------------------------------------------------------------------------
// FONKSİYON: startSessionHeartbeat()
// AMAÇ: Sekreter sekmesi açıkken her 15 saniyede bir /api/auth/heartbeat göndererek oturumu canlı tutmak.
// NEDEN?: Tarayıcı kapatıldığında 60 sn içinde oturum düşer ve TV ekranı otomatik Güvenli Bekleme Moduna geçer.
// ----------------------------------------------------------------------------
function startSessionHeartbeat() {
  if (sessionHeartbeatTimer) clearInterval(sessionHeartbeatTimer);
  if (isDisplayScreenMode()) return; // TV Bekleme ekranı heartbeat göndermez, pasif alıcıdır.

  const sendHeartbeat = async () => {
    const token = localStorage.getItem('diyaliz_auth_token');
    if (!token || !isSecretaryLoggedIn) {
      stopSessionHeartbeat();
      return;
    }
    if (token.startsWith('offline_token_')) return;

    try {
      const res = await fetch(resolveApiUrl('/api/auth/heartbeat'), {
        method: 'POST',
        headers: getAuthHeaders(),
        cache: 'no-store'
      });
      if (res.status === 401) {
        logoutSecretary();
      }
    } catch (_) { }
  };

  sendHeartbeat();
  sessionHeartbeatTimer = setInterval(sendHeartbeat, 15000);
}

// ----------------------------------------------------------------------------
// FONKSİYON: stopSessionHeartbeat()
// AMAÇ: Çıkış yapıldığında veya oturum düştüğünde 15 saniyelik heartbeat zamanlayıcısını durdurmak.
// ----------------------------------------------------------------------------
function stopSessionHeartbeat() {
  if (sessionHeartbeatTimer) {
    clearInterval(sessionHeartbeatTimer);
    sessionHeartbeatTimer = null;
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: checkAuthStatus()
// AMAÇ: Sayfa yüklendiğinde mevcut token'ın sunucuda hâlâ geçerli olup olmadığını kontrol edip oturumu geri yüklemek.
// ----------------------------------------------------------------------------
function checkAuthStatus() {
  const savedUser = localStorage.getItem('diyaliz_logged_user');
  const savedToken = localStorage.getItem('diyaliz_auth_token');
  if (savedUser && savedToken) {
    try {
      const userObj = JSON.parse(savedUser);
      if (userObj && userObj.username) {
        userObj.role = normalizeUserRole(userObj);
        isSecretaryLoggedIn = true;
        currentSecretaryUser = userObj;
        localStorage.setItem('diyaliz_logged_user', JSON.stringify(userObj));
        refreshCurrentUserPermissionsFromApi();
        startSessionHeartbeat();

        // Arka planda sunucu oturumunu doğrula
        fetch(resolveApiUrl('/api/auth/me'), { headers: getAuthHeaders(), cache: 'no-store' })
          .then(r => r.json())
          .then(d => {
            if (!d || !d.authenticated) {
              const isTvScreen = (window.location.pathname.includes('display.html') || document.body.getAttribute('data-screen-mode') === 'display');
              if (!isTvScreen) {
                const curTok = localStorage.getItem('diyaliz_auth_token') || '';
                if (!curTok.startsWith('offline_token_')) {
                  isSecretaryLoggedIn = false;
                  currentSecretaryUser = null;
                  stopSessionHeartbeat();
                  localStorage.removeItem('diyaliz_auth_token');
                  localStorage.removeItem('diyaliz_logged_user');
                  localStorage.removeItem('diyaliz_is_authenticated');
                  localStorage.removeItem('diyaliz_active_session');
                  updateAuthUI();
                }
              }
            } else {
              startSessionHeartbeat();
            }
          }).catch(() => { });
      } else {
        isSecretaryLoggedIn = false;
        currentSecretaryUser = null;
        stopSessionHeartbeat();
      }
    } catch (e) {
      isSecretaryLoggedIn = false;
      currentSecretaryUser = null;
      stopSessionHeartbeat();
    }
  } else {
    isSecretaryLoggedIn = false;
    currentSecretaryUser = null;
    stopSessionHeartbeat();
  }
  updateAuthUI();
}

// ----------------------------------------------------------------------------
// FONKSİYON: updateAuthUI()
// AMAÇ: Oturum durumuna ve role (Admin/Sekreter/Hemşire) göre giriş ekranı, yan menü, admin sekmeleri ve butonları güncellemek.
// ----------------------------------------------------------------------------
function updateAuthUI() {
  // Sol Kenar Çubuğu (Sidebar) Öğeleri
  const sAvatar = document.getElementById('sidebar-user-avatar');
  const sName = document.getElementById('sidebar-user-name');
  const sBadge = document.getElementById('sidebar-user-role-badge');
  const sAuthTxt = document.getElementById('txt-sidebar-auth');
  const sAuthBtn = document.getElementById('btn-sidebar-auth');

  // Eski / Üst Bar Rozetleri (Varsa)
  const badge = document.getElementById('secretary-logged-badge');
  const btnLogin = document.getElementById('btn-login-open');
  const lockOverlay = document.getElementById('secretary-lock-overlay');
  const loggedName = document.getElementById('secretary-logged-name');

  if (isSecretaryLoggedIn && currentSecretaryUser) {
    const roleType = normalizeUserRole(currentSecretaryUser);
    currentSecretaryUser.role = roleType;
    const isAdmin = roleType === 'ADMIN';
    const isNurse = roleType === 'HEMSIRE';

    if (sAvatar) {
      sAvatar.textContent = isAdmin ? '👑' : (isNurse ? '🩺' : '👤');
      sAvatar.classList.remove('admin', 'nurse');
      if (isAdmin) sAvatar.classList.add('admin');
      else if (isNurse) sAvatar.classList.add('nurse');
    }
    if (sName) sName.textContent = currentSecretaryUser.fullName || currentSecretaryUser.username;
    if (sBadge) {
      sBadge.textContent = isAdmin ? 'Yönetici (Admin)' : (isNurse ? 'Hemşire' : 'Sekreter');
      sBadge.className = `sidebar-user-role-badge ${isAdmin ? 'admin' : (isNurse ? 'nurse' : 'secretary')}`;
    }
    if (sAuthTxt) sAuthTxt.textContent = 'Güvenli Çıkış';
    if (sAuthBtn) {
      sAuthBtn.style.background = '#fef2f2';
      sAuthBtn.style.color = '#b91c1c';
      sAuthBtn.style.borderColor = '#fecaca';
    }

    if (badge) badge.style.display = 'flex';
    if (btnLogin) btnLogin.style.display = 'none';
    if (lockOverlay) lockOverlay.style.display = 'none';
    if (loggedName) {
      const icon = isAdmin ? '👑' : (isNurse ? '🩺' : '👤');
      loggedName.textContent = `${icon} ${currentSecretaryUser.fullName}`;
    }

    // Hesap Yönetimi görünümü açıksa bilgilerini doldur
    if (currentMainView === 'account') {
      loadAccountView();
    }
  } else {
    if (sAvatar) {
      sAvatar.textContent = '🔒';
      sAvatar.classList.remove('admin', 'nurse');
    }
    if (sName) sName.textContent = 'Giriş Yapılmadı';
    if (sBadge) {
      sBadge.textContent = 'Misafir';
      sBadge.className = 'sidebar-user-role-badge secretary';
    }
    if (sAuthTxt) sAuthTxt.textContent = 'Giriş Yap';
    if (sAuthBtn) {
      sAuthBtn.style.background = '#e0f2fe';
      sAuthBtn.style.color = '#0369a1';
      sAuthBtn.style.borderColor = '#7dd3fc';
    }

    if (badge) badge.style.display = 'none';
    if (btnLogin) btnLogin.style.display = 'flex';
    if (lockOverlay) lockOverlay.style.display = 'flex';
  }

  updateTimerFeatureAdminUI();
  updateDeleteResetPermissionUI();
  renderSecretaryPanel(true);
  if (currentMainView === 'schedule') {
    renderDeletePatientModalList();
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: updateTimerFeatureAdminUI()
// AMAÇ: Admin'in seans süresi gösterimini açıp kapatmasını sağlayan kontrol anahtarının görsel durumunu güncellemek.
// ----------------------------------------------------------------------------
function updateTimerFeatureAdminUI() {
  const isAdmin = Boolean(
    isSecretaryLoggedIn &&
    currentSecretaryUser &&
    normalizeUserRole(currentSecretaryUser) === 'ADMIN'
  );

  // 1. Üst bardaki tek tuşla Aç/Kapat butonu SADECE Admin girişinde görünür (Sekreter ve Hemşirede görünmez)
  const headerBtn = document.getElementById('admin-header-timer-btn');
  if (headerBtn) {
    headerBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    headerBtn.classList.toggle('active', isTimerFeatureEnabled);
    headerBtn.innerHTML = isTimerFeatureEnabled
      ? `<span>⏱️ Süre Gösterimi: Açık (Kapat)</span>`
      : `<span>⏱️ Süre Gösterimi: Kapalı (Aç)</span>`;
  }

  // 2. Hesap Yönetimi içindeki Admin kontrol kartındaki buton ve durum rozeti
  const accBadge = document.getElementById('admin-account-timer-badge');
  if (accBadge) {
    accBadge.textContent = isTimerFeatureEnabled ? 'AÇIK' : 'KAPALI';
    accBadge.className = `status-badge-mini ${isTimerFeatureEnabled ? 'badge-green' : 'badge-blue'}`;
  }

  const accBtn = document.getElementById('admin-account-timer-btn');
  if (accBtn) {
    accBtn.textContent = isTimerFeatureEnabled ? '⏱️ Süre Gösterimini Kapat' : '⏱️ Süre Gösterimini Aç';
    accBtn.style.background = isTimerFeatureEnabled
      ? 'linear-gradient(135deg, #dc2626, #b91c1c)'
      : '';
  }

  // 3. Hasta Detay modalındaki Diyaliz Seans Süresi kutusu: Süre kapalıyken gizlenir
  const durationBox = document.getElementById('detail-modal-duration-box');
  if (durationBox) {
    durationBox.style.display = isTimerFeatureEnabled ? 'block' : 'none';
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: toggleTimerFeatureByAdmin()
// AMAÇ: Admin'in tek tıkla ekrandaki kalan seans süresi sayaçlarını gizleyip gösterebilmesini sağlamak ve TV'ye yayınlamak.
// ----------------------------------------------------------------------------
function toggleTimerFeatureByAdmin() {
  const isAdmin = Boolean(
    isSecretaryLoggedIn &&
    currentSecretaryUser &&
    normalizeUserRole(currentSecretaryUser) === 'ADMIN'
  );
  if (!isAdmin) {
    showToast('⚠️ Süre gösterimini yalnızca Yönetici (Admin) açıp kapatabilir.');
    return;
  }

  isTimerFeatureEnabled = !isTimerFeatureEnabled;
  try {
    localStorage.setItem(TIMER_FEATURE_STORAGE_KEY, isTimerFeatureEnabled ? 'true' : 'false');
  } catch (e) { }

  // Mevcut aktif hastaların durum metinlerini ve geri sayımlarını yeni ayara göre senkronize et
  activeSeansList.forEach(p => {
    if (p.status === 'KATETER_TAKILIYOR') {
      p.statusText = isTimerFeatureEnabled ? 'Kateter Hazırlığı (45 dk)' : 'Kateter Hazırlığı';
      if (isTimerFeatureEnabled && (!p.countdownEndsAt || new Date(p.countdownEndsAt).getTime() <= Date.now())) {
        p.countdownEndsAt = new Date(Date.now() + 45 * 60 * 1000);
        p.countdownType = 'KATETER';
      }
    } else if (p.status === 'BAGLANDI' || p.status === 'TEDAVI_SURUYOR') {
      if (isTimerFeatureEnabled && (!p.countdownEndsAt || new Date(p.countdownEndsAt).getTime() <= Date.now())) {
        const durMin = Number(p.plannedDurationMinutes) || STANDART_DIYALIZ_SURESI_DK;
        p.countdownEndsAt = new Date(Date.now() + durMin * 60 * 1000);
        p.countdownType = 'DIYALIZ';
      }
    }
  });

  updateTimerFeatureAdminUI();
  renderSecretaryPanel(true);
  renderTvSlides();

  const statusMsg = isTimerFeatureEnabled
    ? '✅ Süre gösterimi AÇILDI (Ekranda süreler aktif).'
    : '🔒 Süre gösterimi KAPATILDI (Süreler kaldırıldı).';
  showToast(statusMsg);

  broadcastSyncState({
    toastMessage: statusMsg
  });
}

// ----------------------------------------------------------------------------
// FONKSİYON: openLoginModal()
// AMAÇ: Personel giriş (login) penceresini açmak ve kullanıcı adı kutusuna odaklanmak.
// ----------------------------------------------------------------------------
function openLoginModal() {
  const modal = document.getElementById('login-modal');
  const errBox = document.getElementById('login-error-msg');
  if (errBox) errBox.style.display = 'none';
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  }
  const inp = document.getElementById('inp-login-username');
  if (inp) setTimeout(() => inp.focus(), 150);
}

// ----------------------------------------------------------------------------
// FONKSİYON: closeLoginModal()
// AMAÇ: Personel giriş (login) penceresini kapatmak ve hata mesajlarını temizlemek.
// ----------------------------------------------------------------------------
function closeLoginModal() {
  const modal = document.getElementById('login-modal');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: handleSecretaryLogin()
// AMAÇ: Giriş formunu /api/auth/login uç noktasına göndermek, 256-bit token'ı kaydetmek, heartbeat başlatmak ve TV'yi canlı moda geçirmek.
// ----------------------------------------------------------------------------
async function handleSecretaryLogin(e) {
  e.preventDefault();
  const uInput = document.getElementById('inp-login-username').value.trim();
  const pInput = document.getElementById('inp-login-password').value.trim();
  const errBox = document.getElementById('login-error-msg');

  try {
    const res = await fetch(resolveApiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ username: uInput, password: pInput })
    });

    const data = await res.json();
    if (res.ok && data.success && data.user) {
      if (data.token) {
        localStorage.setItem('diyaliz_auth_token', data.token);
      }
      localStorage.setItem('diyaliz_is_authenticated', 'true');
      localStorage.setItem('diyaliz_active_session', 'true');
      data.user.role = normalizeUserRole(data.user);
      const uKey = String(data.user.username || '').trim().toLocaleLowerCase('tr-TR');
      if (uKey) {
        const permMap = getLocalDeleteResetPermissionsMap();
        permMap[uKey] = Boolean(data.user.role === 'ADMIN' || data.user.canDeleteAndReset === true || Number(data.user.SILME_SIFIRLAMA_YETKISI) === 1);
        saveLocalDeleteResetPermissionsMap(permMap);
        data.user.canDeleteAndReset = permMap[uKey];
      }
      isSecretaryLoggedIn = true;
      currentSecretaryUser = data.user;
      localStorage.setItem('diyaliz_logged_user', JSON.stringify(data.user));
      updateAuthUI();
      closeLoginModal();
      startSessionHeartbeat();
      checkTvScreenSessionAndSchedule();
      broadcastSyncState({ hasActiveSession: true, userLoggedIn: true });
      showToast(`🔓 Giriş Başarılı: Hoş geldiniz, ${data.user.fullName} (${getRoleDisplayLabel(data.user.role)}).`);
      executeDailyOracleQuery(true);
      return;
    } else {
      throw new Error(data.error || 'Kullanıcı adı veya şifre hatalı!');
    }
  } catch (err) {
    // API'ye ulaşılamadıysa çevrimdışı fallback kontrolü yap
    const fallbackUser = DEFAULT_FALLBACK_USERS.find(
      u => u.username.toLowerCase() === uInput.toLowerCase() && (u.password === pInput || (u.password === '1234' && (pInput === '1234' || pInput === '123456')))
    );
    if (fallbackUser) {
      fallbackUser.role = normalizeUserRole(fallbackUser);
      fallbackUser.canDeleteAndReset = doesUserHaveDeleteResetPermission(fallbackUser);
      isSecretaryLoggedIn = true;
      currentSecretaryUser = fallbackUser;
      localStorage.setItem('diyaliz_auth_token', 'offline_token_' + Date.now());
      localStorage.setItem('diyaliz_logged_user', JSON.stringify(fallbackUser));
      localStorage.setItem('diyaliz_is_authenticated', 'true');
      localStorage.setItem('diyaliz_active_session', 'true');
      updateAuthUI();
      closeLoginModal();
      checkTvScreenSessionAndSchedule();
      broadcastSyncState({ hasActiveSession: true, userLoggedIn: true });
      showToast(`🔓 Giriş Başarılı: Hoş geldiniz, ${fallbackUser.fullName} (${getRoleDisplayLabel(fallbackUser.role)}).`);
      return;
    }

    if (errBox) {
      errBox.textContent = err.message || 'Kullanıcı adı veya şifre hatalı!';
      errBox.style.display = 'block';
    }
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: logoutSecretary()
// AMAÇ: /api/auth/logout çağrısıyla sunucudaki oturumu silmek, token'ı temizlemek ve TV'yi Güvenli Bekleme Moduna döndürmek.
// ----------------------------------------------------------------------------
function logoutSecretary() {
  stopSessionHeartbeat();
  const curToken = localStorage.getItem('diyaliz_auth_token');
  if (curToken && !curToken.startsWith('offline_token_')) {
    fetch(resolveApiUrl('/api/auth/logout'), {
      method: 'POST',
      headers: getAuthHeaders()
    }).catch(() => { });
  }
  isSecretaryLoggedIn = false;
  currentSecretaryUser = null;
  serverActiveSessionState = false;
  localStorage.removeItem('diyaliz_auth_token');
  localStorage.removeItem('diyaliz_logged_user');
  localStorage.removeItem('diyaliz_is_authenticated');
  localStorage.removeItem('diyaliz_active_session');
  updateAuthUI();
  switchMainView('patients');
  checkTvScreenSessionAndSchedule();
  broadcastSyncState({ hasActiveSession: false, userLoggedOut: true });
  showToast('🔒 Oturum güvenli şekilde sonlandırıldı.');
}

// ----------------------------------------------------------------------------
// FONKSİYON: toggleSidebarAuthAction()
// AMAÇ: Kenar çubuğundaki Giriş Yap / Çıkış Yap butonunun mevcut oturum durumuna göre ilgili işlemi tetiklemesini sağlamak.
// ----------------------------------------------------------------------------
function toggleSidebarAuthAction() {
  if (isSecretaryLoggedIn) {
    logoutSecretary();
  } else {
    openLoginModal();
  }
}

// ============================================================================
// SOL MENÜDEN GÖRÜNÜM GEÇİŞİ: HASTA YÖNETİMİ, GÜN YÖNETİMİ vs HESAP YÖNETİMİ
// ============================================================================
function switchMainView(viewName) {
  currentMainView = viewName;
  const btnPatients = document.getElementById('btn-nav-patients');
  const btnSchedule = document.getElementById('btn-nav-schedule') || document.getElementById('btn-nav-days');
  const btnAccount = document.getElementById('btn-nav-account');

  const viewPatients = document.getElementById('view-patient-management');
  const viewSchedule = document.getElementById('view-schedule-management');
  const viewAccount = document.getElementById('view-account-management');

  // Buton aktiflik sınıflarını temizle
  if (btnPatients) btnPatients.classList.remove('active');
  if (btnSchedule) btnSchedule.classList.remove('active');
  if (btnAccount) btnAccount.classList.remove('active');

  // Tüm görünümleri gizle
  if (viewPatients) {
    viewPatients.classList.remove('active');
    viewPatients.style.display = 'none';
  }
  if (viewSchedule) {
    viewSchedule.classList.remove('active');
    viewSchedule.style.display = 'none';
  }
  if (viewAccount) {
    viewAccount.classList.remove('active');
    viewAccount.style.display = 'none';
  }

  if (viewName === 'schedule') {
    if (!isSecretaryLoggedIn) {
      openLoginModal();
      return;
    }
    if (btnSchedule) btnSchedule.classList.add('active');
    if (viewSchedule) {
      viewSchedule.classList.add('active');
      viewSchedule.style.display = 'flex';
    }
    renderDeletePatientModalList();
  } else if (viewName === 'account') {
    if (!isSecretaryLoggedIn) {
      openLoginModal();
      return;
    }
    if (btnAccount) btnAccount.classList.add('active');
    if (viewAccount) {
      viewAccount.classList.add('active');
      viewAccount.style.display = 'flex';
    }
    loadAccountView();
  } else {
    // 'patients' görünümü
    if (btnPatients) btnPatients.classList.add('active');
    if (viewPatients) {
      viewPatients.classList.add('active');
      viewPatients.style.display = 'flex';
    }
  }
}

// ============================================================================
// HESAP YÖNETİMİ & ADMIN KULLANICI (SEKRETER / HEMŞİRE) YÖNETİMİ FONKSİYONLARI
// ============================================================================
async function loadAccountView() {
  if (!currentSecretaryUser) return;

  const roleType = normalizeUserRole(currentSecretaryUser);
  currentSecretaryUser.role = roleType;
  const isAdmin = roleType === 'ADMIN';
  const isNurse = roleType === 'HEMSIRE';

  // Profil Bilgilerini Doldur
  const uNameEl = document.getElementById('acc-info-username');
  const fNameEl = document.getElementById('acc-info-fullname');
  const roleEl = document.getElementById('acc-info-role');
  const dateEl = document.getElementById('acc-info-date');

  if (uNameEl) uNameEl.textContent = currentSecretaryUser.username;
  if (fNameEl) fNameEl.textContent = currentSecretaryUser.fullName;
  if (roleEl) {
    if (isAdmin) {
      roleEl.innerHTML = `<span class="badge-role-admin">👑 Yönetici (Admin)</span>`;
    } else if (isNurse) {
      roleEl.innerHTML = `<span class="badge-role-nurse">🩺 Hemşire</span>`;
    } else {
      roleEl.innerHTML = `<span class="badge-role-secretary">👤 Sekreter</span>`;
    }
  }
  if (dateEl) {
    dateEl.textContent = currentSecretaryUser.createdAt
      ? new Date(currentSecretaryUser.createdAt).toLocaleDateString('tr-TR')
      : 'Kayıtlı';
  }

  // Admin ise Kullanıcı Yönetim Alanını Göster
  const adminCard = document.getElementById('admin-secretary-management-card');
  if (adminCard) {
    if (isAdmin) {
      adminCard.style.display = 'block';
      updateTimerFeatureAdminUI();
      loadSecretariesList();
      loadSystemSettings();
    } else {
      adminCard.style.display = 'none';
    }
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: loadSecretariesList()
// AMAÇ: Admin Hesap Yönetimi ekranı için /api/kullanicilar uç noktasından kayıtlı tüm personel hesaplarını çekmek.
// ----------------------------------------------------------------------------
async function loadSecretariesList() {
  const tbody = document.getElementById('secretary-table-body');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 16px;">Kullanıcılar yükleniyor...</td></tr>`;

  try {
    const res = await fetch(resolveApiUrl('/api/kullanicilar'), {
      headers: getAuthHeaders(),
      cache: 'no-store'
    });
    const data = await res.json();
    if (data.success && Array.isArray(data.users)) {
      const permMap = getLocalDeleteResetPermissionsMap();
      data.users.forEach(u => {
        const uKey = String(u.KULLANICI_ADI || u.username || '').trim().toLocaleLowerCase('tr-TR');
        if (uKey) {
          permMap[uKey] = Boolean(normalizeUserRole(u) === 'ADMIN' || u.canDeleteAndReset === true || Number(u.SILME_SIFIRLAMA_YETKISI) === 1);
        }
      });
      saveLocalDeleteResetPermissionsMap(permMap);
      renderSecretariesTable(data.users);
    } else {
      throw new Error(data.error || 'Kullanıcı listesi alınamadı.');
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #b91c1c; padding: 16px;">Bağlantı hatası: ${e.message}</td></tr>`;
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: renderSecretariesTable()
// AMAÇ: Çekilen personel hesaplarını roller, şifre değiştirme, silme ve yetki delegasyonu butonlarıyla tabloya çizmek.
// ----------------------------------------------------------------------------
function renderSecretariesTable(users) {
  const tbody = document.getElementById('secretary-table-body');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 16px;">Kayıtlı kullanıcı bulunamadı.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => {
    const uRole = normalizeUserRole(u);
    const isAdmin = uRole === 'ADMIN';
    const isNurse = uRole === 'HEMSIRE';
    const regDate = u.KAYIT_TARIHI ? new Date(u.KAYIT_TARIHI).toLocaleDateString('tr-TR') : '-';
    const hasDeleteResetPerm = doesUserHaveDeleteResetPermission(u);

    const roleBadgeClass = isAdmin
      ? 'badge-role-admin'
      : (isNurse ? 'badge-role-nurse' : 'badge-role-secretary');
    const roleBadgeLabel = isAdmin
      ? '👑 ADMIN'
      : (isNurse ? '🩺 HEMŞİRE' : '👤 SEKRETER');

    const safeUsername = String(u.KULLANICI_ADI || '').replace(/'/g, "\\'");
    const safeFullName = String(u.AD_SOYAD || '').replace(/'/g, "\\'");

    return `
      <tr>
        <td style="font-weight: 700; color: #64748b;">#${u.KULLANICI_ID}</td>
        <td style="font-weight: 800; color: #0284c7;">${u.KULLANICI_ADI}</td>
        <td style="font-weight: 700;">${u.AD_SOYAD}</td>
        <td>
          <span class="${roleBadgeClass}">
            ${roleBadgeLabel}
          </span>
        </td>
        <td>
          ${isAdmin
        ? `<span class="status-badge-mini badge-green" style="font-size: 11px;">👑 Tam Yetkili (Varsayılan)</span>`
        : `<div style="display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span class="status-badge-mini ${hasDeleteResetPerm ? 'badge-green' : 'badge-blue'}" style="font-size: 11px;">
                  ${hasDeleteResetPerm ? '✅ Yetkili' : '🔒 Yetkisiz'}
                </span>
                <button type="button" class="btn-action-small" style="font-size: 11px; padding: 4px 10px; ${hasDeleteResetPerm
          ? 'color: #c2410c; border-color: #fdba74; background: #fff7ed;'
          : 'color: #047857; border-color: #6ee7b7; background: #ecfdf5;'
        }" onclick="toggleUserDeleteResetPermission(${u.KULLANICI_ID}, '${safeUsername}', '${safeFullName}', ${!hasDeleteResetPerm})">
                  ${hasDeleteResetPerm ? '🚫 Yetkiyi Kaldır' : '🔑 Yetki Ver'}
                </button>
              </div>`
      }
        </td>
        <td style="color: #64748b; font-size: 12px;">${regDate}</td>
        <td style="text-align: right;">
          ${isAdmin
        ? `<span style="font-size: 11px; color: #94a3b8; font-style: italic;">Silinemez (Yönetici)</span>`
        : `<button type="button" class="btn-action-small" style="font-size: 11px; color: #b91c1c; border-color: #fca5a5; background: #fef2f2;" onclick="deleteSecretaryById(${u.KULLANICI_ID}, '${safeFullName}')">
                🗑️ Kullanıcıyı Sil
              </button>`
      }
        </td>
      </tr>
    `;
  }).join('');
}

// ----------------------------------------------------------------------------
// FONKSİYON: toggleUserDeleteResetPermission()
// AMAÇ: Admin'in seçili kullanıcıya kalıcı silme/sıfırlama yetkisini (/api/kullanicilar/yetki) tek tıkla vermesi veya geri alması.
// ----------------------------------------------------------------------------
async function toggleUserDeleteResetPermission(userId, username, fullName, grantPermission) {
  const isAdmin = Boolean(
    isSecretaryLoggedIn &&
    currentSecretaryUser &&
    normalizeUserRole(currentSecretaryUser) === 'ADMIN'
  );
  if (!isAdmin) {
    showToast('⚠️ Bu yetkiyi yalnızca Yönetici (Admin) değiştirebilir.');
    return;
  }

  const uKey = String(username || '').trim().toLocaleLowerCase('tr-TR');
  const permMap = getLocalDeleteResetPermissionsMap();
  if (uKey) {
    permMap[uKey] = Boolean(grantPermission);
    saveLocalDeleteResetPermissionsMap(permMap);
  }

  try {
    const res = await fetch(resolveApiUrl('/api/kullanicilar/yetki'), {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        userId,
        canDeleteAndReset: Boolean(grantPermission),
        SILME_SIFIRLAMA_YETKISI: grantPermission ? 1 : 0
      })
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Yetki güncellenemedi.');
    }
  } catch (err) {
    console.warn('Sunucu yetki güncelleme uyarısı (yerel olarak kaydedildi):', err);
  }

  const statusMsg = grantPermission
    ? `🔑 "${fullName}" kullanıcısına Kalıcı Silme & Varsayılan 17 Hasta Sıfırlama yetkisi VERİLDİ.`
    : `🔒 "${fullName}" kullanıcısının Kalıcı Silme & Varsayılan 17 Hasta Sıfırlama yetkisi KALDIRILDI.`;

  showToast(statusMsg);
  updateDeleteResetPermissionUI();
  loadSecretariesList();
  renderDeletePatientModalList();

  broadcastSyncState({
    toastMessage: statusMsg
  });
}

// ----------------------------------------------------------------------------
// FONKSİYON: handleAddSecretarySubmit()
// AMAÇ: Admin panelinden yeni sekreter/hemşire/admin hesabı oluşturma formunu doğrulayıp POST /api/kullanicilar ile kaydetmek.
// ----------------------------------------------------------------------------
async function handleAddSecretarySubmit(e) {
  e.preventDefault();
  const username = document.getElementById('inp-sec-username').value.trim();
  const fullName = document.getElementById('inp-sec-fullname').value.trim();
  const password = document.getElementById('inp-sec-password').value.trim();
  const roleEl = document.getElementById('inp-sec-role');
  const role = roleEl ? roleEl.value : 'SEKRETER';

  if (!username || !fullName || !password) {
    alert('Lütfen tüm alanları eksiksiz doldurunuz!');
    return;
  }

  // Admin yetki kontrolü
  const userRole = currentSecretaryUser ? normalizeUserRole(currentSecretaryUser) : '';
  if (userRole !== 'ADMIN') {
    alert('Yetki Engeli: Personel (Sekreter / Hemşire) ekleme işlemi yalnızca Yönetici (Admin) yetkisindedir. Lütfen "admin" hesabıyla giriş yapınız.');
    return;
  }

  const token = localStorage.getItem('diyaliz_auth_token');
  if (!token) {
    alert('Yönetici oturum anahtarınız bulunamadı. Lütfen Admin olarak çıkış yapıp tekrar giriş yapınız.');
    openLoginModal();
    return;
  }

  try {
    const res = await fetch(resolveApiUrl('/api/kullanicilar'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        username,
        kullaniciAdi: username,
        fullName,
        adSoyad: fullName,
        password,
        sifre: password,
        role,
        rol: role
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      const roleTitle = role === 'HEMSIRE' ? 'hemşire' : 'sekreter';
      showToast(`✅ Yeni ${roleTitle} "${fullName}" başarıyla eklendi.`);
      document.getElementById('form-add-secretary').reset();
      loadSecretariesList();
    } else {
      if (res.status === 401 || res.status === 403) {
        alert(data.error || 'Yetkilendirme hatası: Yönetici oturumunuzun süresi dolmuş olabilir. Lütfen tekrar giriş yapınız.');
        openLoginModal();
      } else {
        alert(data.error || 'Kullanıcı eklenirken hata oluştu.');
      }
    }
  } catch (err) {
    alert('Sunucu hatası: ' + err.message);
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: deleteSecretaryById()
// AMAÇ: Admin onayıyla seçili personel hesabını DELETE /api/kullanicilar üzerinden silmek (Admin hesabı korumalıdır).
// ----------------------------------------------------------------------------
async function deleteSecretaryById(userId, fullName) {
  const confirmed = window.confirm(`"${fullName}" isimli kullanıcı hesabını sistemden silmek istediğinize emin misiniz?`);
  if (!confirmed) return;

  try {
    const res = await fetch(resolveApiUrl(`/api/kullanicilar?id=${userId}`), {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`🗑️ Kullanıcı hesabı başarıyla silindi.`);
      loadSecretariesList();
    } else {
      alert(data.error || 'Kullanıcı silinemedi.');
    }
  } catch (err) {
    alert('Sunucu hatası: ' + err.message);
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: handleChangePassword()
// AMAÇ: Personelin kendi şifresini (veya Admin'in herhangi bir personelin şifresini) PUT /api/kullanicilar/sifre ile güncellemek.
// ----------------------------------------------------------------------------
async function handleChangePassword(e) {
  e.preventDefault();
  if (!currentSecretaryUser) return;

  const newPass = document.getElementById('inp-new-pass').value.trim();
  const newPassConfirm = document.getElementById('inp-new-pass-confirm').value.trim();

  if (newPass !== newPassConfirm) {
    alert('Girdiğiniz şifreler birbiriyle uyuşmuyor! Lütfen kontrol ediniz.');
    return;
  }
  if (newPass.length < 3) {
    alert('Şifre en az 3 karakter olmalıdır.');
    return;
  }

  try {
    const res = await fetch(resolveApiUrl('/api/kullanicilar/sifre'), {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ userId: currentSecretaryUser.id, newPassword: newPass })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('✅ Şifreniz başarıyla güncellendi.');
      document.getElementById('form-change-password').reset();
    } else {
      alert(data.error || 'Şifre güncellenemedi.');
    }
  } catch (err) {
    alert('Sunucu hatası: ' + err.message);
  }
}

// ============================================================================
// OTOMATİK BEKLEME EKRANI & ÇALIŞMA SAATLERİ YÖNETİMİ (Madde 1 & 2)
// ============================================================================
let currentSystemSettings = {
  work_start_time: '07:40',
  work_end_time: '18:00',
  work_days: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'],
  work_schedule_enabled: true
};

let serverActiveSessionState = false;

// ----------------------------------------------------------------------------
// FONKSİYON: loadSystemSettings()
// AMAÇ: Backend API'den (/api/ayarlar) çalışma saatlerini ve zamanlayıcı parametrelerini yüklemek.
// ----------------------------------------------------------------------------
async function loadSystemSettings() {
  try {
    const res = await fetch(resolveApiUrl('/api/ayarlar'), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        currentSystemSettings = {
          work_start_time: data.work_start_time || '07:40',
          work_end_time: data.work_end_time || '18:00',
          work_days: data.work_days || ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'],
          work_schedule_enabled: Boolean(data.work_schedule_enabled)
        };

        const inpStart = document.getElementById('inp-work-start');
        const inpEnd = document.getElementById('inp-work-end');
        const chkEnabled = document.getElementById('chk-schedule-enabled');
        if (inpStart) inpStart.value = currentSystemSettings.work_start_time;
        if (inpEnd) inpEnd.value = currentSystemSettings.work_end_time;
        if (chkEnabled) chkEnabled.checked = currentSystemSettings.work_schedule_enabled;

        const dayCheckboxes = document.querySelectorAll('input[name="work_day"]');
        dayCheckboxes.forEach(cb => {
          cb.checked = currentSystemSettings.work_days.includes(cb.value);
        });

        const standbyTxt = document.getElementById('tv-standby-schedule-text');
        const offdutyTxt = document.getElementById('tv-offduty-schedule-text');
        const scheduleDesc = `Çalışma Saatleri: ${currentSystemSettings.work_days.join(', ')} (${currentSystemSettings.work_start_time} - ${currentSystemSettings.work_end_time})`;
        if (standbyTxt) standbyTxt.textContent = scheduleDesc;
        if (offdutyTxt) offdutyTxt.textContent = `Hizmet Saatleri: ${currentSystemSettings.work_start_time} - ${currentSystemSettings.work_end_time}`;

        checkTvScreenSessionAndSchedule();
      }
    }
  } catch (_) { }
}

// ----------------------------------------------------------------------------
// FONKSİYON: handleSaveSystemSettings(e)
// AMAÇ: Admin panelinden girilen yeni mesai saatleri ve çalışma günlerini backend API'ye kaydetmek.
// ----------------------------------------------------------------------------
async function handleSaveSystemSettings(e) {
  if (e && e.preventDefault) e.preventDefault();
  const inpStart = document.getElementById('inp-work-start');
  const inpEnd = document.getElementById('inp-work-end');
  const chkEnabled = document.getElementById('chk-schedule-enabled');
  const dayCheckboxes = document.querySelectorAll('input[name="work_day"]:checked');

  const selectedDays = Array.from(dayCheckboxes).map(cb => cb.value);
  if (selectedDays.length === 0) {
    alert('Lütfen en az bir aktif çalışma günü seçiniz!');
    return;
  }

  const payload = {
    work_start_time: inpStart ? inpStart.value : '07:40',
    work_end_time: inpEnd ? inpEnd.value : '18:00',
    work_days: selectedDays,
    work_schedule_enabled: chkEnabled ? chkEnabled.checked : true
  };

  try {
    const res = await fetch(resolveApiUrl('/api/ayarlar'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      currentSystemSettings = payload;
      showToast('💾 Çalışma saatleri ve zamanlayıcı ayarları kaydedildi.');
      const statusEl = document.getElementById('system-settings-status');
      if (statusEl) {
        statusEl.textContent = `✅ Ayarlar güncellendi (${new Date().toLocaleTimeString('tr-TR')})`;
      }
      loadSystemSettings();
      broadcastSyncState({
        settings: payload,
        toastMessage: '⏰ Çalışma saatleri güncellendi.'
      });
    } else {
      alert(data.error || 'Ayarlar kaydedilemedi.');
    }
  } catch (err) {
    alert('Sunucu hatası: ' + err.message);
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: isWithinWorkSchedule()
// AMAÇ: Şu anki saat ve takvim gününün belirlenen mesai saatleri içinde olup olmadığını kontrol etmek.
// ----------------------------------------------------------------------------
function isWithinWorkSchedule() {
  if (!currentSystemSettings.work_schedule_enabled) return true;

  const now = new Date();
  const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const currentDayName = dayNames[now.getDay()];

  const activeDays = currentSystemSettings.work_days || ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  if (!activeDays.includes(currentDayName)) {
    return false;
  }

  const start = currentSystemSettings.work_start_time || '07:40';
  const end = currentSystemSettings.work_end_time || '18:00';

  const curHours = String(now.getHours()).padStart(2, '0');
  const curMinutes = String(now.getMinutes()).padStart(2, '0');
  const curTimeStr = `${curHours}:${curMinutes}`;

  return (curTimeStr >= start && curTimeStr <= end);
}

// ----------------------------------------------------------------------------
// FONKSİYON: setTvDisplayMode(mode)
// AMAÇ: TV ekranının modunu değiştirmek:
//   - 'live': Canlı 4 slaytlı hasta akışı paneli
//   - 'standby': Güvenli Bekleme Modu (Oturum kapalıyken logo ve bilgi kartı)
//   - 'offduty': Mesai Dışı Modu (Ünitemiz kapalıdır ve Acil Servis yönlendirmesi)
// ----------------------------------------------------------------------------
function setTvDisplayMode(mode) {
  // mode: 'live', 'standby', 'offduty'
  document.body.classList.remove('tv-mode-live', 'tv-mode-standby', 'tv-mode-offduty');
  document.body.classList.add(`tv-mode-${mode}`);

  const standbyEl = document.getElementById('tv-standby-screen');
  const offdutyEl = document.getElementById('tv-offduty-screen');
  const liveEl = document.getElementById('tv-live-panel');

  if (standbyEl) {
    standbyEl.style.display = (mode === 'standby' ? 'flex' : 'none');
    standbyEl.style.visibility = (mode === 'standby' ? 'visible' : 'hidden');
  }
  if (offdutyEl) {
    offdutyEl.style.display = (mode === 'offduty' ? 'flex' : 'none');
    offdutyEl.style.visibility = (mode === 'offduty' ? 'visible' : 'hidden');
  }
  if (liveEl) {
    liveEl.style.display = (mode === 'live' ? 'flex' : 'none');
    liveEl.style.visibility = (mode === 'live' ? 'visible' : 'hidden');
  }
}

let isTvFetchingSession = false;

// ----------------------------------------------------------------------------
// FONKSİYON: checkTvScreenSessionAndSchedule()
// AMAÇ: TV ekranının her 2.5 saniyede bir çalışarak hem mesai saatlerini hem de sunucudaki
//       aktif personel oturumunu denetlemesi ve ekran modunu otomatik seçmesi.
// ----------------------------------------------------------------------------
async function checkTvScreenSessionAndSchedule() {
  if (!isDisplayScreenMode()) return;
  if (isTvFetchingSession) return;
  isTvFetchingSession = true;

  try {
    // 1. Ağ / Sunucu oturum kontrolü (Kesin sunucu gerçeği)
    let serverHasActive = false;
    try {
      const res = await fetch(resolveApiUrl('/api/auth/active-session'), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        serverHasActive = Boolean(data.hasActiveSession);
        serverActiveSessionState = serverHasActive;
      }
    } catch (_) { }

    const isStaffLoggedIn = serverHasActive;

    // 2. Mesai / Çalışma Saatleri Kontrolü
    const withinWorkingHours = isWithinWorkSchedule();

    // Durum 1: Mesai Dışı
    if (!withinWorkingHours) {
      setTvDisplayMode('offduty');
      stopSlideAutomation();
      return;
    }

    // Durum 2: Mesai İçi AMA Henüz Personel Girişi Yapılmamış (Statik Güvenli Bekleme Ekranı)
    if (!isStaffLoggedIn) {
      setTvDisplayMode('standby');
      stopSlideAutomation();
      if (activeSeansList.length > 0) {
        activeSeansList = [];
        const track = document.getElementById('tv-carousel-track');
        if (track) track.innerHTML = '';
      }
      return;
    }

    // Durum 3: Mesai İçi VE Giriş Yapılmış (Canlı Hasta Akışı)
    const wasNotLive = !document.body.classList.contains('tv-mode-live');
    setTvDisplayMode('live');

    if (wasNotLive || activeSeansList.length === 0) {
      await executeDailyOracleQuery(true);
      startSlideAutomation();
    } else if (!countdownInterval) {
      startSlideAutomation();
    }
  } finally {
    isTvFetchingSession = false;
  }
}

// ============================================================================
// VIEW SORGUSUNA BAĞLI DİNAMİK LİSTE VE GÜNCELLE BUTONU (Madde 5)
// ============================================================================
// ----------------------------------------------------------------------------
// FONKSİYON: manualRefreshPatientView()
// AMAÇ: Sekreterlik ekranındaki '🔄 Verileri Güncelle' butonuna tıklandığında
//       veritabanındaki 'VW_DYZ_GUNLUK_HASTA_SEANSLARI' view'ını yeniden sorgulamak.
// ----------------------------------------------------------------------------
async function manualRefreshPatientView() {
  const icon = document.getElementById('refresh-view-icon');
  if (icon) icon.classList.add('spin-fast');

  try {
    const isTvDisplay = isDisplayScreenMode();
    const targetUrl = resolveApiUrl(isTvDisplay ? '/api/tv/seanslar' : '/api/seanslar');

    const res = await fetch(targetUrl, {
      headers: getAuthHeaders(),
      cache: 'no-store'
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        ORACLE_RAW_DATABASE = data;
        const filteredRows = ORACLE_RAW_DATABASE.filter(row => doesRowMatchSelectedFilter(row));
        activeSeansList = filteredRows.map(mapOracleRowToActiveSeans);
        purgeExpiredCompletedPatients();
        sortActiveSeansList();

        renderSecretaryPanel(true);
        renderTvSlides();
        renderDeletePatientModalList();

        showToast(`🔄 Veritabanı ve View listesi güncellendi (${activeSeansList.length} hasta aktif).`);
        broadcastSyncState({
          toastMessage: `🔄 Veritabanı güncellendi (${activeSeansList.length} hasta).`
        });
      }
    } else {
      showToast('⚠️ Veritabanından güncel veriler alınamadı.');
    }
  } catch (err) {
    showToast('⚠️ Bağlantı hatası: ' + err.message);
  } finally {
    if (icon) {
      setTimeout(() => icon.classList.remove('spin-fast'), 600);
    }
  }
}

let lastPollDataHash = '';
// ----------------------------------------------------------------------------
// FONKSİYON: pollPatientViewUpdates()
// AMAÇ: Arka planda her 7 saniyede bir veritabanı view'ındaki değişiklikleri sessizce kontrol etmek.
// ----------------------------------------------------------------------------
async function pollPatientViewUpdates() {
  try {
    const isTvDisplay = isDisplayScreenMode();
    const targetUrl = resolveApiUrl(isTvDisplay ? '/api/tv/seanslar' : '/api/seanslar');

    const res = await fetch(targetUrl, {
      headers: getAuthHeaders(),
      cache: 'no-store'
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const curHash = data.map(d => `${d.HASTASEANSREFNO}:${d.STATU}:${d.completed_at || ''}:${d.HASTAADI}`).join('|');
        if (lastPollDataHash !== '' && lastPollDataHash !== curHash) {
          ORACLE_RAW_DATABASE = data;
          const filteredRows = ORACLE_RAW_DATABASE.filter(row => doesRowMatchSelectedFilter(row));
          activeSeansList = filteredRows.map(mapOracleRowToActiveSeans);
          purgeExpiredCompletedPatients();
          sortActiveSeansList();

          if (!isTvDisplay) {
            renderSecretaryPanel(false);
            renderDeletePatientModalList();
          } else {
            renderTvSlides();
          }
        }
        lastPollDataHash = curHash;
      }
    }
  } catch (_) { }
}

// ============================================================================
// SEKRETER YETKİSİYLE HASTA / ACİL HASTA EKLEME VE HASTA SİLME MOTORU
// ============================================================================
function onAddPatientTypeChange() {
  const typeSel = document.getElementById('inp-new-patient-type');
  const groupSel = document.getElementById('inp-new-patient-group');
  const extraFields = document.getElementById('routine-patient-extra-fields');
  const modalBox = document.getElementById('add-patient-modal-box');
  const titleEl = document.getElementById('add-patient-modal-title');
  const descEl = document.getElementById('add-patient-modal-desc');
  const submitBtn = document.getElementById('btn-submit-add-patient');

  const isEmergency = typeSel && typeSel.value === 'ACIL_SERVIS';
  if (isEmergency) {
    // Acil hasta ekleme ekranında SADECE Hasta Adı Soyadı ve Hasta No görünür
    if (extraFields) extraFields.style.display = 'none';
    if (modalBox) modalBox.style.borderTopColor = '#dc2626';
    if (titleEl) {
      titleEl.style.color = '#dc2626';
      titleEl.innerHTML = `🚨 Acil Hasta Girişi`;
    }
    if (descEl) {
      descEl.textContent = 'Acil gelen hastanın Adı Soyadı ve Hasta Numarasını giriniz (Sadece Bugün için kaydedilir).';
    }
    if (submitBtn) {
      submitBtn.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
      submitBtn.textContent = '🚨 Acil Hastayı Kaydet';
    }
  } else {
    if (extraFields) extraFields.style.display = 'block';
    // Yeni hasta eklerken gün seçimi ZORUNLUDUR: başlangıçta hiçbir gün seçili gelmez
    document.querySelectorAll('.chk-new-patient-day').forEach(chk => {
      chk.checked = false;
    });
    const addListbox = document.getElementById('add-modal-days-listbox');
    if (addListbox) addListbox.classList.remove('open');
    syncDaysCheckListboxUI('new');
    if (modalBox) modalBox.style.borderTopColor = '#059669';
    if (titleEl) {
      titleEl.style.color = '#059669';
      titleEl.innerHTML = `➕ Yeni Hasta Ekle`;
    }
    if (descEl) {
      descEl.textContent = 'Lütfen hastanın adını, soyadını, hasta numarasını ve geleceği seans günlerini seçiniz.';
    }
    if (submitBtn) {
      submitBtn.style.background = '';
      submitBtn.textContent = 'Hastayı Kaydet';
    }
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: openAddPatientModal()
// AMAÇ: Yeni Rutin Hasta veya Acil Hasta ekleme modalını seçilen moda uygun alanlarla açmak.
// ----------------------------------------------------------------------------
function openAddPatientModal(mode = 'RUTIN') {
  if (!isSecretaryLoggedIn) {
    openLoginModal();
    return;
  }

  const form = document.getElementById('form-add-patient');
  if (form) form.reset();

  const typeSel = document.getElementById('inp-new-patient-type');
  if (typeSel) {
    typeSel.value = (mode === 'ACIL') ? 'ACIL_SERVIS' : 'PLANLANDI';
  }
  onAddPatientTypeChange();

  newPatientDayHoursMap = {};
  renderNewPatientModalDayHourSelectors();

  const modal = document.getElementById('add-patient-modal');
  if (modal) modal.classList.add('active');

  const nameInp = document.getElementById('inp-new-patient-name');
  if (nameInp) setTimeout(() => nameInp.focus(), 100);
}

// ----------------------------------------------------------------------------
// FONKSİYON: closeAddPatientModal()
// AMAÇ: Yeni hasta ekleme modalını kapatmak ve form alanlarını sıfırlamak.
// ----------------------------------------------------------------------------
function closeAddPatientModal() {
  const modal = document.getElementById('add-patient-modal');
  if (modal) modal.classList.remove('active');
}

// ----------------------------------------------------------------------------
// FONKSİYON: validateHastaNo()
// AMAÇ: Girilen HBYS hasta dosya/protokol numarasının geçerli formatta ve boş olmadığını doğrulamak.
// ----------------------------------------------------------------------------
function validateHastaNo(rawNo) {
  const cleaned = String(rawNo || '').trim();
  if (!cleaned) {
    return {
      valid: false,
      message: 'Hasta Numarası zorunlu bir alandır! Lütfen boş bırakmayınız.'
    };
  }
  if (!/^\d+$/.test(cleaned)) {
    return {
      valid: false,
      message: 'Hasta Numarası sadece rakamlardan (0-9) oluşmalıdır!'
    };
  }
  if (cleaned.length < 5 || cleaned.length > 8) {
    return {
      valid: false,
      message: `Hasta Numarası en az 5, en fazla 8 karakter (rakam) olmalıdır! (Girilen: ${cleaned.length} karakter)`
    };
  }
  return { valid: true, value: cleaned };
}

// ----------------------------------------------------------------------------
// FONKSİYON: handleAddPatientSubmit()
// AMAÇ: Yeni hasta veya acil hasta kaydını doğrulayıp yerel listeye eklemek, /api/seanslar ile 4 ilişkisel tabloya yazmak ve TV'ye yayınlamak.
// ----------------------------------------------------------------------------
function handleAddPatientSubmit(e) {
  e.preventDefault();
  if (!isSecretaryLoggedIn) {
    openLoginModal();
    return;
  }

  const basvuruTuru = document.getElementById('inp-new-patient-type')?.value || 'PLANLANDI';
  const fullNameRaw = (document.getElementById('inp-new-patient-name')?.value || '').trim().toLocaleUpperCase('tr-TR');
  const hastaNoInputVal = (document.getElementById('inp-new-patient-no')?.value || '').trim();
  const durationVal = STANDART_DIYALIZ_SURESI_DK;
  const shiftSelVal = document.getElementById('inp-new-patient-shift')?.value || 'SABAH';
  const vardiya = basvuruTuru === 'ACIL_SERVIS' ? 'ACİL' : shiftSelVal;

  if (!fullNameRaw) {
    alert('Lütfen hasta adı ve soyadını giriniz.');
    return;
  }

  // Hasta numarası ZORUNLUDUR, sadece rakamlardan oluşmalı, min 6 - max 8 karakter olmalıdır!
  const noValidation = validateHastaNo(hastaNoInputVal);
  if (!noValidation.valid) {
    alert(noValidation.message);
    const noInp = document.getElementById('inp-new-patient-no');
    if (noInp) noInp.focus();
    return;
  }
  const hastaNoRaw = noValidation.value;

  // Rutin hasta eklenirken GÜN SEÇİMİ ZORUNLUDUR!
  let selectedDays = [];
  let gunGrubu = 'BUGUN';
  if (basvuruTuru !== 'ACIL_SERVIS') {
    document.querySelectorAll('.chk-new-patient-day').forEach(chk => {
      if (chk.checked) selectedDays.push(chk.value);
    });
    if (selectedDays.length === 0) {
      alert('Lütfen hastanın geleceği seans günlerini seçiniz! Yeni hasta eklerken gün seçimi zorunludur.');
      return;
    }
    const joinedCode = selectedDays.join('_');
    gunGrubu = joinedCode;
    if (joinedCode === 'PZT_CAR_CUM') gunGrubu = 'PZT_CAR_CUM';
    else if (joinedCode === 'SAL_PER_CMT') gunGrubu = 'SAL_PER_CMT';
    else if (selectedDays.length === 6) gunGrubu = 'HER_GUN';
  }

  // Aynı hasta numarasıyla başka bir kayıt var mı kontrol et
  ORACLE_RAW_DATABASE = loadMasterRoster();
  const existingDuplicate = ORACLE_RAW_DATABASE.find(r => String(r.HASTANO).trim() === hastaNoRaw);
  if (existingDuplicate) {
    alert(`Bu Hasta Numarası (${hastaNoRaw}) zaten "${maskFullName(existingDuplicate.HASTAADI)}" adına kayıtlıdır! Lütfen hasta numarasını kontrol ediniz.`);
    const noInp = document.getElementById('inp-new-patient-no');
    if (noInp) noInp.focus();
    return;
  }

  const newSeansRefNo = Date.now();
  const customDaysArr = basvuruTuru === 'ACIL_SERVIS' ? null : selectedDays;
  const todayIso = getTodayIsoString();
  const registrationStartIso = currentSelectedDateIso > todayIso ? currentSelectedDateIso : todayIso;
  const initialGunlukSaatler = {};
  if (Array.isArray(customDaysArr)) {
    customDaysArr.forEach(d => {
      if (newPatientDayHoursMap[d]) {
        initialGunlukSaatler[d] = newPatientDayHoursMap[d];
      }
    });
  }
  const primaryHour = Object.values(initialGunlukSaatler).find(Boolean) || '';
  const resolvedNewVardiyaTanimNo = resolveVardiyaTanimNo(vardiya);
  const resolvedNewVardiya = vardiya === 'BELIRTILMEMIS' ? 'BELIRTILMEMIS' : (resolvedNewVardiyaTanimNo === 1 ? 'SABAH' : 'ÖGLEN');
  const newRawRecord = {
    HASTAADI: fullNameRaw,
    hastano: hastaNoRaw,
    HASTANO: hastaNoRaw,
    HASTASEANSREFNO: newSeansRefNo,
    HASTATEDAVIREFNO: 50000 + ORACLE_RAW_DATABASE.length + 1,
    HASTADIYALIZREFNO: 20000 + ORACLE_RAW_DATABASE.length + 1,
    KABULTARIHI: new Date(),
    HASTABASVURUREFNO: 30000 + ORACLE_RAW_DATABASE.length + 1,
    HASTAHIZMETREFNO: 40000 + ORACLE_RAW_DATABASE.length + 1,
    SEANSTARIHI: new Date(),
    VARDIYATANIMNO: resolvedNewVardiyaTanimNo,
    VARDIYA: resolvedNewVardiya,
    SEANS_SAATI: primaryHour,
    GUNLUK_SAATLER: Object.keys(initialGunlukSaatler).length > 0 ? initialGunlukSaatler : null,
    SEANSTURU: 'HEMODIYALIZ',
    SURE: durationVal,
    BASVURUTURU: basvuruTuru,
    KABULIPTALNEDENNO: null,
    KABULIPTALTARIHI: null,
    kabuliptalaciklama: '',
    IPTALEDENP: null,
    IPTALTARIHI: null,
    STATU: 'BEKLEMEDE',
    GUN_GRUBU: gunGrubu,
    OZEL_GUNLER: customDaysArr,
    KAYIT_TARIHI: registrationStartIso,
    ACIL_TARIH: basvuruTuru === 'ACIL_SERVIS' ? currentSelectedDateIso : null,
    HEMODIYALIZ_GECMISI: 50
  };

  // 1. Kalıcı Veritabanı Havuzuna Kaydet
  ORACLE_RAW_DATABASE = loadMasterRoster();
  ORACLE_RAW_DATABASE.push(newRawRecord);
  saveMasterRoster(ORACLE_RAW_DATABASE);

  const formattedDaysLabel = basvuruTuru === 'ACIL_SERVIS'
    ? 'Bugün'
    : formatDayGroupShort(gunGrubu, customDaysArr, false);
  const maskedNewName = maskFullName(fullNameRaw);

  // 2. SADECE hastanın seçilen günleri bugünkü seans günüyle eşleşiyorsa bugünkü ekrana ekle!
  if (doesRowMatchSelectedFilter(newRawRecord)) {
    const mappedSeans = mapOracleRowToActiveSeans(newRawRecord);
    activeSeansList.unshift(mappedSeans);
    renderSecretaryPanel(true);
    renderTvSlides();
    renderDeletePatientModalList();
    broadcastSyncState({
      targetSlideIndex: 0,
      playChime: basvuruTuru === 'ACIL_SERVIS',
      toastMessage: basvuruTuru === 'ACIL_SERVIS'
        ? `🚨 Acil Hasta Girişi: ${mappedSeans.maskedName}`
        : `➕ Yeni Hasta Eklendi: ${mappedSeans.maskedName} (${formattedDaysLabel})`
    });
    showToast(
      basvuruTuru === 'ACIL_SERVIS'
        ? `🚨 Acil Hasta (${maskedNewName}) bugünkü seans listesine ve TV ekranına eklendi.`
        : `✅ ${maskedNewName} (${formattedDaysLabel}) bugünkü seans listesine ve TV ekranına eklendi.`
    );
  } else {
    // Seçilen günler bugünü içermiyorsa (Örn: Çarşamba günü Pzt-Per hastası eklendiyse) bugünkü ekranda GÖSTERİLMEZ!
    renderDeletePatientModalList();
    showToast(
      `✅ ${maskedNewName} kaydedildi. Sadece seçilen günlerde (${formattedDaysLabel}) ekranda görünecektir.`
    );
  }

  closeAddPatientModal();

  // 3. Backend Veritabanı Motoruna (database_engine.js) Kaydet
  syncPatientChangeToApi({
    ACTION: 'ADD',
    HASTASEANSREFNO: newSeansRefNo,
    HASTATEDAVIREFNO: newRawRecord.HASTATEDAVIREFNO,
    HASTADIYALIZREFNO: newRawRecord.HASTADIYALIZREFNO,
    HASTABASVURUREFNO: newRawRecord.HASTABASVURUREFNO,
    HASTAHIZMETREFNO: newRawRecord.HASTAHIZMETREFNO,
    HASTAADI: fullNameRaw,
    hastano: hastaNoRaw,
    HASTANO: hastaNoRaw,
    GUN_GRUBU: gunGrubu,
    OZEL_GUNLER: customDaysArr,
    VARDIYATANIMNO: resolvedNewVardiyaTanimNo,
    VARDIYA: resolvedNewVardiya,
    SEANS_SAATI: newSessionTime,
    GUNLUK_SAATLER: newRawRecord.GUNLUK_SAATLER,
    SEANSTURU: newRawRecord.SEANSTURU,
    SURE: durationVal,
    STATU: newRawRecord.STATU,
    BASVURUTURU: basvuruTuru,
    HEMODIYALIZ_GECMISI: newRawRecord.HEMODIYALIZ_GECMISI
  });
}

// Hasta Silme İşlemi (Hem Ekrandan Hem Veritabanından Kalıcı Olarak Silinir)
function deletePatientById(seansId, skipConfirm = false) {
  if (!isSecretaryLoggedIn) {
    openLoginModal();
    return;
  }
  if (!canCurrentUserDeleteAndReset()) {
    showToast('⚠️ Kalıcı hasta silme yetkisi yalnızca Admin veya yetki verilen kullanıcılarda bulunmaktadır.');
    return;
  }

  const target = activeSeansList.find(s => String(s.seansId) === String(seansId));
  const rawTarget = ORACLE_RAW_DATABASE.find(r => String(r.HASTASEANSREFNO) === String(seansId));
  const maskedDisplay = target
    ? `${target.maskedName} (Hasta No: ${target.tcNo})`
    : (rawTarget ? `${maskFullName(rawTarget.HASTAADI)} (Hasta No: ${rawTarget.HASTANO})` : `#${seansId}`);

  if (!skipConfirm) {
    const confirmed = window.confirm(`"${maskedDisplay}" kaydını veritabanından ve seans listesinden kalıcı olarak silmek istediğinize emin misiniz?`);
    if (!confirmed) return;
  }

  const targetTc = target ? target.tcNo : (rawTarget ? rawTarget.HASTANO : null);

  // 1. Kalıcı Veritabanı Havuzundan Sil
  ORACLE_RAW_DATABASE = loadMasterRoster().filter(r => {
    if (String(r.HASTASEANSREFNO) === String(seansId)) return false;
    if (targetTc && String(r.HASTANO) === String(targetTc)) return false;
    return true;
  });
  saveMasterRoster(ORACLE_RAW_DATABASE);

  // 2. Aktif Seans Listesinden Sil
  activeSeansList = activeSeansList.filter(s => {
    if (String(s.seansId) === String(seansId)) return false;
    if (targetTc && String(s.tcNo) === String(targetTc)) return false;
    return true;
  });

  renderSecretaryPanel(true);
  renderTvSlides();
  renderDeletePatientModalList();

  showToast(`🗑️ ${maskedDisplay} aktif listeden silindi ve Silinen Hastalar Veritabanına arşivlendi.`);

  broadcastSyncState({
    toastMessage: `🗑️ Hasta kaydı silindi ve arşive kaydedildi.`
  });

  // 3. Backend Veritabanı Motorundan (database_engine.js) Sil ve Ayrı Arşiv Veritabanına Yaz
  syncPatientChangeToApi({
    ACTION: 'DELETE',
    HASTASEANSREFNO: seansId,
    HASTANO: targetTc,
    SILINME_NEDENI: 'Sekreter Tarafından Kalıcı Silindi'
  });
}

let isDeleteSafetyUnlocked = false;
let editingScheduleSeansId = null;
let scheduleSearchTerm = '';

// ----------------------------------------------------------------------------
// FONKSİYON: onScheduleSearchInput()
// AMAÇ: Seans Planlama ekranındaki arama kutusuna yazıldıkça hasta listesini anlık filtrelemek.
// ----------------------------------------------------------------------------
function onScheduleSearchInput(val) {
  scheduleSearchTerm = String(val || '').trim();
  renderDeletePatientModalList();
}

// ----------------------------------------------------------------------------
// FONKSİYON: openDeletePatientModal()
// AMAÇ: Kalıcı Hasta Silme penceresini açmak ve güvenlik kilidi kapalı şekilde hasta listesini yüklemek.
// ----------------------------------------------------------------------------
function openDeletePatientModal() {
  if (!isSecretaryLoggedIn) {
    openLoginModal();
    return;
  }
  // Pop-up yerine doğrudan sayfa görünümünü aç
  switchMainView('schedule');
}

// ----------------------------------------------------------------------------
// FONKSİYON: closeDeletePatientModal()
// AMAÇ: Kalıcı Hasta Silme penceresini kapatmak ve silme güvenlik kilidini tekrar kilitlemek.
// ----------------------------------------------------------------------------
function closeDeletePatientModal() {
  switchMainView('patients');
}

// ----------------------------------------------------------------------------
// FONKSİYON: toggleDeleteSafetyLock()
// AMAÇ: Yanlışlıkla hasta silinmesini önleyen güvenlik kilidini yetkili personel onayıyla açıp kapatmak.
// ----------------------------------------------------------------------------
function toggleDeleteSafetyLock() {
  const chk = document.getElementById('chk-unlock-delete');
  if (!canCurrentUserDeleteAndReset()) {
    isDeleteSafetyUnlocked = false;
    if (chk) chk.checked = false;
    showToast('⚠️ Bu yetki yalnızca Admin veya yetki verilen kullanıcılarda bulunmaktadır.');
    renderDeletePatientModalList();
    return;
  }
  isDeleteSafetyUnlocked = Boolean(chk && chk.checked);
  renderDeletePatientModalList();
}

// Başka bir gündeki hastayı veritabanından silmeden SADECE BUGÜNKÜ seans ekranına dahil et
function addExistingPatientToToday(seansRefNo) {
  if (!isSecretaryLoggedIn) {
    openLoginModal();
    return;
  }
  ORACLE_RAW_DATABASE = loadMasterRoster().map(r => {
    if (String(r.HASTASEANSREFNO) === String(seansRefNo)) {
      return {
        ...r,
        MANUEL_BUGUN_TARIH: currentSelectedDateIso,
        MANUEL_HARIC_TARIH: null
      };
    }
    return r;
  });
  saveMasterRoster(ORACLE_RAW_DATABASE);

  const row = ORACLE_RAW_DATABASE.find(r => String(r.HASTASEANSREFNO) === String(seansRefNo));
  if (row && !activeSeansList.some(s => String(s.seansId) === String(seansRefNo))) {
    const mapped = mapOracleRowToActiveSeans(row);
    activeSeansList.unshift(mapped);
  }

  renderSecretaryPanel(true);
  renderTvSlides();
  renderDeletePatientModalList();

  if (row) {
    const masked = maskFullName(row.HASTAADI);
    showToast(`➕ ${masked} bugünkü (${formatDateTR(currentSelectedDateIso)}) seans listesine eklendi.`);
    broadcastSyncState({
      toastMessage: `➕ ${masked} bugünkü seansa dahil edildi.`
    });
  }
}

// Bugünkü listede olan bir hastayı veritabanından SİLMEDEN sadece bugünkü ekrandan çıkar (farklı gün gelecekse)
function removePatientFromTodayOnly(seansRefNo) {
  if (!isSecretaryLoggedIn) {
    openLoginModal();
    return;
  }
  ORACLE_RAW_DATABASE = loadMasterRoster().map(r => {
    if (String(r.HASTASEANSREFNO) === String(seansRefNo)) {
      return {
        ...r,
        MANUEL_BUGUN_TARIH: null,
        MANUEL_HARIC_TARIH: currentSelectedDateIso
      };
    }
    return r;
  });
  saveMasterRoster(ORACLE_RAW_DATABASE);

  const row = ORACLE_RAW_DATABASE.find(r => String(r.HASTASEANSREFNO) === String(seansRefNo));
  activeSeansList = activeSeansList.filter(s => String(s.seansId) !== String(seansRefNo));

  renderSecretaryPanel(true);
  renderTvSlides();
  renderDeletePatientModalList();

  if (row) {
    const masked = maskFullName(row.HASTAADI);
    showToast(`📅 ${masked} veritabanından silinmeden sadece bugünkü listeden çıkarıldı.`);
    broadcastSyncState({
      toastMessage: `📅 Liste güncellendi.`
    });
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: renderDeletePatientModalList()
// AMAÇ: Kalıcı silme modalındaki hasta satırlarını KVKK maskeli isim ve silme butonuyla listelemek.
// ----------------------------------------------------------------------------
function renderDeletePatientModalList() {
  const listEl = document.getElementById('delete-patient-modal-list');
  if (!listEl) return;

  updateDeleteResetPermissionUI();
  ORACLE_RAW_DATABASE = loadMasterRoster().slice().sort(comparePatientsByPriority);

  const totalCountEl = document.getElementById('schedule-total-count');
  if (totalCountEl) {
    const activeTodayCount = ORACLE_RAW_DATABASE.filter(r =>
      activeSeansList.some(s => String(s.seansId) === String(r.HASTASEANSREFNO))
    ).length;
    totalCountEl.textContent = `${ORACLE_RAW_DATABASE.length} Kayıtlı Hasta (${activeTodayCount} Bugün Aktif)`;
  }

  const filteredRoster = ORACLE_RAW_DATABASE.filter(r => {
    if (!scheduleSearchTerm) return true;
    const masked = maskFullName(r.HASTAADI);
    const target = `${r.HASTAADI} ${masked} ${r.HASTANO}`.toLocaleLowerCase('tr-TR');
    return target.includes(scheduleSearchTerm.toLocaleLowerCase('tr-TR'));
  });

  if (filteredRoster.length === 0) {
    listEl.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">Arama kriterine uygun veya kayıtlı hasta bulunmamaktadır.</div>`;
    return;
  }

  const canDelete = isDeleteSafetyUnlocked && canCurrentUserDeleteAndReset();

  listEl.innerHTML = filteredRoster.map(r => {
    const isEmergencyRow = r.BASVURUTURU === 'ACIL_SERVIS' || r.GUN_GRUBU === 'BUGUN';
    const isInTodayList = activeSeansList.some(s => String(s.seansId) === String(r.HASTASEANSREFNO));
    const maskedName = maskFullName(r.HASTAADI);
    const hoursSummary = formatPatientScheduleHoursSummary(r);

    return `
      <div class="secretary-patient-card ${isEmergencyRow ? 'card-emergency-patient' : ''}" id="sched-card-${r.HASTASEANSREFNO}">
        <!-- SOL BÖLÜM: Hasta Yönetimi ile Birebir Aynı KVKK Maskeli Kart Yapısı -->
        <div class="card-top">
          <div class="patient-info-left">
            <button type="button" class="patient-name-clickable" onclick="openPatientScheduleModal(${r.HASTASEANSREFNO})" title="KVKK Detay: Hastanın tam adını görmek ve seans gün/saatlerini düzenlemek için tıklayınız">
              <span>${maskedName}</span>
              <span class="name-detail-hint">Detay ▸</span>
            </button>
            <span class="patient-id-badge">Hasta No: ${r.HASTANO || '-'}</span>
            ${hoursSummary ? `<span class="patient-time-badge">🕒 ${hoursSummary}</span>` : ''}
            ${isEmergencyRow ? `<span class="patient-shift-badge shift-badge-emergency">🚨 Acil</span>` : ''}
          </div>

          <span class="status-badge-mini ${isInTodayList ? 'badge-green' : 'badge-blue'}">
            ${isInTodayList ? 'Bugün Aktif' : 'Diğer Gün'}
          </span>
        </div>

        <!-- SAĞ BÖLÜM: Bugüne Ekle / Çıkar Kontrolleri -->
        <div class="card-unified-controls" style="justify-content: flex-end; gap: 8px;">
          ${isInTodayList
        ? `<button type="button" class="btn-row-action btn-row-remove-today" style="padding: 7px 12px; font-size: 12px;" onclick="removePatientFromTodayOnly(${r.HASTASEANSREFNO})" title="Hastayı veritabanından silmeden sadece bugünkü ekrandan çıkar">
                ➖ Bugün Gelmeyecek
              </button>`
        : `<button type="button" class="btn-row-action btn-row-add-today" style="padding: 7px 12px; font-size: 12px;" onclick="addExistingPatientToToday(${r.HASTASEANSREFNO})" title="Bu hastayı bugünkü seans ekranına dahil et">
                ➕ Bugüne Ekle
              </button>`
      }
          ${canDelete ? `
            <button type="button" class="btn-row-action btn-row-delete-safe" style="padding: 7px 12px; font-size: 12px;" onclick="deletePatientById(${r.HASTASEANSREFNO})" title="Kalıcı Olarak Sil">
              🗑️ Sil
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================================
// HASTA DETAY POP-UP MODALI (Hastanın Adına Tıklandığında Açılır)
// Yatak No, Diyaliz Süresi Uzatma ve Manuel Gün Seçimi burada yer alır
// ============================================================================
// ============================================================================
// SADE ÇOKLU SEÇİM DROPDOWN / CHECK LISTBOX MOTORU
// ============================================================================
function toggleDaysCheckListbox(listboxId) {
  const el = document.getElementById(listboxId);
  if (el) {
    el.classList.toggle('open');
  }
}

// Dropdown dışına tıklandığında otomatik kapat
document.addEventListener('click', (e) => {
  document.querySelectorAll('.days-check-listbox.open').forEach(box => {
    if (!box.contains(e.target)) {
      box.classList.remove('open');
    }
  });
});

// ----------------------------------------------------------------------------
// FONKSİYON: onDayGroupPresetToggle()
// AMAÇ: Pzt-Çar-Cum veya Sal-Per-Cmt hızlı grup şablonu işaretlendiğinde ilgili gün kutucuklarını otomatik seçmek.
// ----------------------------------------------------------------------------
function onDayGroupPresetToggle(mode, groupCode, isChecked) {
  const daySelector = mode === 'new' ? '.chk-new-patient-day' : '.chk-custom-day';
  const targetDays = groupCode === 'PZT_CAR_CUM'
    ? ['PZT', 'CAR', 'CUM']
    : ['SAL', 'PER', 'CMT'];

  if (isChecked) {
    // Grup işaretlendiğinde o grubun 3 gününü seç, diğer günleri temizle
    document.querySelectorAll(daySelector).forEach(chk => {
      chk.checked = targetDays.includes(chk.value);
    });
  } else {
    // Grup işareti kaldırıldığında o grubun günlerini temizle
    document.querySelectorAll(daySelector).forEach(chk => {
      if (targetDays.includes(chk.value)) {
        chk.checked = false;
      }
    });
  }
  syncDaysCheckListboxUI(mode);
}

// ----------------------------------------------------------------------------
// FONKSİYON: onIndividualDayCheckChange()
// AMAÇ: Tekil gün kutucuğu değiştiğinde gün seçim arayüzünü ve güne özel saat seçicilerini güncellemek.
// ----------------------------------------------------------------------------
function onIndividualDayCheckChange(mode) {
  syncDaysCheckListboxUI(mode);
}

// ----------------------------------------------------------------------------
// FONKSİYON: syncDaysCheckListboxUI()
// AMAÇ: Seçili gün kutucuklarına göre grup şablonlarını, özet etiketini ve dinamik gün-saat kutularını senkronize etmek.
// ----------------------------------------------------------------------------
function syncDaysCheckListboxUI(mode) {
  const daySelector = mode === 'new' ? '.chk-new-patient-day' : '.chk-custom-day';
  const presetSelector = mode === 'new' ? '.chk-new-group-preset' : '.chk-detail-group-preset';
  const summaryId = mode === 'new' ? 'add-modal-days-summary' : 'detail-modal-days-summary';

  const checkedDays = [];
  document.querySelectorAll(daySelector).forEach(chk => {
    if (chk.checked) checkedDays.push(chk.value);
  });

  const joined = checkedDays.join('_');
  const isPztCarCum = joined === 'PZT_CAR_CUM';
  const isSalPerCmt = joined === 'SAL_PER_CMT';

  document.querySelectorAll(presetSelector).forEach(presetChk => {
    if (presetChk.value === 'PZT_CAR_CUM') {
      presetChk.checked = isPztCarCum;
    } else if (presetChk.value === 'SAL_PER_CMT') {
      presetChk.checked = isSalPerCmt;
    }
  });

  const summaryEl = document.getElementById(summaryId);
  if (summaryEl) {
    if (checkedDays.length === 0) {
      summaryEl.textContent = 'Gün Seçiniz...';
      summaryEl.style.color = '#64748b';
    } else if (isPztCarCum) {
      summaryEl.textContent = 'Pazartesi - Çarşamba - Cuma';
      summaryEl.style.color = '#0f172a';
    } else if (isSalPerCmt) {
      summaryEl.textContent = 'Salı - Perşembe - Cumartesi';
      summaryEl.style.color = '#0f172a';
    } else if (checkedDays.length === 6) {
      summaryEl.textContent = 'Her Gün (Pazartesi - Cumartesi)';
      summaryEl.style.color = '#0f172a';
    } else {
      const fullDayMap = {
        PZT: 'Pazartesi',
        SAL: 'Salı',
        CAR: 'Çarşamba',
        PER: 'Perşembe',
        CUM: 'Cuma',
        CMT: 'Cumartesi'
      };
      summaryEl.textContent = checkedDays.map(d => fullDayMap[d] || d).join(' - ');
      summaryEl.style.color = '#0f172a';
    }
  }

  if (mode === 'detail') {
    renderDetailModalDayHourSelectors();
  } else if (mode === 'new') {
    renderNewPatientModalDayHourSelectors();
  }
}

let newPatientDayHoursMap = {};

// ----------------------------------------------------------------------------
// FONKSİYON: onNewPatientSingleDayHourChange()
// AMAÇ: Yeni hasta modalında bir günün seans saati seçildiğinde kaydetmek ve boş diğer günlere otomatik önermek.
// ----------------------------------------------------------------------------
function onNewPatientSingleDayHourChange(dayCode, val) {
  const cleanVal = String(val || '').trim();
  const previouslyFilledDays = Object.entries(newPatientDayHoursMap).filter(([k, v]) => k !== dayCode && Boolean(v));

  newPatientDayHoursMap[dayCode] = cleanVal;

  // İlk başta hiçbir gün için saat girilmemişse ve kullanıcı 1 gün için saat seçerse,
  // kullanıcının işini kolaylaştırmak için diğer seçili günlere de o saati başlangıç olarak uygula
  if (cleanVal && previouslyFilledDays.length === 0) {
    document.querySelectorAll('.chk-new-patient-day').forEach(chk => {
      if (chk.checked) {
        newPatientDayHoursMap[chk.value] = cleanVal;
      }
    });
    renderNewPatientModalDayHourSelectors();
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: renderNewPatientModalDayHourSelectors()
// AMAÇ: Yeni hasta modalında seçili her gün için bağımsız seans saati (08.00-16.00) seçicilerini dinamik oluşturmak.
// ----------------------------------------------------------------------------
function renderNewPatientModalDayHourSelectors() {
  const wrapper = document.getElementById('add-modal-day-hours-wrapper');
  const grid = document.getElementById('add-modal-day-hours-grid');
  if (!wrapper || !grid) return;

  const checkedDays = [];
  document.querySelectorAll('.chk-new-patient-day').forEach(chk => {
    if (chk.checked) checkedDays.push(chk.value);
  });

  if (checkedDays.length === 0) {
    wrapper.style.display = 'none';
    grid.innerHTML = '';
    return;
  }

  const defaultHour = Object.values(newPatientDayHoursMap).find(Boolean) || '';

  const fullDayNames = {
    PZT: 'Pazartesi',
    SAL: 'Salı',
    CAR: 'Çarşamba',
    PER: 'Perşembe',
    CUM: 'Cuma',
    CMT: 'Cumartesi'
  };

  wrapper.style.display = 'block';
  grid.innerHTML = checkedDays.map(dayCode => {
    if (!(dayCode in newPatientDayHoursMap)) {
      newPatientDayHoursMap[dayCode] = defaultHour;
    }
    const dayVal = newPatientDayHoursMap[dayCode] || '';
    const optionsHtml = [
      `<option value="" ${dayVal === '' ? 'selected' : ''}>Belirtilmemiş</option>`,
      ...SESSION_TIME_OPTIONS.map(opt => `<option value="${opt}" ${dayVal === opt ? 'selected' : ''}>${opt}</option>`)
    ].join('');

    return `
      <div class="day-hour-mini-box">
        <span>${fullDayNames[dayCode] || dayCode}</span>
        <select class="sel-new-day-hour" data-day-code="${dayCode}" onchange="onNewPatientSingleDayHourChange('${dayCode}', this.value)">
          ${optionsHtml}
        </select>
      </div>
    `;
  }).join('');
}

let editingDetailDayHoursMap = {};

// ----------------------------------------------------------------------------
// FONKSİYON: onDetailSingleDayHourChange()
// AMAÇ: Hasta detay modalında belirli bir günün seans saati değiştirildiğinde geçici saat haritasını güncellemek.
// ----------------------------------------------------------------------------
function onDetailSingleDayHourChange(dayCode, val) {
  const cleanVal = String(val || '').trim();
  const previouslyFilledDays = Object.entries(editingDetailDayHoursMap).filter(([k, v]) => k !== dayCode && Boolean(v));

  editingDetailDayHoursMap[dayCode] = cleanVal;

  // İlk başta hastanın hiçbir saati girilmemişse ve sekreter 1 kere saat bilgisi girerse
  // hastanın geldiği diğer günlerde de otomatik olarak o saat başlangıç değeri olsun:
  if (cleanVal && previouslyFilledDays.length === 0) {
    document.querySelectorAll('.chk-custom-day').forEach(chk => {
      if (chk.checked) {
        editingDetailDayHoursMap[chk.value] = cleanVal;
      }
    });
    renderDetailModalDayHourSelectors();
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: renderDetailModalDayHourSelectors()
// AMAÇ: Hasta detay modalında hastanın seçili günlerine göre güne özel saat seçici kutularını çizmek.
// ----------------------------------------------------------------------------
function renderDetailModalDayHourSelectors() {
  const wrapper = document.getElementById('detail-modal-day-hours-wrapper');
  const grid = document.getElementById('detail-modal-day-hours-grid');
  if (!wrapper || !grid) return;

  const checkedDays = [];
  document.querySelectorAll('.chk-custom-day').forEach(chk => {
    if (chk.checked) checkedDays.push(chk.value);
  });

  if (checkedDays.length === 0) {
    wrapper.style.display = 'none';
    grid.innerHTML = '';
    return;
  }

  const defaultHour = Object.values(editingDetailDayHoursMap).find(Boolean) || '';

  const fullDayNames = {
    PZT: 'Pazartesi',
    SAL: 'Salı',
    CAR: 'Çarşamba',
    PER: 'Perşembe',
    CUM: 'Cuma',
    CMT: 'Cumartesi'
  };

  wrapper.style.display = 'block';
  grid.innerHTML = checkedDays.map(dayCode => {
    if (!(dayCode in editingDetailDayHoursMap)) {
      editingDetailDayHoursMap[dayCode] = defaultHour;
    }
    const dayVal = editingDetailDayHoursMap[dayCode] || '';
    const optionsHtml = [
      `<option value="" ${dayVal === '' ? 'selected' : ''}>Belirtilmemiş</option>`,
      ...SESSION_TIME_OPTIONS.map(opt => `<option value="${opt}" ${dayVal === opt ? 'selected' : ''}>${opt}</option>`)
    ].join('');

    return `
      <div class="day-hour-mini-box">
        <span>${fullDayNames[dayCode] || dayCode}</span>
        <select class="sel-detail-day-hour" data-day-code="${dayCode}" onchange="onDetailSingleDayHourChange('${dayCode}', this.value)">
          ${optionsHtml}
        </select>
      </div>
    `;
  }).join('');
}

// ----------------------------------------------------------------------------
// FONKSİYON: updateDetailModalTimeSummary()
// AMAÇ: Hasta detay modalında seçili hastanın toplam seans süresi ve tahmini bitiş saati özetini güncellemek.
// ----------------------------------------------------------------------------
function updateDetailModalTimeSummary(seansRefNo) {
  const timeTextEl = document.getElementById('detail-modal-time-text');
  if (!timeTextEl) return;

  const activeItem = activeSeansList.find(s => String(s.seansId) === String(seansRefNo));
  const row = ORACLE_RAW_DATABASE.find(r => String(r.HASTASEANSREFNO) === String(seansRefNo));
  const plannedMin = activeItem ? (activeItem.plannedDurationMinutes || 145) : (row ? (row.SURE || 145) : 145);

  if (activeItem && activeItem.countdownEndsAt) {
    const estEnd = formatEstimatedEndTime(activeItem.countdownEndsAt);
    timeTextEl.innerHTML = `⏱ Kalan: ${formatRemainingTime(activeItem.countdownEndsAt)} • 🏁 Bitiş: ${estEnd}`;
  } else {
    timeTextEl.innerHTML = `⏱ Planlanan: ${formatDurationLabel(plannedMin)} (${plannedMin} dk)`;
  }
}

// ----------------------------------------------------------------------------
// FONKSİYON: adjustDetailModalTime()
// AMAÇ: Admin süre gösterimi açıkken detay modalından hastanın seans süresini (+15 / -15 dk) uzatıp kısaltmak.
// ----------------------------------------------------------------------------
function adjustDetailModalTime(deltaMinutes) {
  if (!editingScheduleSeansId) return;
  extendPatientSessionTime(Number(editingScheduleSeansId), deltaMinutes);
  updateDetailModalTimeSummary(editingScheduleSeansId);
}

// ----------------------------------------------------------------------------
// FONKSİYON: openPatientScheduleModal(seansRefNo)
// AMAÇ: Hastanın 'Detay ▸' modalını açmak.
// KAPSAM: Tam hasta adı, protokol no, vardiya, güne özel saatler ve DİYALİZ DURUMU seçimi.
// ----------------------------------------------------------------------------
function openPatientScheduleModal(seansRefNo) {
  if (!isSecretaryLoggedIn) {
    openLoginModal();
    return;
  }
  editingScheduleSeansId = seansRefNo;
  ORACLE_RAW_DATABASE = loadMasterRoster();
  const row = ORACLE_RAW_DATABASE.find(r => String(r.HASTASEANSREFNO) === String(seansRefNo));
  const activeItem = activeSeansList.find(s => String(s.seansId) === String(seansRefNo));
  if (!row && !activeItem) return;

  const patientName = row ? row.HASTAADI : `${activeItem.firstName} ${activeItem.lastName}`;
  const patientNo = row ? row.HASTANO : activeItem.tcNo;
  const rawGroup = row ? row.GUN_GRUBU : activeItem.gunGrubu;
  const isEmergency = (row ? row.BASVURUTURU : activeItem.gelisTipi) === 'ACIL_SERVIS' || rawGroup === 'BUGUN';
  const currentDays = isEmergency
    ? []
    : getPatientDaysArray(rawGroup, row ? row.OZEL_GUNLER : activeItem.ozelGunler);

  const savedDefaultHour = String((row ? row.SEANS_SAATI : activeItem?.seansSaat) || '').trim();
  const savedDayMap = normalizeGunlukSaatler(row ? row.GUNLUK_SAATLER : activeItem?.gunlukSaatler);
  editingDetailDayHoursMap = {};
  currentDays.forEach(d => {
    editingDetailDayHoursMap[d] = savedDayMap[d] || savedDefaultHour || '';
  });

  const nameEl = document.getElementById('schedule-modal-patient-name');
  if (nameEl) nameEl.textContent = patientName;

  const nameInp = document.getElementById('detail-modal-patient-name-input');
  if (nameInp) nameInp.value = patientName;

  const hoursSummary = formatPatientScheduleHoursSummary(row || activeItem);
  const currentVardiya = String((activeItem ? activeItem.vardiya : (row ? row.VARDIYA : 'SABAH')) || '').toLocaleUpperCase('tr-TR');
  const detailShiftLabel = formatVardiyaBadgeLabel(currentVardiya, isEmergency);
  const subEl = document.getElementById('schedule-modal-patient-sub');
  if (subEl) {
    subEl.textContent = `Hasta No: ${patientNo} • 📅 ${isEmergency ? 'Bugün' : formatDayGroupShort(rawGroup, currentDays, false)}${detailShiftLabel ? ` • ${detailShiftLabel}` : ''}${hoursSummary ? ` • 🕒 ${hoursSummary}` : ''}`;
  }

  const detailNoInp = document.getElementById('detail-modal-patient-no');
  if (detailNoInp) {
    detailNoInp.value = String(patientNo || '').replace(/[^0-9]/g, '').slice(0, 8);
  }

  const badgeEl = document.getElementById('schedule-modal-status-badge');
  if (badgeEl) {
    badgeEl.className = `status-badge-mini ${activeItem ? activeItem.badgeClass : 'badge-blue'}`;
    badgeEl.textContent = activeItem ? activeItem.statusText : 'Kayıtlı';
  }

  const shiftBox = document.getElementById('detail-modal-shift-box');
  const shiftSel = document.getElementById('detail-modal-shift-select');
  if (isEmergency) {
    if (shiftBox) shiftBox.style.display = 'none';
  } else {
    if (shiftBox) shiftBox.style.display = 'block';
    if (shiftSel) {
      if (currentVardiya === 'SABAH' || currentVardiya === '1') shiftSel.value = 'SABAH';
      else if (currentVardiya === 'ÖGLEN' || currentVardiya === 'OGLEN' || currentVardiya === 'ÖĞLEN' || currentVardiya === 'OGLE' || currentVardiya === '2') shiftSel.value = 'OGLEN';
      else shiftSel.value = 'BELIRTILMEMIS';
    }
  }

  // Diyaliz Seans Durumu Seçim Alanı
  const statusSel = document.getElementById('detail-modal-status-select');
  if (statusSel) {
    const curStatus = (activeItem && activeItem.status) || (row && row.STATU) || 'BEKLEMEDE';
    statusSel.value = curStatus;
  }

  updateDetailModalTimeSummary(seansRefNo);
  const durationBox = document.getElementById('detail-modal-duration-box');
  if (durationBox) {
    durationBox.style.display = isTimerFeatureEnabled ? 'block' : 'none';
  }

  // Acilden gelen hastalara gün girilmez, sadece "Bugün" kutusu gösterilir
  const daysSection = document.getElementById('detail-modal-days-section');
  const emergencyDayBox = document.getElementById('detail-modal-emergency-day-box');
  if (isEmergency) {
    if (daysSection) daysSection.style.display = 'none';
    if (emergencyDayBox) emergencyDayBox.style.display = 'block';
  } else {
    if (daysSection) daysSection.style.display = 'block';
    if (emergencyDayBox) emergencyDayBox.style.display = 'none';
    document.querySelectorAll('.chk-custom-day').forEach(chk => {
      chk.checked = currentDays.includes(chk.value);
    });
    const detailListbox = document.getElementById('detail-modal-days-listbox');
    if (detailListbox) detailListbox.classList.remove('open');
    syncDaysCheckListboxUI('detail');
  }

  const modal = document.getElementById('patient-schedule-modal');
  if (modal) modal.classList.add('active');
}

// ----------------------------------------------------------------------------
// FONKSİYON: closePatientScheduleModal()
// AMAÇ: Hasta Detay & Seans Planlama düzenleme modalını kapatmak ve geçici düzenleme durumunu sıfırlamak.
// ----------------------------------------------------------------------------
function closePatientScheduleModal() {
  const modal = document.getElementById('patient-schedule-modal');
  if (modal) modal.classList.remove('active');
  editingScheduleSeansId = null;
}

// ----------------------------------------------------------------------------
// FONKSİYON: savePatientCustomSchedule()
// AMAÇ: Hasta Detay modalındaki değişiklikleri (ad, no, vardiya, saatler, diyaliz durumu)
//       kalıcı veritabanına ve ekrana kaydetmek.
// ----------------------------------------------------------------------------
function savePatientCustomSchedule() {
  if (!editingScheduleSeansId) return;

  ORACLE_RAW_DATABASE = loadMasterRoster();
  const existingRow = ORACLE_RAW_DATABASE.find(r => String(r.HASTASEANSREFNO) === String(editingScheduleSeansId));
  const activeItem = activeSeansList.find(s => String(s.seansId) === String(editingScheduleSeansId));
  const rawGroup = existingRow ? existingRow.GUN_GRUBU : (activeItem ? activeItem.gunGrubu : '');
  const isEmergency = (existingRow ? existingRow.BASVURUTURU : (activeItem ? activeItem.gelisTipi : '')) === 'ACIL_SERVIS'
    || rawGroup === 'BUGUN';

  const nameInp = document.getElementById('detail-modal-patient-name-input');
  const rawEditedName = nameInp
    ? nameInp.value.trim().toLocaleUpperCase('tr-TR')
    : (existingRow ? existingRow.HASTAADI : (activeItem ? `${activeItem.firstName} ${activeItem.lastName}`.trim() : ''));
  if (!rawEditedName) {
    alert('Lütfen hastanın adını ve soyadını boş bırakmayınız!');
    if (nameInp) nameInp.focus();
    return;
  }

  const rawEditedNo = document.getElementById('detail-modal-patient-no')
    ? document.getElementById('detail-modal-patient-no').value
    : (existingRow ? existingRow.HASTANO : (activeItem ? activeItem.tcNo : ''));
  const noCheck = validateHastaNo(rawEditedNo);
  if (!noCheck.valid) {
    alert(noCheck.message);
    const detailNoInp = document.getElementById('detail-modal-patient-no');
    if (detailNoInp) detailNoInp.focus();
    return;
  }
  const newHastaNo = noCheck.value;

  const duplicateOther = ORACLE_RAW_DATABASE.find(
    r => String(r.HASTASEANSREFNO) !== String(editingScheduleSeansId) && String(r.HASTANO).trim() === newHastaNo
  );
  if (duplicateOther) {
    alert(`Bu Hasta Numarası (${newHastaNo}) zaten "${maskFullName(duplicateOther.HASTAADI)}" adına kayıtlıdır!`);
    const detailNoInp = document.getElementById('detail-modal-patient-no');
    if (detailNoInp) detailNoInp.focus();
    return;
  }

  const resolvedDefaultHour = Object.values(editingDetailDayHoursMap).find(Boolean) || '';
  const rawShiftInput = isEmergency
    ? 'ACİL'
    : (document.getElementById('detail-modal-shift-select')?.value || 'SABAH');
  const newVardiyaTanimNo = resolveVardiyaTanimNo(rawShiftInput);
  const newShiftVal = isEmergency
    ? 'ACİL'
    : (rawShiftInput === 'BELIRTILMEMIS' ? 'BELIRTILMEMIS' : (newVardiyaTanimNo === 1 ? 'SABAH' : 'ÖGLEN'));

  let newGroupCode = 'BUGUN';
  let selectedDays = null;
  let newGunlukSaatler = null;

  if (!isEmergency) {
    selectedDays = [];
    document.querySelectorAll('.chk-custom-day').forEach(chk => {
      if (chk.checked) selectedDays.push(chk.value);
    });

    if (selectedDays.length === 0) {
      alert('Lütfen hastanın geleceği en az 1 gün seçiniz.');
      return;
    }

    const joinedCode = selectedDays.join('_');
    newGroupCode = joinedCode;
    if (joinedCode === 'PZT_CAR_CUM') newGroupCode = 'PZT_CAR_CUM';
    else if (joinedCode === 'SAL_PER_CMT') newGroupCode = 'SAL_PER_CMT';
    else if (selectedDays.length === 6) newGroupCode = 'HER_GUN';

    newGunlukSaatler = {};
    selectedDays.forEach(d => {
      const daySpecific = (editingDetailDayHoursMap[d] ?? resolvedDefaultHour ?? '').trim();
      if (daySpecific) {
        newGunlukSaatler[d] = daySpecific;
      }
    });
  }

  // Seçilen Diyaliz Seans Durumu
  const statusSel = document.getElementById('detail-modal-status-select');
  const modalStatus = statusSel ? statusSel.value : null;
  const currentStatuVal = existingRow ? existingRow.STATU : (activeItem ? activeItem.status : 'BEKLEMEDE');
  const finalStatus = modalStatus || currentStatuVal || 'BEKLEMEDE';

  let newCompletedAt = existingRow ? existingRow.completed_at : null;
  const isFinalCompleted = isSessionCompletedStatus(finalStatus);
  const wasPrevCompleted = isSessionCompletedStatus(currentStatuVal);
  if (isFinalCompleted && !wasPrevCompleted) {
    newCompletedAt = new Date().toISOString();
  } else if (!isFinalCompleted) {
    newCompletedAt = null;
  }

  // 1. Kalıcı veritabanı kaydını güncelle (Ad Soyad, Hasta No, Vardiya, Seans Saati, Günler, Durum)
  let updatedName = rawEditedName;
  let updatedRowObj = null;
  ORACLE_RAW_DATABASE = ORACLE_RAW_DATABASE.map(r => {
    if (String(r.HASTASEANSREFNO) === String(editingScheduleSeansId)) {
      updatedRowObj = {
        ...r,
        HASTAADI: rawEditedName,
        hastano: newHastaNo,
        HASTANO: newHastaNo,
        STATU: finalStatus,
        completed_at: newCompletedAt,
        VARDIYATANIMNO: newVardiyaTanimNo,
        VARDIYA: newShiftVal,
        SEANS_SAATI: resolvedDefaultHour,
        GUNLUK_SAATLER: isEmergency ? null : newGunlukSaatler,
        GUN_GRUBU: isEmergency ? 'BUGUN' : newGroupCode,
        OZEL_GUNLER: isEmergency ? null : selectedDays
      };
      return updatedRowObj;
    }
    return r;
  });
  saveMasterRoster(ORACLE_RAW_DATABASE);

  // Backend Veritabanı Motoruna Kaydet
  syncPatientChangeToApi({
    ACTION: 'UPDATE',
    HASTASEANSREFNO: editingScheduleSeansId,
    HASTAADI: rawEditedName,
    hastano: newHastaNo,
    HASTANO: newHastaNo,
    STATU: finalStatus,
    completed_at: newCompletedAt,
    VARDIYATANIMNO: newVardiyaTanimNo,
    VARDIYA: newShiftVal,
    SEANS_SAATI: resolvedDefaultHour,
    GUNLUK_SAATLER: isEmergency ? null : newGunlukSaatler,
    GUN_GRUBU: isEmergency ? 'BUGUN' : newGroupCode,
    OZEL_GUNLER: isEmergency ? null : selectedDays
  });

  // 2. Hastanın yeni günleri bugünkü seans tarihiyle eşleşiyor mu kontrol et:
  // Eşleşmiyorsa (Örn: Çarşamba günü hastanın günleri Pzt - Per yapıldıysa) bugünkü ekrandan anında kaldır!
  const matchesToday = updatedRowObj ? doesRowMatchSelectedFilter(updatedRowObj) : true;
  if (!matchesToday) {
    activeSeansList = activeSeansList.filter(p => String(p.seansId) !== String(editingScheduleSeansId));
  } else {
    const alreadyInActive = activeSeansList.some(p => String(p.seansId) === String(editingScheduleSeansId));
    const nameParts = rawEditedName.split(/\s+/).filter(Boolean);
    const newFirstName = nameParts[0] || '';
    const newLastName = nameParts.slice(1).join(' ') || '';
    const newMaskedName = maskFullName(rawEditedName);

    if (alreadyInActive) {
      activeSeansList.forEach(p => {
        if (String(p.seansId) === String(editingScheduleSeansId)) {
          p.firstName = newFirstName;
          p.lastName = newLastName;
          p.maskedName = newMaskedName;
          p.tcNo = newHastaNo;
          p.bedNo = null;
          p.vardiya = newShiftVal;
          p.seansSaat = resolvedDefaultHour;
          p.gunlukSaatler = isEmergency ? null : newGunlukSaatler;
          p.gunGrubu = isEmergency ? 'BUGUN' : newGroupCode;
          p.ozelGunler = isEmergency ? null : selectedDays;
        }
      });
      if (finalStatus !== currentStatuVal) {
        setPatientStatus(editingScheduleSeansId, finalStatus);
      }
    } else if (updatedRowObj) {
      activeSeansList.unshift(mapOracleRowToActiveSeans(updatedRowObj));
      if (finalStatus !== currentStatuVal) {
        setPatientStatus(editingScheduleSeansId, finalStatus);
      }
    }
  }
  sortActiveSeansList();

  const formattedDays = isEmergency ? 'Bugün' : formatDayGroupShort(newGroupCode, selectedDays, false);
  const maskedUpdatedName = maskFullName(updatedName || 'Hasta');
  const updatedHourSummary = updatedRowObj ? formatPatientScheduleHoursSummary(updatedRowObj) : resolvedDefaultHour;
  closePatientScheduleModal();
  renderSecretaryPanel(true);
  renderTvSlides();
  renderDeletePatientModalList();

  showToast(
    matchesToday
      ? `✅ ${maskedUpdatedName} detayları güncellendi (${formattedDays}${updatedHourSummary ? ` • 🕒 ${updatedHourSummary}` : ''}).`
      : `✅ ${maskedUpdatedName} sadece (${formattedDays}) günlerine alındı ve bugünkü listeden çıkarıldı.`
  );
  broadcastSyncState({
    toastMessage: `🔄 Hasta detayları güncellendi (${formattedDays}).`
  });
}

// ----------------------------------------------------------------------------
// FONKSİYON: resetMasterRosterToDefaults()
// AMAÇ: Yetkili onayıyla veritabanını varsayılan 17 standart hemodiyaliz hastasına (8 Pzt-Çar-Cum + 9 Sal-Per-Cmt) sıfırlamak.
// ----------------------------------------------------------------------------
async function resetMasterRosterToDefaults() {
  if (!isSecretaryLoggedIn) {
    openLoginModal();
    return;
  }
  if (!canCurrentUserDeleteAndReset()) {
    showToast('⚠️ Varsayılan 17 hastayı geri yükleme yetkisi yalnızca Admin veya yetki verilen kullanıcılarda bulunmaktadır.');
    return;
  }
  if (!window.confirm('Varsayılan Pazartesi-Çarşamba-Cuma (8 Hasta) ve Salı-Perşembe-Cumartesi (9 Hasta) olmak üzere toplam 17 hastayı veritabanına geri yüklemek istediğinize emin misiniz?')) {
    return;
  }
  const initial = DEFAULT_ORACLE_RAW_DATABASE.map(r => ({
    ...r,
    KAYIT_TARIHI: null,
    MANUEL_BUGUN_TARIH: null,
    MANUEL_HARIC_TARIH: null,
    SURE: STANDART_DIYALIZ_SURESI_DK
  }));
  localStorage.removeItem(SYNC_STORAGE_KEY);
  ORACLE_RAW_DATABASE = initial;
  await saveMasterRoster(initial);
  await executeDailyOracleQuery(true);
  renderDeletePatientModalList();
  showToast('✅ Varsayılan 17 hasta (Pzt-Çar-Cum & Sal-Per-Cmt) tüm tarihler için veritabanına geri yüklendi.');
}

// ----------------------------------------------------------------------------
// FONKSİYON: toggleFullscreen()
// AMAÇ: TV bekleme ekranını tarayıcı Fullscreen API ile tek tıkla tam ekran moduna almak veya tam ekrandan çıkmak.
// ----------------------------------------------------------------------------
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => { });
  } else {
    document.exitFullscreen().catch(() => { });
  }
}

// TV Bekleme Salonu Ekranı İçin Otomatik Tam Ekran Giriş Yöneticisi
function initDisplayAutoFullscreen() {
  const tryEnterFullscreen = () => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {
        // Modern tarayıcılar (Chrome/Edge) güvenlik politikası gereği ilk tam ekran geçişi için kullanıcı jesti (tıklama/tuş) bekleyebilir
      });
    }
  };

  // 1. Sayfa yüklendiğinde derhal tam ekrana geçmeyi dene (Kiosk modu veya yetkili pencereler için)
  setTimeout(tryEnterFullscreen, 300);

  // 2. Tarayıcı kullanıcı etkileşimi kısıtı uyguluyorsa; bekleme ekranına yapılan ilk tıklama/dokunma/tuşta anında tam ekrana geçir
  const gestureEvents = ['click', 'keydown', 'touchstart', 'pointerdown'];
  const onFirstInteraction = () => {
    tryEnterFullscreen();
    gestureEvents.forEach(evt => window.removeEventListener(evt, onFirstInteraction));
  };
  gestureEvents.forEach(evt => window.addEventListener(evt, onFirstInteraction, { passive: true }));
}

document.addEventListener('DOMContentLoaded', () => {
  // URL parametresi veya body attribute'una göre başlangıç ekran modunu belirle
  const urlParams = new URLSearchParams(window.location.search);
  const paramMode = urlParams.get('ekran') || urlParams.get('mode');
  const bodyMode = document.body.getAttribute('data-screen-mode');

  // TV Ünitesi Seçimi: ?tv=1, ?tv=2, ?tv=3
  const tvParam = urlParams.get('tv') || urlParams.get('unite');
  if (tvParam && ['1', '2', '3'].includes(tvParam)) {
    selectedTvUnitParam = tvParam;
  }

  if (paramMode === 'display' || paramMode === 'bekleme' || paramMode === 'tv' || selectedTvUnitParam) {
    switchScreenMode('display');
  } else if (paramMode === 'secretary' || paramMode === 'sekreter') {
    switchScreenMode('secretary');
  } else if (bodyMode === 'display' || bodyMode === 'secretary') {
    switchScreenMode(bodyMode);
  } else {
    switchScreenMode('secretary');
  }

  // Bekleme TV ekranı modunda otomatik tam ekranı devreye al
  const isDisplayScreen = (paramMode === 'display' || paramMode === 'bekleme' || paramMode === 'tv' || bodyMode === 'display' || window.location.pathname.includes('display.html') || Boolean(selectedTvUnitParam));
  if (isDisplayScreen) {
    initDisplayAutoFullscreen();
  }

  updateSoundUI();

  startClock();
  updateTickerMessage(DEFAULT_PERMANENT_TICKER_TEXT, true);
  checkAuthStatus(); // Sekreter oturumunu kontrol et
  updateCalendarInfoBar(); // Takvim ve gün grubu çubuğunu başlat
  executeDailyOracleQuery(false); // Kalıcı takvim hastalarını ve seanslarını yükle
  startMultiYearCalendarAutoRefresh(); // Yıllarca çalışan otomatik gün/takvim kontrolünü başlat
  startSlideAutomation();

  // Otomatik Bekleme Ekranı & Çalışma Saatleri (Madde 1 & 2)
  loadSystemSettings();
  checkTvScreenSessionAndSchedule();

  // TV Ekranı oturum ve mesai takip döngüsü (her 2.5 saniyede bir)
  setInterval(() => {
    checkTvScreenSessionAndSchedule();
  }, 2500);

  // Sekmeler / Cihazlar arası oturum sinyalini anında yakala
  window.addEventListener('storage', (e) => {
    if (e.key === 'diyaliz_auth_token' || e.key === 'diyaliz_logged_user' || e.key === 'diyaliz_sync_broadcast_v1' || e.key === 'diyaliz_is_authenticated' || e.key === 'diyaliz_active_session') {
      checkTvScreenSessionAndSchedule();
    }
  });

  // Seansı biten hastaların 2 dakika (120 sn) boyunca saniye saniye geri sayımı ve süre dolunca otomatik kaldırılması (Madde 6)
  setInterval(() => {
    // 1. Sekreter panelindeki geri sayım rozetlerini her saniye canlı güncelle (120, 119, 118... sn)
    tickCompletedPatientCountdowns();

    // 2. 120 saniyesi (2 dakika) dolanları hem TV bekleme ekranından hem sekreter listesinden sil
    const expired = purgeExpiredCompletedPatients();
    if (expired) {
      if (isDisplayScreenMode()) {
        renderTvSlides();
      } else {
        renderSecretaryPanel(true);
      }
    }
  }, 1000);

  // View sorgusuna bağlı arka plan dinamik liste güncelleme polling'i (Madde 5)
  setInterval(() => {
    pollPatientViewUpdates();
  }, 7000);

  const searchInput = document.getElementById('secretary-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      secretarySearchTerm = e.target.value.trim();
      renderSecretaryPanel(true);
    });
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderTvSlides();
    }, 200);
  });

  document.body.addEventListener('click', () => {
    initAudioContext();
  }, { once: true });
});
