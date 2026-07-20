# MagicPatterns Komut Seti — "Kaptan Köşkü" WEB (Desktop) Tasarımı

Kullanım — iki yol:
- **A) Mobil setle AYNI projede devam ediyorsan:** KOMUT 0'ı atla; her ekran için kısa uyarlayıcıyı kullan:
  "Adapt this screen to desktop 1440px: replace the bottom tab bar with the 240px left sidebar,
  keep the same design system." Sonra aşağıdaki ilgili komutun ekrana özel maddelerini ekle.
- **B) Ayrı/yeni proje açıyorsan:** Bu set kendi başına yeterli — önce **KOMUT 0**, sonra 1-6 sırayla,
  hepsi aynı sohbette. Her ekrandan memnun kalınca: "Now show the dark 'Gece Vardiyası' variant."
  Export: React + Tailwind (token'lar Tailwind v4 @theme yapımıza birebir oturur).

---

## KOMUT 0 — Tasarım sistemi + desktop kabuk + "Bugün" (2 kolon)

```
Design a DESKTOP web app (1440px frame) for "LearnUp" — a Turkish university-entrance-exam (YKS) prep
platform for high-school students. The product's face is KAPTAN, a warm, seasoned AI coach with a
ship-captain identity. The visual language follows a premium nautical "journey" metaphor: the weekly
study plan is a ROTA (route), streak is a FENER (lantern flame), levels are RÜTBE (naval ranks).
Audience is 16-18 year olds; warm and encouraging, Duolingo-level energy, but premium and grown-up,
NOT childish. All UI copy must be in TURKISH.

DESIGN TOKENS (follow exactly):
- Light theme "Güverte" (deck): background #F8F5EE warm ivory, sunken areas #EFE8DB sand, cards #FFFFFF,
  hairline borders rgba(26,43,69,0.12). Text: primary #1A2B45 ink navy, secondary #4A5A72, muted #7D8899.
- Dark theme "Gece Vardiyası" (night watch — FIRST-CLASS, not an afterthought): background #0A1524 night
  sea, sunken #060E19, cards #13233A, raised #1A2E4A, hairline rgba(148,178,216,0.14). Text: primary
  #F0EBDF warm ivory, secondary #AEB9C9.
- Primary action: deep navy #183659 (light) / #4C82C3 (dark). Buttons are TACTILE 3D: 16px radius,
  solid fill with a 4px darker bottom edge (#0C1B2E light / #21486F dark), press = translateY(3px).
- Accents: correct green #27935F, wrong = WARM CORAL #DE5B49 (never cold red), streak ember #F4702E
  with soft glow, XP gold #F0B429, BRASS #B98A44 for prestige (official exam seal, rank ring, league
  promotion), SRS/review teal #2E7F8F.
- Typography: "Outfit" for headings/numbers/buttons (600-800, tabular numerals), "Inter" for body.
  Body 15px, question text 17px, titles 20-24, display 30. Radii 10/14/20/28, 4px spacing grid.
  Shadows soft and navy-tinted in light; in dark use surface layering + hairlines, glow only on rewards.

APP SHELL (desktop): fixed 240px LEFT SIDEBAR on the base background with hairline right border.
Top: LearnUp wordmark with a small brass compass mark. Nav groups with 15px labels and lucide-style
icons: "Bugün" (home), "Rota" (compass), "Kaptan" (captain avatar item with brass notification dot),
"Pratik" (target — with indented children: ÖSYM Arşivi, Tekrar Zamanı, Ödevler, Defterim), "Harita"
(map), "Ben" (anchor — children: Rozetler, Lig, Görevler, Bahçe, İstatistik). Active item: sunken pill
with navy left indicator. Bottom of sidebar: theme toggle (sun/moon "Güverte / Gece Vardiyası"),
Ayarlar link, and a profile chip (avatar + "Elif" + Rütbe 7 in brass).

FIRST SCREEN — "Bugün" (home), light theme, evening scenario (21:00). Content area: max-width 1120px,
full-width greeting header then TWO COLUMNS (left ~2/3, right ~1/3, 24px gap):
- Greeting header (no card): captain avatar 40px + "İyi akşamlar, Elif." + microcopy "Gece vardiyası.
  Matematikte 2 blok kaldı." Right side: streak chip 🔥 12 (ember glow) + coin chip (gold) + a small
  "Deneme geri sayımı: 4 gün" pill.
- LEFT COLUMN: (1) "Bugünün Rotası" card — vertical mini-route with nodes and connecting line, 3 blocks:
  first stamped complete, second pulsing active (subject chip "Matematik", "Türev — Zincir Kuralı",
  teal badge "tekrar", "8 soru", difficulty dots, big tactile "Devam Et" button), third dimmed "yeni"
  navy badge; header link "Rotayı Gör →". (2) Daily quest strip: 3 capsule cards side by side with
  progress bars, one completed with gold "Ödülü Al" button. (3) Collapsed "Seyir Defteri'nden" card
  (captain's logbook, subtle paper texture): "Geçen seferden notlarım var."
- RIGHT COLUMN: (1) Nudge card, captain-voiced with avatar and speech-bubble feel, urgent ember border:
  "Fener sönmesin — 1 blok yeter." CTA "5 dakikalık tekrar". (2) League card: "Gümüş Lig · 4. sıra ·
  3 gün kaldı", mini top-5 list with brass promotion line. (3) Teal SRS chip card: "🌊 12 kart seni
  bekliyor · ~6 dk" with "Başla" ghost button. (4) Small garden shortcut card with a tiny isometric
  garden preview + coin balance.
Show realistic Turkish student data throughout.
```

---

## KOMUT 1 — Kaptan sohbeti (desktop, iki kolonlu)

```
Same design system. Design the "Kaptan" chat screen on desktop (sidebar stays). Content area splits
into: a 280px SESSION HISTORY column (hairline right border) + the conversation pane.
- History column: "Yeni Sohbet" tactile button on top, then session list items (title auto-generated
  from first message, date, active item highlighted): "Türev çalışma planı", "Deneme analizi",
  "Moral konuşması".
- Conversation pane: centered message column max-width 720px. User bubbles solid navy right-aligned;
  Kaptan bubbles as warm cards with hairline border and small avatar, left-aligned. Kaptan's latest
  message is mid-stream with a soft blinking ink-cursor.
- Inside Kaptan's message: one shimmering inline TOOL CHIP "🗒️ Kaptan defterine bakıyor…" and one
  finished compact pill "⚙️ Sorular hazırlandı ✓".
- Below the message, a PRACTICE INVITE CARD: "Türev — 5 soru hazır · orta seviye" with tactile navy
  "Çöz" button and subtle brass corner detail.
- A floating status pill above the composer: "🧭 Rota güncelleniyor…".
- Composer pinned to the bottom of the pane: multiline input "Kaptan'a yaz…" with send button; above
  it quick-action chips: "Bugünkü planım", "Zayıf konumdan 5 soru", "Dünü özetle", "Moralim bozuk".
- Top-right of pane: a subtle keyboard hint "⏎ gönder · ⇧⏎ yeni satır".
```

---

## KOMUT 2 — Soru çözme yüzeyi `/coz` (desktop tam ekran + ödül anı)

```
Same design system. Design the fullscreen question-solving surface on desktop — NO sidebar (focus
mode), DARK "Gece Vardiyası" theme. Centered content column max-width 760px on the night-sea background.
- Slim top bar: X close (left), thin progress bar with "4/10" (center), source identity (right).
- THE QUESTION IS AN OFFICIAL PAST EXAM QUESTION: prominent BRASS SEAL badge "ÖSYM · ÇIKMIŞ SORU" +
  label "2023 AYT" at the top of the card — hard product rule, never hidden.
- Question card: math question text with a rendered-looking formula, then 5 answer choices A-E as
  large tactile choice buttons (min 56px) with letter medallions. Choice C selected (navy highlight).
- Bottom action bar full-width (Duolingo-web style): left side keyboard hint "A–E ile seç · ⏎ kontrol",
  right side big tactile "Kontrol Et" button.
- SECOND FRAME — feedback state: C flips warm coral (wrong), B glows green. The bottom bar expands
  into a full-width coral-tinted FEEDBACK PANEL containing: solution text (left, max 60%), and on the
  right a MISCONCEPTION CARD with anchor icon: "⚓ Kavram Yanılgısı — Zincir kuralında iç fonksiyonun
  türevini unutuyorsun." + footnote "Kaptan bunu haritana işledi". Actions row: "Benzer Soru"
  (secondary), "Kaptan'a Sor" (ghost), "Devam" (primary tactile).
- THIRD FRAME — correct-answer reward: green-tinted bottom bar, gold XP chip counting "+12 XP",
  queued toast top-right "✓ Görev tamam: 10 soru çöz".
```

---

## KOMUT 3 — Rota (desktop, yatay seyir haritası)

```
Same design system. Design the "Rota" weekly plan screen on desktop (sidebar stays), light theme.
- Header row: "Rota" title + week range "13-19 Temmuz" + progress ring "12/18 blok" + ghost button
  "Rotamı Güncelle" (right).
- HORIZONTAL nautical route across the top of the content: a dotted path flowing left→right through
  7 day nodes (Pzt…Paz). Past 2 days stamped with ink-stamp effect, today larger with pulsing brass
  ring, future dimmed. Under each node: tiny block-count dots.
- Below, TWO COLUMNS: LEFT (wide) — today's expanded day card listing 3 route blocks, each row =
  subject color chip, title, type badge (one "yeni" navy, one "srs" teal wave, one "telafi" amber),
  question count, difficulty dots, and a "Başla" tactile button on the active block. RIGHT (narrow) —
  "Taktik Notları" card in the captain's voice ("Bu hafta geometriye yüklenelim. Cuma günü deneme
  var — perşembe hafif geçiyoruz.") with a small compass illustration, plus a mini legend card
  explaining block types (yeni / tekrar / srs / telafi).
- Clicking a future day (show as hover state on Perşembe): a popover card previewing that day's blocks.
```

---

## KOMUT 4 — ÖSYM Arşivi (desktop)

```
Same design system. Design the "ÖSYM Arşivi" screen on desktop (sidebar stays), light theme — an
archive of real past exam questions with an official/prestige identity (captain's document chest).
- Header band with a brass seal illustration: "ÖSYM Arşivi — Gerçek çıkmış sorular" + short subtitle.
- Filter row: subject chips (Matematik, Fizik, Kimya, Biyoloji, Türkçe…) each in its subject color,
  plus a year dropdown and an exam-type segmented control (TYT / AYT).
- YEAR GRID: 4-column cards "2024 TYT · 120 soru", "2023 AYT · 80 soru"… with large brass year
  numerals and a subtle document texture.
- Below, question preview list (single column, wide cards): each with the "ÖSYM · ÇIKMIŞ SORU" brass
  badge + exam label, first line of the question, subject chip, difficulty dots, and a tactile "Çöz"
  button on the right. Cards carry a subtle brass LEFT BORDER — AI-generated practice content
  elsewhere NEVER gets this treatment.
```

---

## KOMUT 5 — Harita (desktop, iki panel)

```
Same design system. Design the "Harita" mastery map screen on desktop (sidebar stays), light theme,
as a TWO-PANE master-detail layout.
- LEFT PANE (320px): subject tabs on top (subject colors), then a unit tree list — each unit row has
  a small MASTERY GAUGE (0-100 navy fill, faded/desaturated when knowledge is decaying) + unit name +
  kazanım count. "Türev" unit selected/highlighted.
- RIGHT PANE: selected unit detail — header with big mastery gauge (68) and trend arrow, then kazanım
  rows with gauges: one at 85 (strong), one at 40 with an ember "zayıf" dot and a "Bu konudan çalış"
  tactile button, one faded with "unutuluyor" hint and teal "Tazele" button.
- Below the detail: "Kavram Yanılgıları" section with two MISCONCEPTION CARDS side by side, anchor
  icons — one OPEN (amber border): "Zincir kuralında iç türev unutuluyor" + "Telafi setini çöz"
  button; one RESOLVED (teal, celebratory, untied-knot icon): "Limitte belirsizlik — Çözüldü ✓".
```

---

## KOMUT 6 — Ben (desktop) + Fener anı

```
Same design system. Two frames:
FRAME 1 — "Ben" profile hub on desktop (sidebar stays), light theme: a header band with large LEVEL
RING in brass around the avatar ("Rütbe 7"), XP progress bar with gold fill and tabular numerals
"2.340 / 3.000 XP", and the streak calendar heatmap (ember cells, 12-day run highlighted) stretching
across the band. Below: a 3-column grid of cards — Rozetler (badge grid preview, some locked), Lig
(silver tier gem + mini top-5 with brass promotion line), Görevler (3 quests, one claimable gold
button), Bahçe (isometric mini preview + coins), İstatistik (small line chart of weekly net),
Ayarlar shortcut.
FRAME 2 — "FENER" streak milestone celebration as a centered LARGE MODAL (720px) over a dimmed
night-sea backdrop: lantern flame with warm glow, big brass medallion stamped "7", copy: "7 gün.
Fener hiç sönmedi.", small ice-blue chip "Bir fener koruması kazandın ❄", tactile "Devam" button.
Confetti in brand colors only (navy, gold, ember, ivory). Premium and emotional, not childish.
```

---

## İpuçları

- İterasyonda sistem token'larını değiştirmesine izin verme; ekran bazlı düzeltme iste ("tighten the
  right column", "make the year cards smaller" gibi).
- Her ekran için koyu varyant: **"Now show the dark 'Gece Vardiyası' variant."**
- `/coz` desktop'ta da sidebar'sız tam ekrandır — KOMUT 2'de bilerek yok.
- Mobil setle aynı projede çalışıyorsan bileşenler (QuestionCard, NudgeCard, ToolChip…) zaten üretilmiş
  olur; bu komutlar onları yeniden çizdirmek yerine yerleşimi uyarlatır — daha tutarlı sonuç verir.
- Export → React + Tailwind; renkler `--color-ink / --color-action / --color-brass / --color-ember`
  gibi `@theme` değişkenlerimize map edilip `frontend/src/styles/index.css`'e taşınacak.
