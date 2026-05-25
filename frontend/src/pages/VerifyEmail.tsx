import { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, Mail, RefreshCw } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [resending, setResending] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    setStatus('loading');
    api.get(`/auth/verify-email?token=${token}`)
      .then(async () => {
        await refreshUser();
        setStatus('success');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.response?.data?.error || 'Ошибка подтверждения');
      });
  }, [token]);

  const handleResend = async () => {
    setResending(true);
    try {
      await api.post('/auth/resend-verification');
      setResendDone(true);
    } catch (err: any) {
      setMessage(err.response?.data?.error || 'Не удалось отправить письмо');
    } finally {
      setResending(false);
    }
  };

  // Уже подтверждён — редирект
  if (user?.email_verified && !token) {
    navigate('/', { replace: true });
    return null;
  }

  // Страница "проверьте почту" (после регистрации, без токена)
  if (!token) {
    return (
      <div className="min-h-[calc(100vh-128px)] flex items-center justify-center px-4">
        <div className="card p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center mx-auto mb-5">
            <Mail size={32} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Проверьте почту</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed mb-6">
            Мы отправили письмо на <strong>{user?.email}</strong> со ссылкой для подтверждения.
            Перейдите по ней, чтобы получить возможность создавать тесты.
          </p>

          {!resendDone ? (
            <button
              onClick={handleResend}
              disabled={resending}
              className="btn-secondary w-full justify-center"
            >
              {resending ? <><Loader2 size={16} className="animate-spin" /> Отправляем...</> : <><RefreshCw size={16} /> Отправить повторно</>}
            </button>
          ) : (
            <p className="text-green-600 text-sm font-medium">Письмо отправлено! Проверьте папку «Спам».</p>
          )}

          {message && <p className="text-red-500 text-sm mt-3">{message}</p>}

          <Link to="/" className="block text-sm text-indigo-500 hover:underline mt-4">
            Вернуться на главную
          </Link>
        </div>
      </div>
    );
  }

  // Обработка токена из URL
  return (
    <div className="min-h-[calc(100vh-128px)] flex items-center justify-center px-4">
      <div className="card p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <Loader2 size={48} className="animate-spin text-indigo-500 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Подтверждаем email...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={32} className="text-green-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Email подтверждён!</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
              Теперь вы можете создавать и загружать тесты.
            </p>
            <Link to="/create" className="btn-primary justify-center w-full">Создать тест</Link>
            <Link to="/" className="block text-sm text-indigo-500 hover:underline mt-3">На главную</Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center mx-auto mb-5">
              <XCircle size={32} className="text-red-500" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Ошибка подтверждения</h1>
            <p className="text-red-500 text-sm mb-6">{message}</p>
            {user && !user.email_verified && (
              <button onClick={handleResend} disabled={resending} className="btn-secondary w-full justify-center mb-3">
                {resending ? <><Loader2 size={16} className="animate-spin" /> Отправляем...</> : <><RefreshCw size={16} /> Отправить новую ссылку</>}
              </button>
            )}
            {resendDone && <p className="text-green-600 text-sm mb-3">Письмо отправлено!</p>}
            <Link to="/" className="block text-sm text-indigo-500 hover:underline">На главную</Link>
          </>
        )}
      </div>
    </div>
  );
}
