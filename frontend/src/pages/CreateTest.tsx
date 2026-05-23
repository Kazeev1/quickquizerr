import { useState, useRef, DragEvent, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload, FileText, Plus, Trash2, AlertTriangle, CheckCircle,
  Loader2, ChevronDown, ChevronUp, X
} from 'lucide-react';
import api from '../api/client';
import type { UploadResponse } from '../types';

interface QuestionForm {
  text: string;
  options: string[];
  correct_answers: number[];
}

const emptyQuestion = (): QuestionForm => ({
  text: '',
  options: ['', '', '', ''],
  correct_answers: [0],
});

type Step = 'meta' | 'method' | 'upload' | 'manual' | 'uploading' | 'image_warning' | 'duplicate_warning' | 'done';

export default function CreateTest() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('meta');
  const [meta, setMeta] = useState({ title: '', university: '', access_type: 'public', question_type: 'single' });
  const [docMode, setDocMode] = useState<'with_answers' | 'without_answers'>('with_answers');
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadResp, setUploadResp] = useState<UploadResponse | null>(null);
  const [questions, setQuestions] = useState<QuestionForm[]>([emptyQuestion()]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadStep, setUploadStep] = useState(0);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setMetaField = (k: keyof typeof meta) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setMeta((m) => ({ ...m, [k]: e.target.value }));

  // --- Meta step ---
  const handleMetaNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!meta.title.trim()) { setError('Введите название теста'); return; }
    setError('');
    setStep('method');
  };

  // --- File handling ---
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setFile(e.target.files[0]);
  };

  // Cleanup timer on unmount
  useEffect(() => () => { if (stepTimerRef.current) clearInterval(stepTimerRef.current); }, []);

  // --- Upload & AI processing ---
  const handleUpload = async (force = false, ignoreDuplicate = false) => {
    if (!file) { setError('Выберите файл'); return; }
    setError('');
    setUploadStep(0);
    setStep('uploading');
    if (stepTimerRef.current) clearInterval(stepTimerRef.current);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', meta.title);
    formData.append('university', meta.university);
    formData.append('access_type', meta.access_type);
    formData.append('question_type', meta.question_type);
    formData.append('doc_mode', docMode);
    if (force) formData.append('force', 'true');
    if (ignoreDuplicate) formData.append('ignore_duplicate', 'true');

    try {
      const { data } = await api.post<UploadResponse>('/tests/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          // File transferred to server → advance to step 1, then simulate server stages
          if (e.total && e.loaded >= e.total * 0.95) {
            setUploadStep(1);
            if (stepTimerRef.current) clearInterval(stepTimerRef.current);
            let s = 1;
            stepTimerRef.current = setInterval(() => {
              s++;
              setUploadStep(s);
              if (s >= 3) {
                clearInterval(stepTimerRef.current!);
                stepTimerRef.current = null;
              }
            }, 2200);
          }
        },
      });

      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      setUploadStep(4);

      setUploadResp(data);

      if (data.hasImages && !force) {
        setStep('image_warning');
      } else if (data.duplicate && !ignoreDuplicate) {
        setStep('duplicate_warning');
      } else if (data.id) {
        navigate(`/tests/${data.id}/edit`);
      }
    } catch (err: any) {
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      setError(err.response?.data?.error || 'Ошибка обработки файла');
      setStep('upload');
    }
  };

  // --- Manual questions ---
  const addQuestion = () => setQuestions((q) => [...q, emptyQuestion()]);
  const removeQuestion = (i: number) => setQuestions((q) => q.filter((_, idx) => idx !== i));

  const setQField = (i: number, k: keyof QuestionForm, v: any) =>
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, [k]: v } : q)));

  const setOption = (qi: number, oi: number, v: string) =>
    setQuestions((qs) =>
      qs.map((q, idx) =>
        idx === qi ? { ...q, options: q.options.map((o, oidx) => (oidx === oi ? v : o)) } : q
      )
    );

  const toggleCorrect = (qi: number, oi: number) =>
    setQuestions((qs) =>
      qs.map((q, idx) => {
        if (idx !== qi) return q;
        if (meta.question_type === 'single') return { ...q, correct_answers: [oi] };
        const ca = q.correct_answers.includes(oi)
          ? q.correct_answers.filter((x) => x !== oi)
          : [...q.correct_answers, oi];
        return { ...q, correct_answers: ca.length ? ca : [oi] };
      })
    );

  const handleSaveManual = async () => {
    const valid = questions.filter((q) => q.text.trim() && q.options.filter((o) => o.trim()).length >= 2);
    if (valid.length === 0) { setError('Добавьте хотя бы один вопрос с двумя вариантами ответа'); return; }
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post('/tests', { ...meta, questions: valid });
      navigate(`/tests/${data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  // ===== RENDER =====

  if (step === 'meta') {
    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Создание теста</h1>
        <div className="card p-6">
          <form onSubmit={handleMetaNext} className="space-y-4">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Название теста *</label>
              <input className="input" value={meta.title} onChange={setMetaField('title')} required autoFocus placeholder="Например: Анатомия, раздел 3" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Университет</label>
              <input className="input" value={meta.university} onChange={setMetaField('university')} placeholder="Необязательно" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Доступ</label>
                <select className="input" value={meta.access_type} onChange={setMetaField('access_type')}>
                  <option value="public">Публичный</option>
                  <option value="private">Приватный</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Тип вопросов</label>
                <select className="input" value={meta.question_type} onChange={setMetaField('question_type')}>
                  <option value="single">Один ответ</option>
                  <option value="multiple">Несколько ответов</option>
                </select>
              </div>
            </div>
            <button type="submit" className="btn-primary w-full justify-center">Далее</button>
          </form>
        </div>
      </div>
    );
  }

  if (step === 'method') {
    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-2">Способ создания</h1>
        <p className="text-gray-500 mb-6">Тест: <span className="font-medium text-gray-800">{meta.title}</span></p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => setStep('upload')}
            className="card p-6 text-left hover:shadow-md hover:border-indigo-300 transition-all group"
          >
            <Upload size={32} className="text-indigo-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold text-lg mb-1">Из файла</h3>
            <p className="text-sm text-gray-500">Загрузите PDF, DOC или DOCX — ИИ извлечёт вопросы автоматически</p>
          </button>
          <button
            onClick={() => setStep('manual')}
            className="card p-6 text-left hover:shadow-md hover:border-indigo-300 transition-all group"
          >
            <Plus size={32} className="text-indigo-500 mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold text-lg mb-1">Вручную</h3>
            <p className="text-sm text-gray-500">Добавьте вопросы и ответы самостоятельно</p>
          </button>
        </div>
        <button onClick={() => setStep('meta')} className="btn-secondary mt-4">Назад</button>
      </div>
    );
  }

  if (step === 'upload') {
    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-2">Загрузка файла</h1>
        <p className="text-gray-500 mb-6">Поддерживаются PDF, DOC, DOCX до 50 MB</p>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>}

        {/* Doc mode switcher */}
        <div className="card p-1 flex mb-5 gap-1">
          <button
            onClick={() => setDocMode('with_answers')}
            className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors text-center ${
              docMode === 'with_answers'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            ✓ Документ с ответами
          </button>
          <button
            onClick={() => setDocMode('without_answers')}
            className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors text-center ${
              docMode === 'without_answers'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            ? Только вопросы
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-4 -mt-3">
          {docMode === 'with_answers'
            ? 'ИИ найдёт отмеченные правильные ответы. Неоднозначные — отправит на вашу проверку.'
            : 'ИИ извлечёт вопросы и варианты. Все правильные ответы вы укажете вручную.'}
        </p>

        <div
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400'}`}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileChange} />
          <FileText size={48} className="mx-auto text-gray-300 mb-3" />
          {file ? (
            <div>
              <p className="font-medium text-indigo-600">{file.name}</p>
              <p className="text-sm text-gray-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
          ) : (
            <div>
              <p className="font-medium text-gray-700">Перетащите файл или нажмите для выбора</p>
              <p className="text-sm text-gray-400 mt-1">PDF, DOC, DOCX</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-4">
          <button onClick={() => setStep('method')} className="btn-secondary">Назад</button>
          <button onClick={() => handleUpload()} disabled={!file} className="btn-primary flex-1 justify-center">
            <Upload size={16} />
            Обработать с ИИ
          </button>
        </div>
      </div>
    );
  }

  if (step === 'uploading') {
    const STEPS = [
      'Загрузка файла',
      'Проверка содержимого',
      'Анализ документа',
      'Поиск ответов',
      'Создание теста',
    ];
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <Loader2 size={44} className="mx-auto text-indigo-600 animate-spin mb-3" />
          <h2 className="text-xl font-semibold">Обработка файла...</h2>
          <p className="text-sm text-gray-400 mt-1">{STEPS[Math.min(uploadStep, STEPS.length - 1)]}</p>
        </div>

        <div className="card p-5 space-y-3">
          {STEPS.map((label, i) => {
            const done = i < uploadStep;
            const current = i === uploadStep;
            return (
              <div key={i} className={`flex items-center gap-3 transition-opacity duration-300 ${i > uploadStep ? 'opacity-35' : ''}`}>
                {/* Icon */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors duration-300 ${
                  done ? 'bg-green-500' : current ? 'bg-indigo-500' : 'bg-gray-100'
                }`}>
                  {done
                    ? <CheckCircle size={15} className="text-white" />
                    : current
                    ? <Loader2 size={14} className="text-white animate-spin" />
                    : <span className="w-2 h-2 rounded-full bg-gray-300 block" />
                  }
                </div>

                {/* Label */}
                <span className={`text-sm font-medium flex-1 ${
                  done ? 'text-green-700' : current ? 'text-indigo-700' : 'text-gray-400'
                }`}>
                  {label}
                </span>

                {/* Status tag */}
                {done && <span className="text-xs text-green-500 font-medium">Готово</span>}
                {current && <span className="text-xs text-indigo-400 animate-pulse">В процессе...</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (step === 'image_warning') {
    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="card p-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle size={24} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold text-lg">В документе обнаружены изображения</h2>
              <p className="text-gray-500 text-sm mt-1">Они не могут быть обработаны системой.</p>
            </div>
          </div>

          <div className="bg-amber-50 rounded-lg p-4 mb-4 text-sm space-y-1">
            {uploadResp?.imageWarnings?.map((w, i) => (
              <p key={i} className="text-amber-800">• {w}</p>
            ))}
          </div>

          <div className="text-sm text-gray-600 space-y-2 mb-6">
            <p className="font-medium">Последствия:</p>
            <p>• Текст с изображений не будет распознан</p>
            <p>• Часть вопросов может быть потеряна</p>
            <p className="font-medium mt-3">Рекомендации:</p>
            <p>• Вручную перепишите вопросы из изображений</p>
            <p>• Сохраните их в текстовый файл и загрузите повторно</p>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep('upload')} className="btn-secondary flex-1 justify-center">
              <X size={16} />
              Отменить
            </button>
            <button onClick={() => handleUpload(true, false)} className="btn-primary flex-1 justify-center">
              Продолжить без изображений
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'duplicate_warning') {
    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="card p-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle size={24} className="text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold text-lg">Возможный дубликат</h2>
              <p className="text-gray-500 text-sm mt-1">
                Уже существует тест на основе этого файла: <strong>{uploadResp?.duplicate?.title}</strong>
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={() => navigate(`/tests/${uploadResp?.duplicate?.id}`)} className="btn-secondary flex-1 justify-center">
              Открыть существующий
            </button>
            <button onClick={() => handleUpload(true, true)} className="btn-primary flex-1 justify-center">
              Создать новый
            </button>
          </div>
          <button onClick={() => setStep('upload')} className="btn-secondary w-full justify-center mt-3">Отменить</button>
        </div>
      </div>
    );
  }

  // Manual step
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Ручное создание</h1>
          <p className="text-gray-500 text-sm mt-1">{meta.title}</p>
        </div>
        <button onClick={() => setStep('method')} className="btn-secondary btn-sm">Назад</button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>}

      <div className="space-y-4">
        {questions.map((q, qi) => (
          <QuestionEditor
            key={qi}
            index={qi}
            question={q}
            questionType={meta.question_type}
            onTextChange={(v) => setQField(qi, 'text', v)}
            onOptionChange={(oi, v) => setOption(qi, oi, v)}
            onToggleCorrect={(oi) => toggleCorrect(qi, oi)}
            onAddOption={() => setQField(qi, 'options', [...q.options, ''])}
            onRemoveOption={(oi) => {
              const newOpts = q.options.filter((_, i) => i !== oi);
              const newCA = q.correct_answers
                .filter((ca) => ca !== oi)
                .map((ca) => (ca > oi ? ca - 1 : ca));
              setQField(qi, 'options', newOpts);
              setQField(qi, 'correct_answers', newCA.length ? newCA : [0]);
            }}
            onRemove={questions.length > 1 ? () => removeQuestion(qi) : undefined}
          />
        ))}
      </div>

      <div className="flex gap-3 mt-6">
        <button onClick={addQuestion} className="btn-secondary">
          <Plus size={16} />
          Добавить вопрос
        </button>
        <button onClick={handleSaveManual} disabled={saving} className="btn-primary ml-auto">
          {saving ? <><Loader2 size={16} className="animate-spin" />Сохранение...</> : <><CheckCircle size={16} />Сохранить тест</>}
        </button>
      </div>
    </div>
  );
}

function QuestionEditor({ index, question, questionType, onTextChange, onOptionChange, onToggleCorrect, onAddOption, onRemoveOption, onRemove }: {
  index: number;
  question: QuestionForm;
  questionType: string;
  onTextChange: (v: string) => void;
  onOptionChange: (oi: number, v: string) => void;
  onToggleCorrect: (oi: number) => void;
  onAddOption: () => void;
  onRemoveOption: (oi: number) => void;
  onRemove?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0">
            {index + 1}
          </span>
          <textarea
            className="input resize-none text-sm flex-1"
            rows={2}
            placeholder="Текст вопроса..."
            value={question.text}
            onChange={(e) => onTextChange(e.target.value)}
          />
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 text-gray-400 hover:text-gray-600">
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          {onRemove && (
            <button onClick={onRemove} className="p-1.5 text-red-400 hover:text-red-600">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="space-y-2 pl-8">
          <p className="text-xs text-gray-500 font-medium">
            {questionType === 'multiple' ? 'Отметьте все правильные ответы:' : 'Отметьте правильный ответ:'}
          </p>
          {question.options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleCorrect(oi)}
                className={`w-5 h-5 rounded shrink-0 border-2 flex items-center justify-center transition-colors ${
                  question.correct_answers.includes(oi)
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'border-gray-300 hover:border-green-400'
                } ${questionType === 'single' ? 'rounded-full' : ''}`}
              >
                {question.correct_answers.includes(oi) && <CheckCircle size={12} />}
              </button>
              <input
                className="input text-sm py-1.5"
                placeholder={`Вариант ${oi + 1}`}
                value={opt}
                onChange={(e) => onOptionChange(oi, e.target.value)}
              />
              {question.options.length > 2 && (
                <button onClick={() => onRemoveOption(oi)} className="text-gray-400 hover:text-red-500 shrink-0">
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          {question.options.length < 8 && (
            <button onClick={onAddOption} className="text-sm text-indigo-600 hover:underline flex items-center gap-1 pl-7">
              <Plus size={14} />
              Добавить вариант
            </button>
          )}
        </div>
      )}
    </div>
  );
}
