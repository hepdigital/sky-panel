<?php
/**
 * Plugin Name: SKY Galeri
 * Description: SKY panelinde ekibin oluşturduğu albümleri sitede /galeri/ altında gösterir: iç içe albümler, filigranlı fotoğraflar, büyük görünüm, WhatsApp ve fiyat talebi. Sayfalar sunucuda üretilir (arama motorlarına açık); "yalnızca linkle" albümler listelenmez ve noindex'tir.
 * Version: 1.0.2
 * Author: SKY Görsel Çözümler
 * Text Domain: sky-galeri
 *
 * Veri panelden okunur (GET /api/galeri?yol=…), 5 dakika önbellekte tutulur; panel ulaşılamazsa son başarılı yanıt gösterilir.
 * Talep formu ve sayaçlar tarayıcıdan panele gönderilir (/api/galeri/talep, /api/galeri/olay); talepler panelde Talepler'e düşer.
 * Site haritası: /galeri-harita.xml (robots.txt'ye ve Rank Math site haritası dizinine eklenir; "-sitemap.xml" ile biten adresleri Rank Math kendine ayırır).
 * Başka adres için wp-config.php: define( 'SKY_GALERI_PANEL', 'https://panel.ornek.com' );
 */

defined( 'ABSPATH' ) || exit;

final class Sky_Galeri {
	const VERSION = '1.0.2';
	const BASE    = 'galeri';
	const TTL     = 300;
	/** Gazebo albümlerinde ikinci yönlendirme: konfigüratör */
	const KONFIGURATOR = '/gazebo-tasarla/';

	/** Bu istekte gösterilen albüm verisi */
	private static $data = null;

	public static function init() {
		add_action( 'init', array( __CLASS__, 'rewrite' ) );
		add_filter( 'query_vars', array( __CLASS__, 'query_vars' ) );
		add_action( 'template_redirect', array( __CLASS__, 'route' ), 1 );
		add_filter( 'robots_txt', array( __CLASS__, 'robots' ), 20, 2 );
		add_filter( 'rank_math/sitemap/index', array( __CLASS__, 'rank_math_index' ) );
		add_filter( 'redirect_canonical', array( __CLASS__, 'no_canonical_redirect' ), 10, 2 );
	}

	private static function panel() {
		return rtrim( defined( 'SKY_GALERI_PANEL' ) ? SKY_GALERI_PANEL : 'https://panel.skygorselmarket.com', '/' );
	}

	public static function rewrite() {
		add_rewrite_rule( '^' . self::BASE . '(?:/(.*?))?/?$', 'index.php?sky_galeri=1&sky_galeri_yol=$matches[1]', 'top' );
		add_rewrite_rule( '^galeri-harita\.xml$', 'index.php?sky_galeri_harita=1', 'top' );
	}

	public static function query_vars( $vars ) {
		$vars[] = 'sky_galeri';
		$vars[] = 'sky_galeri_yol';
		$vars[] = 'sky_galeri_harita';
		return $vars;
	}

	/** WordPress galeri adresini "en yakın" yazıya yönlendirmeye çalışmasın */
	public static function no_canonical_redirect( $redirect, $requested ) {
		return get_query_var( 'sky_galeri' ) || get_query_var( 'sky_galeri_harita' ) ? false : $redirect;
	}

	public static function activate() {
		self::rewrite();
		flush_rewrite_rules();
	}

	/* ───────────── panel verisi ───────────── */

	/** Panelden JSON; 5 dk önbellek, panel yanıt vermezse son başarılı yanıt (1 hafta). 404 → false */
	private static function fetch( $path, $key ) {
		$cached = get_transient( 'skyg_' . $key );
		if ( false !== $cached ) {
			return $cached;
		}
		$res  = wp_remote_get( self::panel() . $path, array( 'timeout' => 8, 'headers' => array( 'Accept' => 'application/json' ) ) );
		$code = is_wp_error( $res ) ? 0 : (int) wp_remote_retrieve_response_code( $res );
		if ( 404 === $code ) {
			set_transient( 'skyg_' . $key, 'yok', self::TTL );
			return 'yok';
		}
		$body = 200 === $code ? json_decode( wp_remote_retrieve_body( $res ), true ) : null;
		if ( ! is_array( $body ) || empty( $body['ok'] ) ) {
			$stale = get_transient( 'skyg_s_' . $key );
			return false !== $stale ? $stale : null;
		}
		set_transient( 'skyg_' . $key, $body, self::TTL );
		set_transient( 'skyg_s_' . $key, $body, WEEK_IN_SECONDS );
		return $body;
	}

	/* ───────────── yönlendirme ───────────── */

	public static function route() {
		if ( get_query_var( 'sky_galeri_harita' ) ) {
			self::sitemap();
		}
		if ( ! get_query_var( 'sky_galeri' ) ) {
			return;
		}
		$yol = strtolower( trim( (string) get_query_var( 'sky_galeri_yol' ), '/' ) );
		if ( ! preg_match( '~^[a-z0-9/-]*$~', $yol ) || strlen( $yol ) > 400 ) {
			self::not_found();
		}
		// Tek adres: sonunda eğik çizgi
		$path = (string) wp_parse_url( $_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH );
		if ( '' !== $path && '/' !== substr( $path, -1 ) ) {
			wp_safe_redirect( self::url( $yol ), 301 );
			exit;
		}
		$data = self::fetch( '/api/galeri?yol=' . rawurlencode( $yol ), md5( $yol ) );
		if ( 'yok' === $data ) {
			self::not_found();
		}
		if ( null === $data ) {
			status_header( 503 );
			header( 'Retry-After: 120' );
			wp_die( 'Galeri şu an yüklenemiyor, lütfen biraz sonra tekrar deneyin.', 'Galeri', array( 'response' => 503 ) );
		}
		self::$data = $data;

		global $wp_query;
		$wp_query->is_404  = false;
		$wp_query->is_home = false;
		$wp_query->is_page = true;
		// Ana sorgunun (blog) yazıları sayfaya sızmasın
		$wp_query->posts      = array();
		$wp_query->post_count = 0;
		$wp_query->post       = null;
		status_header( 200 );
		// Sayfa önbelleği kısa: yeni yüklenen fotoğraflar birkaç dakikada görünsün
		do_action( 'litespeed_control_set_ttl', 600 );

		add_filter( 'pre_get_document_title', array( __CLASS__, 'title' ), 999 );
		add_filter( 'wp_robots', array( __CLASS__, 'wp_robots' ), 999 );
		add_action( 'wp_head', array( __CLASS__, 'head' ), 1 );
		add_filter( 'body_class', array( __CLASS__, 'body_class' ) );
		// SEO eklentileri bu sanal sayfa için kendi başlık/canonical çıktısını vermesin (kendi etiketlerimizi basıyoruz)
		add_filter( 'rank_math/frontend/robots', '__return_empty_array', 999 );
		add_action( 'rank_math/head', array( __CLASS__, 'drop_rank_math' ), 0 );
		add_filter( 'wpseo_frontend_presenters', '__return_empty_array', 999 );
		remove_action( 'wp_head', 'rel_canonical' );
		// WoodMart başlık bandı (sayfa başlığı ve yol) galeride kendi başlığımız var
		remove_action( 'woodmart_after_header', 'woodmart_page_title', 20 );

		get_header();
		echo self::render(); // phpcs:ignore WordPress.Security.EscapeOutput -- render() kendi kaçışını yapar
		get_footer();
		exit;
	}

	public static function drop_rank_math() {
		remove_all_actions( 'rank_math/head' );
	}

	private static function not_found() {
		global $wp_query;
		$wp_query->set_404();
		status_header( 404 );
		nocache_headers();
		$t = get_404_template();
		if ( $t ) {
			include $t;
		} else {
			wp_die( 'Sayfa bulunamadı.', '', array( 'response' => 404 ) );
		}
		exit;
	}

	private static function url( $yol ) {
		return home_url( '/' . self::BASE . '/' . ( '' === $yol ? '' : $yol . '/' ) );
	}

	/* ───────────── SEO ───────────── */

	private static function album_name() {
		return self::$data['album']['ad'] ?? 'Galeri';
	}

	private static function description() {
		$d = self::$data;
		if ( ! empty( $d['album']['aciklama'] ) ) {
			return wp_trim_words( wp_strip_all_tags( $d['album']['aciklama'] ), 30, '…' );
		}
		if ( empty( $d['album'] ) ) {
			return 'Gazebo, şemsiye ve baskılı ürünlerimizden gerçek uygulama fotoğrafları. Beğendiğiniz modeli seçin, hemen fiyat alın.';
		}
		$n = count( $d['gorseller'] ) + array_sum( array_column( $d['alt'], 'adet' ) );
		return sprintf( '%s örnek görselleri: %d gerçek uygulama fotoğrafı. Beğendiğiniz model için WhatsApp\'tan hemen fiyat alın.', $d['album']['ad'], $n );
	}

	public static function title() {
		$site = get_bloginfo( 'name' );
		return empty( self::$data['album'] ) ? 'Galeri: Örnek Uygulama Görselleri | ' . $site : self::album_name() . ' Örnek Görselleri | ' . $site;
	}

	private static function hidden() {
		return ! empty( self::$data['album']['gizli'] );
	}

	public static function wp_robots( $robots ) {
		if ( self::hidden() ) {
			return array( 'noindex' => true, 'nofollow' => true );
		}
		return array( 'index' => true, 'follow' => true, 'max-image-preview' => 'large' );
	}

	public static function body_class( $c ) {
		$c[] = 'sky-galeri-sayfa';
		return $c;
	}

	public static function head() {
		$d     = self::$data;
		$yol   = $d['album']['yol'] ?? '';
		$url   = self::url( $yol );
		$title = self::title();
		$desc  = self::description();
		$img   = $d['gorseller'][0]['b'] ?? ( $d['alt'][0]['kapak']['k'] ?? '' );
		// Rank Math başlığı kendi çıktısında basar (çekirdeğin başlık etiketini kaldırır); onun çıktısı bu sayfada kapalı
		if ( ! has_action( 'wp_head', '_wp_render_title_tag' ) ) {
			echo '<title>' . esc_html( $title ) . '</title>' . "\n";
		}
		echo '<meta name="description" content="' . esc_attr( $desc ) . '">' . "\n";
		if ( ! self::hidden() ) {
			echo '<link rel="canonical" href="' . esc_url( $url ) . '">' . "\n";
		}
		echo '<meta property="og:type" content="website">' . "\n";
		echo '<meta property="og:title" content="' . esc_attr( $title ) . '">' . "\n";
		echo '<meta property="og:description" content="' . esc_attr( $desc ) . '">' . "\n";
		echo '<meta property="og:url" content="' . esc_url( $url ) . '">' . "\n";
		if ( $img ) {
			echo '<meta property="og:image" content="' . esc_url( $img ) . '">' . "\n";
			echo '<meta name="twitter:card" content="summary_large_image">' . "\n";
		}
		if ( self::hidden() ) {
			return;
		}
		$crumbs = array( array( 'name' => 'Ana sayfa', 'url' => home_url( '/' ) ), array( 'name' => 'Galeri', 'url' => self::url( '' ) ) );
		foreach ( $d['ust'] as $u ) {
			$crumbs[] = array( 'name' => $u['ad'], 'url' => self::url( $u['yol'] ) );
		}
		if ( ! empty( $d['album'] ) ) {
			$crumbs[] = array( 'name' => $d['album']['ad'], 'url' => $url );
		}
		$graph = array(
			array(
				'@type'           => 'BreadcrumbList',
				'itemListElement' => array_map(
					function ( $c, $i ) {
						return array( '@type' => 'ListItem', 'position' => $i + 1, 'name' => $c['name'], 'item' => $c['url'] );
					},
					$crumbs,
					array_keys( $crumbs )
				),
			),
			array(
				'@type'       => empty( $d['gorseller'] ) ? 'CollectionPage' : 'ImageGallery',
				'name'        => empty( $d['album'] ) ? 'Galeri' : $d['album']['ad'] . ' örnek görselleri',
				'description' => $desc,
				'url'         => $url,
				'publisher'   => array( '@type' => 'Organization', 'name' => $d['marka']['ad'] ?: get_bloginfo( 'name' ), 'url' => home_url( '/' ) ),
				'image'       => array_map(
					function ( $g, $i ) use ( $d ) {
						return array(
							'@type'      => 'ImageObject',
							'contentUrl' => $g['b'],
							'thumbnailUrl' => $g['k'],
							'width'      => $g['en'],
							'height'     => $g['boy'],
							'caption'    => $g['alt'] ?: self::alt( $d, $i ),
						);
					},
					array_slice( $d['gorseller'], 0, 60 ),
					array_keys( array_slice( $d['gorseller'], 0, 60 ) )
				),
			),
		);
		echo '<script type="application/ld+json">' . wp_json_encode( array( '@context' => 'https://schema.org', '@graph' => $graph ), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) . '</script>' . "\n";
	}

	private static function alt( $d, $i ) {
		return ( $d['album']['ad'] ?? 'Galeri' ) . ' örnek görsel ' . ( $i + 1 );
	}

	/* ───────────── sayfa ───────────── */

	private static function wa_link( $text ) {
		$n = self::$data['marka']['whatsapp'] ?? '';
		return $n ? 'https://wa.me/' . rawurlencode( $n ) . '?text=' . rawurlencode( $text ) : '';
	}

	private static function render() {
		$d      = self::$data;
		$album  = $d['album'];
		$yol    = $album['yol'] ?? '';
		$url    = self::url( $yol );
		$name   = $album['ad'] ?? 'Galeri';
		$wa_msg = $album ? "Merhaba, galerideki \"{$name}\" modeli için fiyat almak istiyorum.\n{$url}" : "Merhaba, ürünleriniz için fiyat almak istiyorum.\n{$url}";
		$wa     = self::wa_link( $wa_msg );
		$is_gz  = $album && false !== strpos( $yol, 'gazebo' );
		$total  = count( $d['gorseller'] ) + array_sum( array_column( $d['alt'], 'adet' ) );
		ob_start();
		?>
<div class="skyg" data-yol="<?php echo esc_attr( $yol ); ?>" data-panel="<?php echo esc_url( self::panel() ); ?>">
	<div class="skyg-wrap">
		<nav class="skyg-crumbs" aria-label="Sayfa yolu">
			<a href="<?php echo esc_url( home_url( '/' ) ); ?>">Ana sayfa</a>
			<span>/</span>
			<?php if ( $album ) : ?>
				<a href="<?php echo esc_url( self::url( '' ) ); ?>">Galeri</a>
				<?php foreach ( $d['ust'] as $u ) : ?>
					<span>/</span><a href="<?php echo esc_url( self::url( $u['yol'] ) ); ?>"><?php echo esc_html( $u['ad'] ); ?></a>
				<?php endforeach; ?>
				<span>/</span><span aria-current="page"><?php echo esc_html( $name ); ?></span>
			<?php else : ?>
				<span aria-current="page">Galeri</span>
			<?php endif; ?>
		</nav>

		<header class="skyg-head">
			<div>
				<h1><?php echo esc_html( $album ? $name . ' Örnek Görselleri' : 'Galeri' ); ?></h1>
				<p class="skyg-lead">
					<?php
					if ( ! empty( $album['aciklama'] ) ) {
						echo nl2br( esc_html( $album['aciklama'] ) );
					} elseif ( $album ) {
						echo esc_html( sprintf( '%d gerçek uygulama fotoğrafı. Beğendiğiniz modeli seçin, aynı gün fiyat alın.', $total ) );
					} else {
						echo 'Ürünlerimizden gerçek uygulama fotoğrafları. Bir albüm seçin, beğendiğiniz model için hemen fiyat alın.';
					}
					?>
				</p>
			</div>
			<div class="skyg-actions">
				<?php if ( $wa ) : ?>
					<a class="skyg-btn skyg-wa" href="<?php echo esc_url( $wa ); ?>" target="_blank" rel="noopener" data-olay="whatsapp"><?php echo self::wa_icon(); // phpcs:ignore ?> WhatsApp'tan fiyat al</a>
				<?php endif; ?>
				<a class="skyg-btn skyg-cta" href="#skyg-form">Teklif iste</a>
				<?php if ( ! empty( $album['cta'] ) ) : ?>
					<a class="skyg-btn skyg-ghost" href="<?php echo esc_url( $album['cta']['url'] ); ?>"><?php echo esc_html( $album['cta']['ad'] ); ?> →</a>
				<?php elseif ( $is_gz ) : ?>
					<a class="skyg-btn skyg-ghost" href="<?php echo esc_url( home_url( self::KONFIGURATOR ) ); ?>">Kendi gazebonu tasarla →</a>
				<?php endif; ?>
			</div>
		</header>

		<?php if ( $d['alt'] ) : ?>
			<section class="skyg-albums" aria-label="Albümler">
				<?php foreach ( $d['alt'] as $c ) : ?>
					<a class="skyg-album" href="<?php echo esc_url( self::url( $c['yol'] ) ); ?>">
						<span class="skyg-album-img">
							<?php if ( $c['kapak'] ) : ?>
								<img src="<?php echo esc_url( $c['kapak']['k'] ); ?>" width="<?php echo (int) $c['kapak']['en']; ?>" height="<?php echo (int) $c['kapak']['boy']; ?>" alt="<?php echo esc_attr( $c['ad'] . ' örnek görsel' ); ?>" loading="lazy" decoding="async">
							<?php endif; ?>
						</span>
						<span class="skyg-album-name"><?php echo esc_html( $c['ad'] ); ?></span>
						<span class="skyg-album-count"><?php echo (int) $c['adet']; ?> fotoğraf</span>
					</a>
				<?php endforeach; ?>
			</section>
		<?php endif; ?>

		<?php if ( $d['gorseller'] ) : ?>
			<section class="skyg-grid" aria-label="<?php echo esc_attr( $name ); ?> fotoğrafları">
				<?php foreach ( $d['gorseller'] as $i => $g ) : ?>
					<?php $alt = $g['alt'] ?: self::alt( $d, $i ); ?>
					<a class="skyg-item" href="<?php echo esc_url( $g['b'] ); ?>" data-i="<?php echo (int) $i; ?>" data-cap="<?php echo esc_attr( (string) $g['alt'] ); ?>">
						<img src="<?php echo esc_url( $g['k'] ); ?>" width="<?php echo (int) $g['en']; ?>" height="<?php echo (int) $g['boy']; ?>" alt="<?php echo esc_attr( $alt ); ?>" <?php echo $i < 4 ? 'fetchpriority="high"' : 'loading="lazy"'; ?> decoding="async">
					</a>
					<?php if ( 8 === $i && count( $d['gorseller'] ) > 12 ) : ?>
						<div class="skyg-inline-cta">
							<strong>Bu modeli beğendiniz mi?</strong>
							<span>Ölçü, renk ve baskı seçeneklerini konuşalım; aynı gün fiyat verelim.</span>
							<?php if ( $wa ) : ?><a class="skyg-btn skyg-wa" href="<?php echo esc_url( $wa ); ?>" target="_blank" rel="noopener" data-olay="whatsapp"><?php echo self::wa_icon(); // phpcs:ignore ?> WhatsApp'tan yaz</a><?php endif; ?>
						</div>
					<?php endif; ?>
				<?php endforeach; ?>
			</section>
		<?php elseif ( $album && ! $d['alt'] ) : ?>
			<p class="skyg-empty">Bu albüme yakında fotoğraf eklenecek. Örnekleri WhatsApp'tan hemen gönderebiliriz.</p>
		<?php endif; ?>

		<section class="skyg-form" id="skyg-form">
			<div class="skyg-form-text">
				<h2><?php echo esc_html( $album ? $name . ' için fiyat alın' : 'Fiyat teklifi alın' ); ?></h2>
				<p>Numaranızı bırakın, satış ekibimiz sizi arasın. Ölçü, adet ve baskı detaylarını birlikte netleştirelim.</p>
				<ul>
					<li>Kendi üretimimiz, hızlı teslim</li>
					<li>Logonuza ve ölçünüze özel baskı</li>
					<li>Toptan alımda özel fiyat</li>
				</ul>
			</div>
			<form class="skyg-lead-form" novalidate>
				<label>Adınız<input name="ad" autocomplete="name" maxlength="120"></label>
				<label>Telefon<input name="telefon" type="tel" inputmode="tel" autocomplete="tel" required placeholder="05xx xxx xx xx" maxlength="20"></label>
				<label>Not <small>(adet, ölçü, şehir…)</small><textarea name="mesaj" rows="3" maxlength="1000"></textarea></label>
				<input name="site" tabindex="-1" autocomplete="off" class="skyg-hp" aria-hidden="true">
				<button type="submit" class="skyg-btn skyg-cta">Beni arayın</button>
				<p class="skyg-form-msg" role="status"></p>
			</form>
		</section>
	</div>

	<?php if ( $wa ) : ?>
		<div class="skyg-sticky">
			<a class="skyg-btn skyg-wa" href="<?php echo esc_url( $wa ); ?>" target="_blank" rel="noopener" data-olay="whatsapp"><?php echo self::wa_icon(); // phpcs:ignore ?> WhatsApp</a>
			<a class="skyg-btn skyg-cta" href="#skyg-form">Fiyat al</a>
		</div>
	<?php endif; ?>

	<div class="skyg-lb" hidden>
		<button type="button" class="skyg-lb-x" aria-label="Kapat">×</button>
		<button type="button" class="skyg-lb-prev" aria-label="Önceki">‹</button>
		<img alt="">
		<button type="button" class="skyg-lb-next" aria-label="Sonraki">›</button>
		<div class="skyg-lb-bar">
			<span class="skyg-lb-cap"></span>
			<?php if ( $wa ) : ?><a class="skyg-btn skyg-wa skyg-lb-wa" href="<?php echo esc_url( $wa ); ?>" target="_blank" rel="noopener" data-olay="whatsapp"><?php echo self::wa_icon(); // phpcs:ignore ?> Bu model için fiyat al</a><?php endif; ?>
		</div>
	</div>
</div>
<style><?php echo self::css(); // phpcs:ignore ?></style>
<script><?php echo self::js( $wa_msg ); // phpcs:ignore ?></script>
		<?php
		return ob_get_clean();
	}

	private static function wa_icon() {
		return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1s-.5-.1-.7.1-.8 1-1 1.2-.4.2-.7.1a8.1 8.1 0 0 1-4-3.5c-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.2 1.2 0 0 0-.9.4 3.6 3.6 0 0 0-1.1 2.7 6.3 6.3 0 0 0 1.3 3.3 14.4 14.4 0 0 0 5.5 4.9c2 .9 2.8.9 3.8.8a3.3 3.3 0 0 0 2.1-1.5 2.7 2.7 0 0 0 .2-1.5c-.1-.1-.3-.2-.6-.3zM12 21.8a9.9 9.9 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4a9.9 9.9 0 1 1 8.3 4.6zm8.4-18.3A11.8 11.8 0 0 0 1.8 17.7L.1 24l6.4-1.7a11.8 11.8 0 0 0 5.6 1.4 11.8 11.8 0 0 0 8.3-20.2z"/></svg>';
	}

	private static function css() {
		return '
.skyg{--n:#024B90;--o:#F15A24;--t:#1d2433;--m:#5d6677;--b:#e3e7ee;--r:8px;font-family:Poppins,system-ui,sans-serif;color:var(--t);padding:18px 0 90px}
.skyg-wrap{max-width:1240px;margin:0 auto;padding:0 16px}
.skyg-crumbs{display:flex;flex-wrap:wrap;gap:6px;font-size:13px;color:var(--m);margin-bottom:14px}
.skyg-crumbs a{color:var(--m);text-decoration:none}.skyg-crumbs a:hover{color:var(--n)}
.skyg-head{display:flex;flex-wrap:wrap;gap:16px 24px;align-items:flex-end;justify-content:space-between;margin-bottom:22px}
.skyg-head h1{font-size:clamp(24px,3.4vw,36px);line-height:1.2;margin:0 0 6px;color:var(--n);font-weight:700}
.skyg-lead{margin:0;color:var(--m);max-width:680px;font-size:15px;line-height:1.6}
.skyg-actions{display:flex;flex-wrap:wrap;gap:8px}
.skyg-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:var(--r);font-weight:600;font-size:14px;text-decoration:none!important;border:0;cursor:pointer;transition:filter .15s,transform .15s;white-space:nowrap}
.skyg-btn:hover{filter:brightness(.94)}.skyg-btn:active{transform:scale(.98)}
.skyg-wa{background:#25D366;color:#fff!important}.skyg-cta{background:var(--o);color:#fff!important}
.skyg-ghost{background:#fff;color:var(--n)!important;border:1.5px solid var(--n)}
.skyg-albums{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-bottom:30px}
.skyg-album{display:flex;flex-direction:column;border:1px solid var(--b);border-radius:var(--r);overflow:hidden;background:#fff;text-decoration:none!important;color:var(--t)!important;transition:box-shadow .2s,transform .2s}
.skyg-album:hover{box-shadow:0 10px 30px rgba(2,75,144,.14);transform:translateY(-2px)}
.skyg-album-img{aspect-ratio:4/3;background:#f2f4f8;overflow:hidden}.skyg-album-img img{width:100%;height:100%;object-fit:cover;display:block}
.skyg-album-name{padding:12px 14px 0;font-weight:600;font-size:16px;color:var(--n)}
.skyg-album-count{padding:2px 14px 14px;font-size:13px;color:var(--m)}
.skyg-grid{columns:4 260px;column-gap:12px;margin-bottom:36px}
.skyg-item{display:block;break-inside:avoid;margin-bottom:12px;border-radius:var(--r);overflow:hidden;background:#f2f4f8;cursor:zoom-in}
.skyg-item img{width:100%;height:auto;display:block;transition:transform .3s}.skyg-item:hover img{transform:scale(1.03)}
.skyg-inline-cta{break-inside:avoid;margin-bottom:12px;border-radius:var(--r);background:var(--n);color:#fff;padding:22px;display:flex;flex-direction:column;gap:10px}
.skyg-inline-cta strong{font-size:18px}.skyg-inline-cta span{font-size:14px;opacity:.85}
.skyg-empty{padding:30px;border:1px dashed var(--b);border-radius:var(--r);text-align:center;color:var(--m)}
.skyg-form{display:grid;grid-template-columns:1fr 1fr;gap:28px;background:#f5f7fb;border-radius:var(--r);padding:28px;align-items:start}
.skyg-form h2{margin:0 0 8px;color:var(--n);font-size:24px}.skyg-form p{color:var(--m);margin:0 0 12px}
.skyg-form ul{margin:0;padding-left:18px;color:var(--t);line-height:1.9}
.skyg-lead-form{display:flex;flex-direction:column;gap:12px;background:#fff;padding:20px;border-radius:var(--r);border:1px solid var(--b)}
.skyg-lead-form label{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600}
.skyg-lead-form small{font-weight:400;color:var(--m)}
.skyg-lead-form input,.skyg-lead-form textarea{border:1px solid #cfd6e2;border-radius:var(--r);padding:11px 12px;font:inherit;font-weight:400;font-size:15px;margin:0;width:100%;box-sizing:border-box}
.skyg-lead-form input:focus,.skyg-lead-form textarea:focus{outline:2px solid rgba(2,75,144,.25);border-color:var(--n)}
.skyg-hp{position:absolute!important;left:-9999px!important;width:1px!important;height:1px!important}
.skyg-form-msg{margin:0!important;font-size:14px;font-weight:600}.skyg-form-msg.ok{color:#14833b}.skyg-form-msg.err{color:#c62828}
.skyg-sticky{display:none}
.skyg-lb{position:fixed;inset:0;z-index:100000;background:rgba(8,12,20,.94);display:flex;align-items:center;justify-content:center;touch-action:pan-y}
.skyg-lb[hidden]{display:none}
.skyg-lb img{max-width:min(94vw,1600px);max-height:calc(100vh - 140px);object-fit:contain;user-select:none}
.skyg-lb button{position:absolute;background:rgba(255,255,255,.12);color:#fff;border:0;border-radius:50%;width:48px;height:48px;font-size:30px;line-height:1;cursor:pointer}
.skyg-lb-x{top:14px;right:14px}.skyg-lb-prev{left:14px}.skyg-lb-next{right:14px}
.skyg-lb-bar{position:absolute;left:0;right:0;bottom:0;padding:14px 16px calc(14px + env(safe-area-inset-bottom));display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap}
.skyg-lb-cap{color:#fff;font-size:14px;opacity:.85}
@media (max-width:767px){
 .skyg-form{grid-template-columns:1fr;padding:18px}.skyg-grid{columns:2;column-gap:8px}.skyg-item{margin-bottom:8px}
 .skyg-albums{grid-template-columns:1fr 1fr;gap:10px}.skyg-album-name{font-size:14px;padding:10px 10px 0}.skyg-album-count{padding:2px 10px 10px}
 .skyg-head .skyg-wa,.skyg-head .skyg-cta{display:none}.skyg-head .skyg-ghost{width:100%}
 .skyg-inline-cta{padding:16px}.skyg-inline-cta strong{font-size:16px}.skyg-inline-cta .skyg-btn{white-space:normal;padding:8px 10px;font-size:13px}
 .skyg-sticky{display:grid;grid-template-columns:1fr 1fr;gap:8px;position:fixed;left:0;right:0;bottom:0;z-index:9990;background:#fff;padding:10px 12px calc(10px + env(safe-area-inset-bottom));box-shadow:0 -6px 20px rgba(0,0,0,.08)}
 .skyg-lb-prev,.skyg-lb-next{display:none}
}';
	}

	private static function js( $wa_msg ) {
		return '(function(){var r=document.querySelector(".skyg");if(!r)return;var P=r.dataset.panel,Y=r.dataset.yol;
function ev(t){if(!Y)return;try{navigator.sendBeacon(P+"/api/galeri/olay",JSON.stringify({yol:Y,tur:t}))}catch(e){}}
ev("goruntu");
r.addEventListener("click",function(e){var a=e.target.closest("[data-olay=whatsapp]");if(a){ev("whatsapp");if(window.dataLayer)dataLayer.push({event:"sky_galeri_whatsapp",galeri:Y})}});
var items=[].slice.call(r.querySelectorAll(".skyg-item")),lb=r.querySelector(".skyg-lb"),img=lb.querySelector("img"),cap=lb.querySelector(".skyg-lb-cap"),wa=lb.querySelector(".skyg-lb-wa"),cur=0,base=' . wp_json_encode( $wa_msg, JSON_UNESCAPED_UNICODE ) . ';
function show(i){cur=(i+items.length)%items.length;var a=items[cur];img.src=a.href;img.alt=a.querySelector("img").alt;cap.textContent=a.dataset.cap||((cur+1)+" / "+items.length);
if(wa){var u=new URL(wa.href);u.searchParams.set("text",base+"\nGörsel: "+a.href);wa.href=u.toString()}
var n=items[(cur+1)%items.length];if(n){var p=new Image();p.src=n.href}}
function open(i){show(i);lb.hidden=false;document.documentElement.style.overflow="hidden"}
function close(){lb.hidden=true;img.removeAttribute("src");document.documentElement.style.overflow=""}
items.forEach(function(a,i){a.addEventListener("click",function(e){e.preventDefault();open(i)})});
lb.querySelector(".skyg-lb-x").onclick=close;lb.querySelector(".skyg-lb-prev").onclick=function(){show(cur-1)};lb.querySelector(".skyg-lb-next").onclick=function(){show(cur+1)};
lb.addEventListener("click",function(e){if(e.target===lb)close()});
document.addEventListener("keydown",function(e){if(lb.hidden)return;if(e.key==="Escape")close();if(e.key==="ArrowRight")show(cur+1);if(e.key==="ArrowLeft")show(cur-1)});
var sx=null;lb.addEventListener("touchstart",function(e){sx=e.touches[0].clientX},{passive:true});lb.addEventListener("touchend",function(e){if(sx===null)return;var d=e.changedTouches[0].clientX-sx;if(Math.abs(d)>50)show(cur+(d<0?1:-1));sx=null});
var f=r.querySelector(".skyg-lead-form"),m=f.querySelector(".skyg-form-msg");
f.addEventListener("submit",function(e){e.preventDefault();var b=f.querySelector("button");b.disabled=true;m.className="skyg-form-msg";m.textContent="Gönderiliyor…";
fetch(P+"/api/galeri/talep",{method:"POST",headers:{"Content-Type":"text/plain"},body:JSON.stringify({yol:Y,ad:f.ad.value,telefon:f.telefon.value,mesaj:f.mesaj.value,site:f.site.value})})
.then(function(x){return x.json()}).then(function(j){if(j.ok){m.className="skyg-form-msg ok";m.textContent="Teşekkürler! En kısa sürede sizi arayacağız.";f.reset();if(window.dataLayer)dataLayer.push({event:"sky_galeri_talep",galeri:Y})}else{m.className="skyg-form-msg err";m.textContent=j.hata||"Gönderilemedi, lütfen tekrar deneyin."}})
.catch(function(){m.className="skyg-form-msg err";m.textContent="Gönderilemedi. WhatsApp\'tan yazabilirsiniz."}).finally(function(){b.disabled=false})});
})();';
	}

	/* ───────────── site haritası ───────────── */

	private static function sitemap() {
		$data = self::fetch( '/api/galeri/harita', 'harita' );
		$list = is_array( $data ) ? $data['albumler'] : array();
		status_header( 200 );
		header( 'Content-Type: application/xml; charset=UTF-8' );
		header( 'X-Robots-Tag: noindex' );
		echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
		echo '<url><loc>' . esc_url( self::url( '' ) ) . '</loc></url>' . "\n";
		foreach ( $list as $a ) {
			echo '<url><loc>' . esc_url( self::url( $a['yol'] ) ) . '</loc><lastmod>' . esc_html( gmdate( 'c', strtotime( $a['guncelleme'] ) ) ) . '</lastmod></url>' . "\n";
		}
		echo '</urlset>';
		exit;
	}

	public static function robots( $out, $public ) {
		return $public ? rtrim( $out ) . "\nSitemap: " . home_url( '/galeri-harita.xml' ) . "\n" : $out;
	}

	public static function rank_math_index( $xml ) {
		return $xml . '<sitemap><loc>' . esc_url( home_url( '/galeri-harita.xml' ) ) . '</loc><lastmod>' . esc_html( gmdate( 'c' ) ) . '</lastmod></sitemap>';
	}
}

Sky_Galeri::init();
register_activation_hook( __FILE__, array( 'Sky_Galeri', 'activate' ) );
register_deactivation_hook( __FILE__, 'flush_rewrite_rules' );
