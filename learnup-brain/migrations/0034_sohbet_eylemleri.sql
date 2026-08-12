-- =============================================================================
-- 0034 — SOHBET EYLEMLERİ (Kaptan'ın mesajına iliştirilen butonlar)
--
-- Ön koşul: 0001 (chat_messages). Idempotent.
--
-- ═══ NEDEN ═══
-- Kaptan bir şey ÖNERDİĞİNDE bunu düz yazıyla soruyordu: "Tekrar destesinden 5 soru
-- atayım mı? Ne dersin?" Öğrencinin tek yanıt yolu "evet" yazmaktı; sonra Kaptan
-- soruları üretiyor ve onları da METİN olarak anlatıyordu. Yani sistem elinde YAPISAL
-- veri (kazanım, zorluk, adet) varken onu düzyazıya çevirip öğrenciden geri parse
-- etmesini bekliyordu. İki sonucu vardı:
--   · Öneriden eyleme geçmek 2 tur sohbet + bir de ekran arama demekti,
--   · "Planını güncelledim, haber vereceğim" sözü TUTULAMIYORDU — haber verecek kanal yoktu.
--
-- Artık öneri yapısal geliyor (agents/tools.ts `eylem_oner`) ve arayüzde butona dönüşüyor.
--
-- ═══ NEDEN AYRI KOLON, METİNDEN PARSE DEĞİL ═══
-- Alternatif "asistan metninde 'Tekrar destesi' geçiyorsa buton bas" idi. Bu, LLM çıktısının
-- kelime seçimine bağlı bir arayüz demektir: model bir gün "aralıklı tekrar" derse buton
-- kaybolur, hata da vermez. Buton, modelin ÇAĞIRDIĞI ARACIN sonucudur — metnin değil.
--
-- ═══ NEDEN KALICI (jsonb kolon), SADECE CANLI AKIŞTA DEĞİL ═══
-- SSE olayı yalnız o an bağlı olan istemciye ulaşır. Öğrenci sayfayı yenilerse ya da
-- ertesi gün dönerse balon metni duruyor ama butonu gitmiş olurdu: "5 soru atayım mı?"
-- yazan, tıklanacak hiçbir şeyi olmayan bir mesaj. GET /chat/history bu kolonu da
-- döndürür → butonlar mesajla birlikte yaşar.
--
-- ═══ ŞEKİL ═══
-- eylemler = EylemTarifi[] (bkz. frontend-v2/src/lib/types.ts · EylemTarifi)
--   [{ "tur": "coz", "etiket": "5 soruyu çöz", "kaynak": "ai",
--      "kazanimId": 412, "difficulty": "orta", "baslik": "Türev · orta" }]
--   [{ "tur": "plan_bekle", "etiket": "Plan hazırlanıyor…", "taskId": "uuid" }]
-- Şema DB'de zorlanmaz (jsonb): tur listesi ürünle birlikte büyür ve her yeni buton
-- türü için migration yazmak, arayüz denemesini gereksizce yavaşlatırdı. Doğrulama
-- yazarken (tools.ts) ve okurken (Kaptan.tsx) yapılır; bilinmeyen `tur` sessizce atlanır.
-- =============================================================================

alter table if exists public.chat_messages
  add column if not exists eylemler jsonb;

-- ⚠️ İNDEKS YOK — bilerek. Bu kolon hiçbir zaman FİLTRE değildir: sorgular her zaman
-- (user_id, session_id) ile gelir ve eylemler yalnız SELECT listesinde taşınır.
-- jsonb üstüne GIN indeksi yazmak, hiç kullanılmayacak bir indeksin yazma maliyetini
-- her sohbet mesajına ödetmek olurdu.

comment on column public.chat_messages.eylemler is
  'Kaptan mesajına iliştirilen eylem butonları (EylemTarifi[]). NULL = buton yok. '
  'Yalnız role=assistant satırlarında anlamlıdır; metinden türetilmez, eylem_oner aracının çıktısıdır.';
