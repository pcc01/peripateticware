// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useState } from 'react';

interface LinkedChild {
  link_id: string;
  child_id: string;
  child_name: string;
  relationship: 'parent' | 'guardian' | 'tutor' | 'school_admin';
  linked_at: string;
  verified: boolean;
}

export const LinkChildPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'link' | 'manage'>('link');
  const [linkCode, setLinkCode] = useState('');
  const [relationship, setRelationship] = useState<'parent' | 'guardian' | 'tutor' | 'school_admin'>('parent');
  const [linking, setLinking] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const [linkedChildren] = useState<LinkedChild[]>([
    {
      link_id: 'link1',
      child_id: 'child1',
      child_name: 'Emma Johnson',
      relationship: 'parent',
      linked_at: '2026-04-20',
      verified: true
    },
    {
      link_id: 'link2',
      child_id: 'child2',
      child_name: 'Lucas Johnson',
      relationship: 'parent',
      linked_at: '2026-04-22',
      verified: true
    }
  ]);

  const handleLinkChild = async () => {
    if (!linkCode || linkCode.length !== 6 || !/^\d+$/.test(linkCode)) {
      setMessage({
        type: 'error',
        text: 'Please enter a valid 6-digit code'
      });
      return;
    }

    setLinking(true);
    try {
      // In production, call API
      // await childrenApi.linkChild(linkCode, relationship);
      
      setMessage({
        type: 'success',
        text: `Child linked successfully as ${relationship}!`
      });
      
      setLinkCode('');
      setRelationship('parent');
      
      setTimeout(() => {
        setMessage(null);
        setActiveTab('manage');
      }, 2000);
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Failed to link child. Please check the code and try again.'
      });
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (childId: string) => {
    if (window.confirm('Are you sure you want to unlink this child?')) {
      try {
        // In production, call API to unlink
        setMessage({
          type: 'success',
          text: 'Child unlinked successfully'
        });
      } catch (error) {
        setMessage({
          type: 'error',
          text: 'Failed to unlink child'
        });
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Manage Children</h1>

        {message && (
          <div
            className={`mb-6 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('link')}
            className={`pb-4 font-medium ${
              activeTab === 'link'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600'
            }`}
          >
            Link New Child
          </button>
          <button
            onClick={() => setActiveTab('manage')}
            className={`pb-4 font-medium ${
              activeTab === 'manage'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600'
            }`}
          >
            Manage Linked Children
          </button>
        </div>

        {/* Link Child Tab */}
        {activeTab === 'link' && (
          <div className="bg-white rounded-lg shadow p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Link a Child Account</h2>
              <p className="text-gray-600 mb-6">
                Ask your child's teacher to generate a 6-digit linking code in the teacher portal.
              </p>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  6-Digit Code
                </label>
                <input
                  type="text"
                  value={linkCode}
                  onChange={(e) => setLinkCode(e.target.value.slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  className="block w-full px-4 py-3 text-2xl text-center tracking-widest border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                />
                <p className="mt-2 text-sm text-gray-500">
                  This code expires in 24 hours
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Relationship to Child
                </label>
                <select
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value as any)}
                  className="block w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="parent">Parent</option>
                  <option value="guardian">Guardian</option>
                  <option value="tutor">Tutor</option>
                  <option value="school_admin">School Administrator</option>
                </select>
              </div>

              <button
                onClick={handleLinkChild}
                disabled={linking || linkCode.length !== 6}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400"
              >
                {linking ? 'Linking...' : 'Link Child'}
              </button>
            </div>

            <div className="mt-8 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">How to get a code:</h3>
              <ol className="list-decimal list-inside text-blue-800 space-y-1 text-sm">
                <li>Log into the teacher portal</li>
                <li>Go to "Student Links"</li>
                <li>Click "Generate Parent Code"</li>
                <li>Share the 6-digit code with the parent</li>
              </ol>
            </div>
          </div>
        )}

        {/* Manage Linked Children Tab */}
        {activeTab === 'manage' && (
          <div className="space-y-4">
            {linkedChildren.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <p className="text-gray-600 mb-4">No children linked yet</p>
                <button
                  onClick={() => setActiveTab('link')}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
                >
                  Link Your First Child
                </button>
              </div>
            ) : (
              linkedChildren.map((child) => (
                <div key={child.link_id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{child.child_name}</h3>
                      <p className="text-sm text-gray-600 capitalize">
                        {child.relationship}
                        {child.verified && ' • Verified'}
                      </p>
                    </div>
                    <span className="text-sm text-gray-500">
                      Linked {new Date(child.linked_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <button className="flex-1 bg-gray-100 text-gray-900 py-2 rounded hover:bg-gray-200">
                      View Progress
                    </button>
                    <button
                      onClick={() => handleUnlink(child.child_id)}
                      className="flex-1 bg-red-50 text-red-600 py-2 rounded hover:bg-red-100"
                    >
                      Unlink
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LinkChildPage;
