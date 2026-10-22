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
  var GREEN = [0,131,85], INK = [17,26,38], INK2 = [61,78,100], INK3 = [128,142,160],
      LINE = [219,226,235], SOFT = [244,246,250], WARN = [175,69,38], WARNBG = [250,232,226];
  var FF = "SKYSans";

  var money = function(n){ return Math.round(n).toLocaleString("tr-TR") + " TL"; };

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
      doc.text(FIRMA.ad, M, y + 6);
    }

    /* sag ust: firma kunyesi — sadece doldurulmus alanlar basilir */
    var bw = 100, ry = y;   /* logo 63 mm'de biter, sag blok 95 mm'den baslar */
    setF(doc, 8.6, "bold", INK);
    doc.splitTextToSize(FIRMA.unvan || FIRMA.ad, bw).forEach(function(l){
      doc.text(l, right, ry, { align: "right" }); ry += 3.7;
    });
    ry += 0.8;
    var kunye = [
      FIRMA.adres,
      FIRMA.telefon ? "Tel: " + FIRMA.telefon : "",
      [FIRMA.eposta, FIRMA.web].filter(Boolean).join(" · "),
      [FIRMA.vergi, FIRMA.ticSicil ? "Tic. Sic. " + FIRMA.ticSicil : ""].filter(Boolean).join(" · "),
      FIRMA.mersis ? "Mersis: " + FIRMA.mersis : ""
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

  /* ---------- musteri + teklif bilgisi kutulari ---------- */
  function boxes(doc, q, y){
    var gap = 8, bw = (CW - gap) / 2, pad = 6;

    var sol = [];
    sol.push({ t: q.musteri || "—", bold: true, size: 11 });
    if (q.yetkili)  sol.push({ t: "Yetkili: " + q.yetkili, size: 8.6 });
    if (q.iletisim) sol.push({ t: q.iletisim, size: 8.6 });

    var sag = [];
    sag.push({ t: q.modeAd + " fiyat listesi" + (q.vatOn ? " · KDV dahil" : " · KDV hariç"), size: 8.6 });
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
      if (y + h + 14 > PH - 24){ doc.addPage(); y = 24; }
      setF(doc, 8.6, "bold", INK);
      doc.text(k.ad + " · ürün görselleri", M, y + 7);
      y += 10;
      ims.forEach(function(im, i){
        var x = M + i * (w + gap);
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
  function table(doc, q, y){
    var G = !!q.gorsel;              /* gorsel sutunu basilsin mi */
    var ACI = G ? 2 : 1;             /* aciklama sutununun indeksi */
    var body = [], imgOf = [];       /* imgOf[i] = i. govde satirinin gorsel anahtari */

    function push(cells, imgKey, minH){
      if (G) cells.splice(1, 0, { content: "", styles: minH ? { minCellHeight: minH } : {} });
      imgOf.push(G ? (imgKey || null) : null);
      body.push(cells);
    }

    q.kalemler.forEach(function(k, i){
      var yalin = !(k.parcalar || []).length;
      push([
        { content: String(i + 1), styles: { halign: "center" } },
        { content: k.ad + (k.alt && yalin ? "\n" + k.alt : ""), styles: { fontStyle: "bold" } },
        { content: String(k.adet), styles: { halign: "center" } },
        { content: money(k.birim), styles: { halign: "right" } },
        { content: money(k.tutar), styles: { halign: "right", fontStyle: "bold" } }
      ], k.img, k.img && G ? 15 : 0);

      /* yapilandirma ozeti yalnizca bilesenli kalemlerde ayri satira duser;
         tek satirlik urunlerde olcusu adin altina yazilir (bos satir acmasin) */
      if (k.alt && !yalin) push(["", { content: k.alt }, "", "", ""], null, 0);

      (k.parcalar || []).forEach(function(p){
        push([
          "",
          { content: "•  " + p.ad },
          "",
          { content: p.fiyat === null ? "fiyat alınız" : money(p.fiyat),
            styles: { halign: "right", textColor: p.fiyat === null ? WARN : INK3 } },
          ""
        ], p.img, p.img && G ? 10 : 0);
      });
    });

    var head = ["#", "Açıklama", "Adet", "Birim fiyat", "Tutar"];
    if (G) head.splice(1, 0, "");
    var cols = G
      ? { 0:{cellWidth:9, halign:"center", textColor:INK3, cellPadding:{top:2.6,bottom:2.6,left:1.5,right:1.5}},
          1:{cellWidth:18, cellPadding:1}, 2:{cellWidth:"auto"},
          3:{cellWidth:15, halign:"center"}, 4:{cellWidth:24, halign:"right"}, 5:{cellWidth:27, halign:"right"} }
      : { 0:{cellWidth:12, halign:"center", textColor:INK3}, 1:{cellWidth:"auto"},
          2:{cellWidth:14, halign:"center"}, 3:{cellWidth:27, halign:"right"}, 4:{cellWidth:30, halign:"right"} };

    doc.autoTable({
      startY: y,
      head: [head],
      body: body,
      theme: "grid",
      margin: { left: M, right: M, bottom: 22 },
      styles: { font: FF, fontStyle: "normal", fontSize: 8.8, cellPadding: { top: 2.6, bottom: 2.6, left: 3, right: 3 },
                lineColor: LINE, lineWidth: 0.15, textColor: INK2, valign: "middle" },
      headStyles: { font: FF, fontStyle: "bold", fillColor: INK, textColor: [255,255,255], fontSize: 8,
                    cellPadding: { top: 3, bottom: 3, left: 3, right: 3 }, lineColor: INK },
      columnStyles: cols,
      didParseCell: function(d){
        /* parca satirlari: daha kucuk, gri, girintili */
        if (d.section !== "body" || d.row.raw[0] !== "") return;
        if (d.column.index === ACI){
          d.cell.styles.textColor = INK3;
          d.cell.styles.fontSize = 8;
          d.cell.styles.cellPadding = { top: 1.4, bottom: 1.4, left: 6, right: 3 };
        } else if (!G || d.column.index !== 1){
          d.cell.styles.fontSize = 8;
          d.cell.styles.cellPadding = { top: 1.4, bottom: 1.4, left: 3, right: 3 };
        }
      },
      didDrawCell: function(d){
        if (!G || d.section !== "body" || d.column.index !== 1) return;
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
  function totals(doc, q, y){
    var bw = 84, x = PW - M - bw, lh = 5.4;

    setF(doc, 7.6, "normal", INK3);
    doc.text(q.vatOn ? "Satır tutarları KDV dahildir." : "Satır tutarları KDV hariçtir.", M, y + 6);

    var yy = y + 4;
    setF(doc, 9, "normal", INK2);
    doc.text("Ara toplam (KDV hariç)", x, yy + lh);
    doc.text("KDV %20", x, yy + lh * 2);
    setF(doc, 9, "normal", INK);
    doc.text(money(q.araToplam), PW - M, yy + lh, { align: "right" });
    doc.text(money(q.kdv), PW - M, yy + lh * 2, { align: "right" });

    var by = yy + lh * 2 + 3;
    doc.setFillColor.apply(doc, GREEN);
    doc.roundedRect(x, by, bw, 12, 2, 2, "F");
    setF(doc, 8.2, "bold", [255,255,255]);
    doc.text("GENEL TOPLAM", x + 5, by + 7.4);
    setF(doc, 12, "bold", [255,255,255]);
    doc.text(money(q.genelToplam), x + bw - 5, by + 7.9, { align: "right" });

    return by + 12 + 8;
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
    if (typeof BANKA === "undefined" || !BANKA || !BANKA.banka) return;
    var ust = [BANKA.banka, BANKA.musteriNo ? "Müşteri No: " + BANKA.musteriNo : ""]
                .filter(Boolean).join("   ·   ");
    /* 6 ust bosluk + 5.6 banka satiri + satirlar + 3 alt bosluk */
    var h = 14.6 + (BANKA.iban ? 6.4 : 0) + (BANKA.hesapAdi ? 5 : 0);

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
    if (BANKA.iban){
      yy += 6.4;
      setF(doc, 7.2, "bold", INK3);
      doc.text("IBAN", M + 7, yy);
      setF(doc, 10.5, "bold", INK);
      doc.text(BANKA.iban, M + 21, yy + 0.2);
    }
    if (BANKA.hesapAdi){
      yy += 5;
      setF(doc, 7.6, "normal", INK3);
      doc.text("Hesap adı: " + BANKA.hesapAdi, M + 7, yy);
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
      doc.text((FIRMA.unvan || FIRMA.ad) + (FIRMA.telefon ? " · " + FIRMA.telefon : "") +
               " · Teklif " + q.no, M, PH - 10.5);
      doc.text(i + " / " + n, PW - M, PH - 10.5, { align: "right" });
    }
  }

  /* ---------- ana kurulum ---------- */
  function build(q){
    return Promise.all([logoImage(), prepImages(q)]).then(function(hazir){
      var logo = hazir[0];
      var doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
      window.SKY_PDF_FONT.install(doc);
      doc.setProperties({
        title: "Fiyat teklifi " + q.no,
        subject: q.musteri || "",
        author: FIRMA.ad,
        creator: "SKY Fiyat Terminali"
      });

      var y = header(doc, q, logo);
      y = boxes(doc, q, y);
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
      if (y + 46 > PH - 24){ doc.addPage(); y = 24; }
      y = totals(doc, q, y);
      y = notes(doc, q, y);
      bank(doc, y);
      footers(doc, q);
      return doc;
    });
  }

  function save(q){
    return build(q).then(function(doc){ doc.save(q.dosyaAdi); return true; });
  }

  return { build: build, save: save };
})();
