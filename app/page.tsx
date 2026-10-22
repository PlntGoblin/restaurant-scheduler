'use client';

import { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import StaffManagement from './components/StaffManagement';
import ScheduleGenerator from './components/ScheduleGenerator';
import History from './components/History';
import ToastLink from './components/ToastLink';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'staff' | 'toast' | 'generator' | 'history'>('dashboard');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  /**
   * Ask the SERVER whether we are signed in.
   *
   * This used to read `sessionStorage['loggedIn']`, a flag the browser set for
   * itself after checking a password the browser also stored. Nothing about
   * that was verifiable, and it gated nothing: the API routes answered anyone.
   * The session now lives in an httpOnly cookie that this code cannot read or
   * forge -- hence the round trip.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/status');
        const body = await res.json();
        if (!cancelled && body?.authenticated) setIsLoggedIn(true);
      } catch {
        // Offline or mid-deploy: show the login screen rather than guessing.
      } finally {
        if (!cancelled) setCheckingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async () => {
    setError('');
    if (!password) {
      setError('Enter the staff password');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setPassword('');
        setIsLoggedIn(true);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (body?.error === 'rate_limited') {
        // Keep what they typed: after a lockout the usual cause is a typo they
        // can see and fix, and clearing it makes them start from nothing.
        setError(body.message ?? 'Too many attempts. Try again shortly.');
        return;
      }
      setError(
        body?.error === 'auth_not_configured'
          ? 'This deployment has no staff password set yet.'
          : 'Incorrect password',
      );
      setPassword('');
    } catch {
      setError('Could not reach the server');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !submitting) handleLogin();
  };

  // Don't flash the login screen at someone who is already signed in.
  if (checkingSession) {
    return <div className="min-h-screen bg-black" />;
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center px-4 relative overflow-hidden">
        {/* Red accent bars */}
        <div className="absolute top-0 left-0 right-0 h-3 bg-red-600" />
        <div className="absolute bottom-0 left-0 right-0 h-3 bg-red-600" />

        {/* Background emoji decor */}
        <div className="absolute top-8 left-8 text-7xl opacity-10 select-none pointer-events-none">🐄</div>
        <div className="absolute top-12 right-12 text-5xl opacity-10 select-none pointer-events-none">🍟</div>
        <div className="absolute bottom-12 left-16 text-5xl opacity-10 select-none pointer-events-none">🍟</div>
        <div className="absolute bottom-8 right-8 text-7xl opacity-10 select-none pointer-events-none">🐄</div>
        <div className="absolute top-1/2 left-4 -translate-y-1/2 text-4xl opacity-5 select-none pointer-events-none">🥩</div>
        <div className="absolute top-1/2 right-4 -translate-y-1/2 text-4xl opacity-5 select-none pointer-events-none">🥩</div>

        {/* Logo */}
        <div className="text-center mb-8 relative z-10">
          <div className="text-5xl mb-3">🐄</div>
          <h1 className="text-7xl tracking-widest text-white uppercase" style={{ fontFamily: 'var(--font-bebas-neue)' }}>
            FOREFATHERS
          </h1>
          <div className="flex items-center justify-center gap-3 mt-2">
            <div className="h-px w-10 bg-red-600" />
            <p className="text-red-600 text-xs font-bold tracking-widest uppercase">Staff Portal</p>
            <div className="h-px w-10 bg-red-600" />
          </div>
        </div>

        {/* Card */}
        <div className="relative z-10 bg-zinc-900 border border-red-800 rounded-2xl shadow-2xl p-8 w-full max-w-sm">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                Staff Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-4 py-3 border-2 border-zinc-700 rounded-lg text-white bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 placeholder-zinc-600"
                placeholder="••••••••"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm font-medium text-center">{error}</p>
            )}

            <button
              onClick={handleLogin}
              disabled={submitting}
              className="w-full py-3 bg-red-600 text-white rounded-lg text-sm font-black hover:bg-red-700 disabled:opacity-60 transition-colors tracking-widest uppercase"
            >
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>
          </div>
        </div>

        <p className="relative z-10 text-zinc-700 text-xs mt-8 text-center tracking-widest">
          ★ Making history, one cheesesteak at a time ★
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Sticky dark glass: the blur only reads as glass once content
          actually scrolls underneath it. Tabs are pills in Space Grotesk --
          the display voice; body text stays Geist. */}
      <nav className="sticky top-0 z-30 border-b border-white/10 bg-black/60 shadow-lg backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-1.5 font-[family-name:var(--font-space-grotesk)]">
              {(
                [
                  ['dashboard', 'Dashboard'],
                  ['staff', 'Staff Management'],
                  ['toast', 'Toast Link'],
                  ['generator', 'Generator'],
                  ['history', 'History'],
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-full px-5 py-2 text-sm font-semibold tracking-wide transition-all ${
                    activeTab === tab
                      ? 'bg-red-600 text-white shadow-lg shadow-red-900/50'
                      : 'text-white/60 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
                setIsLoggedIn(false);
              }}
              className="rounded-full px-3 py-1.5 text-xs font-bold text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              Log out
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' ? (
          <Dashboard
            onSaveAndGenerate={() => setActiveTab('generator')}
            onManageToastLinks={() => setActiveTab('toast')}
          />
        ) : activeTab === 'staff' ? (
          <StaffManagement />
        ) : activeTab === 'toast' ? (
          <ToastLink />
        ) : activeTab === 'generator' ? (
          <ScheduleGenerator />
        ) : (
          <History />
        )}
      </main>
    </div>
  );
}
