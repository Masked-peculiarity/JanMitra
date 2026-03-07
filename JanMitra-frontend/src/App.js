import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Mic, MicOff, Send, Upload, Bot, Volume2, Paperclip, VolumeX } from 'lucide-react';
import './App.css';

const API = process.env.REACT_APP_API_BASE;

const SERVICES = {
  income_certificate: { english: 'Income Certificate', telugu: 'ఆదాయ ధృవీకరణ పత్రం', hindi: 'आय प्रमाण पत्र' },
  caste_certificate:  { english: 'Caste Certificate',  telugu: 'కులధృవీకరణ పత్రం',    hindi: 'जाति प्रमाण पत्र' },
  ration_card:        { english: 'Ration Card',        telugu: 'రేషన్ కార్డ్',           hindi: 'राशन कार्ड' },
  voter_id:           { english: 'Voter ID Card',      telugu: 'ఓటర్ ఐడీ కార్డ్',       hindi: 'मतदाता पहचान पत्र' },
  pan_card:           { english: 'PAN Card',           telugu: 'పాన్ కార్డ్',            hindi: 'पैन कार्ड' },
};

const LANG_CODES = { english: 'en', telugu: 'te', hindi: 'hi' };
const LANG_SR    = { english: 'en-IN', telugu: 'te-IN', hindi: 'hi-IN' };

const UI = {
  english: {
    title: 'JanMitra AI', sub: 'Your Civic Guidance Assistant',
    placeholder: 'Ask about any government service...',
    send: 'Send', listening: 'Listening...', thinking: 'Thinking...',
    uploadHint: 'Upload a document to verify',
    docType: 'Document type',
    speak: 'Listen', stop: 'Stop',
    docs: 'Required Documents', mistakes: 'Common Mistakes',
    office: 'Nearest Office', maps: 'Open in Google Maps',
    greeting: 'Hello! I am JanMitra AI. I can help you with government services in Hyderabad. Select a language and ask me anything — or choose a service below.',
  },
  telugu: {
    title: 'జన్‌మిత్ర AI', sub: 'మీ పౌర మార్గదర్శి',
    placeholder: 'ప్రభుత్వ సేవ గురించి అడగండి...',
    send: 'పంపు', listening: 'వింటోంది...', thinking: 'ఆలోచిస్తోంది...',
    uploadHint: 'పత్రాన్ని ధృవీకరించడానికి అప్‌లోడ్ చేయండి',
    docType: 'పత్రం రకం',
    speak: 'వినండి', stop: 'ఆపు',
    docs: 'అవసరమైన పత్రాలు', mistakes: 'సాధారణ తప్పులు',
    office: 'సమీప కార్యాలయం', maps: 'గూగుల్ మ్యాప్స్‌లో తెరవండి',
    greeting: 'నమస్కారం! నేను జన్‌మిత్ర AI. హైదరాబాద్‌లో ప్రభుత్వ సేవలకు సంబంధించిన సమాచారం ఇవ్వగలను. దిగువ సేవను ఎంచుకోండి లేదా మీ ప్రశ్న అడగండి.',
  },
  hindi: {
    title: 'जनमित्र AI', sub: 'आपका नागरिक मार्गदर्शक',
    placeholder: 'सरकारी सेवा के बारे में पूछें...',
    send: 'भेजें', listening: 'सुन रहा है...', thinking: 'सोच रहा है...',
    uploadHint: 'दस्तावेज़ सत्यापित करने के लिए अपलोड करें',
    docType: 'दस्तावेज़ प्रकार',
    speak: 'सुनें', stop: 'रोकें',
    docs: 'आवश्यक दस्तावेज', mistakes: 'सामान्य गलतियां',
    office: 'निकटतम कार्यालय', maps: 'Google Maps में खोलें',
    greeting: 'नमस्ते! मैं जनमित्र AI हूं। हैदराबाद में सरकारी सेवाओं के बारे में जानकारी दे सकता हूं। नीचे सेवा चुनें या अपना प्रश्न पूछें।',
  }
};

// ════════════════════════════════════════════════════════════
//  TTS ENGINE — Google Translate TTS (no API key, no install)
//  Works for Telugu, Hindi, English without browser voices
// ════════════════════════════════════════════════════════════

let currentAudio  = null;   // track active Audio object
let stopRequested = false;  // flag to abort chunk loop

// Call once on any user click to unlock audio autoplay
let audioContextUnlocked = false;
function unlockAudio() {
  if (audioContextUnlocked) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
    // Play a silent base64 WAV — satisfies HTML Audio autoplay policy
    const silent = new Audio(
      'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'
    );
    silent.play().catch(() => {});
    audioContextUnlocked = true;
    console.log('Audio unlocked');
  } catch (e) {
    console.warn('Audio unlock failed:', e);
  }
}

function stopAllSpeech() {
  stopRequested = true;
  window.speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
}

// Split text into speakable chunks ≤150 chars
function chunkText(text) {
  const raw = text
    .split(/(?<=[।.!?])\s+|\n/)
    .map(s => s.trim())
    .filter(Boolean);

  const chunks = [];
  for (const sentence of raw) {
    if (sentence.length <= 150) {
      chunks.push(sentence);
    } else {
      const parts = sentence.split(/,\s+/);
      let current = '';
      for (const part of parts) {
        if (current && (current + ', ' + part).length > 150) {
          chunks.push(current.trim());
          current = part;
        } else {
          current = current ? current + ', ' + part : part;
        }
      }
      if (current) chunks.push(current.trim());
    }
  }
  return chunks;
}

// Play one chunk via Google Translate TTS
function playGoogleTTS(text, langCode, retryCount = 0) {
  return new Promise((resolve) => {
    const url =
      `https://translate.googleapis.com/translate_tts?ie=UTF-8` +
      `&q=${encodeURIComponent(text)}&tl=${langCode}&client=tw-ob&ttsspeed=0.9`;

    const audio = new Audio();
    currentAudio = audio;
    audio.crossOrigin = 'anonymous';

    const timer = setTimeout(() => {
      console.warn('Google TTS timeout:', text.substring(0, 40));
      currentAudio = null;
      resolve(false);
    }, 6000);

    audio.addEventListener('ended', () => {
      clearTimeout(timer);
      currentAudio = null;
      resolve(true);
    });

    audio.addEventListener('error', () => {
      clearTimeout(timer);
      currentAudio = null;
      resolve(false);
    });

    audio.src = url;

    audio.play()
      .catch(async (err) => {
        clearTimeout(timer);
        currentAudio = null;

        // Autoplay blocked — retry once after short delay
        if (retryCount === 0 && err.name === 'NotAllowedError') {
          console.warn('Autoplay blocked, retrying in 300ms...');
          await new Promise(r => setTimeout(r, 300));
          const retryResult = await playGoogleTTS(text, langCode, 1);
          resolve(retryResult);
        } else {
          console.warn('Google TTS play failed:', err.message);
          resolve(false);
        }
      });
  });
}

// Fallback: browser TTS (works for English, partial for Hindi)
function playBrowserTTS(text, langCode) {
  return new Promise((resolve) => {
    const u   = new SpeechSynthesisUtterance(text);
    u.lang    = langCode + '-IN';
    u.rate    = 0.85;
    u.pitch   = 1;

    const voices = window.speechSynthesis.getVoices();
    const voice  =
      voices.find(v => v.lang === langCode + '-IN') ||
      voices.find(v => v.lang.startsWith(langCode))  ||
      voices.find(v => v.lang.startsWith('en'));
    if (voice) u.voice = voice;

    u.onend   = () => resolve(true);
    u.onerror = () => resolve(false);
    setTimeout(() => resolve(false), 8000);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });
}

// Main speak function — called from component
// setIsSpeaking: React state setter, passed in so this stays outside component
async function speakText(text, language, setIsSpeaking) {
  if (!text) return;
  stopAllSpeech();
  stopRequested = false;

  const ttsLang = LANG_CODES[language] || 'en';
  const chunks  = chunkText(text);
  console.log('TTS chunks:', chunks.length, '| lang:', ttsLang);

  if (setIsSpeaking) setIsSpeaking(true);

  for (const chunk of chunks) {
    if (stopRequested || !chunk) break;
    const googleOk = await playGoogleTTS(chunk, ttsLang);
    if (!googleOk && !stopRequested) {
      await playBrowserTTS(chunk, ttsLang);
    }
    // Small gap between chunks for natural rhythm
    if (!stopRequested) await new Promise(r => setTimeout(r, 80));
  }

  if (setIsSpeaking) setIsSpeaking(false);
}

// ════════════════════════════════════════════════════════════
//  APP COMPONENT
// ════════════════════════════════════════════════════════════
export default function App() {
  const [lang, setLang]               = useState('english');
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState('');
  const [service, setService]         = useState('');
  const [loading, setLoading]         = useState(false);
  const [isRec, setIsRec]             = useState(false);
  const [isSpeaking, setIsSpeaking]   = useState(false);
  const [docType, setDocType]         = useState('aadhaar');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult, setUploadResult]   = useState(null);

  const chatEndRef = useRef(null);
  const recRef     = useRef(null);
  const t = UI[lang];

  // ── Unlock audio on first click anywhere ─────────────────
  useEffect(() => {
    document.addEventListener('click', unlockAudio, { once: true });
    return () => document.removeEventListener('click', unlockAudio);
  }, []);

  // ── Greeting message on language change ──────────────────
  useEffect(() => {
    stopAllSpeech();
    setIsSpeaking(false);
    setMessages([{
      id: Date.now(),
      role: 'bot', type: 'greeting',
      text: UI[lang].greeting, lang
    }]);
  }, [lang]);

  // ── Auto scroll chat to bottom ───────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function addMessage(msg) {
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), ...msg }]);
  }

  // ── Handle send ───────────────────────────────────────────
  async function handleSend() {
    const text = input.trim();
    if (!text && !service) return;
    if (loading) return;

    // Unlock audio — this IS a direct user gesture so it works
    unlockAudio();

    const userText = text || SERVICES[service]?.[lang] || service;
    addMessage({ role: 'user', type: 'text', text: userText });
    setInput('');
    setLoading(true);

    let serviceId = service;
    if (!serviceId) {
      const lower = text.toLowerCase();
      if      (lower.match(/income|ఆదాయ|आय/))        serviceId = 'income_certificate';
      else if (lower.match(/caste|కుల|जाति/))          serviceId = 'caste_certificate';
      else if (lower.match(/ration|రేషన్|राशन/))       serviceId = 'ration_card';
      else if (lower.match(/voter|ఓటర్|मतदाता/))       serviceId = 'voter_id';
      else if (lower.match(/pan/i))                   serviceId = 'pan_card';
    }

    if (!serviceId) {
      addMessage({
        role: 'bot', type: 'text', lang,
        text: lang === 'telugu'
          ? 'దయచేసి సేవను ఎంచుకోండి లేదా సేవ పేరు చెప్పండి (ఉదా: ఆదాయ ధృవీకరణ పత్రం)'
          : lang === 'hindi'
          ? 'कृपया सेवा चुनें या सेवा का नाम बताएं (जैसे: आय प्रमाण पत्र)'
          : 'Please select a service or mention the service name (e.g. Income Certificate)',
      });
      setLoading(false);
      return;
    }

    try {
      let userLat = null, userLon = null;
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }));
        userLat = pos.coords.latitude;
        userLon = pos.coords.longitude;
      } catch {}

      const { data } = await axios.post(`${API}/service-info`, {
        serviceId, language: lang,
        userQuestion: text || null,
        userLat, userLon
      });

      addMessage({
        role: 'bot', type: 'service', lang,
        text: data.aiReply,
        service: data.service,
        nearestOffice: data.nearestOffice,
      });

      // Auto-speak — works because AudioContext was unlocked on Send click
      if (data.aiReply) {
        speakText(data.aiReply, lang, setIsSpeaking);
      }

    } catch (err) {
      addMessage({
        role: 'bot', type: 'error', lang,
        text: 'Error: ' + (err.response?.data?.error || err.message),
      });
    }
    setLoading(false);
  }

  // ── Voice input ───────────────────────────────────────────
  function toggleVoice() {
    unlockAudio(); // mic button is a user gesture too

    if (isRec) {
      recRef.current?.stop();
      setIsRec(false);
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Please use Chrome browser for voice input.'); return; }

    const r = new SR();
    r.lang            = LANG_SR[lang] || 'en-IN';
    r.continuous      = false;
    r.interimResults  = false;
    r.maxAlternatives = 3;

    r.onstart  = () => setIsRec(true);
    r.onend    = () => setIsRec(false);

    r.onresult = (e) => {
      const transcripts = Array.from(e.results[0]).map(a => a.transcript.toLowerCase());
      const allText     = transcripts.join(' ');
      console.log('Voice heard:', transcripts);
      setInput(transcripts[0]);

      // Auto detect language from Unicode script
      if      (/[\u0C00-\u0C7F]/.test(transcripts[0])) setLang('telugu');
      else if (/[\u0900-\u097F]/.test(transcripts[0])) setLang('hindi');

      // Auto match service
      if      (allText.match(/income|ఆదాయ|आय/))        setService('income_certificate');
      else if (allText.match(/caste|కుల|జాతి|जाति/))    setService('caste_certificate');
      else if (allText.match(/ration|రేషన్|राशन/))       setService('ration_card');
      else if (allText.match(/voter|ఓటర్|मतदाता/))       setService('voter_id');
      else if (allText.match(/pan/i))                   setService('pan_card');
    };

    r.onerror = (e) => {
      setIsRec(false);
      if (e.error === 'not-allowed') alert('Allow microphone access in browser settings.');
      else if (e.error === 'no-speech') alert('No speech detected. Try again.');
    };

    r.start();
    recRef.current = r;
  }

  // ── Document upload ───────────────────────────────────────
  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    unlockAudio(); // file picker interaction counts as user gesture

    addMessage({ role: 'user', type: 'upload', text: file.name, lang });
    setUploadLoading(true);

    try {
      const { data: { uploadUrl, s3Key } } = await axios.post(`${API}/upload-url`, {
        fileName: file.name,
        fileType: file.type || 'image/jpeg'
      });

      await axios.put(uploadUrl, file, {
        headers: { 'Content-Type': file.type || 'image/jpeg' }
      });

      // Wait for S3 consistency
      await new Promise(r => setTimeout(r, 1500));

      const { data } = await axios.post(`${API}/process-document`, {
        s3Key, documentType: docType, language: lang
      });

      setUploadResult(data);

      const insight = data.aiInsight || buildDocumentInsight(data, lang);

      addMessage({
        role: 'bot', type: 'document', lang,
        docResult: data, text: insight,
      });

      // Auto-speak document insight
      speakText(insight, lang, setIsSpeaking);

    } catch (err) {
      addMessage({ role: 'bot', type: 'error', lang, text: 'Upload failed: ' + err.message });
    }

    setUploadLoading(false);
    e.target.value = '';
  }

  // ── Build fallback insight (used if Lambda doesn't return aiInsight) ──
  function buildDocumentInsight(data, language) {
    if (language === 'telugu') {
      if (!data.isValid) return `పత్రం సమస్యలు: ${data.issues?.join('. ') || data.message}`;
      return `✅ ${data.detectedType?.toUpperCase()} పత్రం గుర్తించబడింది.${data.detectedName ? ' పేరు: ' + data.detectedName + '.' : ''}${data.addressInHyderabad ? ' హైదరాబాద్ చిరునామా ధృవీకరించబడింది.' : data.addressInHyderabad === false ? ' ⚠️ చిరునామా హైదరాబాద్ వెలుపల.' : ''} స్పష్టత: ${data.confidence}%.`;
    }
    if (language === 'hindi') {
      if (!data.isValid) return `दस्तावेज़ समस्याएं: ${data.issues?.join('. ') || data.message}`;
      return `✅ ${data.detectedType?.toUpperCase()} पहचाना गया।${data.detectedName ? ' नाम: ' + data.detectedName + '.' : ''}${data.addressInHyderabad ? ' हैदराबाद पता सत्यापित।' : data.addressInHyderabad === false ? ' ⚠️ पता हैदराबाद से बाहर।' : ''} स्पष्टता: ${data.confidence}%.`;
    }
    if (!data.isValid) return `Document issues: ${data.issues?.join('. ') || data.message}`;
    return `✅ ${data.detectedType?.toUpperCase()} detected.${data.detectedName ? ' Name: ' + data.detectedName + '.' : ''}${data.addressInHyderabad ? ' Hyderabad address confirmed.' : data.addressInHyderabad === false ? ' ⚠️ Address outside Hyderabad.' : ''} Clarity: ${data.confidence}%.`;
  }

  // ── Speak button handler ──────────────────────────────────
  function handleSpeak(text, msgLang) {
    if (isSpeaking) {
      stopAllSpeech();
      setIsSpeaking(false);
    } else {
      speakText(text, msgLang, setIsSpeaking);
    }
  }

  // ── Single chat message renderer ─────────────────────────
  function ChatMessage({ msg }) {
    const isBot = msg.role === 'bot';

    return (
      <div className={`msg-row ${isBot ? 'bot-row' : 'user-row'}`}>
        {isBot && <div className='avatar bot-avatar'><Bot size={18} /></div>}

        <div className={`bubble ${isBot ? 'bot-bubble' : 'user-bubble'}`}>

          {/* Plain text / greeting / error */}
          {(msg.type === 'text' || msg.type === 'greeting' || msg.type === 'error') && (
            <p className='bubble-text'>{msg.text}</p>
          )}

          {/* User file upload */}
          {msg.type === 'upload' && (
            <p className='bubble-text'><Paperclip size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />{msg.text}</p>
          )}

          {/* Service info response */}
          {msg.type === 'service' && (
            <div>
              {msg.text && <p className='bubble-text ai-reply'>{msg.text}</p>}

              {msg.service && (
                <div className='service-details'>
                  <div className='detail-section'>
                    <div className='detail-title'>📄 {UI[msg.lang]?.docs || 'Required Documents'}</div>
                    <ol className='detail-list'>
                      {msg.service.requiredDocuments?.map((d, i) => <li key={i}>{d}</li>)}
                    </ol>
                    <div className='detail-meta'>
                      <span>🕐 {msg.service.processingDays}</span>
                      <span>💰 {msg.service.fees}</span>
                    </div>
                  </div>

                  <div className='detail-section warn-section'>
                    <div className='detail-title'>⚠️ {UI[msg.lang]?.mistakes || 'Common Mistakes'}</div>
                    <ul className='detail-list'>
                      {msg.service.commonMistakes?.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>

                  {msg.nearestOffice && (
                    <div className='detail-section office-section'>
                      <div className='detail-title'>🏢 {UI[msg.lang]?.office || 'Nearest Office'}: {msg.nearestOffice.officeName}</div>
                      <p>📍 {msg.nearestOffice.address}</p>
                      <p>📞 {msg.nearestOffice.contactNumber}</p>
                      <p>🕐 {msg.nearestOffice.timings}</p>
                      <a href={msg.nearestOffice.mapsLink} target='_blank' rel='noreferrer'>
                        <button className='maps-btn'>🗺️ {UI[msg.lang]?.maps || 'Open in Google Maps'}</button>
                      </a>
                    </div>
                  )}
                </div>
              )}

              <button className='speak-btn' onClick={() => handleSpeak(msg.text, msg.lang)}>
                {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
                <span>{isSpeaking ? (UI[msg.lang]?.stop || 'Stop') : (UI[msg.lang]?.speak || 'Listen')}</span>
              </button>
            </div>
          )}

          {/* Document verification result */}
          {msg.type === 'document' && (
            <div>
              <p className='bubble-text ai-reply'>{msg.text}</p>

              {msg.docResult && (
                <div className='doc-result'>
                  <div className={`doc-status ${msg.docResult.isValid ? 'valid' : 'invalid'}`}>
                    {msg.docResult.isValid ? '✅ Verified' : '❌ Issues Found'}
                  </div>

                  <table className='doc-table'>
                    <tbody>
                      {msg.docResult.detectedType && (
                        <tr>
                          <td>📋 Document Type</td>
                          <td><strong>{msg.docResult.detectedType.toUpperCase()}</strong></td>
                        </tr>
                      )}
                      {msg.docResult.detectedName && (
                        <tr>
                          <td>👤 Name Detected</td>
                          <td><strong>{msg.docResult.detectedName}</strong></td>
                        </tr>
                      )}
                      {msg.docResult.detectedAddress && (
                        <tr>
                          <td>📍 Address Detected</td>
                          <td>{msg.docResult.detectedAddress}</td>
                        </tr>
                      )}
                      {msg.docResult.addressInHyderabad !== null && msg.docResult.addressInHyderabad !== undefined && (
                        <tr>
                          <td>🏙️ Hyderabad Address</td>
                          <td>
                            {msg.docResult.addressInHyderabad
                              ? <span className='tag green'>✅ Yes</span>
                              : <span className='tag red'>⚠️ No — may cause rejection</span>}
                          </td>
                        </tr>
                      )}
                      {msg.docResult.confidence > 0 && (
                        <tr>
                          <td>📊 Clarity</td>
                          <td>
                            <div className='confidence-bar'>
                              <div className='confidence-fill' style={{
                                width: msg.docResult.confidence + '%',
                                background: msg.docResult.confidence > 80 ? '#16a34a'
                                          : msg.docResult.confidence > 60 ? '#d97706' : '#dc2626'
                              }} />
                            </div>
                            <span>{msg.docResult.confidence}%</span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {msg.docResult.issues?.length > 0 && (
                    <div className='doc-issues'>
                      {msg.docResult.issues.map((issue, i) => (
                        <p key={i} className='issue-item'>⚠️ {issue}</p>
                      ))}
                    </div>
                  )}

                  {msg.docResult.reminder && (
                    <p className='doc-reminder'>💡 {msg.docResult.reminder}</p>
                  )}
                </div>
              )}

              <button className='speak-btn' onClick={() => handleSpeak(msg.text, msg.lang)}>
                {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
                <span>{isSpeaking ? (UI[msg.lang]?.stop || 'Stop') : (UI[msg.lang]?.speak || 'Listen')}</span>
              </button>
            </div>
          )}
        </div>

        {!isBot && <div className='avatar user-avatar'>👤</div>}
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────
  return (
    <div className='app'>

      {/* HEADER */}
      <header className='header'>
        <div className='header-text'>
          <h1>{t.title}</h1>
          <p>{t.sub}</p>
        </div>
        <div className='lang-btns'>
          {Object.entries({ english: 'English', telugu: 'తెలుగు', hindi: 'हिंदी' }).map(([k, v]) => (
            <button key={k}
              onClick={() => { setLang(k); setService(''); }}
              className={lang === k ? 'lang-btn active' : 'lang-btn'}>
              {v}
            </button>
          ))}
        </div>
      </header>

      {/* ── CHAT SECTION ── */}
      <div className='chat-section'>

        <div className='chat-window'>
          {messages.map(msg => <ChatMessage key={msg.id} msg={msg} />)}

          {/* Typing indicator */}
          {(loading || uploadLoading) && (
            <div className='msg-row bot-row'>
              <div className='avatar bot-avatar'><Bot size={18} /></div>
              <div className='bubble bot-bubble typing'>
                <span /><span /><span />
              </div>
            </div>
          )}

          {/* Speaking indicator */}
          {isSpeaking && (
            <div className='speaking-indicator'>
              <Volume2 size={14} />
              {lang === 'telugu' ? 'మాట్లాడుతోంది...' : lang === 'hindi' ? 'बोल रहा है...' : 'Speaking...'}
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Quick service chips */}
        <div className='quick-services'>
          {Object.entries(SERVICES).map(([id, names]) => (
            <button key={id}
              onClick={() => setService(id)}
              className={service === id ? 'svc-chip active' : 'svc-chip'}>
              {names[lang]}
            </button>
          ))}
        </div>

        {/* Chat input bar */}
        <div className='input-bar'>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={isRec ? t.listening : t.placeholder}
            className='chat-input'
            disabled={loading}
          />
          <button onClick={toggleVoice}
            className={isRec ? 'icon-btn mic-btn active' : 'icon-btn mic-btn'}
            title='Voice input'>
            {isRec ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <button onClick={handleSend}
            disabled={loading || (!input.trim() && !service)}
            className='icon-btn send-btn'
            title='Send'>
            <Send size={20} />
          </button>
        </div>
      </div>

      {/* ── DIVIDER ── */}
      <div className='section-divider'>
        <Paperclip size={15} />
        <span>
          {lang === 'telugu' ? 'పత్రం ధృవీకరణ'
           : lang === 'hindi' ? 'दस्तावेज़ सत्यापन'
           : 'Document Verification'}
        </span>
      </div>

      {/* ── DOCUMENT UPLOAD SECTION ── */}
      <div className='upload-section'>

        {/* Doc type chips */}
        <div className='doc-type-row'>
          <span className='doc-type-label'>{t.docType}:</span>
          {['aadhaar', 'ration', 'pan', 'voter'].map(type => (
            <button key={type}
              onClick={() => setDocType(type)}
              className={docType === type ? 'type-chip active' : 'type-chip'}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>

        {/* Upload trigger */}
        <div className='upload-trigger-row'>
          <input type='file' id='doc-upload' accept='image/jpeg,image/png'
            onChange={handleUpload} style={{ display: 'none' }} />
          <label htmlFor='doc-upload' className='upload-lbl'>
            <Upload size={17} />
            <span>{t.uploadHint}</span>
          </label>
          {uploadLoading && (
            <div className='upload-status-inline'>
              <span className='spinner' />
              {lang === 'telugu' ? 'విశ్లేషిస్తోంది...' : lang === 'hindi' ? 'विश्लेषण हो रहा है...' : 'Analysing...'}
            </div>
          )}
        </div>

        {/* Upload result panel */}
        {uploadResult && (
          <div className={`upload-result-panel ${uploadResult.isValid ? 'ok' : 'warn'}`}>
            <div className='result-banner'>
              <span className='result-icon'>{uploadResult.isValid ? '✅' : '❌'}</span>
              <span className='result-summary'>{uploadResult.message}</span>
              <button className='speak-btn' onClick={() => handleSpeak(uploadResult.message, lang)}>
                {isSpeaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            </div>

            <table className='doc-table'>
              <tbody>
                {uploadResult.detectedType && (
                  <tr>
                    <td>📋 {lang === 'telugu' ? 'పత్రం రకం' : lang === 'hindi' ? 'दस्तावेज़ प्रकार' : 'Document Type'}</td>
                    <td><strong>{uploadResult.detectedType.toUpperCase()}</strong></td>
                  </tr>
                )}
                {uploadResult.detectedName && (
                  <tr>
                    <td>👤 {lang === 'telugu' ? 'గుర్తించిన పేరు' : lang === 'hindi' ? 'पहचाना गया नाम' : 'Detected Name'}</td>
                    <td><strong>{uploadResult.detectedName}</strong></td>
                  </tr>
                )}
                {uploadResult.detectedAddress && (
                  <tr>
                    <td>📍 {lang === 'telugu' ? 'గుర్తించిన చిరునామా' : lang === 'hindi' ? 'पहचाना गया पता' : 'Detected Address'}</td>
                    <td>{uploadResult.detectedAddress}</td>
                  </tr>
                )}
                {uploadResult.addressInHyderabad !== null && uploadResult.addressInHyderabad !== undefined && (
                  <tr>
                    <td>🏙️ {lang === 'telugu' ? 'హైదరాబాద్ చిరునామా' : lang === 'hindi' ? 'हैदराबाद पता' : 'Hyderabad Address'}</td>
                    <td>
                      {uploadResult.addressInHyderabad
                        ? <span className='tag green'>✅ {lang === 'telugu' ? 'అవును' : lang === 'hindi' ? 'हाँ' : 'Yes'}</span>
                        : <span className='tag red'>⚠️ {lang === 'telugu' ? 'కాదు — తిరస్కరించబడవచ్చు' : lang === 'hindi' ? 'नहीं — अस्वीकृत हो सकता है' : 'No — may be rejected'}</span>
                      }
                    </td>
                  </tr>
                )}
                {uploadResult.confidence > 0 && (
                  <tr>
                    <td>📊 {lang === 'telugu' ? 'స్పష్టత' : lang === 'hindi' ? 'स्पष्टता' : 'Clarity'}</td>
                    <td>
                      <div className='confidence-bar'>
                        <div className='confidence-fill' style={{
                          width: uploadResult.confidence + '%',
                          background: uploadResult.confidence > 80 ? '#16a34a'
                                    : uploadResult.confidence > 60 ? '#d97706' : '#dc2626'
                        }} />
                      </div>
                      <span>{uploadResult.confidence}%</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {uploadResult.issues?.length > 0 && (
              <div className='doc-issues'>
                {uploadResult.issues.map((issue, i) => (
                  <p key={i} className='issue-item'>⚠️ {issue}</p>
                ))}
              </div>
            )}

            {uploadResult.reminder && (
              <p className='doc-reminder'>💡 {uploadResult.reminder}</p>
            )}

            <button className='clear-btn' onClick={() => setUploadResult(null)}>
              {lang === 'telugu' ? 'క్లియర్' : lang === 'hindi' ? 'साफ़ करें' : 'Clear'}
            </button>
          </div>
        )}
      </div>

    </div>
  );
}