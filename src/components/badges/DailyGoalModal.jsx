import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import Modal from '../ui/Modal';
import { FormField, Select } from '../ui/FormField';
import { useToast } from '../ToastProvider';

const GOAL_OPTIONS = [5, 10, 20, 30, 50];

// Günlük soru hedefini users/{uid}.dailyGoal alanına yazar.
export default function DailyGoalModal({ isOpen, onClose, currentGoal = 20 }) {
  const { success, error } = useToast();
  const [goal, setGoal] = useState(String(currentGoal));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setGoal(String(currentGoal));
  }, [isOpen, currentGoal]);

  const handleSave = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', uid), { dailyGoal: Number(goal) });
      success('Hedef Güncellendi', `Günlük hedefin ${goal} soru olarak ayarlandı.`);
      onClose();
    } catch (err) {
      console.error('Günlük hedef kaydedilemedi:', err);
      error('Hata', 'Hedef kaydedilirken bir sorun oluştu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title="Günlük Hedefini Belirle"
      footer={
        <>
          <button type="button" className="ds-btn-ghost" onClick={onClose}>Vazgeç</button>
          <button type="button" className="ds-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-400 mb-3">Her gün kaç soru çözmeyi hedefliyorsun?</p>
      <FormField label="Günlük Soru Hedefi">
        <Select value={goal} onChange={e => setGoal(e.target.value)}>
          {GOAL_OPTIONS.map(g => <option key={g} value={g}>{g} soru</option>)}
        </Select>
      </FormField>
    </Modal>
  );
}
