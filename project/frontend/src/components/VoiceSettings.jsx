import { useEffect, useState } from 'react';
import { Settings, Volume2, VolumeX, Play, Check } from 'lucide-react';
import voiceAlertService from '../services/voiceAlertService';

export default function VoiceSettings({ isOpen, onClose }) {
  const [settings, setSettings] = useState(voiceAlertService.getSettings());
  const [voices, setVoices] = useState([]);
  const [isSupported, setIsSupported] = useState(voiceAlertService.isSupported);

  useEffect(() => {
    if (isOpen && isSupported) {
      // Load voices when settings open
      const availableVoices = voiceAlertService.getVoices();
      setVoices(availableVoices);
    }
  }, [isOpen, isSupported]);

  const handleSettingChange = (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    voiceAlertService.updateSettings(newSettings);
  };

  const handleTest = () => {
    voiceAlertService.test('This is a test of the voice alert system. The voice settings are working correctly.');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="from-[#1a1a2e] via-[#16213e] to-[#0f3460] rounded-2xl shadow-2xl border border-white/20 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-[#1a1a2e]/95 backdrop-blur-lg border-b border-white/20 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings className="w-6 h-6 text-white" />
            <h2 className="text-2xl font-bold text-white">Voice Alert Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {!isSupported ? (
            <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-xl p-4 text-yellow-200">
              <p className="font-semibold">Voice alerts are not supported in this browser.</p>
              <p className="text-sm mt-2">Please use Chrome, Firefox, Edge, or Safari for voice alerts.</p>
            </div>
          ) : (
            <>
              {/* Enable/Disable */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {settings.enabled ? (
                      <Volume2 className="w-5 h-5 text-green-400" />
                    ) : (
                      <VolumeX className="w-5 h-5 text-gray-400" />
                    )}
                    <div>
                      <label className="text-white font-semibold">Enable Voice Alerts</label>
                      <p className="text-white/60 text-sm">Turn voice alerts on or off</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleSettingChange('enabled', !settings.enabled)}
                    className={`relative w-14 h-8 rounded-full transition-colors ${
                      settings.enabled ? 'bg-green-500' : 'bg-gray-600'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                        settings.enabled ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Voice Selection */}
              {settings.enabled && (
                <>
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <label className="text-white font-semibold block mb-3">Voice</label>
                    <select
                      value={settings.voice || ''}
                      onChange={(e) => handleSettingChange('voice', e.target.value || null)}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">System Default</option>
                      {voices
                        .filter(v => v.lang.startsWith('en'))
                        .map((voice) => (
                          <option key={voice.name} value={voice.name}>
                            {voice.name} ({voice.lang})
                          </option>
                        ))}
                    </select>
                    <p className="text-white/60 text-sm mt-2">
                      Choose a voice for alerts. English voices are shown.
                    </p>
                  </div>

                  {/* Speech Rate */}
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <label className="text-white font-semibold block mb-3">
                      Speech Rate: {settings.rate.toFixed(1)}x
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      value={settings.rate}
                      onChange={(e) => handleSettingChange('rate', parseFloat(e.target.value))}
                      className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <div className="flex justify-between text-white/60 text-xs mt-1">
                      <span>Slow</span>
                      <span>Normal</span>
                      <span>Fast</span>
                    </div>
                  </div>

                  {/* Pitch */}
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <label className="text-white font-semibold block mb-3">
                      Pitch: {settings.pitch.toFixed(1)}
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      value={settings.pitch}
                      onChange={(e) => handleSettingChange('pitch', parseFloat(e.target.value))}
                      className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <div className="flex justify-between text-white/60 text-xs mt-1">
                      <span>Low</span>
                      <span>Normal</span>
                      <span>High</span>
                    </div>
                  </div>

                  {/* Volume */}
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <label className="text-white font-semibold block mb-3">
                      Volume: {Math.round(settings.volume * 100)}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={settings.volume}
                      onChange={(e) => handleSettingChange('volume', parseFloat(e.target.value))}
                      className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                    <div className="flex justify-between text-white/60 text-xs mt-1">
                      <span>Mute</span>
                      <span>50%</span>
                      <span>100%</span>
                    </div>
                  </div>

                  {/* Test Button */}
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                    <button
                      onClick={handleTest}
                      className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <Play className="w-5 h-5" />
                      Test Voice Alert
                    </button>
                    <p className="text-white/60 text-sm mt-2 text-center">
                      Click to hear a test message with your current settings
                    </p>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[#1a1a2e]/95 backdrop-blur-lg border-t border-white/20 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

