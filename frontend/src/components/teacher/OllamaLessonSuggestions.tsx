import { useTranslation } from 'react-i18next';
import React, { useState, useEffect } from 'react';
import styles from './OllamaLessonSuggestions.module.css';

interface OllamaLessonSuggestionsProps {
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  locationInfo?: string;
  onSuggestionSelected: (suggestion: string) => void;
}

interface Suggestion {
  title: string;
  description: string;
  bloomLevel: string;
}

export const OllamaLessonSuggestions = ({
  title,
  description,
  latitude,
  longitude,
  locationInfo = '',
  onSuggestionSelected
}: OllamaLessonSuggestionsProps) => {
  const { t } = useTranslation('landing');
  
  
  
  
  
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchSuggestions();
  }, [title, description, latitude, longitude]);

  const fetchSuggestions = async () => {
    if (!title.trim()) return;

    setIsLoading(true);
    setError('');

    try {
      const prompt = `You are an expert outdoor education curriculum designer. Based on the following activity details and location, suggest 3-5 specific lesson variations or extensions that would leverage the unique educational opportunities of this location.

Activity Title: ${title}
Activity Description: ${description}
Location: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}
Location Information: ${locationInfo || 'General outdoor setting'}

For each suggestion, provide:
1. A concise title (5-10 words max)
2. Bloom's level (remember, understand, apply, analyze, evaluate, create)
3. Brief description (1-2 sentences)

Format as a numbered list. Be specific to the location when possible.`;

      // Call the backend inference endpoint — it routes to Ollama or Claude
      // based on the LLM_PROVIDER env var. Never call Ollama directly from the
      // browser (wrong host, CORS issues in Docker).
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/v1/inference/inquiry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          student_id: 'teacher-preview',
          session_id: 'activity-builder',
          input_text: prompt,
          bloom_level: 3,
          location_name: locationInfo || 'outdoor setting',
          latitude,
          longitude,
        }),
      });

      if (!response.ok) {
        throw new Error(`Inference API error: ${response.status}`);
      }

      const data = await response.json();
      // Backend returns { response: string } or { content: string }
      const text = data.response || data.content || data.text || '';
      const parsedSuggestions = parseSuggestions(text);
      setSuggestions(parsedSuggestions.length > 0 ? parsedSuggestions : getFallbackSuggestions(title));
    } catch (err) {
      console.error('Error fetching suggestions:', err);
      setError('AI suggestions unavailable. Using curated fallbacks.');
      setSuggestions(getFallbackSuggestions(title));
    } finally {
      setIsLoading(false);
    }
  };

  const parseSuggestions = (text: string): Suggestion[] => {
    const suggestions: Suggestion[] = [];
    const lines = text.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      // Look for numbered items
      const match = line.match(/^\d+\.\s*(.+)/);
      if (match) {
        const content = match[1].trim();
        // Try to extract Bloom's level
        const bloomMatch = content.match(/\(([^)]+)\)/);
        const bloomLevel = bloomMatch ? bloomMatch[1] : 'apply';

        suggestions.push({
          title: content.replace(/\([^)]+\)/g, '').trim(),
          description: '',
          bloomLevel
        });
      }
    }

    return suggestions.slice(0, 5); // Max 5 suggestions
  };

  const getFallbackSuggestions = (activityTitle: string): Suggestion[] => {
    return [
    {
      title: `Comparative Analysis: Indoor vs Outdoor ${activityTitle}`,
      description: 'Students compare learning outcomes between indoor and outdoor settings',
      bloomLevel: 'analyze'
    },
    {
      title: `Extended Field Study of ${activityTitle} Concepts`,
      description: 'Multi-day field observations with daily journals and evidence collection',
      bloomLevel: 'create'
    },
    {
      title: `Location-Specific Data Collection for ${activityTitle}`,
      description: 'Students gather real-world data at this specific location',
      bloomLevel: 'apply'
    },
    {
      title: `Peer Teaching: ${activityTitle} at the Site`,
      description: 'Students teach concepts to peers at the actual location',
      bloomLevel: 'evaluate'
    }];

  };

  const handleSelectSuggestion = (suggestion: Suggestion) => {
    const key = suggestion.title;
    const newSelected = new Set(selectedSuggestions);

    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
      onSuggestionSelected(key);
    }

    setSelectedSuggestions(newSelected);
  };

  const bloomColors: Record<string, string> = {
    remember: '#ef4444',
    understand: '#f97316',
    apply: '#eab308',
    analyze: '#22c55e',
    evaluate: '#06b6d4',
    create: '#8b5cf6'
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>{t("landing:aipowered_lesson_suggestions", "\uD83E\uDD16 AI-Powered Lesson Suggestions")}</h3>
        <p className={styles.subtitle}>{t("landing:ollama_is_analyzing_your_location_and_ac", "Ollama is analyzing your location and activity to suggest relevant lesson variations")}

        </p>
      </div>

      {isLoading &&
      <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <p>{t("landing:generating_suggestions", "Generating suggestions...")}</p>
        </div>
      }

      {error &&
      <div className={styles.errorBanner}>
          <p>{error}</p>
          <p style={{ fontSize: '12px', marginTop: '8px' }}>{t("landing:showing_fallback_suggestions_instead", "Showing fallback suggestions instead.")}

        </p>
        </div>
      }

      {suggestions.length > 0 &&
      <div className={styles.suggestionsList}>
          {suggestions.map((suggestion, index) =>
        <div
          key={index}
          className={`${styles.suggestionCard} ${selectedSuggestions.has(suggestion.title) ? styles.selected : ''}`}
          onClick={() => handleSelectSuggestion(suggestion)}>
          
              <div className={styles.suggestionHeader}>
                <h4>{suggestion.title}</h4>
                <span
              className={styles.bloomBadge}
              style={{ backgroundColor: bloomColors[suggestion.bloomLevel] || '#6b7280' }}>
              
                  {suggestion.bloomLevel}
                </span>
              </div>
              {suggestion.description &&
          <p className={styles.description}>{suggestion.description}</p>
          }
              <div className={styles.selectIndicator}>
                {selectedSuggestions.has(suggestion.title) ? '✓ Added' : '+ Add to Activity'}
              </div>
            </div>
        )}
        </div>
      }

      <div className={styles.actions}>
        <button
          onClick={fetchSuggestions}
          disabled={isLoading || !title.trim()}
          className={styles.refreshBtn}>{t("landing:regenerate_suggestions", "\uD83D\uDD04 Regenerate Suggestions")}


        </button>
      </div>

      <div className={styles.info}>
        <p>
          💡 <strong>{t("landing:tip", "Tip:")}</strong>{t("landing:click_on_suggestions_to_add_them_to_your", "Click on suggestions to add them to your activity. \n          These are AI-generated ideas\u2014customize them to fit your educational goals.")}

        </p>
      </div>
    </div>);

};