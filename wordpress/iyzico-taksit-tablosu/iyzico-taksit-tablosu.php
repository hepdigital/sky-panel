<?php
/**
 * Plugin Name: İyzico Taksit Tablosu By Ogün
 * Description: WooCommerce ürünleri için İyzico taksit oranlarını gösteren tablo. Oranlar mağazanın iyzico hesabından günde iki kez otomatik alınır. Shortcode: [iyzico_taksit_tablosu]
 * Version: 1.1.0
 * Author: Ogün
 * Text Domain: iyzico-taksit-tablosu
 * Requires at least: 5.0
 * Requires PHP: 7.2
 * WC requires at least: 3.0
 * WC tested up to: 8.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly
}

// Check if WooCommerce is active
if ( ! in_array( 'woocommerce/woocommerce.php', apply_filters( 'active_plugins', get_option( 'active_plugins' ) ) ) ) {
    return;
}

class ITTBO_Iyzico_Taksit_Tablosu {

    /**
     * Constructor
     */
    public function __construct() {
        // Admin menu
        add_action( 'admin_menu', array( $this, 'ittbo_add_admin_menu' ) );
        add_action( 'admin_init', array( $this, 'ittbo_register_settings' ) );
        
        // Shortcode
        add_shortcode( 'iyzico_taksit_tablosu', array( $this, 'ittbo_render_shortcode' ) );
        add_shortcode( 'iyzico_taksit_link', array( $this, 'ittbo_render_link_shortcode' ) );
        
        // Enqueue scripts and styles
        add_action( 'wp_enqueue_scripts', array( $this, 'ittbo_enqueue_assets' ) );
        
        // Admin notices
        add_action( 'admin_notices', array( $this, 'ittbo_admin_notices' ) );

        // iyzico'dan otomatik oran güncellemesi (günde iki kez) ve ayarlardaki "Şimdi güncelle" düğmesi
        add_action( self::CRON_HOOK, array( $this, 'ittbo_refresh_rates' ) );
        add_action( 'init', array( $this, 'ittbo_schedule' ) );
        add_action( 'admin_post_ittbo_refresh', array( $this, 'ittbo_handle_refresh' ) );
    }

    const CRON_HOOK     = 'ittbo_iyzico_rates_refresh';
    const LIVE_RATES    = 'ittbo_iyzico_live_rates';
    const MONTHS        = array( 2, 3, 6, 9, 12 );
    const DEFAULT_RATES = array( 2 => 3.46, 3 => 5.51, 6 => 12.56, 9 => 20.62, 12 => 29.74 );

    public function ittbo_schedule() {
        if ( ! wp_next_scheduled( self::CRON_HOOK ) ) {
            wp_schedule_event( time() + 60, 'twicedaily', self::CRON_HOOK );
        }
    }

    /**
     * iyzico'dan vade farklarını alır (mağazanın iyzico WooCommerce eklentisindeki API anahtarlarıyla).
     * 10.000 TL üzerinden hesaplanır; kart aileleri arasında fark varsa en yüksek oran alınır (müşteri eksik görmesin).
     * Başarılıysa true, değilse hata mesajı döner. Başarısızlıkta son alınan oranlar korunur.
     */
    public function ittbo_refresh_rates() {
        $set = get_option( 'woocommerce_iyzico_settings' );
        if ( ! class_exists( '\Iyzipay\Options' ) || ! is_array( $set ) || empty( $set['api_key'] ) || empty( $set['secret_key'] ) ) {
            return 'iyzico WooCommerce eklentisi kurulu değil ya da API anahtarları girilmemiş.';
        }
        try {
            $o = new \Iyzipay\Options();
            $o->setApiKey( $set['api_key'] );
            $o->setSecretKey( $set['secret_key'] );
            $o->setBaseUrl( ! empty( $set['api_type'] ) ? $set['api_type'] : 'https://api.iyzipay.com' );
            $r = new \Iyzipay\Request\RetrieveInstallmentInfoRequest();
            $r->setLocale( 'tr' );
            $r->setConversationId( 'ittbo-' . time() );
            $r->setPrice( '10000' );
            $info = \Iyzipay\Model\InstallmentInfo::retrieve( $r, $o );
        } catch ( \Throwable $e ) {
            return 'iyzico isteği başarısız: ' . $e->getMessage();
        }
        if ( 'success' !== $info->getStatus() ) {
            return 'iyzico hatası: ' . $info->getErrorMessage();
        }
        $rates = array();
        foreach ( (array) $info->getInstallmentDetails() as $d ) {
            foreach ( (array) $d->getInstallmentPrices() as $p ) {
                $n = (int) $p->getInstallmentNumber();
                if ( in_array( $n, self::MONTHS, true ) && $p->getTotalPrice() > 0 ) {
                    $rate        = round( ( (float) $p->getTotalPrice() / 10000 - 1 ) * 100, 2 );
                    $rates[ $n ] = max( isset( $rates[ $n ] ) ? $rates[ $n ] : 0, $rate );
                }
            }
        }
        if ( ! $rates ) {
            return 'iyzico taksit oranı döndürmedi (hesapta taksit kapalı olabilir).';
        }
        ksort( $rates );
        $old = get_option( self::LIVE_RATES );
        update_option( self::LIVE_RATES, array( 'rates' => $rates, 'time' => time() ), false );
        if ( ! is_array( $old ) || $old['rates'] != $rates ) {
            do_action( 'litespeed_purge_all' ); // sayfa önbelleği eski oranları göstermesin
        }
        return true;
    }

    public function ittbo_handle_refresh() {
        if ( ! current_user_can( 'manage_options' ) || ! check_admin_referer( 'ittbo_refresh' ) ) {
            wp_die( 'Yetkiniz yok.' );
        }
        $res = $this->ittbo_refresh_rates();
        set_transient( 'ittbo_refresh_msg', true === $res ? 'ok' : $res, 60 );
        wp_safe_redirect( admin_url( 'options-general.php?page=ittbo-iyzico-taksit' ) );
        exit;
    }

    /**
     * Gösterilecek oranlar (yüzde): otomatik açıksa iyzico'dan alınanlar, yoksa elle girilenler, o da yoksa varsayılanlar.
     */
    public function ittbo_get_rates() {
        $rates_db = get_option( 'ittbo_iyzico_rates', array() );
        $live     = get_option( self::LIVE_RATES );
        $auto     = 'yes' === get_option( 'ittbo_iyzico_auto', 'yes' ) && is_array( $live ) && ! empty( $live['rates'] );
        $out      = array();
        foreach ( self::MONTHS as $month ) {
            if ( $auto && isset( $live['rates'][ $month ] ) ) {
                $out[ $month ] = (float) $live['rates'][ $month ];
            } elseif ( is_array( $rates_db ) && isset( $rates_db[ $month ] ) && $rates_db[ $month ] !== '' ) {
                $out[ $month ] = (float) $rates_db[ $month ];
            } else {
                $out[ $month ] = self::DEFAULT_RATES[ $month ];
            }
        }
        return $out;
    }

    public function ittbo_sanitize_auto( $value ) {
        return 'yes' === $value ? 'yes' : 'no';
    }

    /**
     * Admin notices
     */
    public function ittbo_admin_notices() {
        if ( ! class_exists( 'WooCommerce' ) ) {
            ?>
            <div class="notice notice-error">
                <p><strong>İyzico Taksit Tablosu By Ogün:</strong> Bu eklenti çalışmak için WooCommerce gerektirir.</p>
            </div>
            <?php
        }
    }

    /**
     * Enqueue CSS and JS
     */
    public function ittbo_enqueue_assets() {
        wp_register_style( 
            'ittbo-iyzico-style', 
            plugin_dir_url( __FILE__ ) . 'assets/css/ittbo-style.css',
            array(),
            '1.0.0'
        );
        
        wp_register_script( 
            'ittbo-iyzico-script', 
            plugin_dir_url( __FILE__ ) . 'assets/js/ittbo-script.js',
            array('jquery'),
            '1.0.0',
            true
        );
    }

    /**
     * Add admin menu
     */
    public function ittbo_add_admin_menu() {
        add_options_page(
            'İyzico Taksit Tablosu Ayarları',
            'İyzico Taksit Tablosu',
            'manage_options',
            'ittbo-iyzico-taksit',
            array( $this, 'ittbo_settings_page_html' )
        );
    }

    /**
     * Register settings
     */
    public function ittbo_register_settings() {
        register_setting( 'ittbo_iyzico_options', 'ittbo_iyzico_rates' );
        register_setting( 'ittbo_iyzico_options', 'ittbo_iyzico_banks' );
        register_setting( 'ittbo_iyzico_options', 'ittbo_iyzico_use_tax' );
        register_setting( 'ittbo_iyzico_options', 'ittbo_iyzico_auto', array( 'sanitize_callback' => array( $this, 'ittbo_sanitize_auto' ) ) );
    }

    /**
     * Settings page HTML
     */
    public function ittbo_settings_page_html() {
        if ( ! current_user_can( 'manage_options' ) ) {
            return;
        }

        // Save feedback
        if ( isset( $_GET['settings-updated'] ) ) {
            add_settings_error(
                'ittbo_iyzico_messages',
                'ittbo_iyzico_message',
                'Ayarlar kaydedildi.',
                'updated'
            );
        }

        $msg = get_transient( 'ittbo_refresh_msg' );
        if ( $msg ) {
            delete_transient( 'ittbo_refresh_msg' );
            echo 'ok' === $msg
                ? '<div class="notice notice-success"><p>Oranlar iyzico\'dan güncellendi.</p></div>'
                : '<div class="notice notice-error"><p>' . esc_html( $msg ) . '</p></div>';
        }

        settings_errors( 'ittbo_iyzico_messages' );
        $auto = get_option( 'ittbo_iyzico_auto', 'yes' );
        $live = get_option( self::LIVE_RATES );

        $rates = get_option( 'ittbo_iyzico_rates', array() );
        $banks = get_option( 'ittbo_iyzico_banks', array() );
        $use_tax = get_option( 'ittbo_iyzico_use_tax', 'yes' );
        
        // Default values
        $default_rates = array(
            2 => 3.46,
            3 => 5.51,
            6 => 12.56,
            9 => 20.62,
            12 => 29.74
        );

        $default_banks = array(
            array( 'name' => 'Akbank', 'color' => '#dda905' ),
            array( 'name' => 'Denizbank', 'color' => '#01633a' ),
            array( 'name' => 'İş Bankası', 'color' => '#ca016f' ),
            array( 'name' => 'Halk Bankası', 'color' => '#01a4be' ),
            array( 'name' => 'QNB', 'color' => '#333333' ),
            array( 'name' => 'Kuveyt Türk', 'color' => '#333333' ),
            array( 'name' => 'Albaraka Türk', 'color' => '#504b81' ),
        );

        if ( empty( $banks ) ) {
            $banks = $default_banks;
        }
        ?>
        <div class="wrap">
            <h1><?php echo esc_html( get_admin_page_title() ); ?></h1>
            
            <form method="post" action="options.php">
                <?php
                settings_fields( 'ittbo_iyzico_options' );
                do_settings_sections( 'ittbo_iyzico_options' );
                ?>
                
                <h2>KDV Ayarları</h2>
                <table class="form-table">
                    <tr>
                        <th scope="row">Fiyat Hesaplama</th>
                        <td>
                            <label>
                                <input type="checkbox" name="ittbo_iyzico_use_tax" value="yes" <?php checked( $use_tax, 'yes' ); ?>>
                                Taksit hesaplamasında KDV dahil fiyat kullan
                            </label>
                            <p class="description">
                                Bu seçenek aktifse, ürünün KDV dahil fiyatı kullanılır. 
                                Eğer WooCommerce'de fiyatlar KDV hariç gösteriliyorsa, KDV otomatik olarak eklenecektir.
                            </p>
                        </td>
                    </tr>
                </table>

                <h2>Vade Farkı Oranları</h2>
                <table class="form-table">
                    <tr>
                        <th scope="row">Otomatik Oranlar</th>
                        <td>
                            <input type="hidden" name="ittbo_iyzico_auto" value="no">
                            <label>
                                <input type="checkbox" name="ittbo_iyzico_auto" value="yes" <?php checked( $auto, 'yes' ); ?>>
                                Oranları iyzico hesabından otomatik al (günde iki kez güncellenir)
                            </label>
                            <p class="description">
                                iyzico WooCommerce eklentisindeki API anahtarları kullanılır. Oranlar alınamazsa aşağıdaki elle girilen oranlar gösterilir.
                            </p>
                            <?php if ( is_array( $live ) && ! empty( $live['rates'] ) ) : ?>
                                <p style="margin-top: 8px;">
                                    <strong>iyzico'dan alınan oranlar</strong>
                                    (<?php echo esc_html( wp_date( 'd.m.Y H:i', (int) $live['time'] ) ); ?>):
                                    <?php
                                    $parts = array();
                                    foreach ( $live['rates'] as $n => $r ) {
                                        $parts[] = $n . ' taksit %' . number_format( (float) $r, 2, ',', '.' );
                                    }
                                    echo esc_html( implode( ' · ', $parts ) );
                                    ?>
                                </p>
                            <?php else : ?>
                                <p style="margin-top: 8px;">Henüz iyzico'dan oran alınmadı.</p>
                            <?php endif; ?>
                            <p>
                                <a class="button" href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=ittbo_refresh' ), 'ittbo_refresh' ) ); ?>">Şimdi güncelle</a>
                            </p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Taksit Oranları (%)</th>
                        <td>
                            <p class="description">Vade farkı oranlarını yüzde olarak girin. Örnek: %5.51 için <strong>5.51</strong> yazın. Otomatik oranlar açıksa yalnızca iyzico'ya ulaşılamadığında kullanılır.</p>
                            <table class="widefat" style="max-width: 500px; margin-top: 10px;">
                                <thead>
                                    <tr>
                                        <th>Taksit Sayısı</th>
                                        <th>Vade Farkı Oranı (%)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <?php foreach ( array( 2, 3, 6, 9, 12 ) as $month ): ?>
                                        <?php
                                        $current_rate = isset( $rates[$month] ) && $rates[$month] !== '' 
                                            ? $rates[$month] 
                                            : $default_rates[$month];
                                        ?>
                                        <tr>
                                            <td><strong><?php echo $month; ?> Taksit</strong></td>
                                            <td>
                                                <input 
                                                    type="number" 
                                                    step="0.01" 
                                                    name="ittbo_iyzico_rates[<?php echo $month; ?>]" 
                                                    value="<?php echo esc_attr( $current_rate ); ?>"
                                                    style="width: 100px;"
                                                > %
                                            </td>
                                        </tr>
                                    <?php endforeach; ?>
                                </tbody>
                            </table>
                        </td>
                    </tr>
                </table>

                <h2>Banka Ayarları</h2>
                <table class="form-table">
                    <tr>
                        <th scope="row">Bankalar ve Renkler</th>
                        <td>
                            <table class="widefat" style="max-width: 600px;">
                                <thead>
                                    <tr>
                                        <th>Banka Adı</th>
                                        <th>Renk Kodu</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <?php foreach ( $banks as $index => $bank ): ?>
                                        <tr>
                                            <td>
                                                <input 
                                                    type="text" 
                                                    name="ittbo_iyzico_banks[<?php echo $index; ?>][name]" 
                                                    value="<?php echo esc_attr( $bank['name'] ); ?>"
                                                    style="width: 200px;"
                                                >
                                            </td>
                                            <td>
                                                <input 
                                                    type="color" 
                                                    name="ittbo_iyzico_banks[<?php echo $index; ?>][color]" 
                                                    value="<?php echo esc_attr( $bank['color'] ); ?>"
                                                    style="width: 80px; height: 35px;"
                                                >
                                                <input 
                                                    type="text" 
                                                    value="<?php echo esc_attr( $bank['color'] ); ?>"
                                                    readonly
                                                    style="width: 100px; margin-left: 5px;"
                                                >
                                            </td>
                                        </tr>
                                    <?php endforeach; ?>
                                </tbody>
                            </table>
                            <p class="description">Tabloda gösterilecek bankaları ve renklerini düzenleyin.</p>
                        </td>
                    </tr>
                </table>

                <hr>
                
                <h2>Kullanım</h2>
                <p>Ürün sayfalarında taksit tablosunu göstermek için şu shortcode'ları kullanın:</p>
                <p><strong>Tablo olarak:</strong> <code>[iyzico_taksit_tablosu]</code></p>
                <p><strong>Link olarak (Modal popup):</strong> <code>[iyzico_taksit_link]</code></p>
                <p class="description">Bu shortcode'ları ürün açıklamasına, kısa açıklamasına veya tema dosyalarınıza ekleyebilirsiniz.</p>

                <?php submit_button( 'Ayarları Kaydet' ); ?>
            </form>
        </div>
        <?php
    }

    /**
     * Link shortcode renderer (opens modal)
     */
    public function ittbo_render_link_shortcode( $atts ) {
        global $product;

        // Check if we're on a product page and product exists
        if ( ! is_product() || ! $product ) {
            return '';
        }

        // Enqueue assets
        wp_enqueue_style( 'ittbo-iyzico-style' );
        wp_enqueue_script( 'ittbo-iyzico-script' );

        // Get settings for modal content
        $use_tax = get_option( 'ittbo_iyzico_use_tax', 'yes' );
        
        if ( $use_tax === 'yes' ) {
            $price = wc_get_price_including_tax( $product );
        } else {
            $price = wc_get_price_excluding_tax( $product );
        }

        $final_rates = array();
        foreach ( $this->ittbo_get_rates() as $month => $rate ) {
            $final_rates[ $month ] = $rate / 100;
        }

        $banks = get_option( 'ittbo_iyzico_banks', array() );
        if ( empty( $banks ) ) {
            $banks = array(
                array( 'name' => 'Akbank', 'color' => '#dda905' ),
                array( 'name' => 'Denizbank', 'color' => '#01633a' ),
                array( 'name' => 'İş Bankası', 'color' => '#ca016f' ),
                array( 'name' => 'Halk Bankası', 'color' => '#01a4be' ),
                array( 'name' => 'QNB', 'color' => '#333333' ),
                array( 'name' => 'Kuveyt Türk', 'color' => '#333333' ),
                array( 'name' => 'Albaraka Türk', 'color' => '#504b81' ),
            );
        }

        wp_localize_script( 'ittbo-iyzico-script', 'ittboIyzicoSettings', array(
            'initialPrice' => $price,
            'rates' => $final_rates,
            'banks' => $banks,
            'currencySymbol' => get_woocommerce_currency_symbol()
        ));

        ob_start();
        ?>
        <a href="#" class="ittbo-modal-trigger" data-product-id="<?php echo esc_attr( $product->get_id() ); ?>">
            Taksit Tablosu
        </a>
        
        <div id="ittbo-modal" class="ittbo-modal">
            <div class="ittbo-modal-overlay"></div>
            <div class="ittbo-modal-content">
                <button class="ittbo-modal-close">&times;</button>
                <h3 class="ittbo-modal-title">Taksit Seçenekleri</h3>
                <div id="ittbo-iyzico-installment-modal" class="ittbo-container" data-product-id="<?php echo esc_attr( $product->get_id() ); ?>">
                    <div class="ittbo-loader">Taksit tablosu yükleniyor...</div>
                </div>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }

    /**
     * Shortcode renderer
     */
    public function ittbo_render_shortcode( $atts ) {
        global $product;

        // Check if we're on a product page and product exists
        if ( ! is_product() || ! $product ) {
            return '<div class="ittbo-error">Bu tablo sadece ürün sayfalarında gösterilir.</div>';
        }

        // Enqueue assets
        wp_enqueue_style( 'ittbo-iyzico-style' );
        wp_enqueue_script( 'ittbo-iyzico-script' );

        // Get settings
        $use_tax = get_option( 'ittbo_iyzico_use_tax', 'yes' );
        
        // Calculate price with or without tax
        if ( $use_tax === 'yes' ) {
            // Use price including tax
            $price = wc_get_price_including_tax( $product );
        } else {
            // Use price excluding tax
            $price = wc_get_price_excluding_tax( $product );
        }

        // Rates: iyzico (automatic) → manual → defaults, converted to decimal
        $final_rates = array();
        foreach ( $this->ittbo_get_rates() as $month => $rate ) {
            $final_rates[ $month ] = $rate / 100; // Convert percentage to decimal
        }

        // Get banks
        $banks = get_option( 'ittbo_iyzico_banks', array() );
        if ( empty( $banks ) ) {
            $banks = array(
                array( 'name' => 'Akbank', 'color' => '#dda905' ),
                array( 'name' => 'Denizbank', 'color' => '#01633a' ),
                array( 'name' => 'İş Bankası', 'color' => '#ca016f' ),
                array( 'name' => 'Halk Bankası', 'color' => '#01a4be' ),
                array( 'name' => 'QNB', 'color' => '#333333' ),
                array( 'name' => 'Kuveyt Türk', 'color' => '#333333' ),
                array( 'name' => 'Albaraka Türk', 'color' => '#504b81' ),
            );
        }

        // Localize script data
        wp_localize_script( 'ittbo-iyzico-script', 'ittboIyzicoSettings', array(
            'initialPrice' => $price,
            'rates' => $final_rates,
            'banks' => $banks,
            'currencySymbol' => get_woocommerce_currency_symbol()
        ));

        // Return HTML
        ob_start();
        ?>
        <div id="ittbo-iyzico-installment-container" class="ittbo-container" data-product-id="<?php echo esc_attr( $product->get_id() ); ?>">
            <div class="ittbo-loader">Taksit tablosu yükleniyor...</div>
        </div>
        <?php
        return ob_get_clean();
    }
}

// Initialize the plugin
new ITTBO_Iyzico_Taksit_Tablosu();

// Eklenti kapatılınca zamanlanmış oran güncellemesi kaldırılır
register_deactivation_hook( __FILE__, function () {
    wp_clear_scheduled_hook( ITTBO_Iyzico_Taksit_Tablosu::CRON_HOOK );
} );