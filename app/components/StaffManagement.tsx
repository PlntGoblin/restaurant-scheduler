'use client';

import { useState, useEffect } from 'react';
import { StaffMember, Position, PositionPreference } from '@/lib/types';
import { ALL_POSITIONS } from '@/lib/constants';

// Positions for preferences (exclude duplicates)
const PREFERENCE_POSITIONS: Position[] = [
  'Grill 1',
  'P.O.S.',
  'Expo 1',
  'Expo 2',
  'Fries',
  'Lobby/Dish 1',
];

export default function StaffManagement() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);

  // Load saved staff from localStorage on mount
  useEffect(() => {
    const savedStaff = localStorage.getItem('staff');
    if (savedStaff) {
      try {
        setStaff(JSON.parse(savedStaff));
      } catch (error) {
        console.error('Error loading staff:', error);
      }
    }
  }, []);

  const [formData, setFormData] = useState({
    name: '',
    seniority: 'Team Member' as 'GM' | 'AGM' | 'Captain' | 'Team Member',
    preferences: PREFERENCE_POSITIONS.map(pos => ({ position: pos, preferenceLevel: 3 as 1 | 2 | 3 | 4 | 5 })),
  });

  const handleAddStaff = () => {
    setIsAddingStaff(true);
    setFormData({
      name: '',
      seniority: 'Team Member' as 'GM' | 'AGM' | 'Captain' | 'Team Member',
      preferences: PREFERENCE_POSITIONS.map(pos => ({ position: pos, preferenceLevel: 3 as 1 | 2 | 3 | 4 | 5 })),
    });
  };

  const handleEditStaff = (staffMember: StaffMember) => {
    setEditingStaff(staffMember);
    setFormData({
      name: staffMember.name,
      seniority: staffMember.seniority || 'Team Member',
      preferences: staffMember.preferences,
    });
  };

  const handleSaveStaff = () => {
    if (!formData.name) {
      alert('Please fill in name');
      return;
    }

    const newStaff: StaffMember = {
      id: editingStaff?.id || Date.now().toString(),
      name: formData.name,
      positions: ALL_POSITIONS, // Everyone can work all positions
      preferences: formData.preferences,
      availability: [], // Everyone works all days
      seniority: formData.seniority,
    };

    const updatedStaff = editingStaff
      ? staff.map((s) => (s.id === editingStaff.id ? newStaff : s))
      : [...staff, newStaff];

    setStaff(updatedStaff);

    // Save to localStorage
    localStorage.setItem('staff', JSON.stringify(updatedStaff));

    setIsAddingStaff(false);
    setEditingStaff(null);
    setFormData({
      name: '',
      seniority: 'Team Member' as 'GM' | 'AGM' | 'Captain' | 'Team Member',
      preferences: PREFERENCE_POSITIONS.map(pos => ({ position: pos, preferenceLevel: 3 as 1 | 2 | 3 | 4 | 5 })),
    });
  };

  const handleCancelEdit = () => {
    setIsAddingStaff(false);
    setEditingStaff(null);
    setFormData({
      name: '',
      seniority: 'Team Member' as 'GM' | 'AGM' | 'Captain' | 'Team Member',
      preferences: PREFERENCE_POSITIONS.map(pos => ({ position: pos, preferenceLevel: 3 as 1 | 2 | 3 | 4 | 5 })),
    });
  };

  const handleDeleteStaff = (id: string) => {
    if (confirm('Are you sure you want to delete this staff member?')) {
      const updatedStaff = staff.filter((s) => s.id !== id);
      setStaff(updatedStaff);
      localStorage.setItem('staff', JSON.stringify(updatedStaff));
    }
  };

  const handlePreferenceChange = (position: Position, level: number) => {
    const newPreferences = formData.preferences.map((p) =>
      p.position === position ? { ...p, preferenceLevel: level as 1 | 2 | 3 | 4 | 5 } : p
    );
    setFormData({ ...formData, preferences: newPreferences });
  };

  const exportToJSON = () => {
    const dataStr = JSON.stringify(staff, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'staff-data.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Staff Management</h2>
        <div className="space-x-3">
          {staff.length > 0 && (
            <button
              onClick={exportToJSON}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Export to JSON
            </button>
          )}
          <button
            onClick={handleAddStaff}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
          >
            Add Staff Member
          </button>
        </div>
      </div>

      {(isAddingStaff || editingStaff) && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">
            {editingStaff ? 'Edit Staff Member' : 'Add New Staff Member'}
          </h3>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border-2 border-gray-400 rounded-md text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter staff member name"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-900 mb-2">
                  Seniority Level
                </label>
                <select
                  value={formData.seniority}
                  onChange={(e) => setFormData({ ...formData, seniority: e.target.value as 'GM' | 'AGM' | 'Captain' | 'Team Member' })}
                  className="w-full px-3 py-2 text-base font-medium text-gray-900 bg-white border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="GM">GM (General Manager)</option>
                  <option value="AGM">AGM (Assistant GM)</option>
                  <option value="Captain">Captain</option>
                  <option value="Team Member">Team Member</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-900 mb-3">
                Position Preferences (1 = Least Preferred, 5 = Most Preferred)
              </label>
              <div className="grid grid-cols-2 gap-4">
                {PREFERENCE_POSITIONS.map((position) => {
                  const preference = formData.preferences.find((p) => p.position === position);
                  return (
                    <div key={position} className="border-2 border-gray-300 rounded-md p-3 bg-white">
                      <label className="block text-sm font-bold text-gray-900 mb-2">
                        {position}
                      </label>
                      <select
                        value={preference?.preferenceLevel || 3}
                        onChange={(e) =>
                          handlePreferenceChange(position, parseInt(e.target.value))
                        }
                        className="w-full px-3 py-2 text-base font-medium text-gray-900 bg-white border-2 border-gray-400 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value={1}>1 - Least Preferred</option>
                        <option value={2}>2 - Low Preference</option>
                        <option value={3}>3 - Neutral</option>
                        <option value={4}>4 - High Preference</option>
                        <option value={5}>5 - Most Preferred</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStaff}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Top Preferences
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {staff.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-6 py-12 text-center text-gray-500">
                  No staff members yet. Click &quot;Add Staff Member&quot; to get started.
                </td>
              </tr>
            ) : (
              staff.map((member) => {
                const topPreferences = [...member.preferences]
                  .sort((a, b) => b.preferenceLevel - a.preferenceLevel)
                  .slice(0, 3);

                return (
                  <tr
                    key={member.id}
                    onClick={() => handleEditStaff(member)}
                    className="cursor-pointer hover:bg-gray-50"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {member.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div className="flex flex-wrap gap-1">
                        {topPreferences.map((pref) => (
                          <span
                            key={pref.position}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800"
                          >
                            {pref.position} ({pref.preferenceLevel})
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
