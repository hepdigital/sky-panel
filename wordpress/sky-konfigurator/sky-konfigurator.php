<?php
/**
 * Plugin Name: SKY Konfigüratör
 * Description: SKY panelindeki gazebo konfigüratörünü siteye yerleştirir ve panelin imzaladığı tasarımı WooCommerce sepetine ekler. Fiyat panelde hesaplanır; site yalnızca imzayı doğrular.
 * Version: 1.1.0
 * Author: SKY Görsel Çözümler
 * Requires Plugins: woocommerce
 * Text Domain: sky-konfigurator
 *
 * Kurulum: wp-config.php'ye ortak anahtar (panelde KONFIGURATOR_SECRET ile aynı):
 *   define( 'SKY_KONFIGURATOR_SECRET', '...' );
 * Sayfa: içeriği [sky_konfigurator] olan sayfa tam ekran konfigüratör olarak açılır (tema başlığı ve altbilgisi olmadan).
 * Ürün: stok kodu SKY-GAZEBO-TASARLA olan, katalogda gizli bir WooCommerce ürünü; yalnızca konfigüratörden sepete düşer.
 */

defined( 'ABSPATH' ) || exit;

final class Sky_Konfigurator {
	const PANEL     = 'https://panel.skygorselmarket.com';
	const MARKA     = 'sky';
	const SKU       = 'SKY-GAZEBO-TASARLA';
	const SHORTCODE = 'sky_konfigurator';
	const FIELD     = 'sky_konfigurator_token';
	const KEY       = 'sky_konf';

	/** Yalnızca bu eklentinin eklemesine izin verilir (ürün sayfasından ya da ?add-to-cart ile eklenemez) */
	private static $adding = false;

	public static function init() {
		add_shortcode( self::SHORTCODE, array( __CLASS__, 'shortcode' ) );
		add_filter( 'template_include', array( __CLASS__, 'template' ), 99 );
		add_action( 'wp_loaded', array( __CLASS__, 'handle_post' ), 30 );
		add_filter( 'woocommerce_add_to_cart_validation', array( __CLASS__, 'validate_add' ), 10, 2 );
		add_action( 'woocommerce_cart_loaded_from_session', array( __CLASS__, 'drop_unsigned' ) );
		add_action( 'woocommerce_before_calculate_totals', array( __CLASS__, 'set_prices' ), 20 );
		add_filter( 'woocommerce_cart_item_name', array( __CLASS__, 'item_name' ), 10, 2 );
		add_filter( 'woocommerce_get_item_data', array( __CLASS__, 'item_data' ), 10, 2 );
		add_filter( 'woocommerce_cart_item_thumbnail', array( __CLASS__, 'item_thumb' ), 10, 2 );
		add_filter( 'woocommerce_cart_item_permalink', array( __CLASS__, 'item_link' ), 10, 2 );
		add_action( 'woocommerce_checkout_create_order_line_item', array( __CLASS__, 'order_item' ), 10, 3 );
		add_filter( 'woocommerce_order_item_thumbnail', array( __CLASS__, 'order_thumb' ), 10, 2 );
		add_filter( 'woocommerce_hidden_order_itemmeta', array( __CLASS__, 'hidden_meta' ) );
	}

	/* ───────────── bilet ───────────── */

	private static function secret() {
		return defined( 'SKY_KONFIGURATOR_SECRET' ) ? (string) SKY_KONFIGURATOR_SECRET : '';
	}

	private static function b64d( $s ) {
		return base64_decode( strtr( $s, '-_', '+/' ) . str_repeat( '=', ( 4 - strlen( $s ) % 4 ) % 4 ), true );
	}

	/** Panelin imzaladığı bileti doğrular; geçersiz ya da süresi geçmişse null */
	public static function verify( $token ) {
		$secret = self::secret();
		$parts  = explode( '.', (string) $token );
		if ( '' === $secret || 2 !== count( $parts ) ) {
			return null;
		}
		$sig = self::b64d( $parts[1] );
		if ( false === $sig || ! hash_equals( hash_hmac( 'sha256', $parts[0], $secret, true ), $sig ) ) {
			return null;
		}
		$p = json_decode( (string) self::b64d( $parts[0] ), true );
		if ( ! is_array( $p ) || 1 !== ( $p['v'] ?? 0 ) || self::MARKA !== ( $p['marka'] ?? '' ) || (int) ( $p['exp'] ?? 0 ) < time() ) {
			return null;
		}
		if ( ! isset( $p['fiyat'] ) || ! is_numeric( $p['fiyat'] ) || $p['fiyat'] <= 0 ) {
			return null;
		}
		return $p;
	}

	private static function product_id() {
		return (int) wc_get_product_id_by_sku( self::SKU );
	}

	/* ───────────── sayfa ───────────── */

	private static function frame_src() {
		// s=2: bu sürüm ek ürünleri sepete ekler ve ödemeye geçer (panel ekleri ve "Ödemeye geç"i buna göre gösterir)
		return self::PANEL . '/konfigurator/' . self::MARKA . '?gomulu=1&s=2';
	}

	/** Mesajı alıp bileti sepete gönderen betik (tam ekran sayfa ve kısa kod aynı betiği kullanır) */
	private static function script() {
		$panel = wp_json_encode( self::PANEL );
		$cart  = wp_json_encode( wc_get_cart_url() );
		$field = wp_json_encode( self::FIELD );
		return "<script>(function(){window.addEventListener('message',function(e){if(e.origin!=={$panel})return;var d=e.data||{};if(d.tip!=='sky-konfigurator:sepet'||!d.token)return;var f=document.createElement('form');f.method='post';f.action={$cart};var i=document.createElement('input');i.type='hidden';i.name={$field};i.value=d.token;f.appendChild(i);document.body.appendChild(f);f.submit();});})();</script>";
	}

	/** Kısa kod: tema sayfası içinde (tam ekran şablon kullanılmadığında) yüksekliği ekrana göre iframe */
	public static function shortcode() {
		return '<iframe class="sky-konf-frame" src="' . esc_url( self::frame_src() ) . '" title="Gazebo tasarla" allow="fullscreen" style="display:block;width:100%;height:calc(100vh - 80px);min-height:640px;border:0"></iframe>' . self::script();
	}

	/** Kısa kodun bulunduğu sayfa tam ekran açılır: üstte ince çubuk (logo, siteye dön, sepet), altında konfigüratör */
	public static function template( $template ) {
		if ( is_singular( 'page' ) ) {
			$post = get_post();
			if ( $post && has_shortcode( $post->post_content, self::SHORTCODE ) ) {
				return __DIR__ . '/tam-ekran.php';
			}
		}
		return $template;
	}

	/** Tam ekran şablonun ihtiyaçları */
	public static function page_vars() {
		$logo_id = (int) get_theme_mod( 'custom_logo' );
		return array(
			'title'  => wp_get_document_title(),
			'icon'   => get_site_icon_url( 64 ),
			'logo'   => $logo_id ? wp_get_attachment_image_url( $logo_id, 'medium' ) : apply_filters( 'sky_konfigurator_logo', content_url( 'uploads/2024/09/sky-gorsel-market-logo.png' ) ),
			'home'   => home_url( '/' ),
			'cart'   => wc_get_cart_url(),
			'src'    => self::frame_src(),
			'script' => self::script(),
		);
	}

	/* ───────────── sepet ───────────── */

	/**
	 * Bilet sepet sayfasına POST edilir: doğrulanır, ürün imzalı tasarımla eklenir; seçilen ek ürünler (sabitleme, çanta)
	 * aynı gizli ürünün ayrı satırları olarak eklenir (fiyatları panelden, imzalı). Ardından ödeme sayfasına geçilir.
	 */
	public static function handle_post() {
		if ( empty( $_POST[ self::FIELD ] ) || ! function_exists( 'WC' ) ) {
			return;
		}
		$p = self::verify( sanitize_text_field( wp_unslash( $_POST[ self::FIELD ] ) ) );
		if ( null === WC()->cart && function_exists( 'wc_load_cart' ) ) {
			wc_load_cart();
		}
		$pid = self::product_id();
		if ( ! $p || ! $pid ) {
			wc_add_notice( $pid ? 'Tasarım doğrulanamadı ya da süresi doldu. Lütfen konfigüratörde yeniden sepete ekleyin.' : 'Konfigüratör ürünü bulunamadı.', 'error' );
			wp_safe_redirect( wc_get_cart_url() );
			exit;
		}
		self::$adding = true;
		$added        = WC()->cart->add_to_cart( $pid, max( 1, min( 99, (int) ( $p['adet'] ?? 1 ) ) ), 0, array(), array( self::KEY => $p ) );
		if ( $added ) {
			foreach ( (array) ( $p['ekler'] ?? array() ) as $ek ) {
				$adet = (int) ( $ek['adet'] ?? 0 );
				if ( $adet < 1 || ! is_numeric( $ek['fiyat'] ?? null ) || $ek['fiyat'] <= 0 ) {
					continue;
				}
				// Ek satır: kendi başlığı, görseli ve fiyatıyla; "ek" alanı ana tasarımın kimliğini taşır
				$line = array(
					'v'        => 1,
					'n'        => $p['n'] . '-' . $ek['kod'],
					'marka'    => $p['marka'],
					'baslik'   => (string) $ek['baslik'],
					'fiyat'    => (float) $ek['fiyat'],
					'kdv'      => $p['kdv'] ?? 20,
					'satirlar' => array(),
					'gorsel'   => $ek['gorsel'] ?? '',
					'ek'       => array(
						'kod'     => (string) $ek['kod'],
						'tasarim' => $p['n'],
					),
				);
				WC()->cart->add_to_cart( $pid, min( 999, $adet ), 0, array(), array( self::KEY => $line ) );
			}
		}
		self::$adding = false;
		if ( ! $added ) {
			wp_safe_redirect( wc_get_cart_url() );
			exit;
		}
		wp_safe_redirect( wc_get_checkout_url() );
		exit;
	}

	public static function validate_add( $passed, $product_id ) {
		if ( (int) $product_id === self::product_id() && ! self::$adding ) {
			wc_add_notice( 'Bu ürün yalnızca gazebo konfigüratöründen sepete eklenebilir.', 'error' );
			return false;
		}
		return $passed;
	}

	/** Tasarımsız kalmış konfigüratör ürünü sepetten çıkar (fiyatsız satılmasın) */
	public static function drop_unsigned( $cart ) {
		$pid = self::product_id();
		foreach ( $cart->get_cart() as $key => $item ) {
			if ( (int) $item['product_id'] === $pid && empty( $item[ self::KEY ] ) ) {
				$cart->remove_cart_item( $key );
			}
		}
	}

	/** Fiyat panelin imzaladığı tutar (KDV hariç); site fiyatları KDV dahil giriliyorsa KDV eklenir */
	public static function set_prices( $cart ) {
		foreach ( $cart->get_cart() as $item ) {
			if ( empty( $item[ self::KEY ] ) ) {
				continue;
			}
			$p     = $item[ self::KEY ];
			$price = (float) $p['fiyat'];
			if ( wc_prices_include_tax() ) {
				$price = round( $price * ( 1 + (float) ( $p['kdv'] ?? 20 ) / 100 ), 2 );
			}
			$item['data']->set_price( $price );
		}
	}

	public static function item_name( $name, $item ) {
		return empty( $item[ self::KEY ] ) ? $name : esc_html( $item[ self::KEY ]['baslik'] );
	}

	public static function item_data( $data, $item ) {
		if ( empty( $item[ self::KEY ]['satirlar'] ) ) {
			return $data;
		}
		foreach ( $item[ self::KEY ]['satirlar'] as $row ) {
			$data[] = array(
				'key'   => esc_html( $row['ad'] ),
				'value' => esc_html( $row['deger'] ),
			);
		}
		return $data;
	}

	public static function item_thumb( $thumb, $item ) {
		$src = $item[ self::KEY ]['gorsel'] ?? '';
		return $src ? '<img src="' . esc_url( $src ) . '" alt="" width="300" height="225" style="object-fit:contain;background:#f5f6f8" />' : $thumb;
	}

	public static function item_link( $link, $item ) {
		return empty( $item[ self::KEY ] ) ? $link : '';
	}

	/* ───────────── sipariş ───────────── */

	/** Siparişe: görünen özet satırları + gizli tasarım (panel üretim ayrıntısını buradan okur) */
	public static function order_item( $order_item, $cart_item_key, $values ) {
		if ( empty( $values[ self::KEY ] ) ) {
			return;
		}
		$p = $values[ self::KEY ];
		$order_item->set_name( $p['baslik'] );
		if ( ! empty( $p['ek'] ) ) {
			$order_item->add_meta_data( '_sky_konfigurator', wp_json_encode( array( 'n' => $p['n'], 'marka' => $p['marka'], 'fiyat' => $p['fiyat'], 'ek' => $p['ek'] ), JSON_UNESCAPED_UNICODE ), true );
			if ( ! empty( $p['gorsel'] ) ) {
				$order_item->add_meta_data( '_sky_gorsel', $p['gorsel'], true );
			}
			return;
		}
		foreach ( (array) $p['satirlar'] as $row ) {
			$order_item->add_meta_data( $row['ad'], $row['deger'], true );
		}
		$order_item->add_meta_data(
			'_sky_konfigurator',
			wp_json_encode(
				array(
					'n'        => $p['n'],
					'marka'    => $p['marka'],
					'fiyat'    => $p['fiyat'],
					'cfg'      => $p['cfg'],
					'parcalar' => $p['parcalar'] ?? array(),
				),
				JSON_UNESCAPED_UNICODE
			),
			true
		);
		if ( ! empty( $p['gorsel'] ) ) {
			$order_item->add_meta_data( '_sky_gorsel', $p['gorsel'], true );
		}
	}

	public static function order_thumb( $thumb, $item ) {
		$src = is_callable( array( $item, 'get_meta' ) ) ? $item->get_meta( '_sky_gorsel' ) : '';
		return $src ? '<img src="' . esc_url( $src ) . '" alt="" width="64" height="48" style="object-fit:contain" />' : $thumb;
	}

	public static function hidden_meta( $keys ) {
		$keys[] = '_sky_konfigurator';
		$keys[] = '_sky_gorsel';
		return $keys;
	}
}

add_action( 'plugins_loaded', array( 'Sky_Konfigurator', 'init' ) );
