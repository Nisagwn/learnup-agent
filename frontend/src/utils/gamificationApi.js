// Oyunlaştırma Edge Functions istemci sarmalı.
// record-answer / ensure-daily-state / claim-quest-reward fonksiyonlarını çağırır.
// supabase.functions.invoke kullanıcının JWT'sini otomatik ekler — manuel token yok.
import { supabase } from '../supabase';

async function invokeFn(fn, body = {}) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message || 'İstek başarısız');
  return data;
}

/** Bir cevabı kaydeder; XP/seri/görev/lig/rozet delta'sını döndürür. */
export const recordAnswer = (answer) => invokeFn('record-answer', answer);

/** Açılışta günlük görev + lig kaydını hazırlar; güncel gamification durumunu döndürür. */
export const ensureDailyState = () => invokeFn('ensure-daily-state', {});

/** Tamamlanmış bir günlük görevin ödülünü talep eder. */
export const claimQuestReward = (questId) => invokeFn('claim-quest-reward', { questId });

/**
 * Bugün için bir seri dondurması (freeze) harcar; güncel streak durumunu döndürür.
 * Backend fonksiyon adı 'use-streak-freeze'; client adı `use*` React-hooks lint'ini
 * tetiklemesin diye `requestStreakFreeze`.
 */
export const requestStreakFreeze = () => invokeFn('use-streak-freeze', {});
