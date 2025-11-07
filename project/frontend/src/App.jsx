import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import VideoLoader from './components/VideoLoader';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import LandingPage from './components/LandingPage';
import LiveMode from './components/LiveMode';
import PotholeMap from './components/PotholeMap';

// Page transition variants
const pageVariants = {
  initial: {
    opacity: 0,
    x: -20,
  },
  enter: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.4,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    x: 20,
    transition: {
      duration: 0.3,
      ease: 'easeIn',
    },
  },
};

// Page wrapper component
function PageWrapper({ children }) {
  return (
    <motion.div
      initial="initial"
      animate="enter"
      exit="exit"
      variants={pageVariants}
    >
      {children}
    </motion.div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageWrapper><LandingPage /></PageWrapper>} />
        <Route path="/live" element={<PageWrapper><LiveMode /></PageWrapper>} />
        <Route path="/pothole-map" element={<PageWrapper><PotholeMap /></PageWrapper>} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  const [showVideoLoader, setShowVideoLoader] = useState(true);
  const [hasSeenLoader, setHasSeenLoader] = useState(false);

  useEffect(() => {
    // Check if user has seen the loader before (stored in sessionStorage)
    const seenLoader = sessionStorage.getItem('hasSeenVideoLoader');
    if (seenLoader === 'true') {
      setShowVideoLoader(false);
      setHasSeenLoader(true);
    }
  }, []);

  const handleVideoComplete = () => {
    setShowVideoLoader(false);
    setHasSeenLoader(true);
    // Remember that user has seen the loader in this session
    sessionStorage.setItem('hasSeenVideoLoader', 'true');
  };

  return (
    <ErrorBoundary>
      {showVideoLoader ? (
        <VideoLoader onComplete={handleVideoComplete} />
      ) : (
        <Router>
          <AnimatedRoutes />
          <PWAInstallPrompt />
        </Router>
      )}
    </ErrorBoundary>
  );
}
