import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  Clock, ChevronRight, AlertCircle, CheckCircle, XCircle,
  Lightbulb, Loader2, MessageCircleQuestion, Languages,
} from 'lucide-react';
import api from '../api/client';
import type { Test, Question } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function weightedSample<T>(items: T[], weights: number[], count: number): T[] {
  const result: T[] = [];
  const rem = [...items];
  const remW = [...weights];

  for (let i = 0; i < Math.min(count, items.length); i++) {
    const total = remW.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < remW.length - 1; idx++) {
      r -= remW[idx];
      if (r <= 0) break;
    }
    result.push(rem[idx]);
    rem.splice(idx, 1);
    remW.splice(idx, 1);
  }

  return result;
}

function isAnswerCorrect(selected: number[], correct: number[]) {
  return selected.length === correct.length && selected.every((s) => correct.includes(s));
}

interface QuestionStat {
  correct_streak: number;
  wrong_streak: number;
  total_answers: number;
  last_correct: number;
}

type TranslationLang = 'RU' | 'KZ' | 'EN';

interface AskState {
  open: boolean;
  input: string;
  loading: boolean;
  response: string | null;
}

export default function TakeTest() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const rawMode = params.get('mode');
  const mode = rawMode === 'exam' ? 'exam' : rawMode === 'sprint' ? 'sprint' : 'normal';

  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [confirmed, setConfirmed] = useState<Record<number, boolean>>({});
  const [explanations, setExplanations] = useState<Record<number, string>>({});
  const [loadingExplain, setLoadingExplain] = useState<Record<number, boolean>>({});
  const [translations, setTranslations] = useState<Record<number, Partial<Record<TranslationLang, string>>>>({});
  const [transLoading, setTransLoading] = useState<Record<number, TranslationLang | null>>({});
  const [activeLang, setActiveLang] = useState<Record<number, 'original' | TranslationLang>>({});
  const [askStates, setAskStates] = useState<Record<number, AskState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const startTime = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchTest = async () => {
      try {
        const { data } = await api.get(`/tests/${id}`);
        setTest(data.test);
        let allQs: Question[] = shuffle(data.questions);

        if (mode === 'sprint' && user) {
          try {
            const { data: statsData } = await api.get(`/tests/${id}/question-stats`);
            const stats: Record<number, QuestionStat> = statsData.stats;

            const weights = allQs.map((q) => {
              const s = stats[q.id];
              if (!s) return 15;
              if (s.total_answers > 0 && !s.last_correct) return 20;
              if (s.correct_streak >= 3) return Math.max(10 / 4, 0.5);
              return 10;
            });

            allQs = weightedSample(allQs, weights, 30);
          } catch {
            allQs = allQs.slice(0, 30);
          }
        } else if (mode === 'exam') {
          allQs = allQs.slice(0, 30);
        }

        const qs = allQs.map((q) => {
          const indices = shuffle(q.options.map((_, i) => i));
          return {
            ...q,
            options: indices.map((i) => q.options[i]),
            correct_answers: q.correct_answers.map((ca) => indices.indexOf(ca)),
          };
        });
        setQuestions(qs);

        try { await api.post(`/tests/${id}/start`, { mode }); } catch { /* ignore */ }
      } catch (err: any) {
        setError(err.response?.data?.error || 'Не удалось загрузить тест');
      } finally {
        setLoading(false);
      }
    };
    fetchTest();
  }, [id, mode]);

  const q = questions[current];
  const isMultiple = test?.question_type === 'multiple';
  const selected = answers[current] || [];
  const isConfirmed = mode !== 'exam' ? !!confirmed[current] : false;

  const toggle = (oi: number) => {
    if (isConfirmed) return;
    setAnswers((a) => {
      const cur = a[current] || [];
      if (isMultiple) {
        return { ...a, [current]: cur.includes(oi) ? cur.filter((x) => x !== oi) : [...cur, oi] };
      }
      const next = { ...a, [current]: [oi] };
      if (mode !== 'exam') {
        setConfirmed((c) => ({ ...c, [current]: true }));
      }
      return next;
    });
  };

  const confirmMultiple = () => {
    if (selected.length === 0) return;
    setConfirmed((c) => ({ ...c, [current]: true }));
  };

  const goNext = () => setCurrent((c) => c + 1);

  const fetchExplanation = async (idx: number) => {
    if (explanations[idx] || loadingExplain[idx]) return;
    const question = questions[idx];
    setLoadingExplain((l) => ({ ...l, [idx]: true }));
    try {
      const { data } = await api.post('/ai/explain', {
        text: question.text,
        options: question.options,
        correct_answers: question.correct_answers,
      });
      setExplanations((e) => ({ ...e, [idx]: data.explanation }));
    } catch {
      setExplanations((e) => ({ ...e, [idx]: 'Не удалось получить объяснение. Попробуйте позже.' }));
    } finally {
      setLoadingExplain((l) => ({ ...l, [idx]: false }));
    }
  };

  const fetchTranslation = async (idx: number, lang: TranslationLang) => {
    const existing = translations[idx]?.[lang];
    if (existing) {
      setActiveLang((a) => ({ ...a, [idx]: lang }));
      return;
    }

    const currentLang = activeLang[idx] || 'original';
    const sourceText =
      currentLang !== 'original' && translations[idx]?.[currentLang as TranslationLang]
        ? translations[idx]![currentLang as TranslationLang]!
        : explanations[idx];

    setTransLoading((t) => ({ ...t, [idx]: lang }));
    try {
      const { data } = await api.post('/ai/translate', { text: sourceText, lang });
      setTranslations((t) => ({ ...t, [idx]: { ...(t[idx] || {}), [lang]: data.translated } }));
      setActiveLang((a) => ({ ...a, [idx]: lang }));
    } catch {
      setTranslations((t) => ({ ...t, [idx]: { ...(t[idx] || {}), [lang]: 'Не удалось выполнить перевод. Попробуйте позже.' } }));
      setActiveLang((a) => ({ ...a, [idx]: lang }));
    } finally {
      setTransLoading((t) => ({ ...t, [idx]: null }));
    }
  };

  const getDisplayedExplanation = (idx: number): string => {
    const lang = activeLang[idx] || 'original';
    if (lang === 'original') return explanations[idx] || '';
    return translations[idx]?.[lang as TranslationLang] || explanations[idx] || '';
  };

  const openAsk = (idx: number) => {
    setAskStates((s) => ({
      ...s,
      [idx]: s[idx] ? { ...s[idx], open: true } : { open: true, input: '', loading: false, response: null },
    }));
  };

  const submitAsk = async (idx: number) => {
    const state = askStates[idx];
    if (!state || !state.input.trim() || state.loading) return;

    const question = questions[idx];
    setAskStates((s) => ({ ...s, [idx]: { ...s[idx], loading: true } }));
    try {
      const { data } = await api.post('/ai/ask', {
        text: question.text,
        options: question.options,
        correct_answers: question.correct_answers,
        user_question: state.input.trim(),
      });
      setAskStates((s) => ({ ...s, [idx]: { ...s[idx], loading: false, response: data.answer } }));
    } catch {
      setAskStates((s) => ({
        ...s,
        [idx]: { ...s[idx], loading: false, response: 'Не удалось получить ответ. Попробуйте позже.' },
      }));
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const timeTaken = Math.floor((Date.now() - startTime.current) / 1000);
    const resultAnswers = questions.map((q, i) => {
      const sel = answers[i] || [];
      return { question_id: q.id, selected: sel, correct: isAnswerCorrect(sel, q.correct_answers) };
    });
    const score = resultAnswers.filter((a) => a.correct).length;

    try {
      if (user) {
        const statsUpdates = resultAnswers
          .filter((_, i) => answers[i] !== undefined)
          .map((a) => ({ question_id: a.question_id, is_correct: a.correct }));
        if (statsUpdates.length > 0) {
          try {
            await api.post(`/tests/${id}/question-stats/batch`, { updates: statsUpdates });
          } catch { /* ignore */ }
        }
      }

      const { data } = await api.post(`/tests/${id}/results`, {
        score, total: questions.length, time_spent: timeTaken, answers: resultAnswers, mode,
      });
      navigate(`/tests/${id}/results/${data.id}`);
    } catch {
      setSubmitting(false);
    }
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  if (loading) return <LoadingSpinner label="Загрузка теста..." />;
  if (error) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
      <p className="text-red-600">{error}</p>
      <Link to={`/tests/${id}`} className="btn-secondary mt-4">Назад</Link>
    </div>
  );
  if (!test || questions.length === 0) return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <p className="text-gray-500">В тесте нет вопросов</p>
      <Link to={`/tests/${id}`} className="btn-secondary mt-4">Назад</Link>
    </div>
  );

  const progress = ((current + 1) / questions.length) * 100;
  const answeredCount = Object.keys(answers).length;
  const currentIsCorrect = isConfirmed && isAnswerCorrect(selected, q.correct_answers);
  const currentAsk = askStates[current];
  const explanationText = getDisplayedExplanation(current);
  const currentActiveLang = activeLang[current] || 'original';
  const currentTransLoading = transLoading[current];

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-5 sm:py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[180px] sm:max-w-xs">{test.title}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {mode === 'exam' ? 'Режим экзамена' : mode === 'sprint' ? 'Быстрый тест' : 'Обучение'} · {questions.length} вопросов
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg px-3 py-1.5 text-sm font-mono font-medium text-gray-700 dark:text-gray-300">
          <Clock size={14} />
          {formatTime(elapsed)}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full mb-6">
        <div className="h-2 bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      {/* Question card */}
      <div className={`card p-4 sm:p-6 mb-4 transition-colors duration-300 ${
        isConfirmed
          ? currentIsCorrect
            ? 'ring-2 ring-green-400'
            : 'ring-2 ring-red-400'
          : ''
      }`}>
        <div className="flex items-start gap-3 mb-5">
          <span className="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold rounded-full w-8 h-8 flex items-center justify-center shrink-0 text-sm">
            {current + 1}
          </span>
          <p className="text-gray-900 dark:text-gray-100 font-medium leading-relaxed">{q.text}</p>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-300 mb-3 pl-0 sm:pl-11">
          {isMultiple ? 'Выберите все правильные ответы' : 'Выберите один правильный ответ'}
        </p>

        <div className="space-y-2 pl-0 sm:pl-11">
          {q.options.map((opt, oi) => {
            const isSel = selected.includes(oi);
            const isCorrectOpt = q.correct_answers.includes(oi);

            let optClass = 'border-gray-200 dark:border-gray-600 hover:border-indigo-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer dark:text-gray-200';
            let icon = null;

            if (isConfirmed) {
              if (isCorrectOpt) {
                optClass = 'border-green-500 bg-green-50 text-green-900 dark:bg-green-900/30 dark:text-green-300 dark:border-green-600 cursor-default';
                icon = <CheckCircle size={16} className="text-green-500 shrink-0" />;
              } else if (isSel && !isCorrectOpt) {
                optClass = 'border-red-400 bg-red-50 text-red-900 dark:bg-red-900/30 dark:text-red-300 dark:border-red-600 cursor-default';
                icon = <XCircle size={16} className="text-red-400 shrink-0" />;
              } else {
                optClass = 'border-gray-100 dark:border-gray-700 text-gray-500 dark:text-gray-300 cursor-default';
              }
            } else if (isSel) {
              optClass = 'border-indigo-500 bg-indigo-50 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-200 cursor-pointer';
            }

            return (
              <button
                key={oi}
                onClick={() => toggle(oi)}
                disabled={isConfirmed}
                className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all text-sm flex items-center gap-2 ${optClass}`}
              >
                {!isConfirmed && (
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded${isMultiple ? '' : '-full'} border-2 shrink-0 transition-colors ${
                    isSel ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'
                  }`}>
                    {isSel && <span className="w-2 h-2 bg-white rounded-full block" />}
                  </span>
                )}
                {isConfirmed && icon}
                <span className="flex-1">{opt}</span>
                {isConfirmed && isCorrectOpt && (
                  <span className="text-xs font-semibold text-green-600 ml-auto shrink-0">Правильно</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Ask question button — available before confirmation, not in exam mode */}
        {mode !== 'exam' && (
          <div className="mt-4 ml-0 sm:ml-11">
            {!currentAsk?.open ? (
              <button
                onClick={() => openAsk(current)}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-400 transition-colors"
              >
                <MessageCircleQuestion size={15} />
                Задать вопрос
              </button>
            ) : (
              <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
                  <MessageCircleQuestion size={13} />
                  Задайте вопрос по теме
                </div>
                {!currentAsk.response ? (
                  <div className="flex gap-2">
                    <input
                      className="input flex-1 text-sm py-1.5"
                      placeholder="Ваш вопрос..."
                      value={currentAsk.input}
                      onChange={(e) =>
                        setAskStates((s) => ({ ...s, [current]: { ...s[current], input: e.target.value } }))
                      }
                      onKeyDown={(e) => { if (e.key === 'Enter') submitAsk(current); }}
                      disabled={currentAsk.loading}
                    />
                    <button
                      onClick={() => submitAsk(current)}
                      disabled={currentAsk.loading || !currentAsk.input.trim()}
                      className="btn-primary btn-sm shrink-0"
                    >
                      {currentAsk.loading ? <Loader2 size={14} className="animate-spin" /> : 'Отправить'}
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{currentAsk.response}</p>
                    <button
                      onClick={() =>
                        setAskStates((s) => ({ ...s, [current]: { open: true, input: '', loading: false, response: null } }))
                      }
                      className="text-xs text-indigo-500 hover:text-indigo-700 mt-2"
                    >
                      Задать ещё вопрос
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Feedback banner (normal/sprint mode) */}
        {isConfirmed && (
          <div className={`mt-4 ml-0 sm:ml-11 flex items-center gap-2 text-sm font-medium rounded-lg px-4 py-2.5 ${
            currentIsCorrect ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
          }`}>
            {currentIsCorrect
              ? <><CheckCircle size={16} /> Верно! Отличная работа.</>
              : <><XCircle size={16} /> Неверно. Правильный ответ выделен зелёным.</>
            }
          </div>
        )}

        {/* AI Explanation block (after confirming) */}
        {isConfirmed && (
          <div className="mt-3 ml-0 sm:ml-11">
            {!explanations[current] ? (
              <button
                onClick={() => fetchExplanation(current)}
                disabled={loadingExplain[current]}
                className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
              >
                {loadingExplain[current]
                  ? <><Loader2 size={15} className="animate-spin" /> Генерирую объяснение...</>
                  : <><Lightbulb size={15} /> Объяснить ответ</>
                }
              </button>
            ) : (
              <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-lg px-4 py-3 text-sm text-indigo-900 dark:text-indigo-200 leading-relaxed">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 font-semibold text-indigo-700 dark:text-indigo-400">
                    <Lightbulb size={14} /> Объяснение
                  </div>
                  {/* Translation buttons */}
                  <div className="flex items-center gap-1">
                    <Languages size={13} className="text-indigo-400 mr-0.5" />
                    {(['RU', 'KZ', 'EN'] as TranslationLang[]).map((lang) => (
                      <button
                        key={lang}
                        onClick={() => fetchTranslation(current, lang)}
                        disabled={!!currentTransLoading}
                        className={`text-xs px-2 py-0.5 rounded font-medium transition-colors ${
                          currentActiveLang === lang
                            ? 'bg-indigo-600 text-white'
                            : 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800'
                        }`}
                      >
                        {currentTransLoading === lang ? <Loader2 size={10} className="animate-spin inline" /> : lang}
                      </button>
                    ))}
                    {currentActiveLang !== 'original' && (
                      <button
                        onClick={() => setActiveLang((a) => ({ ...a, [current]: 'original' }))}
                        className="text-xs px-1.5 py-0.5 rounded text-gray-400 hover:text-gray-600 transition-colors"
                        title="Показать оригинал"
                      >
                        ↩
                      </button>
                    )}
                  </div>
                </div>
                <p>{explanationText}</p>
              </div>
            )}
          </div>
        )}

        {/* Confirm button for multiple-choice */}
        {mode !== 'exam' && isMultiple && !isConfirmed && selected.length > 0 && (
          <div className="mt-4 ml-0 sm:ml-11">
            <button onClick={confirmMultiple} className="btn-primary btn-sm">
              Подтвердить ответ
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <div>
          {current > 0 && (
            <button onClick={() => setCurrent((c) => c - 1)} className="btn-secondary btn-sm">
              Назад
            </button>
          )}
        </div>

        <span className="text-sm text-gray-500 dark:text-gray-400">
          {mode !== 'exam'
            ? `${Object.keys(confirmed).length} / ${questions.length}`
            : `Отвечено: ${answeredCount} / ${questions.length}`
          }
        </span>

        {current < questions.length - 1 ? (
          (mode === 'exam' || isConfirmed) ? (
            <button onClick={goNext} className="btn-primary btn-sm">
              Следующий
              <ChevronRight size={16} />
            </button>
          ) : (
            <span className="text-xs text-gray-500 dark:text-gray-300 italic">Выберите ответ</span>
          )
        ) : (
          (mode === 'exam' || isConfirmed) ? (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="btn-primary btn-sm bg-green-600 hover:bg-green-700"
            >
              {submitting ? 'Сохранение...' : 'Завершить тест'}
            </button>
          ) : (
            <span className="text-xs text-gray-500 dark:text-gray-300 italic">Выберите ответ</span>
          )
        )}
      </div>

      {/* Dot navigation */}
      <div className="flex flex-wrap gap-1.5 mt-6 justify-center">
        {questions.map((q, i) => {
          const isCur = i === current;
          const conf = confirmed[i];
          const ans = answers[i] || [];
          const correct = conf && isAnswerCorrect(ans, q.correct_answers);
          const wrong = conf && !correct;

          return (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              title={conf ? (correct ? 'Верно' : 'Неверно') : ''}
              className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                isCur
                  ? 'bg-indigo-600 text-white ring-2 ring-indigo-300'
                  : correct
                  ? 'bg-green-500 text-white'
                  : wrong
                  ? 'bg-red-400 text-white'
                  : answers[i]
                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
