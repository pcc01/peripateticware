import { useTranslation } from 'react-i18next';
/**
 * NotebookEntry Component - MERGED VERSION
 * Combines existing functionality with new design system tokens
 * 
 * Copyright (c) 2026 Paul Christopher Cerda
 * This source code is licensed under the Business Source License 1.1
 * found in the LICENSE.md file in the root directory of this source tree.
 */

import React, { useState } from 'react';
import { clsx } from 'clsx';
import { BookOpen, MessageSquare, FileText } from 'lucide-react';
import {
  ReflectionType,
  NotebookEntryFormData,
  SessionContext } from
'../../types/student';
import { useNotebookEntryStore } from '../../stores/student';

interface NotebookEntryProps {
  sessionContext: SessionContext;
}

const NotebookEntry: React.FC<NotebookEntryProps> = ({ sessionContext }) => {
  const { t } = useTranslation('landing');
  const [reflectionType, setReflectionType] = useState<ReflectionType>('freeform');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const { loading, error } = useNotebookEntryStore();

  const handleSubmit = async () => {
    const data: NotebookEntryFormData = {
      title,
      content,
      reflection_type: reflectionType,
      learning_objectives: sessionContext.learning_objectives.map((o) => o.id),
      competencies: sessionContext.competencies.map((c) => c.id),
      capture_ids: []
    };

    try {
      await useNotebookEntryStore.getState().createEntry(
        sessionContext.session_id,
        data
      );
      setTitle('');
      setContent('');
    } catch (err) {
      console.error('Failed to save entry:', err);
    }
  };

  const reflectionOptions = [
  {
    value: 'guided' as const,
    label: 'Guided',
    icon: <MessageSquare className="w-4 h-4" />
  },
  {
    value: 'freeform' as const,
    label: 'Free Form',
    icon: <FileText className="w-4 h-4" />
  },
  {
    value: 'structured' as const,
    label: 'Structured',
    icon: <BookOpen className="w-4 h-4" />
  }];


  return (
    <div className={clsx(
      'space-y-4 p-[var(--spacing-4)]',
      'border border-[var(--color-gray-200)] rounded-[var(--radius-lg)]',
      'bg-[var(--color-gray-50)]',
      'transition-all duration-[var(--transition-base)]'
    )}>
      <h3 className={clsx(
        'font-semibold text-lg',
        'text-[var(--color-gray-900)]'
      )}>{t("landing:reflection_notebook", "Reflection Notebook")}

      </h3>

      {/* Reflection Type Selection */}
      <div className="flex gap-2 flex-wrap">
        {reflectionOptions.map((option) =>
        <button
          key={option.value}
          onClick={() => setReflectionType(option.value)}
          className={clsx(
            'flex items-center gap-2 px-3 py-2',
            'rounded-[var(--radius-md)] border-2',
            'transition-all duration-[var(--transition-fast)]',
            reflectionType === option.value ?
            clsx(
              'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]',
              'text-[var(--color-primary-700)]'
            ) :
            clsx(
              'border-[var(--color-gray-200)] bg-white',
              'text-[var(--color-gray-700)]',
              'hover:border-[var(--color-gray-300)]'
            )
          )}>
          
            {option.icon}
            {option.label}
          </button>
        )}
      </div>

      {/* Title Input */}
      <input
        type="text"
        placeholder={t("landing:entry_title", "Entry title")}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={clsx(
          'w-full px-3 py-2 border rounded-[var(--radius-md)]',
          'bg-white text-[var(--color-gray-900)]',
          'border-[var(--color-gray-300)]',
          'placeholder:text-[var(--color-gray-400)]',
          'focus:outline-2 focus:outline-offset-0',
          'focus:outline-[var(--color-primary-500)]',
          'focus:border-[var(--color-primary-500)]',
          'transition-colors duration-[var(--transition-fast)]'
        )} />
      

      {/* Content Textarea */}
      <textarea
        placeholder={t("landing:write_your_reflection", "Write your reflection...")}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        className={clsx(
          'w-full px-3 py-2 border rounded-[var(--radius-md)]',
          'bg-white text-[var(--color-gray-900)]',
          'border-[var(--color-gray-300)]',
          'placeholder:text-[var(--color-gray-400)]',
          'focus:outline-2 focus:outline-offset-0',
          'focus:outline-[var(--color-primary-500)]',
          'focus:border-[var(--color-primary-500)]',
          'transition-colors duration-[var(--transition-fast)]',
          'resize-none font-sans'
        )} />
      

      {/* Error Display */}
      {error &&
      <div className={clsx(
        'p-3 rounded-[var(--radius-md)]',
        'bg-[var(--color-error-50)] text-[var(--color-error-600)]',
        'border border-[var(--color-error-200)]',
        'text-sm'
      )}>
          {error}
        </div>
      }

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={loading || !title || !content}
        className={clsx(
          'w-full px-4 py-2',
          'rounded-[var(--radius-md)]',
          'font-medium text-white',
          'transition-all duration-[var(--transition-fast)]',
          loading || !title || !content ?
          clsx(
            'bg-[var(--color-gray-400)] cursor-not-allowed opacity-50'
          ) :
          clsx(
            'bg-[var(--color-primary-500)]',
            'hover:bg-[var(--color-primary-600)]',
            'active:bg-[var(--color-primary-700)]'
          )
        )}>
        
        {loading ? 'Saving...' : 'Save Entry'}
      </button>

      {/* Session Info */}
      <div className={clsx(
        'text-xs p-2 rounded-[var(--radius-md)]',
        'bg-white border border-[var(--color-gray-200)]',
        'text-[var(--color-gray-600)]'
      )}>
        <p>{t("landing:session", "Session:")}{sessionContext.session_id}</p>
      </div>
    </div>);

};

NotebookEntry.displayName = 'NotebookEntry';

export default NotebookEntry;