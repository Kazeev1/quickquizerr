import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Plus, Trash2, Save, CheckCircle, X, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../api/client';
import type { Test, Question, PendingQuestion } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';

export default function EditTest() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [pending, setPending] = useState<PendingQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);
  const [meta, setMeta] = useState({ title: '', university: '', access_type: 'public', question_type: 'single' });
  const [tokenUsage, setTokenUsage] = useState<{ has_logs: boolean; prompt_tokens: number; completion_tokens: number; total_tokens: number; cost_usd: number; cost_kzt: number } | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const [testRes, pendRes, tokenRes] = await Promise.allSettled([
          api.get(`/tests/${id}`),
          api.get(`/tests/${id}/pending`),
          api.get(`/tests/${id}/token-usage`),
        ]);
        if (testRes.status === 'fulfilled') {
          const { data } = testRes.value;
          if (data.test.author_id !== user?.id && user?.role !== 'admin') {
            navigate(`/tests/${id}`);
            return;
          }
          setTest(data.test);
          setMeta({
            title: data.test.title,
            university: data.test.university,
            access_type: data.test.access_type,
            question_type: data.test.question_type,
          });
          setQuestions(data.questions);
        }
        if (pendRes.status === 'fulfilled') {
          setPending(pendRes.value.data.pending);
        }
        if (tokenRes.status === 'fulfilled' && tokenRes.value.data.has_logs) {
          setTokenUsage(tokenRes.value.data);
        }
      } catch {
        setError('Не удалось загрузить тест');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [id, user, navigate]);

  const saveMeta = async () => {
    setSavingMeta(true);
    try {
      await api.put(`/tests/${id}`, meta);
      setTest((t) => t ? { ...t, ...meta } as Test : t);
    } catch {/* ignore */} finally {
      setSavingMeta(false);
    }
  };

  const deleteQuestion = async (qId: number) => {
    try {
      await api.delete(`/tests/${id}/questions/${qId}`);
      setQuestions((qs) => qs.filter((q) => q.id !== qId));
    } catch {/* ignore */}
  };

  const saveQuestion = async (q: Question) => {
    try {
      await api.put(`/tests/${id}/questions/${q.id}`, {
        text: q.text,
        options: q.options,
        correct_answers: q.correct_answers,
      });
    } catch {/* ignore */}
  };

  const addQuestion = async () => {
    try {
      const { data } = await api.post(`/tests/${id}/questions`, {
        text: 'Новый вопрос',
        options: ['Вариант А', 'Вариант Б', 'Вариант В', 'Вариант Г'],
        correct_answers: [0],
      });
      setQuestions((qs) => [
        ...qs,
        { id: data.id, test_id: Number(id), text: 'Новый вопрос', options: ['Вариант А', 'Вариант Б', 'Вариант В', 'Вариант Г'], correct_answers: [0], order_num: qs.length },
      ]);
    } catch {/* ignore */}
  };

  const resolvePending = async (pq: PendingQuestion, correctAnswers: number[]) => {
    await api.post(`/tests/${id}/pending/${pq.id}`, { correct_answers: correctAnswers });
    setPending((p) => p.filter((x) => x.id !== pq.id));
    const { data } = await api.get(`/tests/${id}`);
    setQuestions(data.questions);
  };

  const skipPending = async (pqId: number) => {
    await api.delete(`/tests/${id}/pending/${pqId}`);
    setPending((p) => p.filter((x) => x.id !== pqId));
  };

  if (loading) return <LoadingSpinner label="Загрузка..." />;
  if (error || !test) return <div className="max-w-xl mx-auto px-4 py-16 text-center"><p className="text-red-600">{error}</p></div>;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Редактирование теста</h1>
        <Link to={`/tests/${id}`} className="btn-secondary btn-sm">← К тесту</Link>
      </div>

      {/* Meta */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold mb-4">Параметры теста</h2>
        <div className="space-y-3">
          <input className="input" placeholder="Название" value={meta.title} onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))} />
          <input className="input" placeholder="Университет" value={meta.university} onChange={(e) => setMeta((m) => ({ ...m, university: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <select className="input" value={meta.access_type} onChange={(e) => setMeta((m) => ({ ...m, access_type: e.target.value }))}>
              <option value="public">Публичный</option>
              <option value="private">Приватный</option>
            </select>
            <select className="input" value={meta.question_type} onChange={(e) => setMeta((m) => ({ ...m, question_type: e.target.value }))}>
              <option value="single">Один ответ</option>
              <option value="multiple">Несколько ответов</option>
            </select>
          </div>
          <button onClick={saveMeta} disabled={savingMeta} className="btn-primary btn-sm">
            <Save size={14} />
            {savingMeta ? 'Сохранение...' : 'Сохранить параметры'}
          </button>
        </div>
      </div>

      {/* Pending questions */}
      {pending.length > 0 && (
        <div className="card p-5 mb-6 border-amber-200 bg-amber-50">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle size={18} className="text-amber-600" />
            <h2 className="font-semibold text-amber-800">Вопросы для проверки ({pending.length})</h2>
          </div>
          <p className="text-sm text-amber-700 mb-4">ИИ не смог с уверенностью определить правильные ответы. Выберите их вручную.</p>
          <div className="space-y-4">
            {pending.map((pq) => (
              <PendingQuestionReview key={pq.id} pq={pq} questionType={meta.question_type} onResolve={resolvePending} onSkip={skipPending} />
            ))}
          </div>
        </div>
      )}

      {/* Token usage */}
      {tokenUsage && (
        <div className="card p-5 mb-6 border-violet-200 bg-violet-50">
          <h2 className="font-semibold text-violet-800 mb-3">Использование ИИ (gpt-4.1-nano)</h2>
          {tokenUsage.total_tokens > 0 ? (
            <>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-white rounded-lg p-3 text-center border border-violet-100">
                  <p className="text-xs text-gray-500 mb-1">Входящие токены</p>
                  <p className="font-bold text-gray-800">{tokenUsage.prompt_tokens.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-lg p-3 text-center border border-violet-100">
                  <p className="text-xs text-gray-500 mb-1">Исходящие токены</p>
                  <p className="font-bold text-gray-800">{tokenUsage.completion_tokens.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-lg p-3 text-center border border-violet-100">
                  <p className="text-xs text-gray-500 mb-1">Всего токенов</p>
                  <p className="font-bold text-violet-700">{tokenUsage.total_tokens.toLocaleString()}</p>
                </div>
              </div>
              <div className="bg-white rounded-lg px-4 py-2 border border-violet-100 text-sm inline-flex gap-1">
                <span className="text-gray-500">Стоимость:</span>
                <span className="font-semibold text-gray-800">${tokenUsage.cost_usd.toFixed(6)}</span>
                <span className="text-gray-400">·</span>
                <span className="font-semibold text-gray-800">{tokenUsage.cost_kzt.toFixed(4)} ₸</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-violet-600">Тест был загружен до добавления трекинга токенов — данные недоступны для старых тестов.</p>
          )}
        </div>
      )}

      {/* Questions */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">Вопросы ({questions.length})</h2>
        <button onClick={addQuestion} className="btn-primary btn-sm">
          <Plus size={14} />
          Добавить вопрос
        </button>
      </div>

      <div className="space-y-3">
        {questions.map((q, i) => (
          <EditableQuestion
            key={q.id}
            index={i}
            question={q}
            questionType={meta.question_type}
            onSave={saveQuestion}
            onDelete={() => deleteQuestion(q.id)}
          />
        ))}
      </div>

      {questions.length === 0 && pending.length === 0 && (
        <div className="card p-8 text-center text-gray-400">
          <p>Нет вопросов. Нажмите «Добавить вопрос».</p>
        </div>
      )}
    </div>
  );
}

function EditableQuestion({ index, question, questionType, onSave, onDelete }: {
  index: number;
  question: Question;
  questionType: string;
  onSave: (q: Question) => void;
  onDelete: () => void;
}) {
  const [q, setQ] = useState(question);
  const [expanded, setExpanded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = (changes: Partial<Question>) => {
    setQ((prev) => ({ ...prev, ...changes }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(q);
    setDirty(false);
    setSaving(false);
  };

  const toggleCorrect = (oi: number) => {
    if (questionType === 'single') {
      update({ correct_answers: [oi] });
    } else {
      const ca = q.correct_answers.includes(oi)
        ? q.correct_answers.filter((x) => x !== oi)
        : [...q.correct_answers, oi];
      update({ correct_answers: ca.length ? ca : [oi] });
    }
  };

  return (
    <div className={`card p-4 ${dirty ? 'ring-2 ring-indigo-300' : ''}`}>
      <div className="flex items-start gap-2">
        <span className="bg-gray-100 text-gray-600 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0">{index + 1}</span>
        <textarea
          className="input text-sm resize-none flex-1"
          rows={2}
          value={q.text}
          onChange={(e) => update({ text: e.target.value })}
        />
        <div className="flex gap-1 shrink-0">
          <button onClick={() => setExpanded(!expanded)} className="p-1 text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button onClick={onDelete} className="p-1 text-red-400 hover:text-red-600">
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pl-8 space-y-2">
          {q.options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <button
                onClick={() => toggleCorrect(oi)}
                className={`w-5 h-5 rounded${questionType === 'single' ? '-full' : ''} border-2 flex items-center justify-center shrink-0 transition-colors ${
                  q.correct_answers.includes(oi) ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'
                }`}
              >
                {q.correct_answers.includes(oi) && <CheckCircle size={12} />}
              </button>
              <input
                className="input text-sm py-1"
                value={opt}
                onChange={(e) => {
                  const opts = [...q.options];
                  opts[oi] = e.target.value;
                  update({ options: opts });
                }}
              />
              {q.options.length > 2 && (
                <button onClick={() => {
                  const opts = q.options.filter((_, i) => i !== oi);
                  const ca = q.correct_answers.filter((ca) => ca !== oi).map((ca) => ca > oi ? ca - 1 : ca);
                  update({ options: opts, correct_answers: ca.length ? ca : [0] });
                }} className="text-gray-400 hover:text-red-500">
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            {q.options.length < 8 && (
              <button onClick={() => update({ options: [...q.options, ''] })} className="text-xs text-indigo-600 hover:underline">
                + Добавить вариант
              </button>
            )}
            {dirty && (
              <button onClick={handleSave} disabled={saving} className="btn-primary btn-sm ml-auto text-xs">
                <Save size={12} />
                {saving ? 'Сохр...' : 'Сохранить'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PendingQuestionReview({ pq, questionType, onResolve, onSkip }: {
  pq: PendingQuestion;
  questionType: string;
  onResolve: (pq: PendingQuestion, ca: number[]) => void;
  onSkip: (id: number) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);

  const toggle = (oi: number) => {
    if (questionType === 'single') { setSelected([oi]); return; }
    setSelected((s) => s.includes(oi) ? s.filter((x) => x !== oi) : [...s, oi]);
  };

  return (
    <div className="bg-white rounded-lg p-4 border border-amber-200">
      <p className="font-medium text-sm text-gray-800 mb-3">{pq.text}</p>
      <p className="text-xs text-gray-400 mb-2">Уверенность ИИ: {Math.round(pq.confidence)}%</p>
      <div className="space-y-1.5 mb-3">
        {pq.options.map((opt, oi) => (
          <button
            key={oi}
            onClick={() => toggle(oi)}
            className={`w-full text-left text-sm px-3 py-2 rounded border transition-colors ${
              selected.includes(oi) ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSkip(pq.id)} className="btn-secondary btn-sm text-xs">Пропустить</button>
        <button
          onClick={() => selected.length && onResolve(pq, selected)}
          disabled={!selected.length}
          className="btn-primary btn-sm text-xs"
        >
          Подтвердить ответ
        </button>
      </div>
    </div>
  );
}
