import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass } from 'lucide-react';

export const SplashScreen: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Simulate loading for 2 seconds
    const timer = setTimeout(() => {
      navigate('/login');
    }, 2000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-blue-500 to-green-500 flex flex-col items-center justify-center">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
      </div>

      {/* Content */}
      <div className="relative z-10 text-center">
        {/* Logo */}
        <div className="mb-8 animate-bounce">
          <div className="bg-white rounded-full p-6 shadow-2xl inline-flex">
            <Compass className="w-16 h-16 text-blue-600" />
          </div>
        </div>

        {/* App Name */}
        <h1 className="text-5xl font-bold text-white mb-2">Peripateticware</h1>
        <p className="text-xl text-blue-100 mb-12">Learning in Motion</p>

        {/* Loading Animation */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
          <div className="w-3 h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
          <div className="w-3 h-3 bg-white rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
        </div>

        {/* Loading Text */}
        <p className="text-white text-sm opacity-75">Loading...</p>
      </div>

      {/* Footer */}
      <div className="absolute bottom-8 text-center">
        <p className="text-white text-xs opacity-60">© 2026 Peripateticware. All rights reserved.</p>
      </div>
    </div>
  );
};

export default SplashScreen;
