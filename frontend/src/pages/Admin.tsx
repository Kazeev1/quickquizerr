import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, BookOpen, BarChart3, Shield, Ban, Trash2, RefreshCw,
  CheckCircle, XCircle, AlertTriangle, Clock, UserX, ShieldAlert
} from 'lucide-react';
import api from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';

type Tab = 'stats' | 'users' | 'tests' | 'ai-logs' | 'user-logs';

export default function Admin() {
  const [tab, setTab] = useState<Tab>('stats');

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Shield size={24} className="text-indigo-600" />
        <h1 className="text-2xl font-bold">Панель администратора</h1>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {([
          ['stats', 'Статистика', BarChart3],
          ['users', 'Пользователи', Users],
          ['tests', 'Тесты', BookOpen],
          ['ai-logs', 'Логи ИИ', AlertTriangle],
          ['user-logs', 'Действия', Clock],
        ] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'stats' && <StatsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'tests' && <TestsTab />}
      {tab === 'ai-logs' && <AILogsTab />}
      {tab === 'user-logs' && <UserLogsTab />}
    </div>
  );
}

const ACTION_STYLES: Record<string, string> = {
  login:            'bg-blue-100 text-blue-700',
  register:         'bg-green-100 text-green-700',
  create_test:      'bg-indigo-100 text-indigo-700',
  upload_test:      'bg-purple-100 text-purple-700',
  admin_block_user: 'bg-red-100 text-red-700',
  admin_delete_user:'bg-red-100 text-red-700',
  login_failed:     'bg-rose-100 text-rose-700',
  login_blocked:    'bg-rose-200 text-rose-800',
  anon_take_test:   'bg-orange-100 text-orange-700',
  anon_export:      'bg-amber-100 text-amber-700',
  explain_ai:       'bg-violet-100 text-violet-700',
  anon_explain_ai:  'bg-orange-100 text-orange-700',
};

const ACTION_LABELS: Record<string, string> = {
  login:            'Вход',
  register:         'Регистрация',
  create_test:      'Создал тест',
  upload_test:      'Загрузил файл',
  admin_block_user: 'Заблок. пользователя',
  admin_delete_user:'Удалил пользователя',
  login_failed:     'Неудачный вход',
  login_blocked:    'Вход заблокирован',
  anon_take_test:   'Прошёл тест (аноним)',
  anon_export:      'Скачал базу (аноним)',
  explain_ai:       'Объяснение ИИ',
  anon_explain_ai:  'Объяснение ИИ (аноним)',
};

function ActionBadge({ action }: { action: string }) {
  const style = ACTION_STYLES[action] || 'bg-gray-100 text-gray-700';
  const label = ACTION_LABELS[action] || action;
  return <span className={`badge ${style}`}>{label}</span>;
}

function StatsTab() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/stats').then(({ data }) => setStats(data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;
  if (!stats) return null;

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
        {[
          { label: 'Пользователей', value: stats.users, color: 'text-blue-600', bg: 'bg-blue-50', Icon: Users },
          { label: 'Тестов', value: stats.tests, color: 'text-indigo-600', bg: 'bg-indigo-50', Icon: BookOpen },
          { label: 'Прохождений', value: stats.results, color: 'text-green-600', bg: 'bg-green-50', Icon: CheckCircle },
        ].map(({ label, value, color, bg, Icon }) => (
          <div key={label} className={`card p-5 ${bg}`}>
            <Icon size={24} className={`mb-2 ${color}`} />
            <div className={`text-3xl font-bold ${color}`}>{value}</div>
            <div className="text-sm text-gray-600 mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Ошибок ИИ', value: stats.aiErrors, color: 'text-red-600', bg: 'bg-red-50', Icon: XCircle },
          { label: 'Действий анонимов', value: stats.anonActions ?? 0, color: 'text-orange-600', bg: 'bg-orange-50', Icon: UserX },
          { label: 'Неудачных входов', value: stats.loginFailed ?? 0, color: 'text-rose-600', bg: 'bg-rose-50', Icon: ShieldAlert },
        ].map(({ label, value, color, bg, Icon }) => (
          <div key={label} className={`card p-5 ${bg}`}>
            <Icon size={24} className={`mb-2 ${color}`} />
            <div className={`text-3xl font-bold ${color}`}>{value}</div>
            <div className="text-sm text-gray-600 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {stats.pending > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-600" />
            <span className="text-amber-800 font-medium">
              {stats.pending} вопросов ожидают проверки пользователями
            </span>
          </div>
        </div>
      )}

      <div className="card p-5">
        <h2 className="font-semibold mb-4">Последние действия</h2>
        <div className="space-y-2">
          {stats.recentActivity.map((log: any) => (
            <div key={log.id} className="flex items-center justify-between text-sm py-1.5 border-b dark:border-gray-700 last:border-0">
              <div className="flex items-center gap-3">
                <ActionBadge action={log.action} />
                {log.user_id == null
                  ? <span className="text-orange-500 font-medium flex items-center gap-1"><UserX size={13} /> Аноним</span>
                  : <span className="text-gray-600 dark:text-gray-300">{log.username || `#${log.user_id}`}</span>
                }
                {log.ip && <span className="text-gray-400 text-xs font-mono hidden sm:inline">{log.ip}</span>}
              </div>
              <span className="text-gray-400 text-xs shrink-0">{new Date(log.created_at).toLocaleString('ru-RU')}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    const { data } = await api.get('/admin/users', { params: { search } });
    setUsers(data.users);
    setTotal(data.total);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, [search]);

  const toggleBlock = async (id: number) => {
    await api.put(`/admin/users/${id}/block`);
    fetchUsers();
  };

  const deleteUser = async (id: number, email: string) => {
    if (!confirm(`Удалить пользователя ${email}?`)) return;
    await api.delete(`/admin/users/${id}`);
    fetchUsers();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold">Пользователи ({total})</h2>
        <input className="input sm:max-w-xs" placeholder="Поиск..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[540px]">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Пользователь</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Дата</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Статус</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3 font-medium dark:text-gray-200">{u.username}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{u.email}</td>
                  <td className="px-4 py-3 text-gray-400 dark:text-gray-500">{new Date(u.created_at).toLocaleDateString('ru-RU')}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${u.is_blocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {u.is_blocked ? 'Заблокирован' : 'Активен'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => toggleBlock(u.id)} className="btn-secondary btn-sm text-xs">
                        <Ban size={12} />
                        {u.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                      </button>
                      <button onClick={() => deleteUser(u.id, u.email)} className="btn-danger btn-sm text-xs">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TestsTab() {
  const [tests, setTests] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchTests = async () => {
    setLoading(true);
    const { data } = await api.get('/admin/tests', { params: { search } });
    setTests(data.tests);
    setTotal(data.total);
    setLoading(false);
  };

  useEffect(() => { fetchTests(); }, [search]);

  const toggleBlock = async (id: number) => {
    await api.put(`/admin/tests/${id}/block`);
    fetchTests();
  };

  const deleteTest = async (id: number, title: string) => {
    if (!confirm(`Удалить тест "${title}"?`)) return;
    await api.delete(`/admin/tests/${id}`);
    fetchTests();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold">Тесты ({total})</h2>
        <input className="input sm:max-w-xs" placeholder="Поиск..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Название</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Автор</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Вопросов</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Статус</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t.id} className="border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3">
                    <Link to={`/tests/${t.id}`} className="font-medium text-indigo-600 hover:underline">{t.title}</Link>
                    {t.university && <p className="text-xs text-gray-400 dark:text-gray-500">{t.university}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{t.author_name}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{t.question_count}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${t.is_blocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {t.is_blocked ? 'Заблокирован' : 'Активен'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => toggleBlock(t.id)} className="btn-secondary btn-sm text-xs">
                        <Ban size={12} />
                        {t.is_blocked ? 'Разблокировать' : 'Заблокировать'}
                      </button>
                      <button onClick={() => deleteTest(t.id, t.title)} className="btn-danger btn-sm text-xs">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AILogsTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/ai-logs').then(({ data }) => setLogs(data.logs)).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const totalTokens = logs.reduce((sum, log) => {
    try {
      const d = JSON.parse(log.details || '{}');
      return sum + (d.tokens?.total_tokens || 0);
    } catch { return sum; }
  }, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Логи ИИ ({logs.length})</h2>
        {totalTokens > 0 && (
          <div className="card px-4 py-2 text-sm flex items-center gap-2">
            <span className="text-gray-500">Всего токенов использовано:</span>
            <span className="font-bold text-indigo-600">{totalTokens.toLocaleString('ru-RU')}</span>
          </div>
        )}
      </div>
      <div className="space-y-2">
        {logs.map((log) => {
          let details: any = {};
          try { details = JSON.parse(log.details || '{}'); } catch { /* ignore */ }
          const tokens = details.tokens;

          return (
            <div key={log.id} className="card p-4 flex items-start gap-3">
              {log.status === 'success'
                ? <CheckCircle size={16} className="text-green-500 mt-0.5 shrink-0" />
                : <XCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{log.test_title || `Тест #${log.test_id}`}</span>
                  <span className="text-xs text-gray-400 shrink-0">{new Date(log.created_at).toLocaleString('ru-RU')}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{log.username} · {log.status}</p>

                {/* Token usage */}
                {tokens && (
                  <div className="flex gap-3 mt-1.5 flex-wrap">
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                      Входящие: {tokens.prompt_tokens.toLocaleString('ru-RU')}
                    </span>
                    <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded">
                      Исходящие: {tokens.completion_tokens.toLocaleString('ru-RU')}
                    </span>
                    <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-medium">
                      Итого: {tokens.total_tokens.toLocaleString('ru-RU')} токенов
                    </span>
                  </div>
                )}

                {/* Question stats */}
                {details.total && (
                  <p className="text-xs text-gray-400 mt-1">
                    Извлечено вопросов: {details.total} · подтверждено: {details.confirmed} · на проверку: {details.pending}
                  </p>
                )}

                {log.error_message && <p className="text-xs text-red-600 mt-1">{log.error_message}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UserLogsTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/user-logs').then(({ data }) => setLogs(data.logs)).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <h2 className="font-semibold mb-4">Журнал действий ({logs.length})</h2>
      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead className="bg-gray-50 dark:bg-gray-700/50 border-b dark:border-gray-700">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Пользователь</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Действие</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">IP</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Дата</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr
                key={log.id}
                className={`border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30 ${
                  log.user_id == null ? 'bg-orange-50/40 dark:bg-orange-900/10' : ''
                }`}
              >
                <td className="px-4 py-2">
                  {log.user_id == null
                    ? <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400 font-medium"><UserX size={13} /> Аноним</span>
                    : <span className="dark:text-gray-300">{log.username || `#${log.user_id}`}</span>
                  }
                </td>
                <td className="px-4 py-2">
                  <ActionBadge action={log.action} />
                </td>
                <td className="px-4 py-2 text-gray-400 dark:text-gray-500 font-mono text-xs">{log.ip || '—'}</td>
                <td className="px-4 py-2 text-gray-400 dark:text-gray-500 text-xs">{new Date(log.created_at).toLocaleString('ru-RU')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
