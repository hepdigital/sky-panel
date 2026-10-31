module.exports=[30323,a=>{"use strict";var b=a.i(93321),c=a.i(30385),d=a.i(51674),e=a.i(14851),f=a.i(40566),g=a.i(51419),h=a.i(27103),i=a.i(60627),j=a.i(10120),k=a.i(26838),k=k;let{siteTalepleri:l,siteBaglantilari:m}=h.f,n=null,o=()=>n??=(0,g.f)().execute(d.B.raw(`CREATE TABLE IF NOT EXISTS site_talepleri (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)).catch(a=>{throw n=null,a});async function p(a,c){if("gazebotente"!==a.tur)return 0;await o();let[e]=await (0,g.f)().select({m:d.B`COALESCE(MAX(${l.disId}), 0)`.mapWith(Number)}).from(l).where((0,b.u)(l.siteId,a.id)),f=e?.m??0,h=0;for(let b=0;b<20;b++){let{talepler:b}=await c(`/api/panel/talepler/?limit=50&after=${f}`);if(b.length&&(await (0,g.f)().insert(l).values(b.map(b=>({siteId:a.id,markaId:a.markaId,disId:b.id,tur:b.tur.slice(0,24),turAd:b.turAd.slice(0,60),ad:b.ad.slice(0,120),firma:b.firma?.slice(0,191)||null,eposta:b.eposta.slice(0,191),telefon:b.telefon.slice(0,32),il:b.il?.slice(0,64)||null,mesaj:b.mesaj,disTarih:new Date(b.tarih)}))).onDuplicateKeyUpdate({set:{disId:d.B`dis_id`}}),f=b.at(-1).id,h+=b.length),b.length<50)break}return h}async function q(a){return(0,e.N)(a)?null:(await (0,f.Y)(a)).map(a=>a.id)}async function r(a,d){await o();let e=await q(a);if(e&&!e.length)return[];let f=[e?(0,b.y)(l.markaId,e):void 0,d?(0,b.y)(l.durum,["yeni","arandi","teklif"]):void 0].filter(Boolean);return(0,g.f)().select({t:l,site:m.ad,marka:i.f.markalar.ad,markaRenk:i.f.markalar.renk,ilgilenen:j.f.kullanicilar.adSoyad}).from(l).innerJoin(m,(0,b.u)(m.id,l.siteId)).leftJoin(i.f.markalar,(0,b.u)(i.f.markalar.id,l.markaId)).leftJoin(j.f.kullanicilar,(0,b.u)(j.f.kullanicilar.id,l.ilgilenenId)).where(f.length?(0,b.b)(...f):void 0).orderBy((0,c.A)(l.disTarih)).limit(300)}async function s(a){try{await o();let c=await q(a);if(c&&!c.length)return 0;let[e]=await (0,g.f)().select({n:d.B`COUNT(*)`.mapWith(Number)}).from(l).where((0,b.b)((0,b.u)(l.durum,"yeni"),c?(0,b.y)(l.markaId,c):void 0));return e?.n??0}catch{return 0}}async function t(a,c,d){await o();let[e]=await (0,g.f)().select({markaId:l.markaId}).from(l).where((0,b.u)(l.id,c));if(!e)return{ok:!1,hata:"Talep bulunamadı."};let f=await q(a);if(f&&!f.includes(e.markaId))return{ok:!1,hata:"Bu talebe erişiminiz yok."};let h={},i=k.TALEP_DURUMLARI.find(a=>a===d.durum);return i&&(h.durum=i,h.ilgilenenId=a.id),void 0!==d.not&&(h.not=d.not.trim().slice(0,4e3)||null),Object.keys(h).length&&await (0,g.f)().update(l).set(h).where((0,b.u)(l.id,c)),{ok:!0}}a.s(["O",0,r,"o",0,s,"U",0,p,"I",0,t],30323)}];

//# sourceMappingURL=src_server_site-requests_ts_11ytl9dbvxn8c._.js.map