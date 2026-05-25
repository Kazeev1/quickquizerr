import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, SlidersHorizontal, Plus, BookOpen, Megaphone, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react';
import api from '../api/client';
import type { Test } from '../types';
import TestCard from '../components/TestCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';

interface PatchNote {
  id: number;
  title: string;
  body: string;
  published_at: string;
  is_visible: number;
}

function PatchNotesBlock() {
  const [notes, setNotes] = useState<PatchNote[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 3;

  useEffect(() => {
    api.get('/patch-notes', { params: { page, limit } })
      .then(({ data }) => {
        setNotes(data.notes);
        setTotal(data.total);
      })
      .catch(() => { /* ignore */ });
  }, [page]);

  if (notes.length === 0) return null;

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="card p-5 mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Megaphone size={18} className="text-indigo-600" />
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Последние изменения</h2>
      </div>
      <div className="space-y-4">
        {notes.map((note) => (
          <div key={note.id} className="border-b dark:border-gray-700 last:border-0 pb-4 last:pb-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm">{note.title}</h3>
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                {new Date(note.published_at).toLocaleDateString('ru-RU', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}
              </span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{note.body}</p>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 1}
            className="btn-secondary btn-sm"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs text-gray-500">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page === totalPages}
            className="btn-secondary btn-sm"
          >
            <ChevronRightIcon size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [tests, setTests] = useState<Test[]>([]);
  const [universities, setUniversities] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [university, setUniversity] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const limit = 20;

  const fetchTests = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { sort, page: String(page), limit: String(limit) };
      if (search) params.search = search;
      if (university) params.university = university;
      const { data } = await api.get('/tests', { params });
      setTests(data.tests);
      setTotal(data.total);
      if (data.universities?.length) setUniversities(data.universities);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [search, university, sort, page]);

  useEffect(() => {
    setPage(1);
  }, [search, university, sort]);

  useEffect(() => {
    fetchTests();
  }, [fetchTests]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PatchNotesBlock />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Тесты</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{total} тестов в базе</p>
        </div>
        {user && (
          <Link to="/create" className="btn-primary">
            <Plus size={18} />
            Создать тест
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Поиск по названию или университету..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[140px]">
            <SlidersHorizontal size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              className="input pl-9 pr-4 appearance-none"
              value={university}
              onChange={(e) => setUniversity(e.target.value)}
            >
              <option value="">Все университеты</option>
              {universities.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <select
            className="input flex-1 min-w-[130px]"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="newest">Сначала новые</option>
            <option value="oldest">Сначала старые</option>
            <option value="name">По названию</option>
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner label="Загрузка тестов..." />
      ) : tests.length === 0 ? (
        <div className="text-center py-20">
          <BookOpen size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <p className="text-gray-500 dark:text-gray-400 text-lg">Тесты не найдены</p>
          {user && (
            <Link to="/create" className="btn-primary mt-4">
              <Plus size={16} />
              Создать первый тест
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tests.map((t) => (
              <TestCard key={t.id} test={t} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              <button
                className="btn-secondary btn-sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Назад
              </button>
              <span className="flex items-center px-4 text-sm text-gray-600 dark:text-gray-400">
                {page} / {totalPages}
              </span>
              <button
                className="btn-secondary btn-sm"
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Вперёд
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
