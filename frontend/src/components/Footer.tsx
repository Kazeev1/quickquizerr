import { Send, Mail } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white mt-auto dark:bg-gray-900 dark:border-gray-700">
      <div className="max-w-6xl mx-auto px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400 space-y-1">
        <p className="font-medium text-gray-700 dark:text-gray-300">Created by — Kazeev Danil</p>
        <p>Student of IITU</p>
        <div className="flex items-center justify-center gap-4 pt-2">
          <a
            href="https://t.me/Daneelll"
            target="_blank"
            rel="noreferrer"
            title="Telegram: @Daneelll"
            className="p-2 rounded-lg hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-900/20 dark:hover:text-blue-400 transition-colors"
          >
            <Send size={18} />
          </a>
          <a
            href="mailto:Kazeev2006@gmail.com"
            title="Kazeev2006@gmail.com"
            className="p-2 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-400 transition-colors"
          >
            <Mail size={18} />
          </a>
        </div>
      </div>
    </footer>
  );
}
