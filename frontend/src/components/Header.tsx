import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, LogOut, User, Shield, Plus, GitCompare, Sun, Moon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

export default function Header() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40 dark:bg-gray-900 dark:border-gray-700">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-xl text-indigo-600 dark:text-indigo-400">
          <BookOpen size={24} />
          Quizify
        </Link>

        <nav className="flex items-center gap-3">
          {user ? (
            <>
              <Link to="/create" className="btn-primary btn-sm">
                <Plus size={16} />
                Создать тест
              </Link>
              <Link to="/compare" className="btn-secondary btn-sm">
                <GitCompare size={16} />
                Сравнить файлы
              </Link>
              {user.role === 'admin' && (
                <Link to="/admin" className="btn-secondary btn-sm">
                  <Shield size={16} />
                  Админ
                </Link>
              )}
              <div className="flex items-center gap-2 text-sm text-gray-600 px-3 py-2 bg-gray-50 rounded-lg dark:bg-gray-800 dark:text-gray-300">
                <User size={15} />
                <span className="font-medium">{user.username}</span>
              </div>
              <button onClick={handleLogout} className="btn-secondary btn-sm">
                <LogOut size={15} />
                Выйти
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-secondary btn-sm">
                Войти
              </Link>
              <Link to="/register" className="btn-primary btn-sm">
                Регистрация
              </Link>
            </>
          )}
          <button
            onClick={toggle}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 transition-colors"
            title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </nav>
      </div>
    </header>
  );
}
