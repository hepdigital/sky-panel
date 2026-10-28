# Duvar fiyatları — notlar

Durum: 2026-10-28. Kaynak: SKY fiyat terminali broşür listesi (`src/lib/terminal/fiyatlar.json`, terminaldeki
`inc/fiyatlar.js` ile birebir aynı). Fiyatlar KDV hariç; aşağıdaki örnekler perakende, 690D.

## Kurallar (uygulamada)

- Fiyat duvarın ölçü grubundan alınır (200x200, 200x300, 200x450, 200x600, 230x400, 230x600, 230x800).
- Seçim broşürdeki bir ürüne birebir denk gelirse **broşür fiyatı** kullanılır (karar: PDF'te yazan geçerlidir).
- Denk gelmezse: o grubun düz tam duvarı + modüller. Pencere (137×137) ve kapı (90 cm) her ölçüde aynı olduğundan
  modüller ölçüden bağımsızdır; 3 m duvarın (200x300) farklarından alınır:

| Modül | 690D | 200D | Baskılı |
|---|---|---|---|
| Pencere PVC | 450 | 600 | — |
| Pencere perde | 400 | 400 | — |
| Pencere sineklik | 500 | 450 | — |
| Kapı (perdeli) | 350 | 350 | 400 |
| Kapı sineklik | 950 | 950 | — |

(Toptan fiyatlarda aynı yöntemle toptan listeden; "—" olan seçim o kumaşta satılmaz.)

## Broşürde kontrol edilecek satırlar (uzmanla görüşülecek)

Bu satırlar broşürde yazdığı gibi kullanılıyor; tutarsız görünüyor:

1. **Kapı eklemek pencereli duvarı pahalandırmıyor / ucuzlatıyor**
   - 200x200: PVC + kapı 1.900 = PVC + perde 1.900 (kapı bedelsiz)
   - 200x450: PVC + kapı 3.850 < PVC + perde 4.200
   - 200x600: PVC + kapı 4.450 < PVC + perde 4.700
2. **200x200'de PVC pencere** düz duvara göre yalnızca +100 (3 m'de +450).
3. **Pencere sinekliği uzun duvarlarda çok yüksek** (PVC + sineklik + perde − PVC + perde):
   230x400 +1.100, 230x600 +2.750, 230x800 +4.000 (3 m'de +500). Uzun duvarda birden çok pencere varsa doğru olabilir.
4. **Kapı farkı ölçüye göre dalgalı** (çift fermuarlı kapı − düz tam): 200x200 +450, 200x300 +350, 200x450 +650, 200x600 +300.
5. **Şeffaf PVC + Perde + Kapı** (200x300'de 3.150): kapıya PVC takılmadığı için kullanılmıyor; eski kayıtlar "PVC + kapı" olarak açılır.

## GazeboTente sitesi

- Duvar fiyatları terminal perakende × 1,20 (KDV dahil) ile aynı; uzun kenarlı ölçülerde (3x6, 4x8) her bölme ayrı duvar
  olarak fiyatlanır (panelde "iki parça" seçimiyle aynı).
- 4x6'nın uzun kenarındaki 2 m bölmeler (230 cm) broşürde yok: kumaş m²'sine göre 230x600 duvarın üçte biri
  + modüller olarak hesaplandı (2026-10-28). Uzmanla görüşülüp kesinleştirilecek.
