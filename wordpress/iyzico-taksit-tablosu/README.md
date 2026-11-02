# İyzico Taksit Tablosu By Ogün

WordPress WooCommerce ürünleri için İyzico taksit oranlarını gösteren profesyonel taksit tablosu eklentisi.

## 📋 Özellikler

- ✅ WooCommerce entegrasyonu
- ✅ Shortcode desteği: `[iyzico_taksit_tablosu]`
- ✅ KDV dahil/hariç fiyat seçeneği
- ✅ Özelleştirilebilir vade farkı oranları (2, 3, 6, 9, 12 taksit)
- ✅ Banka renkleri ve isimleri düzenlenebilir
- ✅ Responsive tasarım
- ✅ Varyasyonlu ürünler ile otomatik çalışma
- ✅ Mobil uyumlu sticky (yapışkan) kolon

## 📦 Kurulum

### Dosya Yapısı

Eklentiyi şu şekilde oluşturun:

```
wp-content/plugins/iyzico-taksit-tablosu/
├── iyzico-taksit-tablosu.php
├── assets/
│   ├── css/
│   │   └── ittbo-style.css
│   └── js/
│       └── ittbo-script.js
└── README.md
```

### Adım Adım Kurulum

1. **Dosyaları Oluşturun**
   - `wp-content/plugins/` klasörü içinde `iyzico-taksit-tablosu` adında yeni bir klasör oluşturun
   - Ana plugin dosyasını (`iyzico-taksit-tablosu.php`) bu klasöre kaydedin
   - `assets/css/` ve `assets/js/` klasörlerini oluşturun
   - CSS ve JS dosyalarını ilgili klasörlere kaydedin

2. **Eklentiyi Aktif Edin**
   - WordPress yönetim paneline gidin
   - **Eklentiler** menüsüne tıklayın
   - "İyzico Taksit Tablosu By Ogün" eklentisini bulun
   - **Etkinleştir** butonuna tıklayın

3. **Ayarları Yapılandırın**
   - **Ayarlar → İyzico Taksit Tablosu** menüsüne gidin
   - KDV ayarlarını yapılandırın
   - Vade farkı oranlarını girin (varsayılan değerler hazır)
   - Banka isimlerini ve renklerini düzenleyin
   - **Ayarları Kaydet** butonuna tıklayın

## 🎯 Kullanım

### Shortcode Kullanımı

Taksit tablosunu göstermek için 2 farklı shortcode kullanabilirsiniz:

**1. Tablo olarak (Direkt gösterim):**
```
[iyzico_taksit_tablosu]
```

**2. Link olarak (Modal popup):**
```
[iyzico_taksit_link]
```
Bu shortcode "Taksit Tablosu" yazısını altı çizili link olarak gösterir. Tıklandığında modal popup açılır ve içinde taksit tablosu görüntülenir.

### Shortcode Ekleme Yerleri

1. **Ürün Açıklamasına Ekleme**
   - Ürün düzenleme sayfasında "Açıklama" alanına shortcode'u ekleyin

2. **Kısa Açıklamaya Ekleme**
   - Ürün düzenleme sayfasında "Kısa açıklama" alanına shortcode'u ekleyin

3. **Tema Dosyasına Ekleme**
   ```php
   <?php echo do_shortcode('[iyzico_taksit_tablosu]'); ?>
   // veya
   <?php echo do_shortcode('[iyzico_taksit_link]'); ?>
   ```

4. **Tüm Ürünlere Otomatik Ekleme**
   Tema'nızın `functions.php` dosyasına:
   ```php
   // Tablo olarak
   add_action('woocommerce_single_product_summary', function() {
       echo do_shortcode('[iyzico_taksit_tablosu]');
   }, 25);
   
   // veya Link olarak
   add_action('woocommerce_single_product_summary', function() {
       echo do_shortcode('[iyzico_taksit_link]');
   }, 25);
   ```

## ⚙️ Ayarlar

### KDV Ayarları

- **KDV Dahil Fiyat Kullan**: Aktif edildiğinde taksit hesaplamalarında KDV dahil fiyat kullanılır
- WooCommerce'de fiyatlar KDV hariç gösteriliyorsa, eklenti otomatik olarak KDV'yi ekler

### Vade Farkı Oranları

Varsayılan oranlar:
- 2 Taksit: %3.46
- 3 Taksit: %5.51
- 6 Taksit: %12.56
- 9 Taksit: %20.62
- 12 Taksit: %29.74

### Banka Ayarları

Varsayılan bankalar:
- Akbank (#dda905)
- Denizbank (#01633a)
- İş Bankası (#ca016f)
- Halk Bankası (#01a4be)
- QNB (#333333)
- Kuveyt Türk (#333333)
- Albaraka Türk (#504b81)

## 💡 Örnek Senaryolar

### Senaryo 1: KDV Dahil Fiyat
- Ürün fiyatı: 2.250 TL (KDV Hariç)
- KDV oranı: %20
- KDV dahil: 2.700 TL
- Tablo 2.700 TL üzerinden hesaplanır

### Senaryo 2: Varyasyonlu Ürün
- Ana ürün fiyatı: 2.000 TL
- Varyasyon seçildiğinde: 2.500 TL
- Tablo otomatik olarak 2.500 TL'ye güncellenir

### Senaryo 3: 3 Taksit Hesaplama
- Ürün fiyatı: 2.700 TL
- Vade farkı: %5.51
- Toplam tutar: 2.700 × 1.0551 = 2.848,77 TL
- Aylık ödeme: 2.848,77 ÷ 3 = 949,59 TL

## 🔧 Teknik Detaylar

### Gereksinimler
- WordPress 5.0 veya üzeri
- WooCommerce 3.0 veya üzeri
- PHP 7.2 veya üzeri

### Kullanılan Class Önekleri
- **ITTBO_**: PHP class ve fonksiyon öneki
- **ittbo-**: CSS class öneki
- **ittboIyzicoSettings**: JavaScript global değişken

### Hooks ve Filtreler
Eklenti şu WooCommerce hook'larını kullanır:
- `show_variation`: Varyasyon değişikliklerini dinler
- `wc_get_price_including_tax()`: KDV dahil fiyat hesaplar
- `get_woocommerce_currency_symbol()`: Para birimi sembolü

## 🎨 Özelleştirme

### CSS Özelleştirme
Tema'nızın `style.css` dosyasına ekleyerek tabloyu özelleştirebilirsiniz:

```css
/* Tablo köşe yuvarlaklarını değiştir */
.ittbo-container {
    border-radius: 12px !important;
}

/* Başlık rengini değiştir */
.ittbo-table th {
    background-color: #your-color !important;
}
```

### Programatik Özelleştirme
```php
// Varsayılan oranları değiştir
add_filter('ittbo_default_rates', function($rates) {
    $rates[2] = 4.00; // 2 taksit için %4
    return $rates;
});
```

## 🐛 Sorun Giderme

### Tablo Görünmüyor
1. WooCommerce'in aktif olduğundan emin olun
2. Ürün sayfasında olduğunuzdan emin olun
3. Tarayıcı konsolunda JavaScript hataları kontrol edin

### Fiyat Yanlış Hesaplanıyor
1. Ayarlar sayfasından KDV ayarlarını kontrol edin
2. WooCommerce → Ayarlar → Vergi bölümünü kontrol edin
3. Vade farkı oranlarının doğru girildiğinden emin olun

### Varyasyon Değişince Tablo Güncellenmiyor
1. Tema'nızın WooCommerce uyumlu olduğundan emin olun
2. jQuery'nin doğru yüklendiğini kontrol edin
3. Tarayıcı konsolunda hata mesajları kontrol edin

## 📞 Destek

Bu eklenti hakkında sorularınız için:
- WordPress destek forumlarını kullanın
- Eklenti geliştirici ile iletişime geçin

## 📄 Lisans

Bu eklenti GPL v2 veya üzeri lisans ile dağıtılmaktadır.

## 🔄 Güncellemeler

### v1.0.0 (İlk Sürüm)
- Temel taksit tablosu özelliği
- WooCommerce entegrasyonu
- Admin panel ayarları
- Shortcode desteği
- KDV hesaplama
- Varyasyon desteği

---

**Geliştirici:** Ogün  
**Versiyon:** 1.0.0  
**Son Güncelleme:** 2024