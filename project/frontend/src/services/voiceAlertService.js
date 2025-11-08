/**
 * Voice Alert Service
 * Provides Text-to-Speech (TTS) alerts with priority queue, cooldown management, and browser compatibility
 */

// Priority levels
const PRIORITY = {
  EMERGENCY: 3,
  HAZARD: 2,
  WARNING: 1
};

// Cooldown periods (in milliseconds)
const COOLDOWNS = {
  EMERGENCY: 5000,  // 5 seconds
  HAZARD: 10000,    // 10 seconds
  WARNING: 30000    // 30 seconds
};

// Default voice settings
const DEFAULT_SETTINGS = {
  enabled: true,
  rate: 1.0,      // 0.1 to 10
  pitch: 1.0,     // 0 to 2
  volume: 1.0,    // 0 to 1
  voice: null,    // null = system default
  lang: 'en-US'
};

class VoiceAlertService {
  constructor() {
    this.isSupported = this.checkSupport();
    this.queue = [];
    this.currentAlert = null;
    this.lastAlertTime = {};
    this.settings = this.loadSettings();
    this.voices = [];
    this.voicesLoaded = false;
    
    // Load available voices
    if (this.isSupported) {
      this.loadVoices();
      // Some browsers load voices asynchronously
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  /**
   * Check if Web Speech API is supported
   */
  checkSupport() {
    return (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      'SpeechSynthesisUtterance' in window
    );
  }

  /**
   * Load available voices from the browser
   */
  loadVoices() {
    if (!this.isSupported) return;
    
    this.voices = window.speechSynthesis.getVoices();
    this.voicesLoaded = true;
    
    // Try to find a preferred voice (English, female if available)
    if (!this.settings.voice && this.voices.length > 0) {
      const preferred = this.voices.find(
        v => v.lang.startsWith('en') && v.name.toLowerCase().includes('female')
      ) || this.voices.find(v => v.lang.startsWith('en')) || this.voices[0];
      
      if (preferred) {
        this.settings.voice = preferred.name;
      }
    }
  }

  /**
   * Load settings from localStorage
   */
  loadSettings() {
    try {
      const saved = localStorage.getItem('voiceAlertSettings');
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load voice alert settings:', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Save settings to localStorage
   */
  saveSettings() {
    try {
      localStorage.setItem('voiceAlertSettings', JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Failed to save voice alert settings:', e);
    }
  }

  /**
   * Update voice alert settings
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
  }

  /**
   * Get current settings
   */
  getSettings() {
    return { ...this.settings };
  }

  /**
   * Check if enough time has passed since last alert of this type
   */
  isCooldownExpired(priority) {
    const lastTime = this.lastAlertTime[priority];
    if (!lastTime) return true;
    
    const cooldown = COOLDOWNS[this.getPriorityName(priority)] || COOLDOWNS.WARNING;
    return Date.now() - lastTime >= cooldown;
  }

  /**
   * Get priority name from level
   */
  getPriorityName(priority) {
    for (const [name, value] of Object.entries(PRIORITY)) {
      if (value === priority) return name;
    }
    return 'WARNING';
  }

  /**
   * Stop current alert and clear queue
   */
  stop() {
    if (this.isSupported && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    this.currentAlert = null;
    this.queue = [];
  }

  /**
   * Interrupt current alert if new alert has higher priority
   */
  shouldInterrupt(newPriority) {
    if (!this.currentAlert) return true;
    return newPriority > this.currentAlert.priority;
  }

  /**
   * Process the alert queue
   */
  processQueue() {
    if (this.queue.length === 0) return;
    
    // Sort queue by priority (highest first)
    this.queue.sort((a, b) => b.priority - a.priority);
    
    const nextAlert = this.queue[0];
    
    // Check if we should interrupt current alert
    if (this.shouldInterrupt(nextAlert.priority)) {
      this.stop();
      this.speak(nextAlert);
      this.queue.shift();
    }
  }

  /**
   * Speak an alert message
   */
  speak(alert) {
    if (!this.isSupported || !this.settings.enabled) {
      console.warn('Voice alerts not available or disabled');
      return;
    }

    // Ensure voices are loaded
    if (!this.voicesLoaded) {
      this.loadVoices();
    }

    try {
      const utterance = new SpeechSynthesisUtterance(alert.message);
      
      // Apply settings
      utterance.rate = this.settings.rate;
      utterance.pitch = this.settings.pitch;
      utterance.volume = this.settings.volume;
      utterance.lang = this.settings.lang;
      
      // Set voice if specified
      if (this.settings.voice) {
        const voice = this.voices.find(v => v.name === this.settings.voice);
        if (voice) {
          utterance.voice = voice;
        }
      }
      
      // Handle completion
      utterance.onend = () => {
        this.currentAlert = null;
        this.lastAlertTime[alert.priority] = Date.now();
        this.processQueue();
      };
      
      utterance.onerror = (error) => {
        console.error('Voice alert error:', error);
        this.currentAlert = null;
        this.processQueue();
      };
      
      this.currentAlert = alert;
      window.speechSynthesis.speak(utterance);
      
    } catch (error) {
      console.error('Failed to speak alert:', error);
      this.currentAlert = null;
      this.processQueue();
    }
  }

  /**
   * Add an alert to the queue
   */
  alert(message, priority = PRIORITY.WARNING, options = {}) {
    if (!this.isSupported) {
      console.warn('Web Speech API not supported');
      return;
    }

    if (!this.settings.enabled) {
      return;
    }

    // Check cooldown
    if (!this.isCooldownExpired(priority)) {
      return; // Skip if still in cooldown
    }

    const alertObj = {
      message,
      priority,
      timestamp: Date.now(),
      ...options
    };

    // If higher priority, interrupt current
    if (this.shouldInterrupt(priority)) {
      this.stop();
      this.speak(alertObj);
    } else {
      // Add to queue
      this.queue.push(alertObj);
    }
  }

  /**
   * Convenience methods for different priority levels
   */
  emergency(message, options = {}) {
    this.alert(message, PRIORITY.EMERGENCY, options);
  }

  hazard(message, options = {}) {
    this.alert(message, PRIORITY.HAZARD, options);
  }

  warning(message, options = {}) {
    this.alert(message, PRIORITY.WARNING, options);
  }

  /**
   * Test voice with current settings
   */
  test(message = 'This is a test of the voice alert system.') {
    if (!this.isSupported) {
      alert('Voice alerts are not supported in this browser.');
      return;
    }
    
    this.stop(); // Stop any current alerts
    this.speak({
      message,
      priority: PRIORITY.WARNING,
      timestamp: Date.now()
    });
  }

  /**
   * Get available voices
   */
  getVoices() {
    if (!this.voicesLoaded) {
      this.loadVoices();
    }
    return this.voices;
  }
}

// Export singleton instance
const voiceAlertService = new VoiceAlertService();
export default voiceAlertService;

// Export constants for use in other files
export { PRIORITY, COOLDOWNS };

