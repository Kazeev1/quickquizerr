import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  FileQuestion, Building2, Clock, Lock, Globe, User, Edit, Trash2,
  PlayCircle, GraduationCap, AlertCircle, Zap
} from 'lucide-react';
import api from '../api/client';
import type { Test, Question, PendingQuestion } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/Modal';

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function TestDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [pending, setPending] = useState<PendingQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data } = await api.get(`/tests/${id}`);
        setTest(data.test);
        setQuestions(data.questions);

        if (user && (user.id === data.test.author_id || user.role === 'admin')) {
          try {
            const p = await api.get(`/tests/${id}/pending`);
            setPending(p.data.pending);
          } catch { /* no pending */ }
        }
      } catch (err: any) {
        setError(err.response?.data?.error || 'Тест не найден');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, user]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/tests/${id}`);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка удаления');
      setDeleting(false);
    }
  };

  if (loading) return <LoadingSpinner label="Загрузка теста..." />;
  if (error) return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <AlertCircle size={48} className="mx-auto text-red-400 mb-4" />
      <p className="text-red-600 text-lg">{error}</p>
      <Link to="/" className="btn-secondary mt-4">На главную</Link>
    </div>
  );
  if (!test) return null;

  const isOwner = user && (user.id === test.author_id || user.role === 'admin');
  const canTake = questions.length > 0;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">{test.title}</h1>
          <span className={`badge shrink-0 ${test.access_type === 'private' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
            {test.access_type === 'private' ? <><Lock size={10} className="mr-1" />Приватный</> : <><Globe size={10} className="mr-1" />Публичный</>}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm text-gray-600 dark:text-gray-400 mb-6">
          {test.university && (
            <div className="flex items-center gap-1.5">
              <Building2 size={15} className="text-gray-400" />
              <span>{test.university}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <FileQuestion size={15} className="text-gray-400" />
            <span>{questions.length} вопросов</span>
          </div>
          <div className="flex items-center gap-1.5">
            <User size={15} className="text-gray-400" />
            <span>{test.author_name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock size={15} className="text-gray-400" />
            <span>{formatDate(test.created_at)}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          {canTake ? (
            <>
              <Link to={`/tests/${id}/take?mode=normal`} className="btn-primary justify-center sm:justify-start">
                <PlayCircle size={18} />
                Пройти тест
              </Link>
              {questions.length >= 30 && (
                <Link to={`/tests/${id}/take?mode=sprint`} className="btn-secondary justify-center sm:justify-start">
                  <Zap size={18} />
                  Быстрый тест (30 вопросов)
                </Link>
              )}
              {questions.length >= 30 && (
                <Link to={`/tests/${id}/take?mode=exam`} className="btn-secondary justify-center sm:justify-start">
                  <GraduationCap size={18} />
                  Режим экзамена (30 вопросов)
                </Link>
              )}
            </>
          ) : (
            <p className="text-amber-600 text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              В тесте нет вопросов. Добавьте их в редакторе.
            </p>
          )}
          {isOwner && (
            <div className="flex gap-3 sm:contents">
              <Link to={`/tests/${id}/edit`} className="btn-secondary flex-1 justify-center sm:flex-none">
                <Edit size={16} />
                Редактировать
              </Link>
              <button onClick={() => setDeleteModal(true)} className="btn-danger btn-sm flex-1 justify-center sm:flex-none">
                <Trash2 size={16} />
                Удалить
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pending questions review */}
      {pending.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={18} className="text-amber-600" />
            <span className="font-medium text-amber-800">
              {pending.length} вопросов ожидают проверки
            </span>
          </div>
          <p className="text-sm text-amber-700 mb-3">
            ИИ не смог определить правильные ответы для этих вопросов. Перейдите в редактор, чтобы проверить их.
          </p>
          <Link to={`/tests/${id}/edit`} className="btn-sm bg-amber-600 text-white hover:bg-amber-700 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium">
            <Edit size={14} />
            Проверить вопросы
          </Link>
        </div>
      )}

      {/* Question list preview */}
      {questions.length > 0 && (
        <div className="card p-6">
          <h2 className="font-semibold text-lg mb-4">Вопросы ({questions.length})</h2>
          <div className="space-y-3">
            {questions.slice(0, 5).map((q, i) => (
              <div key={q.id} className="flex gap-3 text-sm">
                <span className="num-badge">{i + 1}</span>
                <p className="text-gray-700 dark:text-gray-300 line-clamp-2">{q.text}</p>
              </div>
            ))}
            {questions.length > 5 && (
              <p className="text-sm text-gray-400 dark:text-gray-500 pl-9">... и ещё {questions.length - 5} вопросов</p>
            )}
          </div>
        </div>
      )}

      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Удалить тест">
        <p className="text-gray-600 dark:text-gray-400 mb-6">Вы уверены, что хотите удалить тест <strong>{test.title}</strong>? Это действие нельзя отменить.</p>
        <div className="flex gap-3">
          <button onClick={() => setDeleteModal(false)} className="btn-secondary flex-1 justify-center">Отмена</button>
          <button onClick={handleDelete} disabled={deleting} className="btn-danger flex-1 justify-center">
            {deleting ? 'Удаление...' : 'Удалить'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
