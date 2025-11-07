import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SkipForward, Loader2 } from 'lucide-react';

export default function VideoLoader({ onComplete }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [error, setError] = useState(false);
  const videoRef = useRef(null);
  const skipTimeoutRef = useRef(null);

  useEffect(() => {
    // Show skip button after 2 seconds
    skipTimeoutRef.current = setTimeout(() => {
      setShowSkip(true);
    }, 2000);

    return () => {
      if (skipTimeoutRef.current) {
        clearTimeout(skipTimeoutRef.current);
      }
    };
  }, []);

  const handleVideoLoaded = () => {
    setIsLoading(false);
    setIsPlaying(true);
    if (videoRef.current) {
      videoRef.current.play().catch(err => {
        console.error('Error playing video:', err);
        setError(true);
        // If autoplay fails, still allow manual play or skip
      });
    }
  };

  const handleVideoEnded = () => {
    handleSkip();
  };

  const handleSkip = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsPlaying(false);
    // Small delay before calling onComplete for smooth transition
    setTimeout(() => {
      onComplete();
    }, 300);
  };

  const handleVideoError = () => {
    setError(true);
    setIsLoading(false);
    // Auto-skip if video fails to load
    setTimeout(() => {
      handleSkip();
    }, 1000);
  };

  // Auto-skip after video ends or if there's an error
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        handleSkip();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  return (
    <AnimatePresence>
      {isPlaying || isLoading ? (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[9999] bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center overflow-hidden"
        >
          {/* Background overlay with animated gradient */}
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-gradient-to-br from-[#3498db]/20 via-[#2ecc71]/10 to-[#e74c3c]/20 animate-pulse"></div>
          </div>

          {/* Video Container */}
          <div className="relative w-full h-full flex items-center justify-center">
            {isLoading && !error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex items-center justify-center z-20"
              >
                <div className="text-center">
                  <Loader2 className="w-16 h-16 text-[#3498db] animate-spin mx-auto mb-4" />
                  <p className="text-white text-lg font-semibold">Loading...</p>
                </div>
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute inset-0 flex items-center justify-center z-20"
              >
                <div className="text-center">
                  <p className="text-white text-lg mb-4">Video unavailable</p>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleSkip}
                    className="px-6 py-3 bg-gradient-to-r from-[#3498db] to-[#2ecc71] text-white rounded-full font-semibold"
                  >
                    Continue
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* Video Element */}
            <motion.video
              ref={videoRef}
              className={`w-full h-full object-cover ${isLoading ? 'opacity-0' : 'opacity-100'}`}
              onLoadedData={handleVideoLoaded}
              onEnded={handleVideoEnded}
              onError={handleVideoError}
              playsInline
              muted
              preload="auto"
            >
              <source src="/Volkswagen%20Das%20Auto%20!!%20(Full%20HD).mp4" type="video/mp4" />
              <source src="/Volkswagen Das Auto !! (Full HD).mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </motion.video>

            {/* Skip Button */}
            {showSkip && !error && (
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSkip}
                className="absolute bottom-8 right-8 z-30 px-6 py-3 bg-white/10 backdrop-blur-lg border border-white/20 text-white rounded-full font-semibold flex items-center gap-2 hover:bg-white/20 transition-all shadow-lg"
              >
                <SkipForward className="w-5 h-5" />
                <span>Skip</span>
              </motion.button>
            )}

            {/* Loading Progress Bar */}
            {isLoading && !error && (
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 3, ease: 'easeOut' }}
                className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-[#3498db] to-[#2ecc71] z-30"
              />
            )}

            {/* App Logo/Branding Overlay */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none"
            >
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

