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
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
          <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
            Restaurant Scheduler
          </h1>
          <p className="text-gray-500 text-center text-sm mb-8">
            {isRegistering ? 'Create an account to get started' : 'Sign in to continue'}
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="you@example.com"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-900 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter password"
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm font-medium text-center">{error}</p>
            )}

            <button
              onClick={isRegistering ? handleRegister : handleLogin}
              className="w-full py-3 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors"
            >
              {isRegistering ? 'Create Account' : 'Sign In'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gradient-to-r from-blue-600 to-indigo-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-6 py-4 font-bold text-base rounded-t-lg transition-all duration-200 ${
                activeTab === 'dashboard'
                  ? 'bg-white text-blue-700 shadow-xl transform scale-105'
                  : 'text-white hover:bg-white/20 hover:scale-105'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('staff')}
              className={`px-6 py-4 font-bold text-base rounded-t-lg transition-all duration-200 ${
                activeTab === 'staff'
                  ? 'bg-white text-blue-700 shadow-xl transform scale-105'
                  : 'text-white hover:bg-white/20 hover:scale-105'
              }`}
            >
              Staff Management
            </button>
            <button
              onClick={() => setActiveTab('generator')}
              className={`px-6 py-4 font-bold text-base rounded-t-lg transition-all duration-200 ${
                activeTab === 'generator'
                  ? 'bg-white text-blue-700 shadow-xl transform scale-105'
                  : 'text-white hover:bg-white/20 hover:scale-105'
              }`}
            >
              Generator
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-4 font-bold text-base rounded-t-lg transition-all duration-200 ${
                activeTab === 'history'
                  ? 'bg-white text-blue-700 shadow-xl transform scale-105'
                  : 'text-white hover:bg-white/20 hover:scale-105'
              }`}
            >
              History
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
