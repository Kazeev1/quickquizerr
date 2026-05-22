export default function LoadingSpinner({ size = 'md', label }: { size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const s = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-10 w-10' : 'h-7 w-7';
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10">
      <div className={`${s} animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600`} />
      {label && <p className="text-sm text-gray-500">{label}</p>}
    </div>
  );
}
