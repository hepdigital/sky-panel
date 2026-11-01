<?php
/**
 * Tam ekran konfigüratör sayfası: tema başlığı/altbilgisi ve sabit düğmeler (WhatsApp vb.) olmadan; konfigüratör
 * ekranın kalan yüksekliğini doldurur (mobilde alt çubuğu ve 3D'si ekrana sabit kalır).
 */
defined( 'ABSPATH' ) || exit;
$v = Sky_Konfigurator::page_vars();
?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo( 'charset' ); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title><?php echo esc_html( $v['title'] ); ?></title>
<?php if ( $v['icon'] ) : ?><link rel="icon" href="<?php echo esc_url( $v['icon'] ); ?>"><?php endif; ?>
<meta name="robots" content="index,follow">
<link rel="preconnect" href="<?php echo esc_url( Sky_Konfigurator::PANEL ); ?>">
<style>
	html,body{margin:0;height:100%;background:#f5f6f8;font-family:Poppins,Arial,Helvetica,sans-serif}
	.skyk{display:flex;flex-direction:column;height:100vh;height:100dvh}
	.skyk-bar{flex:none;display:flex;align-items:center;gap:12px;height:56px;padding:0 16px;background:#fff;border-bottom:1px solid #e6e9ee}
	.skyk-logo img{display:block;height:34px;width:auto}
	.skyk-title{font-size:14px;font-weight:600;color:#242424;margin-right:auto}
	.skyk-link{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 12px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;color:#024B90;border:1px solid #dfe3e8}
	.skyk-cart{background:#024B90;color:#fff;border-color:#024B90}
	.skyk-frame{flex:1;width:100%;border:0;display:block}
	@media (max-width:640px){.skyk-title,.skyk-back{display:none}.skyk-bar{height:52px;padding:0 12px}.skyk-logo{margin-right:auto}.skyk-logo img{height:30px}}
</style>
</head>
<body>
<div class="skyk">
	<header class="skyk-bar">
		<a class="skyk-logo" href="<?php echo esc_url( $v['home'] ); ?>" aria-label="Ana sayfa"><img src="<?php echo esc_url( $v['logo'] ); ?>" alt="<?php echo esc_attr( get_bloginfo( 'name' ) ); ?>"></a>
		<span class="skyk-title">Gazebo Çadırınızı Tasarlayın</span>
		<a class="skyk-link skyk-back" href="<?php echo esc_url( $v['home'] ); ?>">‹ Siteye dön</a>
		<a class="skyk-link skyk-cart" href="<?php echo esc_url( $v['cart'] ); ?>">Sepet</a>
	</header>
	<iframe class="skyk-frame" src="<?php echo esc_url( $v['src'] ); ?>" title="Gazebo tasarla" allow="fullscreen"></iframe>
</div>
<?php echo $v['script']; // phpcs:ignore WordPress.Security.EscapeOutput -- sabit betik ?>
</body>
</html>
