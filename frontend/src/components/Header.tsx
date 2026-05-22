import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, LogOut, User, Shield, Plus, GitCompare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-xl text-indigo-600">
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
              <div className="flex items-center gap-2 text-sm text-gray-600 px-3 py-2 bg-gray-50 rounded-lg">
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
        </nav>
      </div>
    </header>
  );
}
