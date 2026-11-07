module.exports=[230323,492231,a=>{"use strict";var b=a.i(93321),c=a.i(530385),d=a.i(351674),e=a.i(514851),f=a.i(940566),g=a.i(351419),h=a.i(227103),i=a.i(160627),j=a.i(110120),k=a.i(326838);a.s(["f",0,k],492231);var k=k,l=a.i(884301);let{siteTalepleri:m,siteBaglantilari:n}=h.f,o=null,p=()=>o??=(0,g.f)().execute(d.B.raw(`CREATE TABLE IF NOT EXISTS site_talepleri (
        id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
        site_id int unsigned NOT NULL,
        marka_id int unsigned NOT NULL,
        dis_id int unsigned NOT NULL,
        tur varchar(24) NOT NULL,
        tur_ad varchar(60) NOT NULL,
        ad varchar(120) NOT NULL,
        firma varchar(191) NULL,
        eposta varchar(191) NOT NULL,
        telefon varchar(32) NOT NULL,
        il varchar(64) NULL,
        mesaj text NOT NULL,
        dis_tarih timestamp NOT NULL DEFAULT current_timestamp(),
        durum enum('yeni','arandi','teklif','kazanildi','kaybedildi') NOT NULL DEFAULT 'yeni',
        \`not\` text NULL,
        ilgilenen_id int unsigned NULL,
        olusturma timestamp NOT NULL DEFAULT current_timestamp(),
        guncelleme timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        UNIQUE KEY talep_site_dis (site_id, dis_id),
        KEY talep_durum (durum),
        CONSTRAINT site_talepleri_site_id_site_baglantilari_id_fk FOREIGN KEY (site_id) REFERENCES site_baglantilari (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)).catch(a=>{throw o=null,a});async function q(a,c){if("gazebotente"!==a.tur)return 0;await p();let[e]=await (0,g.f)().select({m:d.B`COALESCE(MAX(${m.disId}), 0)`.mapWith(Number)}).from(m).where((0,b.u)(m.siteId,a.id)),f=e?.m??0,h=0;for(let b=0;b<20;b++){let{talepler:b}=await c(`/api/panel/talepler/?limit=50&after=${f}`);if(b.length){await (0,g.f)().insert(m).values(b.map(b=>({siteId:a.id,markaId:a.markaId,disId:b.id,tur:b.tur.slice(0,24),turAd:b.turAd.slice(0,60),ad:b.ad.slice(0,120),firma:b.firma?.slice(0,191)||null,eposta:b.eposta.slice(0,191),telefon:b.telefon.slice(0,32),il:b.il?.slice(0,64)||null,mesaj:b.mesaj,disTarih:new Date(b.tarih)}))).onDuplicateKeyUpdate({set:{disId:d.B`dis_id`}}),f=b.at(-1).id,h+=b.length;let c=b.filter(a=>Date.now()-new Date(a.tarih).getTime()<2592e5);for(let b of c.length>3?[]:c)(0,l.notify)("talep",(0,l.sellers)(a.markaId),{title:`Yeni talep \xb7 ${b.turAd}`,body:[b.firma||b.ad,b.il,b.mesaj.replace(/s+/g," ").slice(0,140)].filter(Boolean).join(" · "),url:"/panel/talepler",tag:`talep-${a.id}-${b.id}`});c.length>3&&(0,l.notify)("talep",(0,l.sellers)(a.markaId),{title:`${c.length} yeni talep \xb7 ${a.ad}`,body:c.map(a=>a.firma||a.ad).join(" · "),url:"/panel/talepler"})}if(b.length<50)break}return h}async function r(a){return(0,e.N)(a)?null:(await (0,f.Y)(a)).map(a=>a.id)}async function s(a,d){await p();let e=await r(a);if(e&&!e.length)return[];let f=[e?(0,b.y)(m.markaId,e):void 0,d?(0,b.y)(m.durum,["yeni","arandi","teklif"]):void 0].filter(Boolean);return(0,g.f)().select({t:m,site:n.ad,marka:i.f.markalar.ad,markaRenk:i.f.markalar.renk,ilgilenen:j.f.kullanicilar.adSoyad}).from(m).innerJoin(n,(0,b.u)(n.id,m.siteId)).leftJoin(i.f.markalar,(0,b.u)(i.f.markalar.id,m.markaId)).leftJoin(j.f.kullanicilar,(0,b.u)(j.f.kullanicilar.id,m.ilgilenenId)).where(f.length?(0,b.b)(...f):void 0).orderBy((0,c.A)(m.disTarih)).limit(300)}async function t(a,d){await p();let e=await r(a);return e&&!e.length?[]:(0,g.f)().select({t:m,marka:i.f.markalar.ad,markaRenk:i.f.markalar.renk}).from(m).leftJoin(i.f.markalar,(0,b.u)(i.f.markalar.id,m.markaId)).where((0,b.b)((0,b.u)(m.tur,"konfigurator"),(0,b.y)(m.durum,["yeni","arandi","teklif"]),e?(0,b.y)(m.markaId,e):void 0,d?(0,b.u)(m.markaId,d):void 0)).orderBy((0,c.A)(m.disTarih)).limit(50)}async function u(a){try{await p();let c=await r(a);if(c&&!c.length)return 0;let[e]=await (0,g.f)().select({n:d.B`COUNT(*)`.mapWith(Number)}).from(m).where((0,b.b)((0,b.u)(m.durum,"yeni"),c?(0,b.y)(m.markaId,c):void 0));return e?.n??0}catch{return 0}}async function v(a,c,d){await p();let[e]=await (0,g.f)().select({markaId:m.markaId}).from(m).where((0,b.u)(m.id,c));if(!e)return{ok:!1,hata:"Talep bulunamadı."};let f=await r(a);if(f&&!f.includes(e.markaId))return{ok:!1,hata:"Bu talebe erişiminiz yok."};let h={},i=k.TALEP_DURUMLARI.find(a=>a===d.durum);return i&&(h.durum=i,h.ilgilenenId=a.id),void 0!==d.not&&(h.not=d.not.trim().slice(0,4e3)||null),Object.keys(h).length&&await (0,g.f)().update(m).set(h).where((0,b.u)(m.id,c)),{ok:!0}}a.s(["T",0,()=>p(),"i",0,t,"O",0,s,"o",0,u,"U",0,q,"I",0,v],230323)}];

//# sourceMappingURL=src_server_site-requests_ts_11ytl9dbvxn8c._.js.map