'use client';

import { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import StaffManagement from './components/StaffManagement';
import ScheduleGenerator from './components/ScheduleGenerator';
import History from './components/History';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'staff' | 'generator' | 'history'>('dashboard');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (sessionStorage.getItem('loggedIn') === 'true') {
      setIsLoggedIn(true);
    }
    if (!localStorage.getItem('appAccount')) {
      setIsRegistering(true);
    }
  }, []);

  const handleRegister = () => {
    setError('');
    if (!email || !email.includes('@')) {
      setError('Please enter a valid email');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }
    localStorage.setItem('appAccount', JSON.stringify({ email, password }));
    sessionStorage.setItem('loggedIn', 'true');
    setIsLoggedIn(true);
  };

  const handleLogin = () => {
    setError('');
    const saved = localStorage.getItem('appAccount');
    if (!saved) return;
    const account = JSON.parse(saved);
    if (email === account.email && password === account.password) {
      sessionStorage.setItem('loggedIn', 'true');
      setIsLoggedIn(true);
    } else {
      setError('Incorrect email or password');
      setPassword('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      isRegistering ? handleRegister() : handleLogin();
    }
  };

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
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-4 py-3 border-2 border-zinc-700 rounded-lg text-white bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 placeholder-zinc-600"
                placeholder="you@forefathers.com"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-4 py-3 border-2 border-zinc-700 rounded-lg text-white bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-red-600 placeholder-zinc-600"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-red-500 text-sm font-medium text-center">{error}</p>
            )}

            <button
              onClick={isRegistering ? handleRegister : handleLogin}
              className="w-full py-3 bg-red-600 text-white rounded-lg text-sm font-black hover:bg-red-700 transition-colors tracking-widest uppercase"
            >
              {isRegistering ? "Let's Go 🍟" : 'Sign In'}
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
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gradient-to-r from-black to-red-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-6 py-4 text-base transition-colors ${
                activeTab === 'dashboard'
                  ? 'text-white border-b-2 border-red-400 font-bold'
                  : 'text-white/60 hover:text-white border-b-2 border-transparent font-medium'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('staff')}
              className={`px-6 py-4 text-base transition-colors ${
                activeTab === 'staff'
                  ? 'text-white border-b-2 border-red-400 font-bold'
                  : 'text-white/60 hover:text-white border-b-2 border-transparent font-medium'
              }`}
            >
              Staff Management
            </button>
            <button
              onClick={() => setActiveTab('generator')}
              className={`px-6 py-4 text-base transition-colors ${
                activeTab === 'generator'
                  ? 'text-white border-b-2 border-red-400 font-bold'
                  : 'text-white/60 hover:text-white border-b-2 border-transparent font-medium'
              }`}
            >
              Generator
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-4 text-base transition-colors ${
                activeTab === 'history'
                  ? 'text-white border-b-2 border-red-400 font-bold'
                  : 'text-white/60 hover:text-white border-b-2 border-transparent font-medium'
              }`}
            >
              History
            </button>
          </div>
            <button
              onClick={() => { sessionStorage.removeItem('loggedIn'); setIsLoggedIn(false); }}
              className="mb-2 px-3 py-1.5 text-xs font-bold text-white/70 hover:text-white hover:bg-white/20 rounded transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'dashboard' ? <Dashboard onSaveAndGenerate={() => setActiveTab('generator')} /> : activeTab === 'staff' ? <StaffManagement /> : activeTab === 'generator' ? <ScheduleGenerator /> : <History />}
      </main>
    </div>
  );
}
