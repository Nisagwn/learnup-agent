# MagicPatterns Komut Seti — "Kaptan Köşkü" Tasarımı

Kullanım: MagicPatterns'te YENİ proje aç → önce **KOMUT 0**'ı yapıştır (tasarım sistemi + kabuk + ana ekran).
Sonra AYNI proje sohbetinde ekran komutlarını (1-6) **teker teker** gönder — bağlam korunur, her ekran aynı
tasarım sistemiyle üretilir. Her ekrandan memnun kalınca "Now show the dark 'Gece Vardiyası' variant of this
screen" yaz. Çıktıyı React + Tailwind olarak export et (token'lar Tailwind v4 @theme yapımıza birebir oturur).

---

## KOMUT 0 — Tasarım sistemi + uygulama kabuğu + ana ekran

```
Design a mobile-first web app for "LearnUp" — a Turkish university-entrance-exam (YKS) prep platform
for high-school students. The product's face is KAPTAN, a warm, seasoned AI coach with a ship-captain
identity. The whole visual language follows a premium nautical "journey" metaphor: the weekly study
plan is a ROTA (route), streak is a FENER (lantern flame), levels are RÜTBE (naval ranks). Audience is
16-18 year olds studying at night on their phones — warm and encouraging, Duolingo-level energy, but
premium and grown-up, NOT childish. All UI copy must be in TURKISH.

DESIGN TOKENS (follow exactly):
- Light theme "Güverte" (deck): background #F8F5EE warm ivory, sunken areas #EFE8DB sand, cards #FFFFFF,
  hairline borders rgba(26,43,69,0.12). Text: primary #1A2B45 ink navy, secondary #4A5A72, muted #7D8899.
- Dark theme "Gece Vardiyası" (night watch — FIRST-CLASS, not an afterthought): background #0A1524 night
  sea, sunken #060E19, cards #13233A, raised #1A2E4A, hairline rgba(148,178,216,0.14). Text: primary
  #F0EBDF warm ivory, secondary #AEB9C9.
- Primary action: deep navy #183659 (light) / #4C82C3 (dark). Buttons are TACTILE 3D: 16px radius,
  solid fill with a 4px darker bottom edge (#0C1B2E light / #21486F dark), press = translateY(3px).
- Accents: correct green #27935F, wrong = WARM CORAL #DE5B49 (never cold red), streak ember #F4702E
  with soft glow, XP gold #F0B429, BRASS #B98A44 for prestige elements (official exam seal, rank ring,
  league promotion), SRS/review teal #2E7F8F.
- Typography: "Outfit" for headings/numbers/buttons (600-800, tabular numerals), "Inter" for body.
  Sizes: 15px body, 17px question text, 20 title, 24 heading, 30 display.
- Radii 10/14/20/28, spacing on a 4px grid, touch targets ≥48px. Shadows soft and navy-tinted in light;
  in dark use surface layering + hairlines instead of shadows, glow only on rewards.

APP SHELL (mobile): bottom tab bar with 5 tabs — "Bugün" (home), "Rota" (compass), CENTER TAB "KAPTAN"
(circular, slightly raised above the bar, shows the captain avatar, brass notification dot), "Pratik"
(target), "Ben" (anchor). Desktop: 240px left sidebar with the same groups.

FIRST SCREEN — "Bugün" (home), light theme, mobile 390px wide, evening scenario (21:00):
1. Greeting header (no card): small captain avatar + "İyi akşamlar, Elif." + contextual microcopy
   "Gece vardiyası. Matematikte 2 blok kaldı." Right side: streak chip 🔥 12 (ember) + coin chip (gold).
2. One nudge card, captain-voiced with avatar and speech-bubble feel, urgent ember border variant:
   "Fener sönmesin — 1 blok yeter." with tactile CTA "5 dakikalık tekrar".
3. "Bugünün Rotası" card: vertical mini-route with nodes and connecting line — 3 blocks; first node
   stamped complete, second node pulsing active with block row (subject color chip "Matematik",
   title "Türev — Zincir Kuralı", type badge "tekrar" in teal, "8 soru", difficulty dots) and a big
   tactile "Devam Et" button; third block dimmed upcoming with badge "yeni" in navy. Header link "Rotayı Gör →".
4. Daily quest strip: 3 horizontal capsule cards with progress bars, one completed showing a gold
   "Ödülü Al" button.
5. Small teal chip row: "🌊 12 kart seni bekliyor · ~6 dk" (spaced-repetition due).
6. Collapsed "Seyir Defteri'nden" card (captain's logbook, subtle paper texture): "Geçen seferden notlarım var."
7. League mini-card: "Gümüş Lig · 4. sıra · 3 gün kaldı" with brass accent near promotion line.
Show realistic Turkish student data throughout.
```

---

## KOMUT 1 — Kaptan sohbeti (hero ekran)

```
Same design system. Design the "Kaptan" chat screen (mobile, light theme) — the hero feature: a
streaming AI coach chat.
- Top bar: captain avatar + "Kaptan" + subtitle "seninle", history icon, "Yeni Sohbet" icon.
- Messages: user bubbles solid navy right-aligned; Kaptan bubbles as warm cards with hairline border,
  left-aligned with small avatar. Kaptan's latest message is mid-stream: show a soft blinking ink-cursor
  at the end of the text.
- Inside Kaptan's message, show an inline TOOL CHIP that appeared while he works: a small pill with
  shimmer animation "🗒️ Kaptan defterine bakıyor…" and a second finished pill, compact with a checkmark
  "⚙️ Sorular hazırlandı ✓".
- Below that message, a PRACTICE INVITE CARD: "Türev — 5 soru hazır · orta seviye" with tactile navy
  "Çöz" button and subtle brass corner detail.
- A persistent status pill floating above the composer: "🧭 Rota güncelleniyor…" (plan update in progress).
- Composer: multiline input "Kaptan'a yaz…", above it a row of quick-action chips: "Bugünkü planım",
  "Zayıf konumdan 5 soru", "Dünü özetle", "Moralim bozuk".
- Keyboard-open state: tab bar hidden.
```

---

## KOMUT 2 — Soru çözme yüzeyi `/coz` (+ ödül anı)

```
Same design system. Design the fullscreen question-solving surface (mobile, DARK "Gece Vardiyası"
theme this time — students solve questions at night).
- Top bar: X close, thin progress bar (question 4/10), source identity on the right.
- THE QUESTION IS AN OFFICIAL PAST EXAM QUESTION: show a prominent BRASS SEAL badge "ÖSYM · ÇIKMIŞ SORU"
  plus label "2023 AYT" at the top of the card — this badge is a hard product rule, never hidden.
- Question card: math question text (include a rendered-looking formula), then 5 answer choices A-E as
  large tactile choice buttons (min 56px tall) with letter medallions on the left. Choice C is selected
  (navy highlight). Bottom bar: big tactile "Kontrol Et" button.
- SECOND FRAME of the same screen — the answer feedback state: chosen answer C flips to warm coral
  (wrong), correct answer B glows green. A feedback panel slides up from the bottom containing:
  the solution text, then a MISCONCEPTION CARD with anchor icon: "⚓ Kavram Yanılgısı — Zincir kuralında
  iç fonksiyonun türevini unutuyorsun." and footnote "Kaptan bunu haritana işledi", then three actions:
  "Benzer Soru" (secondary), "Kaptan'a Sor" (ghost), "Devam" (primary tactile).
- THIRD FRAME — reward moment after a correct answer: small XP chip counting up "+12 XP" in gold near
  the choice, and a queued toast "✓ Görev tamam: 10 soru çöz".
```

---

## KOMUT 3 — Rota (haftalık plan)

```
Same design system. Design the "Rota" weekly plan screen (mobile, light theme): a 7-day route map
drawn as a nautical dotted path winding down the screen with day nodes.
- Past 2 days: nodes stamped with an ink stamp effect. Today: larger pulsing node with brass ring.
  Future days: dimmed nodes.
- Today's node expands into a card list: 3 route blocks, each row = subject color chip, title, type
  badge (one "yeni" navy, one "srs" teal wave icon, one "telafi" amber), question count, difficulty dots.
- A "Taktik Notları" card from the captain at the top: short bullet list in his voice ("Bu hafta
  geometriye yüklenelim. Cuma günü deneme var — perşembe hafif geçiyoruz.").
- Header: week range "13-19 Temmuz", a progress ring "12/18 blok", and a ghost button "Rotamı Güncelle".
- Bottom sheet variant (second frame): tapping a future day opens a sheet listing that day's blocks.
```

---

## KOMUT 4 — ÖSYM Arşivi

```
Same design system. Design the "ÖSYM Arşivi" screen (mobile, light theme) — an archive of real past
exam questions, identity built on the BRASS seal (official/prestige feel, like a captain's document chest).
- Header with brass seal illustration: "ÖSYM Arşivi — Gerçek çıkmış sorular".
- Subject filter chips row (Matematik, Fizik, Kimya, Biyoloji, Türkçe…), each with its subject color.
- Year grid: cards per exam year "2024 TYT · 120 soru", "2023 AYT · 80 soru" with brass year numerals.
- Below, a preview list of question cards: each with the "ÖSYM · ÇIKMIŞ SORU" brass badge + exam label,
  first line of the question, subject chip, and a tactile "Çöz" button.
- Emphasize the visual separation: these cards have a subtle brass left border — AI-generated practice
  content elsewhere in the app NEVER gets this treatment.
```

---

## KOMUT 5 — Harita (ustalık haritası)

```
Same design system. Design the "Harita" mastery map screen (mobile, light theme).
- Top: segmented subject tabs with subject colors.
- Per-unit accordion list: each unit row has a MASTERY GAUGE (0-100 fill, navy fill, faded/desaturated
  when knowledge is decaying) + unit name + kazanım count. One unit expanded showing kazanım rows with
  small gauges: one at 85 (strong), one at 40 with a small ember "zayıf" dot, one faded "unutuluyor".
- A separate section "Kavram Yanılgıları": two MISCONCEPTION CARDS with anchor icons — one OPEN (amber
  border): "Zincir kuralında iç türev unutuluyor" + "Telafi setini çöz" button; one RESOLVED (teal,
  celebratory, with an untied-knot icon): "Limitte belirsizlik — Çözüldü ✓".
- CTA on each weak kazanım row: small "Bu konudan çalış" tactile button.
```

---

## KOMUT 6 — Ben (profil) + Fener anı

```
Same design system. Two frames:
FRAME 1 — "Ben" profile hub (mobile, light theme): large LEVEL RING in brass around the avatar
("Rütbe 7"), XP progress with gold fill and tabular numerals "2.340 / 3.000 XP", streak calendar
heatmap (ember-colored cells, current 12-day run highlighted), quick-link cards: Rozetler, Lig,
Görevler, Bahçe, İstatistik — each with small preview stats. League card shows silver tier gem.
FRAME 2 — "FENER" streak milestone celebration modal (dark night-sea background, fullscreen):
a lantern flame with warm glow, big brass medallion being stamped "7", copy: "7 gün. Fener hiç
sönmedi." below: small ice-blue chip "Bir fener koruması kazandın ❄" and a tactile "Devam" button.
Confetti in brand colors only (navy, gold, ember, ivory). Premium, emotional, not childish.
```

---

## İpuçları

- Her komuttan sonra beğenmediğin noktayı Türkçe/İngilizce iterasyonla düzelt ("make the nudge card
  smaller", "warmer ivory background" gibi) — sistem token'larını değiştirmesine izin verme.
- Ekran başına dark varyantı almayı unutma: **"Now show the dark 'Gece Vardiyası' variant."**
- Export → React + Tailwind seç; renkleri bizim `@theme` değişken adlarına (`--color-ink`,
  `--color-action`, `--color-brass`…) map ederek `frontend/src/styles/index.css`'e taşıyacağız.
- Masaüstü uyarlaması gerekirse: "Adapt this screen to desktop with a 240px left sidebar instead of
  the bottom tab bar."
