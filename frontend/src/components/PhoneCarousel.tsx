/**
 * Peripateticware - PhoneCarousel.tsx
 * Business Source License 1.1 — see LICENSE
 *
 * FIX: useTranslation() was called at module level (line 2 of original),
 * outside any React component. This violated Rules of Hooks and crashed the
 * entire app before the React tree could mount. Moved inside component body.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './PhoneCarousel.css';

export interface CarouselScreen {
  emoji?: string;
  title: string;
  subtitle?: string;
  prompt?: string;
  response?: string;
  imageUrl?: string;
  backgroundColor?: string;
}

interface PhoneCarouselProps {
  screens: CarouselScreen[];
  personaColor: string;
}

export function PhoneCarousel({ screens, personaColor }: PhoneCarouselProps): React.ReactNode {
  // ✅ CORRECT: Hook called inside the component body, not at module level.
  const { t } = useTranslation('landing');
  const [currentIndex, setCurrentIndex] = useState(0);

  const goToPrevious = () => {
    setCurrentIndex((prev) => prev === 0 ? screens.length - 1 : prev - 1);
  };

  const goToNext = () => {
    setCurrentIndex((prev) => prev === screens.length - 1 ? 0 : prev + 1);
  };

  const currentScreen = screens[currentIndex];
 
  return (
    <div className="carousel-container">
      <div className="phone-mockup" style={{ backgroundColor: personaColor }}>
        <div className="phone-inner">
          <div className="phone-header">
            <span>📍</span>
            <span>9:41</span>
          </div>

          <div className="phone-content">
            {currentScreen.imageUrl ? (
              <div
                className="carousel-image"
                style={{
                  backgroundImage: `url(${currentScreen.imageUrl})`,
                  backgroundColor: currentScreen.backgroundColor || '#eaf2ec',
                }}
              >
                {currentScreen.emoji && (
                  <div className="carousel-emoji">{currentScreen.emoji}</div>
                )}
              </div>
            ) : (
              <div
                className="carousel-placeholder"
                style={{ backgroundColor: currentScreen.backgroundColor || '#eaf2ec' }}
              >
                {currentScreen.emoji && (
                  <div className="placeholder-emoji">{currentScreen.emoji}</div>
                )}
                <div className="placeholder-text">{currentScreen.title}</div>
              </div>
            )}

            <div className="carousel-text">
              <h3 className="carousel-title">{currentScreen.title}</h3>
              {currentScreen.subtitle && (
                <p className="carousel-subtitle">{currentScreen.subtitle}</p>
              )}

              {currentScreen.prompt && (
                <div className="carousel-prompt">
                  <div className="prompt-label">
                    {t('phonecarousel.prompt', '💬 Prompt')}
                  </div>
                  <p className="prompt-text">{currentScreen.prompt}</p>
                </div>
              )}

              {currentScreen.response && (
                <div className="carousel-response">
                  <div className="response-label">
                    {t('phonecarousel.response', '✓ Response')}
                  </div>
                  <p className="response-text">{currentScreen.response}</p>
                </div>
              )}
            </div>
          </div>

          <div className="phone-indicators">
            {screens.map((_, index) => (
              <div
                key={index}
                className={`indicator ${index === currentIndex ? 'active' : ''}`}
                onClick={() => setCurrentIndex(index)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="carousel-controls">
        <button className="carousel-btn" onClick={goToPrevious}>
          {t('phonecarousel.previous', '← Previous')}
        </button>
        <span className="carousel-counter">
          {currentIndex + 1} / {screens.length}
        </span>
        <button className="carousel-btn" onClick={goToNext}>
          {t('phonecarousel.next', 'Next →')}
        </button>
      </div>
    </div>
  );
}
