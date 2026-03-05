'use client';
import changelogData from '../../../public/data/changelog.json';

interface ChangeEntry {
  version: string;
  date: string;
  changes: string[];
}

export default function ChangelogPage() {
  const entries: ChangeEntry[] = changelogData;
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">Changelog</h1>
      <p className="text-sm text-gray-500 mb-8">
        Auto-generated from git history · Last updated {entries[0]?.date ?? 'N/A'}
      </p>
      <div className="space-y-8">
        {entries.map((entry) => (
          <div key={entry.version} className="border-l-4 border-blue-500 pl-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl font-semibold">v{entry.version}</span>
              <span className="text-sm text-gray-500">{entry.date}</span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              {entry.changes.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
