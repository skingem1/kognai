'use client';

import { useState, useEffect } from 'react';
import { fetchDashboardStats, fetchRecentActivity, fetchApiKeys, fetchCompanyProfile, DashboardStats, RecentActivityItem } from '@/lib/api-client';
import { WelcomeOnboarding } from '@/components/welcome-onboarding';
// Custom modern icons - no external dependency

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<RecentActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    try {
      const [statsData, activityData, keys, profile] = await Promise.all([
        fetchDashboardStats().catch(() => null),
        fetchRecentActivity().catch(() => []),
        fetchApiKeys().catch(() => []),
        fetchCompanyProfile().catch(() => null),
      ]);
      setStats(statsData);
      setActivity(activityData ?? []);

      // Show onboarding if user has no company profile or no API keys
      const needsProfile = !profile;
      const needsApiKey = keys.length === 0;
      const dismissed = typeof window !== 'undefined' && localStorage.getItem('invoica_onboarding_dismissed');
      setShowOnboarding((needsProfile || needsApiKey) && !dismissed);
    } finally {
      setLoading(false);
    }
  }

  function handleOnboardingComplete() {
    setShowOnboarding(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('invoica_onboarding_dismissed', '1');
    }
    // Reload stats in case a key was just created
    loadDashboard();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (showOnboarding) {
    return <WelcomeOnboarding onComplete={handleOnboardingComplete} />;
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Invoices */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:border-[#635BFF]/10 transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-[#635BFF]/10 to-[#818CF8]/10 rounded-xl">
              <svg className="w-6 h-6 text-[#635BFF]" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="2" width="16" height="20" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 7h8M8 11h6M8 15h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="17" cy="17" r="3.5" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" />
                <path d="M15.8 17l.8.8 1.6-1.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Invoices</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.totalInvoices ?? 0}</p>
            </div>
          </div>
        </div>
        {/* Pending */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:border-amber-200 transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl">
              <svg className="w-6 h-6 text-amber-500" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.08" />
                <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.25" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.pending ?? 0}</p>
            </div>
          </div>
        </div>
        {/* Settled */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:border-emerald-200 transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl">
              <svg className="w-6 h-6 text-emerald-500" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.08" />
                <path d="M8 12.5l2.5 2.5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500">Settled</p>
              <p className="text-2xl font-bold text-gray-900">{stats?.settled ?? 0}</p>
            </div>
          </div>
        </div>
        {/* Revenue */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md hover:border-violet-200 transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl">
              <svg className="w-6 h-6 text-violet-500" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
                <rect x="2" y="4" width="20" height="16" rx="3" fill="currentColor" opacity="0.06" />
                <path d="M2 9h20" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 14.5c0-.83.67-1.5 1.5-1.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3c-.83 0-1.5-.67-1.5-1.5z" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="1" />
                <path d="M6 14h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500">Revenue</p>
              <p className="text-2xl font-bold text-gray-900">${(stats?.revenue ?? 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        <div className="space-y-4">
          {activity.length === 0 ? (
            <p className="text-center text-gray-400 py-6">No recent activity yet. Create your first invoice via the API.</p>
          ) : (
            activity.map((item) => (
              <div key={item.id} className="flex items-center gap-4 pb-4 border-b last:border-0">
                <div className={`w-2 h-2 rounded-full ${item.status === 'success' ? 'bg-green-500' : item.status === 'pending' ? 'bg-amber-500' : 'bg-red-500'}`} />
                <div className="flex-1">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-gray-500">{item.description}</p>
                </div>
                <p className="text-sm text-gray-400">{item.timestamp}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
