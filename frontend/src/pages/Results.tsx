import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Clock, Award, RotateCcw, Home } from 'lucide-react';
import api from '../api/client';
import type { TestResult, Test, Question } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Results() {
  const { id, resultId } = useParams<{ id: string; resultId: string }>();
  const [result, setResult] = useState<TestResult | null>(null);
  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    api
      .get(`/tests/${id}/results/${resultId}`)
      .then(({ data }) => {
        setResult(data.result);
        setTest(data.test);
        setQuestions(data.questions);
      })
      .catch((err) => setError(err.response?.data?.error || 'Результат не найден'))
      .finally(() => setLoading(false));
  }, [id, resultId]);

  if (loading) return <LoadingSpinner label="Загрузка результатов..." />;
  if (error || !result || !test) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-red-600">{error || 'Не удалось загрузить результаты'}</p>
        <Link to="/" className="btn-secondary mt-4">На главную</Link>
      </div>
    );
  }

  const pct = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;
  const formatTime = (s: number) =>
    s < 60 ? `${s} сек` : `${Math.floor(s / 60)} мин ${s % 60} сек`;

  const grade =
    pct >= 90 ? { label: 'Отлично', color: 'text-green-600', bg: 'bg-green-50' } :
    pct >= 75 ? { label: 'Хорошо', color: 'text-blue-600', bg: 'bg-blue-50' } :
    pct >= 60 ? { label: 'Удовлетворительно', color: 'text-amber-600', bg: 'bg-amber-50' } :
    { label: 'Неудовлетворительно', color: 'text-red-600', bg: 'bg-red-50' };

  const wrongAnswers = result.answers.filter((a) => !a.correct);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Score card */}
      <div className={`card p-8 mb-6 text-center ${grade.bg}`}>
        <Award size={48} className={`mx-auto mb-3 ${grade.color}`} />
        <div className={`text-6xl font-bold mb-2 ${grade.color}`}>{pct}%</div>
        <div className={`text-xl font-semibold mb-4 ${grade.color}`}>{grade.label}</div>
        <p className="text-gray-600 dark:text-gray-400">
          Правильных ответов: <strong>{result.score}</strong> из <strong>{result.total}</strong>
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4 text-center">
          <CheckCircle size={20} className="mx-auto text-green-500 mb-1" />
          <div className="text-xl font-bold text-green-600">{result.score}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Верно</div>
        </div>
        <div className="card p-4 text-center">
          <XCircle size={20} className="mx-auto text-red-500 mb-1" />
          <div className="text-xl font-bold text-red-600">{result.total - result.score}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Неверно</div>
        </div>
        <div className="card p-4 text-center">
          <Clock size={20} className="mx-auto text-gray-400 mb-1" />
          <div className="text-xl font-bold text-gray-700 dark:text-gray-300">{formatTime(result.time_spent)}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Время</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <Link to="/" className="btn-secondary flex-1 justify-center">
          <Home size={16} />
          На главную
        </Link>
        <Link
          to={`/tests/${id}/take?mode=${result.mode}`}
          className="btn-primary flex-1 justify-center"
        >
          <RotateCcw size={16} />
          Пройти ещё раз
        </Link>
      </div>

      {/* Mistakes */}
      {wrongAnswers.length > 0 && (
        <div className="card p-4">
          <button
            onClick={() => setShowErrors(!showErrors)}
            className="w-full flex items-center justify-between font-medium"
          >
            <span className="flex items-center gap-2 text-red-700">
              <XCircle size={18} />
              Ошибки ({wrongAnswers.length})
            </span>
            <span className="text-sm text-gray-400 dark:text-gray-500">{showErrors ? 'Скрыть' : 'Показать'}</span>
          </button>

          {showErrors && (
            <div className="mt-4 space-y-4">
              {wrongAnswers.map((ans) => {
                const q = questions.find((x) => x.id === ans.question_id);
                if (!q) return null;
                return (
                  <div key={ans.question_id} className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <p className="font-medium text-sm text-gray-800 dark:text-gray-200 mb-2">{q.text}</p>
                    <div className="space-y-1">
                      {q.options.map((opt, oi) => {
                        const isCorrect = q.correct_answers.includes(oi);
                        const wasSelected = ans.selected.includes(oi);
                        return (
                          <div
                            key={oi}
                            className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded ${
                              isCorrect
                                ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                : wasSelected
                                ? 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}
                          >
                            {isCorrect ? (
                              <CheckCircle size={14} className="text-green-500" />
                            ) : wasSelected ? (
                              <XCircle size={14} className="text-red-500" />
                            ) : (
                              <span className="w-3.5 h-3.5" />
                            )}
                            {opt}
                            {isCorrect && <span className="text-xs ml-auto font-medium text-green-600">Правильный</span>}
                            {wasSelected && !isCorrect && <span className="text-xs ml-auto font-medium text-red-600">Ваш ответ</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
