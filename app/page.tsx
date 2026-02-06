'use client';

import { useState } from 'react';
import Dashboard from './components/Dashboard';
import StaffManagement from './components/StaffManagement';
import ScheduleGenerator from './components/ScheduleGenerator';
import History from './components/History';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'staff' | 'generator' | 'history'>('dashboard');

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
