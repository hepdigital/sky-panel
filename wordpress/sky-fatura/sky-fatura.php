<?php
/**
 * Plugin Name: SKY Fatura Bilgileri
 * Description: Ödeme sayfasında Bireysel / Kurumsal fatura seçimi. Bireyselde TC kimlik no, kurumsalda firma adı, vergi dairesi ve vergi no istenir; siparişte, e-postada, hesabım sayfasında ve yönetim ekranında gösterilir.
 * Version: 1.0.1
 * Author: SKY Görsel Çözümler
 * Requires Plugins: woocommerce
 * Text Domain: sky-fatura
 *
 * Sipariş bilgileri (SKY paneli bu anahtarlarla okur):
 *   _billing_fatura_tipi  bireysel | kurumsal
 *   _billing_tc           TC kimlik no (bireysel)
 *   _billing_company      firma adı (kurumsal, WooCommerce'in kendi alanı)
 *   _billing_tax_office   vergi dairesi (kurumsal)
 *   _billing_tax_number   vergi no (kurumsal; şahıs şirketinde 11 haneli TC olabilir)
 */

defined( 'ABSPATH' ) || exit;

final class Sky_Fatura {
	const TIPLER = array(
		'bireysel' => 'Bireysel',
		'kurumsal' => 'Kurumsal',
	);
	/** Fatura tipine göre gösterilen ve zorunlu olan alanlar */
	const ALANLAR = array(
		'bireysel' => array( 'billing_tc' ),
		'kurumsal' => array( 'billing_company', 'billing_tax_office', 'billing_tax_number' ),
	);

	public static function init() {
		add_filter( 'woocommerce_billing_fields', array( __CLASS__, 'fields' ), 20 );
		add_filter( 'woocommerce_checkout_posted_data', array( __CLASS__, 'clean_posted' ) );
		add_action( 'woocommerce_after_checkout_validation', array( __CLASS__, 'validate' ), 10, 2 );
		add_action( 'woocommerce_after_save_address_validation', array( __CLASS__, 'validate_account' ), 10, 4 );
		add_action( 'wp_footer', array( __CLASS__, 'script' ), 30 );
		add_filter( 'woocommerce_admin_billing_fields', array( __CLASS__, 'admin_fields' ) );
		add_action( 'woocommerce_order_details_after_customer_details', array( __CLASS__, 'order_box' ) );
		add_action( 'woocommerce_email_customer_details', array( __CLASS__, 'email_box' ), 25, 4 );
	}

	/** Gönderilen fatura tipi; yoksa bireysel */
	private static function posted_type() {
		$t = isset( $_POST['billing_fatura_tipi'] ) ? sanitize_key( wp_unslash( $_POST['billing_fatura_tipi'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
		return isset( self::TIPLER[ $t ] ) ? $t : 'bireysel';
	}

	/**
	 * Alanlar formda hep vardır; seçime göre betik gizler. Zorunluluk gönderimde seçilen tipe göre belirlenir,
	 * formu çizerken ise yıldızlı görünsünler diye hepsi zorunlu işaretlenir (gizli olan zaten görünmez).
	 */
	public static function fields( $fields ) {
		$posting = isset( $_POST['billing_fatura_tipi'] ); // phpcs:ignore WordPress.Security.NonceVerification
		$type    = self::posted_type();
		$need    = function ( $key ) use ( $posting, $type ) {
			return ! $posting || in_array( $key, self::ALANLAR[ $type ], true );
		};

		$fields['billing_fatura_tipi'] = array(
			'type'     => 'radio',
			'label'    => 'Fatura tipi',
			'options'  => self::TIPLER,
			'default'  => 'bireysel',
			'required' => true,
			'class'    => array( 'form-row-wide', 'sky-fatura-tipi' ),
			'priority' => 5,
		);
		$fields['billing_tc'] = array(
			'label'             => 'TC kimlik no',
			'required'          => $need( 'billing_tc' ),
			'class'             => array( 'form-row-wide', 'sky-fatura-bireysel' ),
			'priority'          => 25,
			'maxlength'         => 11,
			'custom_attributes' => array(
				'inputmode' => 'numeric',
				'pattern'   => '[0-9]*',
			),
		);
		if ( isset( $fields['billing_company'] ) ) {
			$fields['billing_company']['label']    = 'Firma adı (unvan)';
			$fields['billing_company']['required'] = $need( 'billing_company' );
			$fields['billing_company']['class']    = array( 'form-row-wide', 'sky-fatura-kurumsal' );
			$fields['billing_company']['priority'] = 26;
		}
		$fields['billing_tax_office'] = array(
			'label'    => 'Vergi dairesi',
			'required' => $need( 'billing_tax_office' ),
			'class'    => array( 'form-row-first', 'sky-fatura-kurumsal' ),
			'priority' => 27,
		);
		$fields['billing_tax_number'] = array(
			'label'             => 'Vergi no',
			'required'          => $need( 'billing_tax_number' ),
			'class'             => array( 'form-row-last', 'sky-fatura-kurumsal' ),
			'priority'          => 28,
			'maxlength'         => 11,
			'custom_attributes' => array( 'inputmode' => 'numeric' ),
		);
		return $fields;
	}

	/** Seçilmeyen tipin alanları kaydedilmez (ör. kurumsal seçildiyse önceden yazılmış TC) */
	public static function clean_posted( $data ) {
		$type = isset( self::TIPLER[ $data['billing_fatura_tipi'] ?? '' ] ) ? $data['billing_fatura_tipi'] : 'bireysel';
		foreach ( self::ALANLAR as $t => $keys ) {
			if ( $t !== $type ) {
				foreach ( $keys as $k ) {
					$data[ $k ] = '';
				}
			}
		}
		$data['billing_fatura_tipi'] = $type;
		return $data;
	}

	/** TC kimlik no algoritması (11 hane, ilk hane 0 değil, 10. ve 11. hane kontrolü) */
	public static function tc_valid( $tc ) {
		if ( ! preg_match( '/^[1-9]\d{10}$/', $tc ) ) {
			return false;
		}
		$d   = array_map( 'intval', str_split( $tc ) );
		$tek = $d[0] + $d[2] + $d[4] + $d[6] + $d[8];
		$cift = $d[1] + $d[3] + $d[5] + $d[7];
		if ( ( ( $tek * 7 - $cift ) % 10 + 10 ) % 10 !== $d[9] ) {
			return false;
		}
		return array_sum( array_slice( $d, 0, 10 ) ) % 10 === $d[10];
	}

	private static function check( array $data, $add ) {
		$type = $data['billing_fatura_tipi'] ?? 'bireysel';
		if ( 'bireysel' === $type ) {
			$tc = preg_replace( '/\D/', '', (string) ( $data['billing_tc'] ?? '' ) );
			if ( '' !== $tc && ! self::tc_valid( $tc ) ) {
				$add( 'billing_tc', '<strong>TC kimlik no</strong> geçerli değil; 11 haneyi kontrol edin.' );
			}
		} else {
			$vn = preg_replace( '/\D/', '', (string) ( $data['billing_tax_number'] ?? '' ) );
			if ( '' !== $vn && ! preg_match( '/^\d{10,11}$/', $vn ) ) {
				$add( 'billing_tax_number', '<strong>Vergi no</strong> 10 haneli olmalı (şahıs şirketinde 11 haneli TC kimlik no).' );
			}
		}
	}

	public static function validate( $data, $errors ) {
		self::check(
			$data,
			function ( $key, $msg ) use ( $errors ) {
				$errors->add( $key . '_gecersiz', $msg, array( 'id' => $key ) );
			}
		);
	}

	/** Hesabım > Adresler > Fatura adresi kaydedilirken */
	public static function validate_account( $user_id, $load_address, $address, $customer ) {
		if ( 'billing' !== $load_address ) {
			return;
		}
		$data = array();
		foreach ( array( 'billing_fatura_tipi', 'billing_tc', 'billing_tax_number' ) as $k ) {
			$data[ $k ] = isset( $_POST[ $k ] ) ? sanitize_text_field( wp_unslash( $_POST[ $k ] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
		}
		self::check(
			$data,
			function ( $key, $msg ) {
				wc_add_notice( $msg, 'error' );
			}
		);
	}

	/** Seçime göre alanları gösterir/gizler (ödeme ve Hesabım > Fatura adresi sayfalarında) */
	public static function script() {
		if ( ! ( is_checkout() || is_wc_endpoint_url( 'edit-address' ) ) || is_wc_endpoint_url( 'order-pay' ) || is_wc_endpoint_url( 'order-received' ) ) {
			return;
		}
		?>
		<style>
			/* Seçim kartları: seçili kart lacivert çerçeve ve açık mavi zemin (konfigüratördeki ölçü kartları gibi) */
			.sky-fatura-tipi .woocommerce-input-wrapper { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 4px; }
			.sky-fatura-tipi input.input-radio { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }
			.sky-fatura-tipi label.radio {
				display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; margin: 0; padding: 18px 12px 16px;
				border: 2px solid #e3e7ee; border-radius: 14px; background: #fff; cursor: pointer; text-align: center;
				font-size: 17px; font-weight: 700; line-height: 1.2; color: #1f2329; transition: border-color .15s, background-color .15s;
			}
			.sky-fatura-tipi label.radio:hover { border-color: #b9c6d8; }
			.sky-fatura-tipi label.radio .required, .sky-fatura-tipi label.radio abbr { display: none; }
			.sky-fatura-tipi label.radio::before {
				content: ""; width: 34px; height: 34px; background-color: #8a94a3;
				-webkit-mask: var(--sky-ikon) center / contain no-repeat; mask: var(--sky-ikon) center / contain no-repeat;
			}
			.sky-fatura-tipi label.radio::after { font-size: 13px; font-weight: 400; color: #7a828e; }
			.sky-fatura-tipi label.radio[for$="_bireysel"] { --sky-ikon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='8' r='4'/%3E%3Cpath d='M4 21a8 8 0 0 1 16 0'/%3E%3C/svg%3E"); }
			.sky-fatura-tipi label.radio[for$="_kurumsal"] { --sky-ikon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='4' y='3' width='16' height='18' rx='1.5'/%3E%3Cpath d='M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3'/%3E%3C/svg%3E"); }
			.sky-fatura-tipi label.radio[for$="_bireysel"]::after { content: "TC kimlik no ile"; }
			.sky-fatura-tipi label.radio[for$="_kurumsal"]::after { content: "Firma ve vergi no ile"; }
			.sky-fatura-tipi input.input-radio:checked + label.radio { border-color: #0f4c8a; background: #f3f6fb; color: #0f2f57; }
			.sky-fatura-tipi input.input-radio:checked + label.radio::before { background-color: #0f4c8a; }
			.sky-fatura-tipi input.input-radio:focus-visible + label.radio { outline: 2px solid #0f4c8a; outline-offset: 2px; }
		</style>
		<script>
		( function () {
			function apply() {
				var on = document.querySelector( 'input[name="billing_fatura_tipi"]:checked' );
				var type = on ? on.value : 'bireysel';
				document.querySelectorAll( '.sky-fatura-bireysel' ).forEach( function ( r ) { r.style.display = type === 'bireysel' ? '' : 'none'; } );
				document.querySelectorAll( '.sky-fatura-kurumsal' ).forEach( function ( r ) { r.style.display = type === 'kurumsal' ? '' : 'none'; } );
			}
			document.addEventListener( 'change', function ( e ) {
				if ( e.target && e.target.name === 'billing_fatura_tipi' ) apply();
			} );
			if ( document.readyState === 'loading' ) document.addEventListener( 'DOMContentLoaded', apply ); else apply();
		} )();
		</script>
		<?php
	}

	/** Yönetim > Sipariş düzenle: fatura adresinde görünür ve düzenlenir (_billing_tc vb.) */
	public static function admin_fields( $fields ) {
		$out = array();
		foreach ( $fields as $k => $f ) {
			if ( 'company' === $k ) {
				$out['fatura_tipi'] = array(
					'label'   => 'Fatura tipi',
					'type'    => 'select',
					'options' => self::TIPLER,
					'show'    => true,
				);
				$out['tc'] = array(
					'label' => 'TC kimlik no',
					'show'  => true,
				);
			}
			$out[ $k ] = $f;
			if ( 'company' === $k ) {
				$out['tax_office'] = array(
					'label' => 'Vergi dairesi',
					'show'  => true,
				);
				$out['tax_number'] = array(
					'label' => 'Vergi no',
					'show'  => true,
				);
			}
		}
		return $out;
	}

	/** Siparişin fatura bilgisi satırları: [etiket, değer] */
	private static function lines( $order ) {
		$type = (string) $order->get_meta( '_billing_fatura_tipi' );
		if ( ! isset( self::TIPLER[ $type ] ) ) {
			return array();
		}
		$rows = array( array( 'Fatura tipi', self::TIPLER[ $type ] ) );
		if ( 'bireysel' === $type ) {
			$rows[] = array( 'TC kimlik no', (string) $order->get_meta( '_billing_tc' ) );
		} else {
			$rows[] = array( 'Firma adı', $order->get_billing_company() );
			$rows[] = array( 'Vergi dairesi', (string) $order->get_meta( '_billing_tax_office' ) );
			$rows[] = array( 'Vergi no', (string) $order->get_meta( '_billing_tax_number' ) );
		}
		return array_filter(
			$rows,
			function ( $r ) {
				return '' !== $r[1];
			}
		);
	}

	/** Teşekkürler ve Hesabım > Sipariş sayfası */
	public static function order_box( $order ) {
		$rows = self::lines( $order );
		if ( ! $rows ) {
			return;
		}
		echo '<section class="sky-fatura-bilgileri" style="margin-top:24px"><h2 class="woocommerce-column__title">Fatura bilgileri</h2><table class="woocommerce-table shop_table"><tbody>';
		foreach ( $rows as $r ) {
			echo '<tr><th>' . esc_html( $r[0] ) . '</th><td>' . esc_html( $r[1] ) . '</td></tr>';
		}
		echo '</tbody></table></section>';
	}

	public static function email_box( $order, $sent_to_admin, $plain_text, $email = null ) {
		$rows = self::lines( $order );
		if ( ! $rows ) {
			return;
		}
		if ( $plain_text ) {
			echo "\nFATURA BİLGİLERİ\n";
			foreach ( $rows as $r ) {
				echo esc_html( $r[0] ) . ': ' . esc_html( $r[1] ) . "\n";
			}
			return;
		}
		echo '<h2>Fatura bilgileri</h2><table cellspacing="0" cellpadding="6" style="width:100%;margin-bottom:24px;border:1px solid #e5e5e5" border="1"><tbody>';
		foreach ( $rows as $r ) {
			echo '<tr><th style="text-align:left;width:40%">' . esc_html( $r[0] ) . '</th><td style="text-align:left">' . esc_html( $r[1] ) . '</td></tr>';
		}
		echo '</tbody></table>';
	}
}

add_action( 'plugins_loaded', array( 'Sky_Fatura', 'init' ) );
