/* SKY Fiyat Terminali — PDF teklif ureticisi.
   Sadece yerlesim yapar; tutarlari ve metinleri app.js hazir gonderir (bkz. quoteData()).
   Bagimliliklar: vendor/jspdf.umd.min.js, vendor/jspdf.plugin.autotable.min.js, vendor/fonts-tr.js, js/firma.js

   q = {
     no, tarih, gecerlilik, hazirlayan, musteri, yetkili, iletisim,
     modeAd, toptan, vatOn,
     kalemler: [{ ad, alt, adet, birim, tutar, parcalar:[{ad, fiyat}] }],
     araToplam, kdv, genelToplam,
     uyarilar: [metin], notlar: [metin], dosyaAdi
   }
   birim/tutar zaten KDV moduna gore hesaplanmis gosterim tutarlaridir;
   araToplam/kdv/genelToplam ise her zaman KDV haric tabandan turetilir. */

window.SKY_PDF = (function(){
  "use strict";

  var M = 15, PW = 210, PH = 297, CW = PW - 2 * M;
  var GREEN0 = [0,131,85], GREEN = GREEN0, INK = [17,26,38], INK2 = [61,78,100], INK3 = [128,142,160],
      LINE = [219,226,235], SOFT = [244,246,250], WARN = [175,69,38], WARNBG = [250,232,226];
  var FF = "SKYSans";

  var money = function(n){ return Math.round(n).toLocaleString("tr-TR") + " TL"; };
  /* Kalemin liste fiyatina gore iskonto orani — kayittaki tutarlardan (birim x adet -> tutar) hesaplanir,
     boylece iskonto turu (yuzde, TL, birim fiyat) ne olursa olsun ve eski kayitlarda da musteri ayni bicimi gorur.
     Indirimde "%15,19", ilavede "+%5"; fark yoksa bos. */
  function oran(k){
    var liste = k.birim * k.adet;
    if (!(liste > 0) || Math.abs(liste - k.tutar) < 0.5) return "";
    var p = Math.round((1 - k.tutar / liste) * 10000) / 100;
    if (!p) return "";
    return (p < 0 ? "+%" : "%") + Math.abs(p).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  }

  /* ---------- marka ----------
     Panelde teklif verisi markanin kimligini tasir (q.firma): firma kunyesi, banka, renk, logo.
     Eski kayitlarda yoktur; o zaman firma.js'teki (SKY) bilgiler kullanilir. */
  var F = typeof FIRMA !== "undefined" ? FIRMA : { ad: "" };
  var B = typeof BANKA !== "undefined" ? BANKA : null;
  var TPL = "klasik", DARK = INK;   /* sablon ve ikinci (koyu) renk */
  function hexRgb(h){
    var m = /^#?([0-9a-f]{6})$/i.exec(h || "");
    if (!m) return GREEN0;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function useBrand(q){
    var f = q.firma;
    if (!f){
      F = typeof FIRMA !== "undefined" ? FIRMA : { ad: "" };
      B = typeof BANKA !== "undefined" ? BANKA : null;
      GREEN = GREEN0; TPL = "klasik"; DARK = INK;
      return;
    }
    TPL = f.sablon === "modern" ? "modern" : "klasik";
    DARK = f.renk2 ? hexRgb(f.renk2) : INK;
    F = { ad: f.ad, unvan: f.unvan, adres: f.adres, telefon: f.telefon, eposta: f.eposta, web: f.web,
          vergi: f.vergi, ticSicil: f.ticSicil, mersis: f.mersis };
    B = f.banka || null;
    GREEN = hexRgb(f.renk);
  }
  /* markanin logo dosyasini (svg/webp/png) PNG'ye cevir */
  function brandLogo(url){
    return new Promise(function(resolve){
      var img = new Image();
      img.onload = function(){
        try {
          var iw = img.naturalWidth || 300, ih = img.naturalHeight || 100;
          var ratio = iw / ih, w = 1400, h = Math.max(1, Math.round(w / ratio));
          var cv = document.createElement("canvas");
          cv.width = w; cv.height = h;
          cv.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve({ data: cv.toDataURL("image/png"), ratio: ratio });
        } catch (e) { resolve(null); }
      };
      img.onerror = function(){ resolve(null); };
      img.src = url;
    });
  }

  /* ---------- sayfadaki SVG logoyu PNG'ye cevir ---------- */
  function logoImage(){
    return new Promise(function(resolve){
      try {
        var svg = document.querySelector("svg.brand");
        if (!svg) return resolve(null);
        var vb = (svg.getAttribute("viewBox") || "0 0 4 1").split(/\s+/).map(Number);
        var ratio = vb[2] / vb[3], w = 1400, h = Math.round(w / ratio);
        var c = svg.cloneNode(true);
        c.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        c.setAttribute("width", w);
        c.setAttribute("height", h);
        c.removeAttribute("class");
        c.setAttribute("style", "color:#111A26");        /* currentColor'li yazi kismi */
        var url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(c));
        var img = new Image();
        img.onload = function(){
          try {
            var cv = document.createElement("canvas");
            cv.width = w; cv.height = h;
            var ctx = cv.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);
            resolve({ data: cv.toDataURL("image/png"), ratio: ratio });
          } catch (e) { resolve(null); }
        };
        img.onerror = function(){ resolve(null); };
        img.src = url;
      } catch (e) { resolve(null); }
    });
  }

  /* ---------- kucuk yardimcilar ---------- */
  function setF(doc, size, style, color){
    doc.setFont(FF, style || "normal");
    doc.setFontSize(size);
    doc.setTextColor.apply(doc, color || INK);
  }
  /* Turkce buyuk harf: i -> İ (varsayilan toUpperCase bunu I yapar) */
  var upper = function(s){
    try { return s.toLocaleUpperCase("tr"); } catch (e) { return s.toUpperCase(); }
  };
  function label(doc, txt, x, y){
    setF(doc, 7.2, "bold", INK3);
    doc.text(upper(txt), x, y);
  }
  /* metni kutuya sigdirip kac mm yer kapladigini dondurur */
  function para(doc, txt, x, y, w, lh){
    var lines = doc.splitTextToSize(txt, w);
    doc.text(lines, x, y);
    return lines.length * lh;
  }

  /* ---------- ust bilgi ---------- */
  function header(doc, q, logo){
    var y = 15, right = PW - M;

    if (logo){
      var lh = 11, lw = lh * logo.ratio;
      doc.addImage(logo.data, "PNG", M, y - 2, lw, lh);
    } else {
      setF(doc, 15, "bold", GREEN);
      doc.text(F.ad, M, y + 6);
    }

    /* sag ust: firma kunyesi — sadece doldurulmus alanlar basilir */
    var bw = 100, ry = y;   /* logo 63 mm'de biter, sag blok 95 mm'den baslar */
    setF(doc, 8.6, "bold", INK);
    doc.splitTextToSize(F.unvan || F.ad, bw).forEach(function(l){
      doc.text(l, right, ry, { align: "right" }); ry += 3.7;
    });
    ry += 0.8;
    var kunye = [
      F.adres,
      F.telefon ? "Tel: " + F.telefon : "",
      [F.eposta, F.web].filter(Boolean).join(" · "),
      [F.vergi, F.ticSicil ? "Tic. Sic. " + F.ticSicil : ""].filter(Boolean).join(" · "),
      F.mersis ? "Mersis: " + F.mersis : ""
    ].filter(Boolean);
    setF(doc, 7.4, "normal", INK3);
    kunye.forEach(function(s){
      doc.splitTextToSize(s, bw).forEach(function(l){ doc.text(l, right, ry, { align: "right" }); ry += 3.1; });
    });

    var y2 = Math.max(y + 13, ry) + 3;
    doc.setDrawColor.apply(doc, GREEN);
    doc.setLineWidth(0.9);
    doc.line(M, y2, right, y2);
    doc.setDrawColor.apply(doc, LINE);
    doc.setLineWidth(0.2);
    doc.line(M, y2 + 1.4, right, y2 + 1.4);

    /* baslik satiri */
    var y3 = y2 + 12;
    setF(doc, 17, "bold", INK);
    doc.text("FİYAT TEKLİFİ", M, y3);
    /* etiketler degerlerin soluna, en genis degere gore hizalanir */
    setF(doc, 8.8, "bold", INK2);
    var lx = right - Math.max(doc.getTextWidth(q.no), doc.getTextWidth(q.tarih)) - 5;
    doc.text(q.no, right, y3 - 4.6, { align: "right" });
    doc.text(q.tarih, right, y3, { align: "right" });
    setF(doc, 8.4, "normal", INK3);
    doc.text("Teklif No", lx, y3 - 4.6, { align: "right" });
    doc.text("Tarih", lx, y3, { align: "right" });

    return y3 + 7;
  }

  /* ---------- modern sablon ----------
     Sayfa boyu koyu serit: solda logo beyaz kartta, sagda buyuk TEKLIF, numara ve tarih; altinda marka renginde ince cizgi.
     Firma kunyesi ustte degil, her sayfanin altindaki koyu seritte. */
  var tint = function(c, a){ return c.map(function(v){ return Math.round(255 - (255 - v) * a); }); };
  function headerModern(doc, q, logo){
    var bh = 40;
    doc.setFillColor.apply(doc, DARK);
    doc.rect(0, 0, PW, bh, "F");
    doc.setFillColor.apply(doc, GREEN);
    doc.rect(0, bh, PW, 1.6, "F");

    /* logo beyaz kartta (koyu yazili logolar koyu zeminde kaybolmasin) */
    var cw = 74, ch = 22, cx = M, cy = (bh - ch) / 2;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(cx, cy, cw, ch, 3, 3, "F");
    if (logo){
      var lh = 12, lw = lh * logo.ratio;
      if (lw > cw - 10){ lw = cw - 10; lh = lw / logo.ratio; }
      doc.addImage(logo.data, "PNG", cx + (cw - lw) / 2, cy + (ch - lh) / 2, lw, lh);
    } else {
      setF(doc, 14, "bold", DARK);
      doc.text(F.ad, cx + 6, cy + ch / 2 + 2);
    }

    var right = PW - M;
    setF(doc, 24, "bold", [255,255,255]);
    doc.text("TEKLİF", right, 19, { align: "right" });
    setF(doc, 9, "bold", tint(GREEN, 0.55));
    doc.text(q.no, right, 27, { align: "right" });
    setF(doc, 8.4, "normal", [205,214,224]);
    doc.text(q.tarih + (q.gecerlilik ? "  ·  geçerlilik " + q.gecerlilik.replace(/\s*\(.*\)$/, "") : ""), right, 32.5, { align: "right" });
    return bh + 12;
  }
  function boxesModern(doc, q, y){
    var gap = 10, bw = (CW - gap) / 2;
    function col(x, title, lines){
      doc.setFillColor.apply(doc, GREEN);
      doc.rect(x, y - 3.2, 1.2, 4.2, "F");
      label(doc, title, x + 4, y);
      var yy = y + 7;
      lines.forEach(function(it){
        setF(doc, it.size || 8.8, it.bold ? "bold" : "normal", it.bold ? DARK : INK2);
        doc.splitTextToSize(it.t, bw - 4).slice(0, 2).forEach(function(l){ doc.text(l, x + 4, yy); yy += it.size && it.size > 10 ? 6 : 4.8; });
      });
      return yy;
    }
    var sol = [{ t: q.musteri || "—", bold: true, size: 13 }];
    if (q.yetkili) sol.push({ t: q.yetkili });
    if (q.iletisim) sol.push({ t: q.iletisim });
    /* fiyat listesi/KDV satiri yok: KDV notu toplamlarin yaninda, toptan uyarisi tablonun ustunde */
    var sag = [];
    if (q.gecerlilik) sag.push({ t: "Geçerlilik: " + q.gecerlilik });
    if (q.hazirlayan) sag.push({ t: "Hazırlayan: " + q.hazirlayan });
    var y1 = col(M, "Sayın", sol), y2 = col(M + bw + gap, "Teklif bilgileri", sag);
    var yb = Math.max(y1, y2) + 2;
    doc.setDrawColor.apply(doc, LINE);
    doc.setLineWidth(0.2);
    doc.line(M, yb, PW - M, yb);
    return yb + 7;
  }
  function footersModern(doc, q){
    var n = doc.internal.getNumberOfPages();
    var kunye = [F.unvan || F.ad, F.adres, F.telefon ? "Tel: " + F.telefon : "", [F.eposta, F.web].filter(Boolean).join(" · "),
                 [F.vergi, F.ticSicil ? "Tic. Sic. " + F.ticSicil : "", F.mersis ? "Mersis: " + F.mersis : ""].filter(Boolean).join(" · ")]
                .filter(Boolean).join("   ·   ");
    for (var i = 1; i <= n; i++){
      doc.setPage(i);
      doc.setFillColor.apply(doc, DARK);
      doc.rect(0, PH - 13, PW, 13, "F");
      doc.setFillColor.apply(doc, GREEN);
      doc.rect(0, PH - 13, PW, 0.9, "F");
      setF(doc, 6.8, "normal", [205,214,224]);
      /* sagdaki "no · sayfa" yazisina binmesin */
      setF(doc, 7.4, "bold", [255,255,255]);
      var sagW = doc.getTextWidth(q.no + "  ·  " + i + " / " + n) + 6;
      setF(doc, 6.8, "normal", [205,214,224]);
      var lines = doc.splitTextToSize(kunye, CW - sagW).slice(0, 2);
      doc.text(lines, M, PH - (lines.length > 1 ? 7.6 : 5.8));
      setF(doc, 7.4, "bold", [255,255,255]);
      doc.text(q.no + "  ·  " + i + " / " + n, PW - M, PH - 5.8, { align: "right" });
    }
  }

  /* ---------- musteri + teklif bilgisi kutulari ---------- */
  function boxes(doc, q, y){
    var gap = 8, bw = (CW - gap) / 2, pad = 6;

    var sol = [];
    sol.push({ t: q.musteri || "—", bold: true, size: 11 });
    if (q.yetkili)  sol.push({ t: "Yetkili: " + q.yetkili, size: 8.6 });
    if (q.iletisim) sol.push({ t: q.iletisim, size: 8.6 });

    var sag = [];
    if (q.gecerlilik) sag.push({ t: "Geçerlilik: " + q.gecerlilik, size: 8.6 });
    if (q.hazirlayan) sag.push({ t: "Hazırlayan: " + q.hazirlayan, size: 8.6 });

    var h = Math.max(sol.length, sag.length) * 5 + 13;
    doc.setFillColor.apply(doc, SOFT);
    doc.setDrawColor.apply(doc, LINE);
    doc.setLineWidth(0.2);
    doc.roundedRect(M, y, bw, h, 2, 2, "FD");
    doc.roundedRect(M + bw + gap, y, bw, h, 2, 2, "FD");

    function fill(items, x, title){
      label(doc, title, x + pad, y + 6);
      var yy = y + 12.5;
      items.forEach(function(it){
        setF(doc, it.size || 8.6, it.bold ? "bold" : "normal", it.bold ? INK : INK2);
        doc.splitTextToSize(it.t, bw - pad * 2).slice(0, 2).forEach(function(l){ doc.text(l, x + pad, yy); yy += 4.6; });
      });
    }
    fill(sol, M, "Müşteri");
    fill(sag, M + bw + gap, "Teklif bilgileri");

    return y + h + 7;
  }

  /* ---------- gorseller ----------
     Katalog gorselleri webp; jsPDF webp basamadigi icin canvas uzerinden
     kuculterek JPEG'e cevrilir. Saydam kenarlar siyah cikmasin diye once
     beyaz zemin doldurulur. Anahtar bazinda onbellege alinir. */
  var imgCache = {};
  function rasterize(key, px){
    if (imgCache[key] !== undefined) return Promise.resolve(imgCache[key]);
    /* anahtar dogrudan gorsel adresi de olabilir (3D goruntuleri: data:image/...) */
    /* ya da sitedeki dosya adresi (panelden yuklenen urun gorselleri: /dosya/...) */
    var src = key.indexOf("data:") === 0 || key.charAt(0) === "/" ? key : (typeof IMG !== "undefined" && IMG && IMG[key]) ? IMG[key]
      : key.indexOf(":") > 0 ? "/terminal/img/" + key.replace(":", "-") + ".webp" : null;
    if (!src){ imgCache[key] = null; return Promise.resolve(null); }
    return new Promise(function(res){
      var im = new Image();
      im.onload = function(){
        try {
          var iw = im.naturalWidth || px, ih = im.naturalHeight || px;
          var w = Math.min(px, iw), h = Math.max(1, Math.round(ih * w / iw));
          var cv = document.createElement("canvas");
          cv.width = w; cv.height = h;
          var ctx = cv.getContext("2d");
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(im, 0, 0, w, h);
          imgCache[key] = { data: cv.toDataURL("image/jpeg", 0.82), ratio: w / h };
        } catch (e) { imgCache[key] = null; }
        res(imgCache[key]);
      };
      im.onerror = function(){ imgCache[key] = null; res(null); };
      im.src = src;
    });
  }
  /* tablodaki tum gorselleri onceden hazirla — autoTable senkron cizer */
  function prepImages(q){
    if (!q.gorsel) return Promise.resolve([]);
    var jobs = [];
    q.kalemler.forEach(function(k){
      if (k.img) jobs.push(rasterize(k.img, 200));                 /* ~16 mm @ 300 dpi */
      (k.parcalar || []).forEach(function(p){
        if (p.img) jobs.push(rasterize(p.img, 130));               /* ~10 mm @ 300 dpi */
      });
      (k.gorseller || []).forEach(function(u){ jobs.push(rasterize(u, 900)); });  /* 3D goruntuleri */
    });
    return Promise.all(jobs);
  }

  /* ---------- urun gorselleri ----------
     3D yapilandiricidan gelen gazebolarda iki capraz aci (sol-on, sag-arka) tablonun altinda yan yana. */
  function views(doc, q, y){
    if (!q.gorsel) return y;
    q.kalemler.forEach(function(k){
      var ims = (k.gorseller || []).map(function(u){ return imgCache[u]; }).filter(Boolean);
      if (!ims.length) return;
      var gap = 4, w = (CW - gap * (ims.length - 1)) / ims.length, h = w / ims[0].ratio;
      /* en fazla 56 mm yukseklik: toplam ve notlar ayni sayfada kalabilsin; daralan gorseller ortalanir */
      if (h > 56){ h = 56; w = h * ims[0].ratio; }
      var x0 = M + (CW - (w * ims.length + gap * (ims.length - 1))) / 2;
      if (y + h + 14 > PH - 24){ doc.addPage(); y = 24; }
      setF(doc, 8.6, "bold", INK);
      doc.text(k.ad + " · ürün görselleri", M, y + 7);
      y += 10;
      ims.forEach(function(im, i){
        var x = x0 + i * (w + gap);
        doc.addImage(im.data, "JPEG", x, y, w, h);
        doc.setDrawColor.apply(doc, LINE);
        doc.setLineWidth(0.15);
        doc.rect(x, y, w, h);
      });
      y += h + 2;
    });
    return y;
  }

  /* ---------- kalem tablosu ---------- */
  /* yazi boyutundan satir yuksekligi (mm): autoTable ile ayni carpan (1.15) */
  var LH = function(pt){ return pt * 1.15 * 25.4 / 72; };
  function pads(cell){
    var p = cell.styles.cellPadding;
    return typeof p === "number" ? { top: p, bottom: p, left: p, right: p } : p;
  }
  var padX = function(cell){ var p = pads(cell); return p.left + p.right; };

  /* bilesen kutusu: baslik + iki sutun kart (gorsel, ad, fiyat) */
  var CARD = 10.6, CGAP = 1.6;
  function partsHeight(parts){
    var rows = Math.ceil(parts.length / 2);
    return 2 + 8 + rows * CARD + (rows - 1) * CGAP + 3.5;
  }
  function drawParts(doc, q, parts, x, y, w, h){
    var bx = x + 1.5, by = y + 2, bw = w - 3, bh = h - 3.5;
    doc.setFillColor.apply(doc, SOFT);
    doc.roundedRect(bx, by, bw, bh, 1.8, 1.8, "F");
    label(doc, "Bileşenler · 1 adet için · birim fiyata dahildir", bx + 3, by + 5.2);
    var cw = (bw - 6 - 2) / 2;
    parts.forEach(function(p, j){
      var cx = bx + 3 + (j % 2) * (cw + 2), cy = by + 8 + Math.floor(j / 2) * (CARD + CGAP);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor.apply(doc, LINE);
      doc.setLineWidth(0.15);
      doc.roundedRect(cx, cy, cw, CARD, 1.4, 1.4, "FD");
      var im = q.gorsel && p.img ? imgCache[p.img] : null, tx = cx + 3;
      if (im){
        var s = CARD - 2.4, iw = s, ih = s / im.ratio;
        if (ih > s){ ih = s; iw = s * im.ratio; }
        doc.addImage(im.data, "JPEG", cx + 1.2 + (s - iw) / 2, cy + 1.2 + (s - ih) / 2, iw, ih, p.img);
        tx = cx + s + 3.4;
      }
      var fiyat = p.fiyat === null ? "fiyat alınız" : money(p.fiyat);
      setF(doc, 7.8, "bold", p.fiyat === null ? WARN : INK2);
      var fw = doc.getTextWidth(fiyat);
      doc.text(fiyat, cx + cw - 2.5, cy + CARD / 2 + 1, { align: "right" });
      setF(doc, 7.4, "normal", INK2);
      var lines = doc.splitTextToSize(p.ad, cx + cw - 2.5 - fw - 3 - tx).slice(0, 2);
      var ly = cy + CARD / 2 + 1 - (lines.length - 1) * LH(7.4) / 2;
      lines.forEach(function(l, i){ doc.text(l, tx, ly + i * LH(7.4)); });
    });
  }
  function table(doc, q, y){
    var G = !!q.gorsel;              /* gorsel sutunu basilsin mi */
    var ACI = G ? 2 : 1;             /* aciklama sutununun indeksi */
    var body = [], imgOf = [];       /* imgOf[i] = i. govde satirinin gorsel anahtari */
    var I = q.kalemler.some(function(k){ return !!oran(k); });  /* iskonto sutunu: en az bir kalemde iskonto/ilave varsa */

    function push(cells, imgKey, minH, isk){
      if (I) cells.splice(4, 0, isk ? { content: isk, styles: { halign: "right", textColor: isk.charAt(0) === "+" ? WARN : GREEN, fontStyle: "bold" } } : "");
      if (G) cells.splice(1, 0, { content: "", styles: minH ? { minCellHeight: minH } : {} });
      imgOf.push(G ? (imgKey || null) : null);
      body.push(cells);
    }

    /* meta[i]: ana satirda { ad, alt } (aciklama adin altina ince yazilir), bilesen satirinda { parca } */
    var meta = [];
    var NC = 5 + (I ? 1 : 0) + (G ? 1 : 0);
    q.kalemler.forEach(function(k, i){
      push([
        { content: String(i + 1), styles: { halign: "center" } },
        /* yukseklik ad + aciklamaya gore ayrilir; aciklama cizimde ince/gri yazilir (willDrawCell / didDrawCell) */
        { content: k.ad + (k.alt ? "\n" + k.alt : ""), styles: { fontStyle: "bold", valign: k.alt ? "top" : "middle" } },
        { content: String(k.adet), styles: { halign: "center" } },
        { content: money(k.birim), styles: { halign: "right" } },
        { content: money(k.tutar), styles: { halign: "right", fontStyle: "bold" } }
      ], k.img, k.img && G ? 15 : 0, oran(k));
      meta[body.length - 1] = k.alt ? { ad: k.ad, alt: k.alt } : null;

      /* gazebo bilesenleri: musteri linkindeki gibi ayri kutuda kartlar; fiyatlar bilgi amacli, birim fiyata dahil */
      var parts = k.parcalar || [];
      if (parts.length){
        body.push([{ content: "", colSpan: NC, styles: { minCellHeight: partsHeight(parts), cellPadding: 0, fillColor: [255,255,255] } }]);
        imgOf.push(null);
        meta[body.length - 1] = { parca: parts };
      }
    });

    var head = ["#", "Açıklama", "Adet", "Birim fiyat", "Tutar"];
    if (I) head.splice(4, 0, "İskonto");
    if (G) head.splice(1, 0, "");
    /* sutun genislikleri: "Birim fiyat" liste fiyatidir; iskonto sutunu varsa Tutar = adet x birim - iskonto */
    var w = I ? [15, 25, 21, 27] : [15, 24, 0, 27];    /* adet, birim, iskonto, tutar */
    var cols = {}, c = 0;
    cols[c++] = G ? { cellWidth: 9, halign: "center", textColor: INK3, cellPadding: { top: 2.6, bottom: 2.6, left: 1.5, right: 1.5 } }
                  : { cellWidth: 12, halign: "center", textColor: INK3 };
    if (G) cols[c++] = { cellWidth: 18, cellPadding: 1 };
    cols[c++] = { cellWidth: "auto" };
    cols[c++] = { cellWidth: w[0], halign: "center" };
    cols[c++] = { cellWidth: w[1], halign: "right" };
    if (I) cols[c++] = { cellWidth: w[2], halign: "right" };
    cols[c++] = { cellWidth: w[3], halign: "right" };

    doc.autoTable({
      startY: y,
      head: [head],
      body: body,
      theme: TPL === "modern" ? "striped" : "grid",
      alternateRowStyles: TPL === "modern" ? { fillColor: tint(GREEN, 0.07) } : {},
      margin: { left: M, right: M, bottom: 22 },
      styles: { font: FF, fontStyle: "normal", fontSize: 8.8, cellPadding: { top: 2.6, bottom: 2.6, left: 3, right: 3 },
                lineColor: LINE, lineWidth: TPL === "modern" ? 0 : 0.15, textColor: INK2, valign: "middle" },
      headStyles: { font: FF, fontStyle: "bold", fillColor: TPL === "modern" ? GREEN : INK, textColor: [255,255,255], fontSize: 8,
                    cellPadding: { top: 3, bottom: 3, left: 3, right: 3 }, lineColor: TPL === "modern" ? GREEN : INK },
      columnStyles: cols,
      rowPageBreak: "avoid",
      willDrawCell: function(d){
        /* ana satir: hucreye yalnizca ad basilir, aciklamayi didDrawCell yazar */
        var m = meta[d.row.index];
        if (d.section !== "body" || d.column.index !== ACI || !m || !m.alt) return;
        setF(doc, 8.8, "bold", INK2);
        var n = doc.splitTextToSize(m.ad, d.cell.width - padX(d.cell)).length;
        d.cell.text = d.cell.text.slice(0, n);
        m.n = n;
      },
      didDrawCell: function(d){
        if (d.section !== "body") return;
        var m = meta[d.row.index];
        if (m && m.parca && d.column.index === 0){
          /* kutu aciklama sutununun hizasindan baslar (# ve gorsel sutunlari bos kalir) */
          var inset = 0;
          for (var c = 0; c < ACI; c++) inset += d.table.columns[c].width;
          drawParts(doc, q, m.parca, d.cell.x + inset, d.cell.y, d.cell.width - inset, d.cell.height);
          return;
        }
        if (m && m.alt && d.column.index === ACI){
          var pad = pads(d.cell), ty = d.cell.y + pad.top + m.n * LH(8.8) + 0.6;
          setF(doc, 7.8, "normal", INK3);
          doc.splitTextToSize(m.alt, d.cell.width - pad.left - pad.right).forEach(function(l, j){
            doc.text(l, d.cell.x + pad.left, ty + 2.4 + j * LH(7.8));
          });
          return;
        }
        if (!G || d.column.index !== 1) return;
        var key = imgOf[d.row.index], im = key ? imgCache[key] : null;
        if (!im) return;
        var mw = d.cell.width - 2, mh = d.cell.height - 2;
        var w = mw, h = w / im.ratio;
        if (h > mh){ h = mh; w = h * im.ratio; }
        var ix = d.cell.x + (d.cell.width - w) / 2, iy = d.cell.y + (d.cell.height - h) / 2;
        /* alias = anahtar: ayni gorsel PDF'e bir kez gomulur */
        doc.addImage(im.data, "JPEG", ix, iy, w, h, key);
        /* acik zeminli urun fotograflari kagitta kaybolmasin diye ince cerceve */
        doc.setDrawColor.apply(doc, LINE);
        doc.setLineWidth(0.15);
        doc.rect(ix, iy, w, h);
      }
    });
    return doc.lastAutoTable.finalY;
  }

  /* ---------- toplam bloku ---------- */
  /* [etiket, tutar, renk?]: liste toplami, satir iskontolari/ilaveleri, genel iskonto.
     Eksi icin duz tire: PDF yazi tipinde uzun eksi (U+2212) yok, bos cikar. */
  function discountRows(q){
    var r = [], s = q.satirIsk || 0, g = q.genelIsk || 0;
    if (!s && !g) return r;
    r.push(["Liste toplamı (KDV hariç)", money(q.araListe)]);
    var pct = function(n, base){ return base > 0 ? " (%" + (Math.round(Math.abs(n) / base * 10000) / 100).toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + ")" : ""; };
    if (s) r.push([(s > 0 ? "Satır iskontoları" : "Satır ilaveleri") + pct(s, q.araListe), (s > 0 ? "- " : "+ ") + money(Math.abs(s)), s > 0 ? GREEN : WARN]);
    /* musterinin iskonto grubundan geldiyse etiket "Grup · %10 ind." bicimindedir: grup adi da yazilir */
    var grup = / · /.test(q.genelIskEtiket || "") ? " · " + q.genelIskEtiket.split(" · ")[0] : "";
    if (g) r.push([(g > 0 ? "Genel iskonto" : "Genel ilave") + pct(g, q.araListe - s) + grup,
                   (g > 0 ? "- " : "+ ") + money(Math.abs(g)), g > 0 ? GREEN : WARN]);
    return r;
  }
  /* sag blok (dokum + genel toplam) ve sol blok (KDV notu + online onay kutusu) yukseklikleri; cizmeden olcer */
  var TBW = 84, TLH = 5.4;
  function totalsRows(q){
    var rows = discountRows(q);
    rows.push(["Ara toplam (KDV hariç)", money(q.araToplam)], ["KDV %20", money(q.kdv)]);
    return rows;
  }
  /* online onay kutusu: sol sutunda, QR kod solda, metin ve tiklanir baglanti sagda */
  var QR = 22;
  function onlineLines(doc, w){
    setF(doc, 7.4, "normal", INK2);
    return doc.splitTextToSize("QR kodu okutarak ya da bağlantıya tıklayarak teklifi inceleyip onaylayabilirsiniz; müşteri temsilciniz anında bilgilendirilir.", w);
  }
  function onlineBox(doc, q, x, y, w, draw){
    if (!q.link) return 0;
    var qx = q.qr ? QR + 4 : 0, tw = w - 8 - qx;
    var lines = onlineLines(doc, tw);
    setF(doc, 6.4, "normal", INK3);
    var url = doc.splitTextToSize(q.link, tw).slice(0, 2);
    var h = Math.max(q.qr ? QR + 6 : 0, 6 + 4.4 + lines.length * 3.4 + 1.6 + 4 + url.length * 2.8 + 3);
    if (!draw) return h;
    doc.setFillColor.apply(doc, tint(GREEN, 0.08));
    doc.setDrawColor.apply(doc, tint(GREEN, 0.35));
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, w, h, 2, 2, "FD");
    if (q.qr){
      doc.addImage(q.qr, "PNG", x + 3, y + 3, QR, QR);
      doc.link(x + 3, y + 3, QR, QR, { url: q.link });
    }
    var tx = x + 4 + qx, ty = y + 6.4;
    setF(doc, 8.8, "bold", INK);
    doc.text("Teklifi online onaylayın", tx, ty);
    ty += 4.4;
    setF(doc, 7.4, "normal", INK2);
    lines.forEach(function(l){ doc.text(l, tx, ty); ty += 3.4; });
    ty += 1.6;
    setF(doc, 8, "bold", GREEN);
    doc.textWithLink("Teklifi görüntüle ve onayla", tx, ty, { url: q.link });
    ty += 3.4;
    setF(doc, 6.4, "normal", INK3);
    url.forEach(function(l){ doc.text(l, tx, ty); doc.link(tx, ty - 2.2, tw, 2.8, { url: q.link }); ty += 2.8; });
    return h;
  }
  function totalsHeight(doc, q){
    var right = 4 + TLH * totalsRows(q).length + 3 + 12;
    var left = 9 + onlineBox(doc, q, 0, 0, PW - 2 * M - TBW - 8, false);
    return Math.max(right, left);
  }
  function totals(doc, q, y){
    var bw = TBW, x = PW - M - bw, lh = TLH;

    setF(doc, 7.6, "normal", INK3);
    doc.text(q.vatOn ? "Satır tutarları KDV dahildir." : "Satır tutarları KDV hariçtir.", M, y + 6);
    onlineBox(doc, q, M, y + 9, PW - 2 * M - bw - 8, true);

    var yy = y + 4;
    /* iskonto varsa liste toplamindan ara toplama kadar dokum (hepsi KDV haric) */
    var rows = totalsRows(q);
    rows.forEach(function(r, i){
      setF(doc, 9, "normal", r[2] || INK2);
      doc.text(r[0], x, yy + lh * (i + 1));
      setF(doc, 9, "normal", r[2] || INK);
      doc.text(r[1], PW - M, yy + lh * (i + 1), { align: "right" });
    });

    var by = yy + lh * rows.length + 3;
    doc.setFillColor.apply(doc, TPL === "modern" ? DARK : GREEN);
    doc.roundedRect(x, by, bw, 12, 2, 2, "F");
    if (TPL === "modern"){ doc.setFillColor.apply(doc, GREEN); doc.rect(x, by, 2.2, 12, "F"); }
    setF(doc, 8.2, "bold", [255,255,255]);
    doc.text("GENEL TOPLAM", x + 5, by + 7.4);
    setF(doc, 12, "bold", [255,255,255]);
    doc.text(money(q.genelToplam), x + bw - 5, by + 7.9, { align: "right" });

    return y + totalsHeight(doc, q) + 8;
  }

  /* ---------- uyarilar + notlar ---------- */
  function notes(doc, q, y){
    if (q.uyarilar.length){
      var uh = 0;
      q.uyarilar.forEach(function(u){ uh += doc.splitTextToSize(u, CW - 12).length * 4.2; });
      uh += 7;
      if (y + uh > PH - 19){ doc.addPage(); y = 24; }
      doc.setFillColor.apply(doc, WARNBG);
      doc.setDrawColor(224, 176, 158);
      doc.setLineWidth(0.2);
      doc.roundedRect(M, y, CW, uh, 2, 2, "FD");
      var uy = y + 5.6;
      setF(doc, 8.4, "bold", WARN);
      q.uyarilar.forEach(function(u){
        uy += para(doc, "!  " + u, M + 5, uy, CW - 12, 4.2);
      });
      y += uh + 7;
    }

    if (q.notlar.length){
      var nh = 0;
      q.notlar.forEach(function(n){ nh += doc.splitTextToSize("•  " + n, CW - 4).length * 4.2; });
      if (y + nh + 8 > PH - 19){ doc.addPage(); y = 24; }
      label(doc, "Notlar", M, y);
      y += 5;
      setF(doc, 8.4, "normal", INK2);
      q.notlar.forEach(function(n){ y += para(doc, "•  " + n, M, y, CW - 4, 4.2); });
    }
    return y;
  }

  /* ---------- son sayfanin en altinda odeme bilgileri ---------- */
  function bank(doc, y){
    if (!B || !B.banka) return;
    var ust = [B.banka, B.musteriNo ? "Müşteri No: " + B.musteriNo : ""]
                .filter(Boolean).join("   ·   ");
    /* 6 ust bosluk + 5.6 banka satiri + satirlar + 3 alt bosluk */
    var h = 14.6 + (B.iban ? 6.4 : 0) + (B.hesapAdi ? 5 : 0);

    if (y + 6 + h > PH - 19){ doc.addPage(); y = 24; }
    var by = Math.max(y + 6, PH - 19 - h);   /* yer varsa sayfanin dibine yaslanir */

    doc.setFillColor.apply(doc, SOFT);
    doc.setDrawColor.apply(doc, LINE);
    doc.setLineWidth(0.2);
    doc.roundedRect(M, by, CW, h, 2, 2, "FD");
    doc.setFillColor.apply(doc, GREEN);
    doc.rect(M, by, 1.4, h, "F");            /* sol kenarda marka seridi */

    var yy = by + 6;
    label(doc, "Ödeme bilgileri", M + 7, yy);
    yy += 5.6;
    setF(doc, 8.6, "normal", INK2);
    doc.text(ust, M + 7, yy);
    if (B.iban){
      yy += 6.4;
      setF(doc, 7.2, "bold", INK3);
      doc.text("IBAN", M + 7, yy);
      setF(doc, 10.5, "bold", INK);
      doc.text(B.iban, M + 21, yy + 0.2);
    }
    if (B.hesapAdi){
      yy += 5;
      setF(doc, 7.6, "normal", INK3);
      doc.text("Hesap adı: " + B.hesapAdi, M + 7, yy);
    }
  }

  /* ---------- her sayfaya alt bilgi ---------- */
  function footers(doc, q){
    var n = doc.internal.getNumberOfPages();
    for (var i = 1; i <= n; i++){
      doc.setPage(i);
      doc.setDrawColor.apply(doc, LINE);
      doc.setLineWidth(0.2);
      doc.line(M, PH - 15, PW - M, PH - 15);
      setF(doc, 7.4, "normal", INK3);
      doc.text((F.unvan || F.ad) + (F.telefon ? " · " + F.telefon : "") +
               " · Teklif " + q.no, M, PH - 10.5);
      doc.text(i + " / " + n, PW - M, PH - 10.5, { align: "right" });
    }
  }

  /* ---------- ana kurulum ---------- */
  function build(q){
    useBrand(q);
    var logoJob = q.firma && q.firma.logo ? brandLogo(q.firma.logo) : logoImage();
    return Promise.all([logoJob, prepImages(q)]).then(function(hazir){
      var logo = hazir[0];
      var doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
      window.SKY_PDF_FONT.install(doc);
      doc.setProperties({
        title: "Fiyat teklifi " + q.no,
        subject: q.musteri || "",
        author: F.ad,
        creator: (F.ad || "SKY") + " teklif"
      });

      var modern = TPL === "modern";
      var y = modern ? headerModern(doc, q, logo) : header(doc, q, logo);
      y = modern ? boxesModern(doc, q, y) : boxes(doc, q, y);
      if (q.toptan){
        doc.setFillColor.apply(doc, WARNBG);
        doc.setDrawColor(224, 176, 158);
        doc.roundedRect(M, y, CW, 9, 2, 2, "FD");
        setF(doc, 8.4, "bold", WARN);
        doc.text("TOPTAN (BAYİ) FİYAT LİSTESİ — SON KULLANICIYA VERİLMEZ", M + 5, y + 6);
        y += 14;
      }
      y = table(doc, q, y);
      y = views(doc, q, y);
      /* toplam blogu bolunmez: tam yuksekligi sigmiyorsa yeni sayfaya (alt bilgi cizgisi PH-15'te) */
      if (y + totalsHeight(doc, q) > PH - 18){ doc.addPage(); y = 24; }
      y = totals(doc, q, y);
      y = notes(doc, q, y);
      bank(doc, y);
      if (modern) footersModern(doc, q); else footers(doc, q);
      return doc;
    });
  }

  function save(q){
    return build(q).then(function(doc){ doc.save(q.dosyaAdi); return true; });
  }

  return { build: build, save: save };
})();
