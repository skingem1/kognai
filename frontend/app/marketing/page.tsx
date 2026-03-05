'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/components/auth-provider';
import { ADMIN_EMAILS } from '@/components/sidebar-nav-items';

interface SocialPost {
  id: string;
  platform: string;
  content: string;
  status: string;
  platform_post_id: string | null;
  error_message: string | null;
  posted_at: string | null;
  created_at: string;
}

const TWITTER_FN_URL = 'https://igspopoejhsxvwvxyhbh.supabase.co/functions/v1/twitter';

const SUGGESTED_TEMPLATES = [
  {
    label: 'Product Launch',
    text: "We just shipped something big at Invoica \u2014 the financial OS for AI agents.\n\nAutomate invoicing, tax compliance, and settlements with a single API call.\n\nBuilt on x402. Try it free \u2192 https://invoica-b89o.vercel.app",
  },
  {
    label: 'Developer Focus',
    text: "Stop building payment infrastructure from scratch.\n\nInvoica gives your AI agents:\n\u2022 Invoice generation\n\u2022 Tax compliance\n\u2022 Settlement detection\n\u2022 Webhook notifications\n\nAll via REST API. Free tier available.\n\nhttps://invoica-b89o.vercel.app",
  },
  {
    label: 'Feature Highlight',
    text: "Invoica now supports real-time webhook notifications for invoice events.\n\nGet notified when:\n\u2192 Invoice created\n\u2192 Payment settled\n\u2192 Status changes\n\nPerfect for autonomous AI agent workflows.\n\nhttps://invoica.mintlify.app/docs/webhooks",
  },
  {
    label: 'x402 Protocol',
    text: "The x402 protocol is changing how machines pay each other.\n\nInvoica is the first financial OS built on x402 \u2014 enabling AI agents to handle invoicing, compliance, and settlements autonomously.\n\nLearn more \u2192 https://invoica-b89o.vercel.app",
  },
];

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-700',
  posted: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

export default function MarketingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [tweetText, setTweetText] = useState('');
  const [posting, setPosting] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Admin-only route guard
  useEffect(() => {
    if (user && !ADMIN_EMAILS.includes(user.email || '')) {
      router.replace('/');
    }
  }, [user, router]);

  const loadPosts = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('SocialPost')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      setPosts(data || []);
    } catch {
      console.error('Failed to load posts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  // Don't render for non-admins
  if (user && !ADMIN_EMAILS.includes(user.email || '')) {
    return null;
  }

  async function handlePostTweet() {
    if (!tweetText.trim()) return;
    setPosting(true);
    setResult(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const res = await fetch(`${TWITTER_FN_URL}/tweet`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ text: tweetText }),
      });

      const data = await res.json();

      if (data.success) {
        setResult({ type: 'success', message: 'Tweet posted successfully!' });
        setTweetText('');
        loadPosts();
      } else {
        setResult({ type: 'error', message: data.error || 'Failed to post tweet' });
      }
    } catch (err) {
      setResult({ type: 'error', message: err instanceof Error ? err.message : 'Failed to post' });
    } finally {
      setPosting(false);
    }
  }

  const charCount = tweetText.length;
  const isOverLimit = charCount > 280;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Marketing</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your social media presence</p>
      </div>

      {/* Compose Tweet */}
      <div className="bg-white rounded-xl border shadow-sm p-6 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-black rounded-lg">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold">Compose Post</h2>
        </div>

        <textarea
          value={tweetText}
          onChange={(e) => setTweetText(e.target.value)}
          placeholder="What's happening with Invoica?"
          rows={4}
          className={`w-full px-4 py-3 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-[#635BFF] focus:border-transparent outline-none ${
            isOverLimit ? 'border-red-300 bg-red-50' : 'border-gray-300'
          }`}
        />

        <div className="flex items-center justify-between mt-3">
          <span className={`text-sm font-mono ${isOverLimit ? 'text-red-500 font-bold' : charCount > 250 ? 'text-amber-500' : 'text-gray-400'}`}>
            {charCount}/280
          </span>
          <button
            onClick={handlePostTweet}
            disabled={posting || !tweetText.trim() || isOverLimit}
            className="px-5 py-2.5 bg-black text-white rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {posting ? 'Posting...' : 'Post to X'}
          </button>
        </div>

        {result && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${
            result.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {result.message}
          </div>
        )}
      </div>

      {/* Templates */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-4">Quick Templates</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SUGGESTED_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.label}
              onClick={() => setTweetText(tmpl.text)}
              className="bg-white rounded-xl border shadow-sm p-4 text-left hover:border-[#635BFF]/30 hover:shadow-md transition-all group"
            >
              <h3 className="font-semibold text-sm mb-2 group-hover:text-[#635BFF] transition-colors">{tmpl.label}</h3>
              <p className="text-xs text-gray-500 line-clamp-3">{tmpl.text}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Post History */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Post History</h2>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="bg-white rounded-xl border shadow-sm p-8 text-center">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
            <p className="text-gray-500 mb-1">No posts yet</p>
            <p className="text-sm text-gray-400">Compose your first tweet above to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <div key={post.id} className="bg-white rounded-xl border shadow-sm p-5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[post.status]}`}>
                      {post.status}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(post.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{post.content}</p>
                {post.error_message && (
                  <p className="text-xs text-red-500 mt-2 bg-red-50 p-2 rounded">{post.error_message}</p>
                )}
                {post.platform_post_id && (
                  <a
                    href={`https://x.com/i/status/${post.platform_post_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#635BFF] hover:underline mt-2"
                  >
                    View on X
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
