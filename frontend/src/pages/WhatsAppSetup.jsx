import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { 
  QrCode, 
  Send, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  WifiOff, 
  Power, 
  Loader2, 
  PhoneCall, 
  CheckSquare
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const WhatsAppSetup = () => {
  const [waState, setWaState] = useState({ status: 'DISCONNECTED', qrCode: null, error: null });
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Test message form state
  const [testRecipient, setTestRecipient] = useState('');
  const [testMessage, setTestMessage] = useState('Hello from TaskUpdater! WhatsApp notification service is fully online.');
  const [sendingTest, setSendingTest] = useState(false);

  const pollIntervalRef = useRef(null);

  const fetchStatus = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const data = await api.get('/whatsapp/status');
      setWaState(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to query WhatsApp connection status.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch immediately on mount
    fetchStatus(true);

    // Setup polling every 4 seconds to catch QR updates or authenticated events
    pollIntervalRef.current = setInterval(() => {
      fetchStatus(false);
    }, 4000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handleConnect = async () => {
    setStarting(true);
    const toastId = toast.loading('Spinning up WhatsApp client...');
    try {
      const res = await api.post('/whatsapp/connect');
      setWaState(res.status);
      toast.success('WhatsApp service initialized. Waiting for QR code...', { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to start WhatsApp client.', { id: toastId });
    } finally {
      setStarting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect and clear WhatsApp auth session tokens?')) return;

    setDisconnecting(true);
    const toastId = toast.loading('Clearing credentials...');
    try {
      const res = await api.post('/whatsapp/disconnect');
      setWaState(res.status);
      toast.success('WhatsApp client disconnected and reset.', { id: toastId });
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to disconnect WhatsApp client.', { id: toastId });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSendTest = async (e) => {
    e.preventDefault();
    if (!testRecipient) {
      toast.error('Please enter a recipient WhatsApp number or Group JID.');
      return;
    }

    setSendingTest(true);
    const toastId = toast.loading('Sending test transmission...');
    try {
      await api.post('/whatsapp/send-test', {
        recipient: testRecipient,
        message: testMessage
      });
      toast.success('Test transmission delivered successfully!', { id: toastId });
      setTestRecipient('');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Failed to deliver test transmission.', { id: toastId });
    } finally {
      setSendingTest(false);
    }
  };

  // Helper to autofill default Group JID from env or typical config
  const autofillGroupJid = () => {
    setTestRecipient('120363200000000000@g.us');
    toast.success('Group JID autofilled! Customize with your real group JID.');
  };

  const renderStatusPanel = () => {
    switch (waState.status) {
      case 'READY':
        return (
          <div className="flex flex-col items-center justify-center p-8 bg-green-500/10 border border-green-500/20 rounded-2xl shadow-lg shadow-green-500/5 animate-fade-in text-center max-w-lg mx-auto">
            <CheckCircle2 className="w-16 h-16 text-green-400 mb-4 animate-bounce-slow" />
            <h3 className="text-xl font-bold text-white mb-2">WhatsApp Client is Active</h3>
            <p className="text-sm text-zinc-400 max-w-sm mb-6">
              The service is connected, authenticated, and broadcasting automated task reports perfectly!
            </p>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="btn-danger w-full py-2.5 flex items-center justify-center gap-2"
            >
              {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
              Disconnect WhatsApp Session
            </button>
          </div>
        );

      case 'QR_RECEIVED':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center max-w-3xl mx-auto bg-darkbg-900/40 p-8 rounded-2xl border border-zinc-800 animate-fade-in">
            {/* QR display */}
            <div className="flex flex-col items-center justify-center p-5 bg-white rounded-2xl border-4 border-primary/20 shadow-glow relative">
              {waState.qrCode ? (
                <QRCodeSVG 
                  value={waState.qrCode} 
                  size={240} 
                  level="H" 
                  includeMargin={true}
                />
              ) : (
                <div className="w-[240px] h-[240px] bg-zinc-950/20 rounded flex items-center justify-center">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                </div>
              )}
              <span className="text-[10px] text-zinc-500 font-semibold uppercase mt-3 tracking-widest block">Scan with WhatsApp App</span>
            </div>

            {/* Instruction details */}
            <div className="flex flex-col">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <QrCode className="w-5 h-5 text-primary" />
                Pair WhatsApp Service
              </h3>
              <ol className="space-y-3.5 text-sm text-zinc-400 pl-4 list-decimal font-medium">
                <li>Open your smartphone WhatsApp Application.</li>
                <li>Tap <strong className="text-zinc-200">Menu</strong> or <strong className="text-zinc-200">Settings</strong> (⚙️ icon).</li>
                <li>Select <strong className="text-zinc-200">Linked Devices</strong>.</li>
                <li>Tap <strong className="text-zinc-200">Link a Device</strong> and point your camera at the screen to scan.</li>
              </ol>

              <div className="mt-8 pt-6 border-t border-zinc-800/80 flex justify-between items-center text-xs">
                <span className="text-zinc-500 font-medium">Auto-polling active...</span>
                <button
                  onClick={handleDisconnect}
                  className="text-red-400 hover:text-red-300 font-semibold underline flex items-center gap-1"
                >
                  Reset Pairing
                </button>
              </div>
            </div>
          </div>
        );

      case 'INITIALIZING':
      case 'AUTHENTICATED':
        return (
          <div className="flex flex-col items-center justify-center p-12 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl max-w-lg mx-auto text-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
            <h3 className="text-lg font-bold text-white mb-1.5 capitalize">WhatsApp State: {waState.status.toLowerCase()}</h3>
            <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
              Waiting for backend Chromium server nodes to boot, log-in, and sync authentication states. This should take just a few seconds...
            </p>
          </div>
        );

      case 'FAILED':
        return (
          <div className="flex flex-col items-center justify-center p-8 bg-red-500/10 border border-red-500/20 rounded-2xl max-w-lg mx-auto text-center animate-fade-in">
            <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">WhatsApp Service Crash</h3>
            <p className="text-xs text-red-400 bg-red-950/20 border border-red-900/30 rounded-xl px-4 py-3 font-mono leading-relaxed mb-6 select-all">
              Error code: {waState.error || 'Puppeteer launch failure'}
            </p>
            <button
              onClick={handleConnect}
              disabled={starting}
              className="btn-primary w-full py-2.5"
            >
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Re-initialize Service
            </button>
          </div>
        );

      case 'DISCONNECTED':
      default:
        return (
          <div className="flex flex-col items-center justify-center p-8 bg-zinc-900/30 border border-zinc-800 rounded-2xl max-w-lg mx-auto text-center">
            <WifiOff className="w-14 h-14 text-zinc-600 mb-4" />
            <h3 className="text-lg font-bold text-zinc-300 mb-1">WhatsApp is Unpaired</h3>
            <p className="text-sm text-zinc-500 max-w-sm mb-6 leading-relaxed">
              The daily report auto-broadcast systems are currently offline. Pair a WhatsApp account to start sending messages.
            </p>
            <button
              onClick={handleConnect}
              disabled={starting}
              className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-sm shadow-primary/10 hover:shadow-primary/20"
            >
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
              Initialize WhatsApp Client
            </button>
          </div>
        );
    }
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto h-screen animate-fade-in">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white font-sans">
            WhatsApp <span className="gradient-text font-bold">Pairing Center</span>
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            Configure automated daily reports delivery. Connect WhatsApp Web nodes using dynamic QR scan pairing.
          </p>
        </div>

        <button
          onClick={() => fetchStatus(true)}
          disabled={loading}
          className="btn-secondary py-2 px-3 text-xs flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Force Sync
        </button>
      </div>

      {loading ? (
        <div className="glass-card p-16 flex flex-col items-center justify-center text-zinc-500 gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <span>Synchronizing pairing state...</span>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Main Status Panel */}
          {renderStatusPanel()}

          {/* Test Transmission Suite - Available only when paired */}
          {waState.status === 'READY' && (
            <div className="glass-card p-8 max-w-2xl mx-auto border-zinc-800/80 animate-slide-up">
              <h3 className="text-base font-bold text-white mb-5 flex items-center gap-2">
                <Send className="w-5 h-5 text-primary" />
                Send Test Transmission
              </h3>

              <form onSubmit={handleSendTest} className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Recipient Number or Group JID
                    </label>
                    <button 
                      type="button"
                      onClick={autofillGroupJid}
                      className="text-[10px] text-primary hover:text-primary-light font-semibold underline"
                    >
                      Autofill Seed Group JID
                    </button>
                  </div>
                  <div className="relative">
                    <PhoneCall className="absolute left-4 top-3.5 w-5 h-5 text-zinc-500" />
                    <input
                      type="text"
                      value={testRecipient}
                      onChange={(e) => setTestRecipient(e.target.value)}
                      placeholder="e.g. +123456789 or 120363200000000000@g.us"
                      className="input-field pl-12"
                      required
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500 mt-1.5 block leading-normal">
                    Enter a direct number with international country code (e.g. <code>+14155552671</code>) or a valid WhatsApp Group JID (e.g. <code>120363200000000000@g.us</code>).
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                    Message Body
                  </label>
                  <textarea
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    rows="3"
                    className="input-field text-sm resize-none"
                    required
                  ></textarea>
                </div>

                <button
                  type="submit"
                  disabled={sendingTest}
                  className="btn-primary w-full py-3.5 text-sm font-semibold flex items-center justify-center gap-2 shadow-primary/10 hover:shadow-primary/20"
                >
                  {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Dispatch Test Transmission
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default WhatsAppSetup;
