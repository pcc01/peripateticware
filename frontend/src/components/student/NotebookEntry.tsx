import React, { useState } from 'react';
import { BookOpen, MessageSquare, FileText } from 'lucide-react';
import { ReflectionType, NotebookEntryFormData, SessionContext } from '../../types/student';
import { useNotebookEntryStore } from '../../stores/student';

interface NotebookEntryProps {
  sessionContext: SessionContext;
}

const NotebookEntry: React.FC<NotebookEntryProps> = ({ sessionContext }) => {
  const [reflectionType, setReflectionType] = useState<ReflectionType>('freeform');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const { loading, error } = useNotebookEntryStore();

  const handleSubmit = async () => {
    const data: NotebookEntryFormData = {
      title,
      content,
      reflection_type: reflectionType,
      learning_objectives: sessionContext.learning_objectives.map(o => o.id),
      competencies: sessionContext.competencies.map(c => c.id),
      capture_ids: [],
    };

    try {
      await useNotebookEntryStore.getState().createEntry(sessionContext.session_id, data);
      setTitle('');
      setContent('');
    } catch (err) {
      console.error('Failed to save entry:', err);
    }
  };

  const reflectionOptions = [
    { value: 'guided' as const, label: 'Guided', icon: <MessageSquare className="w-4 h-4" /> },
    { value: 'freeform' as const, label: 'Free Form', icon: <FileText className="w-4 h-4" /> },
    { value: 'structured' as const, label: 'Structured', icon: <BookOpen className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
      <h3 className="font-semibold text-lg">Reflection Notebook</h3>

      <div className="flex gap-2">
        {reflectionOptions.map(option => (
          <button
            key={option.value}
            onClick={() => setReflectionType(option.value)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition ${
              reflectionType === option.value
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white'
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>

      <input
        type="text"
        placeholder="Entry title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <textarea
        placeholder="Write your reflection..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <button
        onClick={handleSubmit}
        disabled={loading || !title || !content}
        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Saving...' : 'Save Entry'}
      </button>
    </div>
  );
};

export default NotebookEntry;
