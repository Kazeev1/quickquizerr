import { Link } from 'react-router-dom';
import { FileQuestion, Building2, Clock, Lock, Globe } from 'lucide-react';
import type { Test } from '../types';

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function TestCard({ test }: { test: Test }) {
  return (
    <Link to={`/tests/${test.id}`} className="card p-5 hover:shadow-md transition-shadow block group">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-2">
          {test.title}
        </h3>
        <span className={`badge shrink-0 ${test.access_type === 'private' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
          {test.access_type === 'private' ? <><Lock size={10} className="mr-1" />Приватный</> : <><Globe size={10} className="mr-1" />Публичный</>}
        </span>
      </div>

      <div className="space-y-1.5 text-sm text-gray-500">
        {test.university && (
          <div className="flex items-center gap-1.5">
            <Building2 size={14} />
            <span className="truncate">{test.university}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <FileQuestion size={14} />
          <span>{test.question_count} вопросов · {test.question_type === 'multiple' ? 'Несколько ответов' : 'Один ответ'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock size={14} />
          <span>{formatDate(test.created_at)} · {test.author_name}</span>
        </div>
      </div>
    </Link>
  );
}
