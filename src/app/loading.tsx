// Мгновенный скелет при переходах — экран не «висит», сразу виден отклик.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-44 rounded-xl bg-line" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[72px] rounded-2xl bg-line/60" />
        ))}
      </div>
      <div className="space-y-3">
        <div className="h-4 w-32 rounded bg-line/60" />
        <div className="h-20 rounded-2xl bg-line/60" />
        <div className="h-20 rounded-2xl bg-line/60" />
      </div>
    </div>
  );
}
