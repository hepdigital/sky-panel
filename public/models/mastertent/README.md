# Mastertent 3D modelleri

- Kaynak: konfigurator.skygorselcozumler.com (Mastertent / Zingerle Group sahne dışa aktarımı, EGR GF formatı).
- Kullanım: Mastertent ürünleri SKY tarafından fason üretildiği için kullanım izni mevcuttur (2026-10-14, proje sahibi beyanı).
- Şu an yalnızca 3x3 ölçü var: `scene-3x3.json` (iskelet + çatı) ve duvar varyantları
  `scene-3x3-{standard,fenster,tuer,halbwand}.json`. Parçalar `glb/` altında, geometri kimliğiyle adlandırılmış.
- GLB'ler `gltf-transform meshopt` ile sıkıştırıldı (5,3 MB → 1,5 MB); drei `useGLTF` meshopt'u otomatik çözer.
- Yeni ölçü eklemek için aynı yapıdaki dosyaları buraya koyup `src/site/configurator.json` içinde ölçüye `"model"` alanı ekleyin.
