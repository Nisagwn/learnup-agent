# ORTAK ANAYASA — Çoklu-Ajan İşletim Kuralları

> Bu dosya YALNIZ çoklu-ajan işletiminin kurallarını içerir. **Teknik kuralların tek kaynağı
> [`VERDENT.md`](../../VERDENT.md)'dir; çelişkide [`YKS-BEYIN-SISTEM-MIMARISI.md`](../../YKS-BEYIN-SISTEM-MIMARISI.md)
> kazanır.** Buraya teknik kural kopyalanmaz — özet ikinci kaynak demektir, ikinci kaynak kayma demektir.

## 1. Belge hiyerarşisi (çelişkide üstteki kazanır)

1. `YKS-BEYIN-SISTEM-MIMARISI.md` (mimari gerekçelerin tek kaynağı)
2. `VERDENT.md` (operasyonel teknik anayasa)
3. Bu dosya (çoklu-ajan işletimi)
4. `docs/agents/<rol>.md` (rol master prompt'u)
5. Görev kartı (`docs/agents/handoff/GOREV-NNN-*.md`)

## 2. Kadro ve bölge sahipliği

Kadro tablosu ve her ajanın **yazma bölgesi** [`AGENTS.md`](AGENTS.md)'de tanımlıdır (kanonik kaynak orasıdır).

- Bölge dışına **yazmak yasaktır**. Okumak serbesttir.
- Bölge dışı bir değişiklik gerekiyorsa: iş fikri RAPOR'un "Sonraki adım önerisi" bölümüne yazılır;
  kartı ilgili ajana ORKESTRATÖR açar.
- Uygulamanın İÇİNDEKİ ürün ajanları (kaptan, atlas, pusula, nabız, kâtip; worker'ın "bekçi"si,
  eval'in "hakem"i) **ürün özelliğidir** — geliştirme ajanlarıyla karıştırılmaz, geliştirme ajanı
  adı olarak kullanılmaz.

## 3. Görev kartı yaşam döngüsü

```
beklemede → alindi → tamamlandi → onaylandi → arsiv/
                │           │
                │           └→ iade (gerekçeyle) → alindi
                └→ engellendi (gerekçe zorunlu: bağımlılık / migration / paralı-onay bekliyor)
her durumdan → iptal (gerekçeyle) → arsiv/
```

- Kart dosyasını **yalnız ORKESTRATÖR oluşturur**. Sıradaki numara = `handoff/` + `handoff/arsiv/`
  içindeki en büyük NNN + 1. **Dizin listesi kanonik sayaçtır** — ayrı sayaç dosyası tutulmaz
  (iki kaynak = kayma). Numara asla yeniden kullanılmaz.
- Uzman ajanın karttaki **ilk eylemi** durumu `alindi` yapmaktır (dosya düzeyinde claim; ürün
  kodundaki CAS-claim deseninin dosya karşılığı).
- `onaylandi` ve `iptal` kartları ORKESTRATÖR `arsiv/`e taşır (dosya adı değişmez). Aktif dizinde
  yalnız yaşayan kartlar durur.
- Her durum geçişi kartın **Günlük** bölümüne tek satır düşer:
  `2026-07-21 · BACKEND · alindi` · `2026-07-22 · ORKESTRATÖR · iade: eval çıktısı eksik`

## 4. Bölüm sahipliği (aynı karta iki oturum yazarsa)

| Bölüm | Kim yazar |
|---|---|
| Frontmatter (durum hariç), Amaç, Bağlam, Kabul Kriterleri, Kısıtlar, Başlangıç Durumu, Onay Kayıtları | ORKESTRATÖR |
| RAPOR | yalnız `kime` ajanı |
| Durum: `alindi / tamamlandi / engellendi` geçişleri | `kime` ajanı |
| Durum: `onaylandi / iade / iptal` geçişleri | ORKESTRATÖR |
| Günlük | geçişi yapan |

## 5. Eşzamanlılık

- Farklı bölgelerde paralel çalışma serbesttir.
- Kart frontmatter'ındaki `dokunulan-dosyalar` bir **niyet beyanıdır**; kesişen beyanlı kartları
  ORKESTRATÖR serileştirir — aynı bölgeye aynı anda **en fazla bir** kart `alindi` olabilir.
- Ajan, beyanı dışındaki kirli (uncommitted) dosyalara dokunmaz ve asla geri almaz —
  **`git checkout --` / `git restore` yasak.**
- API sözleşmesi değişen işler **iki karta bölünür**: BACKEND kartı önce; FRONTEND kartı
  `bagimlilik` alanıyla onu bekler.

## 6. Onay tanımı (`onaylandi` için 4 ölçüt — hepsi şart)

1. Kabul kriterlerinin her biri işaretli.
2. Kalite kapısı komutlarının **çıktıları** RAPOR'da (bkz. §8).
3. `git status` farkı `dokunulan-dosyalar` beyanıyla eşleşiyor.
4. Paralı koşu yapıldıysa Onay Kayıtları'nda tavan + gerçekleşen maliyet var.

## 7. Para ve yan etkiler

- **Paralı LLM koşusu:** tahmini maliyet önce söylenir; kartın **Onay Kayıtları** bölümünde
  tarih + tavan değeriyle **yazılı kullanıcı onayı** olmadan tek çağrı gönderilmez. Sert tavan
  (`--tavan` / `maliyetTavani()`) şarttır. (Teknik ayrıntı: `VERDENT.md` §3.7.)
- **Commit'i her zaman KULLANICI atar.** Hiçbir ajan `git commit` / `git push` çalıştırmaz.
  ORKESTRATÖR onay verdiği kartta "commit'e hazır" der — commit'i atmaz.
- **Migration akışı:** BACKEND yazar, **KULLANICI koşar** (Supabase Dashboard → SQL Editor).
  Kartın `migration-gerekli` bayrağı durumu izler: `evet-yazilacak → yazildi-kosulmadi → kosuldu`.
  `yazildi-kosulmadi` iken karta bağlı davranış doğrulaması yapılamaz — kart `engellendi`ye çekilir.
- **DB'ye toplu yazım iki aşamalı:** önce `learnup-brain/data/*.jsonl`, kullanıcı onayı, sonra DB.
- Zamanlanmış görev eklenmez; her koşu elle başlatılır.

## 8. RAPOR disiplini

- "Çalıştırdım" yetmez — kapı komutlarının **ham çıktısı** (veya son satırları) RAPOR'a yapıştırılır.
- Dürüstlük sözleşmesi raporlara da uygulanır: **koşulmayan kapı "koşulmadı" diye yazılır**,
  yeşilmiş gibi gösterilmez. `null` = ölçülmedi, `0` = ölçüldü sıfır çıktı.
- RAPOR şu başlıkları içerir: Yapılan · Değişen dosyalar · Koşulan kapılar + çıktıları ·
  Gerçekleşen maliyet ($0 dahil) · Açık riskler · Sonraki adım önerisi.

## 9. Oturum başlatma

Her uzman oturum şu tek satırla açılır (rol adı ve kart numarası değişir):

> Sen **<ROL>** ajanısın. Sırasıyla `docs/agents/ORTAK-ANAYASA.md`, `docs/agents/<rol>.md` ve
> `docs/agents/handoff/GOREV-NNN-*.md` dosyalarını oku; kartın durumunu `alindi` yap, sonra işle.
