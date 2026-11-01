/** Kargo firmaları ve takip adresi şablonu ({no} yerine takip numarası); GazeboTente sitesindeki listeyle aynı */
export const KARGOLAR = [
  { key: "yurtici", label: "Yurtiçi Kargo", url: "https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code={no}" },
  { key: "aras", label: "Aras Kargo", url: "https://kargotakip.araskargo.com.tr/mainpage.aspx?code={no}" },
  { key: "mng", label: "MNG Kargo", url: "https://www.mngkargo.com.tr/gonderi-takip/?code={no}" },
  { key: "surat", label: "Sürat Kargo", url: "https://www.suratkargo.com.tr/KargoTakip/?kargotakipno={no}" },
  { key: "ptt", label: "PTT Kargo", url: "https://gonderitakip.ptt.gov.tr/Track/Verify?q={no}" },
  { key: "ambar", label: "Ambar / nakliye", url: "" },
  { key: "elden", label: "Elden teslim", url: "" },
];

export const kargoAd = (key: string | null | undefined) => KARGOLAR.find((k) => k.key === key)?.label ?? key ?? "";

export function takipLinki(firma: string | null | undefined, no: string | null | undefined) {
  const k = KARGOLAR.find((x) => x.key === firma);
  return k?.url && no ? k.url.replace("{no}", encodeURIComponent(no.trim())) : null;
}
