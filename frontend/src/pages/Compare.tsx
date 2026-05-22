import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, FileText, GitCompare, Loader2, CheckCircle, AlertCircle, Plus } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

interface FileResult {
  name: string;
  count: number;
}

interface UniqueQuestion {
  text: string;
  options: string[];
  correct_answers: number[];
  confidence: number;
  source: string;
}

interface CompareResult {
  files: FileResult[];
  unique_questions: UniqueQuestion[];
  unique_count: number;
  total_count: number;
  duplicate_count: number;
}

export default function Compare() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState('');

  // Create test form
  const [showForm, setShowForm] = useState(false);
  const [testTitle, setTestTitle] = useState('');
  const [testUniversity, setTestUniversity] = useState('');
  const [testAccess, setTestAccess] = useState('public');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<number | null>(null);

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <AlertCircle size={48} className="mx-auto text-amber-400 mb-4" />
        <p className="text-gray-600 mb-4">Войдите в аккаунт для использования сравнения файлов</p>
        <button onClick={() => navigate('/login')} className="btn-primary">Войти</button>
      </div>
    );
  }

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const valid = Array.from(newFiles).filter((f) => {
      const ext = f.name.toLowerCase().split('.').pop();
      return ['pdf', 'doc', 'docx'].includes(ext || '');
    });
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      const toAdd = valid.filter((f) => !existing.has(f.name));
      return [...prev, ...toAdd].slice(0, 10);
    });
    setResult(null);
    setError('');
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setResult(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  const handleCompare = async () => {
    if (files.length < 2) {
      setError('Добавьте минимум 2 файла');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    setShowForm(false);
    setCreated(null);

    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const { data } = await api.post('/compare', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка сравнения файлов');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTest = async () => {
    if (!testTitle.trim() || !result) return;
    setCreating(true);
    try {
      const { data } = await api.post('/compare/create-test', {
        title: testTitle.trim(),
        university: testUniversity.trim(),
        access_type: testAccess,
        question_type: 'single',
        questions: result.unique_questions,
      });
      setCreated(data.id);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка создания теста');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <GitCompare size={28} className="text-indigo-600" />
          <h1 className="text-2xl font-bold">Сравнение файлов</h1>
        </div>
        <p className="text-gray-500 text-sm">
          Добавьте несколько файлов (PDF, DOC, DOCX) — ИИ извлечёт вопросы из каждого, найдёт уникальные
          и предложит создать тест без повторений.
        </p>
      </div>

      {/* Drop zone */}
      <div
        className="border-2 border-dashed border-indigo-300 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-colors mb-4"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload size={32} className="mx-auto text-indigo-400 mb-3" />
        <p className="font-medium text-gray-700">Перетащите файлы или нажмите для выбора</p>
        <p className="text-sm text-gray-400 mt-1">PDF, DOC, DOCX · до 10 файлов · 50 MB каждый</p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2 mb-4">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-2.5">
              <FileText size={16} className="text-indigo-500 shrink-0" />
              <span className="text-sm text-gray-700 flex-1 truncate">{f.name}</span>
              <span className="text-xs text-gray-400 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
              <button onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500 shrink-0">
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <button
          onClick={handleCompare}
          disabled={loading || files.length < 2}
          className="btn-primary w-full mb-6"
        >
          {loading ? (
            <><Loader2 size={16} className="animate-spin" /> Анализирую файлы...</>
          ) : (
            <><GitCompare size={16} /> Сравнить файлы ({files.length})</>
          )}
        </button>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-gray-800">{result.total_count}</p>
              <p className="text-xs text-gray-500 mt-1">Всего вопросов</p>
            </div>
            <div className="card p-4 text-center border-green-200 bg-green-50">
              <p className="text-2xl font-bold text-green-700">{result.unique_count}</p>
              <p className="text-xs text-green-600 mt-1">Уникальных</p>
            </div>
            <div className="card p-4 text-center border-amber-200 bg-amber-50">
              <p className="text-2xl font-bold text-amber-700">{result.duplicate_count}</p>
              <p className="text-xs text-amber-600 mt-1">Дубликатов</p>
            </div>
          </div>

          {/* Per-file breakdown */}
          <div className="card p-4">
            <h3 className="font-semibold text-sm text-gray-700 mb-3">Файлы</h3>
            <div className="space-y-2">
              {result.files.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={14} className="text-indigo-400 shrink-0" />
                    <span className="truncate text-gray-700">{f.name}</span>
                  </div>
                  <span className="text-gray-500 shrink-0 ml-2">{f.count} вопросов</span>
                </div>
              ))}
            </div>
          </div>

          {/* Unique questions list */}
          <div className="card p-4">
            <h3 className="font-semibold text-sm text-gray-700 mb-3">
              Уникальные вопросы ({result.unique_count})
            </h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {result.unique_questions.map((q, i) => (
                <div key={i} className="text-sm border-b border-gray-100 pb-2 last:border-0 last:pb-0">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-bold text-indigo-500 shrink-0 mt-0.5">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-gray-800">{q.text}</p>
                      <p className="text-xs text-gray-400 mt-0.5">из: {q.source}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Create test */}
          {!created ? (
            !showForm ? (
              <button onClick={() => setShowForm(true)} className="btn-primary w-full">
                <Plus size={16} /> Создать тест из {result.unique_count} уникальных вопросов
              </button>
            ) : (
              <div className="card p-5">
                <h3 className="font-semibold mb-4">Создать тест</h3>
                <div className="space-y-3">
                  <input
                    className="input"
                    placeholder="Название теста *"
                    value={testTitle}
                    onChange={(e) => setTestTitle(e.target.value)}
                  />
                  <input
                    className="input"
                    placeholder="Университет (необязательно)"
                    value={testUniversity}
                    onChange={(e) => setTestUniversity(e.target.value)}
                  />
                  <select className="input" value={testAccess} onChange={(e) => setTestAccess(e.target.value)}>
                    <option value="public">Публичный</option>
                    <option value="private">Приватный</option>
                  </select>
                  <div className="flex gap-2">
                    <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Отмена</button>
                    <button
                      onClick={handleCreateTest}
                      disabled={creating || !testTitle.trim()}
                      className="btn-primary flex-1"
                    >
                      {creating ? <><Loader2 size={14} className="animate-spin" /> Создаю...</> : 'Создать тест'}
                    </button>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="card p-5 border-green-200 bg-green-50 text-center">
              <CheckCircle size={32} className="mx-auto text-green-500 mb-2" />
              <p className="font-semibold text-green-800 mb-3">Тест успешно создан!</p>
              <div className="flex gap-2 justify-center">
                <button onClick={() => navigate(`/tests/${created}/edit`)} className="btn-secondary btn-sm">
                  Редактировать
                </button>
                <button onClick={() => navigate(`/tests/${created}`)} className="btn-primary btn-sm">
                  Открыть тест
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
