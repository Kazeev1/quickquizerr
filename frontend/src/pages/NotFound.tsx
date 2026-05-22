import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-4">
      <div className="text-center">
        <div className="text-8xl font-bold text-indigo-100 mb-4">404</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Страница не найдена</h1>
        <p className="text-gray-500 mb-6">Такой страницы не существует</p>
        <Link to="/" className="btn-primary">На главную</Link>
      </div>
    </div>
  );
}
