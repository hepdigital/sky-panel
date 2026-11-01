<?php
/**
 * Plugin Name: SKY Konfigüratör
 * Description: SKY panelindeki gazebo konfigüratörünü siteye yerleştirir ve panelin imzaladığı tasarımı WooCommerce sepetine ekler. Fiyat panelde hesaplanır; site yalnızca imzayı doğrular.
 * Version: 1.3.3
 * Author: SKY Görsel Çözümler
 * Requires Plugins: woocommerce
 * Text Domain: sky-konfigurator
 *
 * Kurulum: wp-config.php'ye ortak anahtar (panelde KONFIGURATOR_SECRET ile aynı):
 *   define( 'SKY_KONFIGURATOR_SECRET', '...' );
 * Sayfa: içeriği [sky_konfigurator] olan sayfa tam ekran konfigüratör olarak açılır (tema başlığı ve altbilgisi olmadan).
 * Kategori banner'ı: gazebo kategorilerinin üstünde "Kendi gazebonu tasarla"; ölçü ve baskı kategoriden seçili gelir (?olcu=3x3&baski=baskisiz).
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
	const PAGE      = 'gazebo-tasarla';

	/** Banner'ın gösterildiği kategoriler (alt kategorileriyle); baskısız/baskılı ön seçimi bu ana kategorilerden */
	const BANNER_CATS = array( 'gazebo-tente', 'baskili-gazebo-cadir', 'gazebo-cadir', 'gazebo-portatif-cardak-kamelya' );
	const BASKISIZ    = 'gazebo-tente';
	const BASKILI     = 'baskili-gazebo-cadir';

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
		add_action( 'woocommerce_before_shop_loop', array( __CLASS__, 'category_banner' ), 1 );
		// WoodMart yerleşim oluşturucusu (Elementor, öğe önbellekli) kategori sayfasında woocommerce_before_shop_loop'u çağırmaz:
		// ana içerik tamponlanır, banner sıralama ve ürünleri tutan "list-section" sınıflı kapsayıcının hemen önüne konur
		add_action( 'woocommerce_before_main_content', array( __CLASS__, 'buffer_start' ), 999 );
		add_action( 'woocommerce_after_main_content', array( __CLASS__, 'buffer_end' ), 0 );
		add_action( 'woocommerce_no_products_found', array( __CLASS__, 'category_banner' ), 1 );
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
		$args = array( 'gomulu' => 1, 's' => 2 );
		// Ön seçim sayfa adresinden panele geçer (kategori banner'ı): ?olcu=3x3&baski=baskili
		$olcu = isset( $_GET['olcu'] ) ? sanitize_text_field( wp_unslash( $_GET['olcu'] ) ) : '';
		if ( preg_match( '/^\d+x\d+([.,]\d+)?$/', $olcu ) ) {
			$args['olcu'] = $olcu;
		}
		$baski = isset( $_GET['baski'] ) ? sanitize_key( wp_unslash( $_GET['baski'] ) ) : '';
		if ( in_array( $baski, array( 'baskili', 'baskisiz' ), true ) ) {
			$args['baski'] = $baski;
		}
		return add_query_arg( $args, self::PANEL . '/konfigurator/' . self::MARKA );
	}

	/* ───────────── kategori banner'ı ───────────── */

	private static $buffering = false;

	public static function buffer_start() {
		if ( is_product_category() && ! self::$buffering ) {
			self::$buffering = true;
			ob_start();
		}
	}

	public static function buffer_end() {
		if ( ! self::$buffering ) {
			return;
		}
		self::$buffering = false;
		$html = (string) ob_get_clean();
		ob_start();
		self::category_banner();
		$banner = (string) ob_get_clean();
		if ( '' !== $banner && preg_match( '/<div\b[^>]*class="[^"]*\blist-section\b[^"]*"[^>]*>/', $html, $m, PREG_OFFSET_CAPTURE ) ) {
			$html = substr_replace( $html, $banner, $m[0][1], 0 );
		} elseif ( '' !== $banner ) {
			$html = $banner . $html;
		}
		echo $html; // phpcs:ignore WordPress.Security.EscapeOutput -- temanın kendi çıktısı
	}

	/** Gazebo kategorilerinin üstünde konfigüratör çağrısı; ölçü kategorisinde ölçü, baskısız/baskılı dalında baskı seçili gelir */
	public static function category_banner() {
		static $done = false;
		if ( $done || ! is_product_category() ) {
			return;
		}
		$term = get_queried_object();
		if ( ! $term instanceof WP_Term ) {
			return;
		}
		$slugs = array( $term->slug );
		foreach ( get_ancestors( $term->term_id, 'product_cat', 'taxonomy' ) as $id ) {
			$t = get_term( $id, 'product_cat' );
			if ( $t instanceof WP_Term ) {
				$slugs[] = $t->slug;
			}
		}
		if ( ! array_intersect( $slugs, self::BANNER_CATS ) ) {
			return;
		}
		$page = get_page_by_path( self::PAGE );
		if ( ! $page ) {
			return;
		}
		$done  = true;
		$args  = array();
		$olcu  = preg_match( '/^(\d)x(\d)(\d)?-/', $term->slug, $m ) ? $m[1] . 'x' . $m[2] . ( isset( $m[3] ) && '' !== $m[3] ? ',' . $m[3] : '' ) : '';
		$baski = in_array( self::BASKILI, $slugs, true ) ? 'baskili' : ( in_array( self::BASKISIZ, $slugs, true ) ? 'baskisiz' : '' );
		if ( $olcu ) {
			$args['olcu'] = $olcu;
		}
		if ( $baski ) {
			$args['baski'] = $baski;
		}
		$url   = add_query_arg( $args, get_permalink( $page ) );
		$title = 'baskili' === $baski ? ( $olcu ? "Baskılı {$olcu} gazebonu kendin tasarla" : 'Baskılı gazebonu kendin tasarla' ) : ( $olcu ? "{$olcu} gazebonu kendin tasarla" : 'Kendi gazebonu tasarla' );
		$text  = 'baskili' === $baski
			? 'İskeleti ve duvarları seç, fiyatını anında gör. Tasarımını siparişten sonra iletirsin, baskıdan önce onayına sunulur.'
			: 'Ölçüyü, tavan ve duvar rengini, iskeleti, kapı ve pencereleri seç; 3D önizle, fiyatını anında gör.';
		$img   = self::PANEL . '/konfigurator/' . ( 'baskili' === $baski ? 'tip-baskili.webp' : 'tip-baskisiz.webp' );
		?>
<style>
.sky-konf-banner{display:flex;align-items:center;gap:20px;margin:0 0 24px;padding:18px 22px;border-radius:8px;background:#024B90;color:#fff;text-decoration:none!important;overflow:hidden;position:relative}
.sky-konf-banner:hover{background:#013d75}
.sky-konf-banner img{width:150px;height:112px;object-fit:cover;border-radius:6px;flex:none;background:#fff}
.sky-konf-banner .skb-t{flex:1;min-width:0}
.sky-konf-banner .skb-k{display:inline-block;margin-bottom:6px;padding:2px 8px;border-radius:4px;background:rgba(255,255,255,.14);font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.sky-konf-banner .skb-h{display:block;margin:0 0 4px;color:#fff;font-size:22px;font-weight:700;line-height:1.25}
.sky-konf-banner .skb-p{display:block;margin:0;color:rgba(255,255,255,.85);font-size:14px;line-height:1.5}
.sky-konf-banner .skb-b{flex:none;display:inline-flex;align-items:center;gap:8px;padding:12px 20px;border-radius:8px;background:#F15A24;color:#fff;font-size:15px;font-weight:600;white-space:nowrap}
@media (max-width:767px){
.sky-konf-banner{flex-wrap:wrap;gap:12px;padding:14px}
.sky-konf-banner img{width:96px;height:72px}
.sky-konf-banner .skb-h{font-size:17px}
.sky-konf-banner .skb-p{font-size:13px}
.sky-konf-banner .skb-b{width:100%;justify-content:center}
}
</style>
<a class="sky-konf-banner" href="<?php echo esc_url( $url ); ?>">
	<img src="<?php echo esc_url( $img ); ?>" alt="" width="150" height="112" loading="lazy">
	<span class="skb-t">
		<span class="skb-k">Yeni · Gazebo tasarla</span>
		<span class="skb-h"><?php echo esc_html( $title ); ?></span>
		<span class="skb-p"><?php echo esc_html( $text ); ?></span>
	</span>
	<span class="skb-b">Hemen tasarla <span aria-hidden="true">→</span></span>
</a>
		<?php
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
				// Sitede satılan ürün (ör. taşıma çantası): asıl varyasyon eklenir, fiyat ve stok sitenin
				if ( ! empty( $ek['woo']['varyasyon'] ) ) {
					$var = wc_get_product( (int) $ek['woo']['varyasyon'] );
					if ( $var && $var->is_type( 'variation' ) && (int) $var->get_parent_id() === (int) ( $ek['woo']['urun'] ?? 0 ) ) {
						WC()->cart->add_to_cart( $var->get_parent_id(), min( 999, $adet ), $var->get_id(), $var->get_variation_attributes() );
					}
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
