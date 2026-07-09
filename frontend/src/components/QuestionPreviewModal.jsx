import React, { useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import Modal from './ui/Modal';
import MathMarkdown from './MathMarkdown';
import Spinner from './ui/Spinner';
import { formatDate } from '../utils/formatDate';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// Tek bir yanlış sorunun büyütülmüş önizlemesi.
// İçerik önceliği: questions/{id} (detail) > SRS snapshot. İkisi de yoksa nazik mesaj.
export default function QuestionPreviewModal({
  isOpen,
  onClose,
  log,
  detail,
  snapshot,
  loadingDetail = false,
  wrongCount = 0,
  onRetryQuestion,
}) {
  const view = useMemo(() => {
    const text = detail?.text || snapshot?.question || '';
    const options = detail?.options?.length ? detail.options : (snapshot?.choices || []);
    const correctAnswer = detail?.correctAnswer ?? snapshot?.answer ?? null;
    const explanation = detail?.explanation || '';
    return { text, options, correctAnswer, explanation };
  }, [detail, snapshot]);

  const subject = log?.subject || detail?.subject || 'Genel';
  const topic = detail?.topic || log?.sub_topic || null;
  const difficulty = detail?.difficulty || log?.difficulty || null;
  const hasContent = !!view.text || view.options.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="Soru Önizleme"
      footer={
        <>
          <button type="button" className="ds-btn-ghost" onClick={onClose}>Kapat</button>
          <button
            type="button"
            className="ds-btn-primary flex items-center gap-1.5"
            onClick={onRetryQuestion}
          >
            <RotateCcw size={16} /> Bu Soruyu Tekrar Çöz
          </button>
        </>
      }
    >
      {/* Metadata rozetleri */}
      <div className="flex items-center gap-2 mb-4 text-xs flex-wrap">
        <span className="px-2 py-0.5 bg-indigo-500/15 text-indigo-300 rounded">{subject}</span>
        {topic && <span className="px-2 py-0.5 bg-white/5 text-slate-300 rounded">{topic}</span>}
        {difficulty && <span className="text-slate-400">{({ easy: 'Kolay', medium: 'Orta', hard: 'Zor' }[difficulty]) || difficulty}</span>}
        {log?.timestamp && <span className="text-slate-500">· {formatDate(log.timestamp)}</span>}
        {wrongCount > 1 && (
          <span className="px-2 py-0.5 bg-red-500/15 text-red-300 rounded font-semibold">
            {wrongCount} kez yanlış
          </span>
        )}
      </div>

      {loadingDetail && !hasContent ? (
        <Spinner size="md" label="Soru yükleniyor" />
      ) : !hasContent ? (
        <div className="text-sm text-slate-400 py-4">
          Bu soru içeriği artık mevcut değil. Yine de tekrar çözmeyi deneyebilirsin.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="text-base text-slate-100 font-medium">
            <MathMarkdown>{view.text || 'Soru metni kayıtlı değil.'}</MathMarkdown>
          </div>

          {view.options.length > 0 && (
            <ul className="flex flex-col gap-2">
              {view.options.map((o, i) => {
                const correct = view.correctAnswer != null && o === view.correctAnswer;
                return (
                  <li
                    key={i}
                    className={`flex gap-2 items-start p-2.5 rounded-lg border text-sm ${
                      correct
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-semibold'
                        : 'border-white/8 bg-white/5 text-slate-300'
                    }`}
                  >
                    <span className="font-mono font-bold flex-shrink-0">{LETTERS[i] || i + 1}</span>
                    <MathMarkdown inline>{String(o)}</MathMarkdown>
                    {correct && <span className="ml-auto flex-shrink-0">✓</span>}
                  </li>
                );
              })}
            </ul>
          )}

          {loadingDetail ? (
            <Spinner size="sm" label="Çözüm yükleniyor" />
          ) : view.explanation ? (
            <div className="p-3 bg-indigo-500/8 border border-indigo-500/20 rounded-xl text-sm text-slate-200">
              <div className="font-semibold text-indigo-300 mb-1">Çözüm</div>
              <MathMarkdown>{view.explanation}</MathMarkdown>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
