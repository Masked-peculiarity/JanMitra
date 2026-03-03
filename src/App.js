import { useState, useRef } from 'react';
import axios from 'axios';
import './App.css';
 
const API = process.env.REACT_APP_API_BASE;
 
const SERVICES = {
  income_certificate: { english:'Income Certificate', telugu:'ఆదాయ ధృవీకరణ పత్రం', hindi:'आय प्रमाण पत्र' },
  caste_certificate:  { english:'Caste Certificate',  telugu:'కులధృవీకరణ పత్రం',   hindi:'जाति प्रमाण पत्र' },
  ration_card:        { english:'Ration Card',        telugu:'రేషన్ కార్డ్',          hindi:'राशन कार्ड' },
  voter_id:           { english:'Voter ID Card',      telugu:'ఓటర్ ఐడీ కార్డ్',      hindi:'मतदाता पहचान पत्र' },
  pan_card:           { english:'PAN Card',           telugu:'పాన్ కార్డ్',           hindi:'पैन कार्ड' },
};
 
const UI = {
  english: { title:'JanMitra AI', sub:'Your Civic Guidance Assistant',
    pick:'Select a service', getInfo:'Get Information',
    orVoice:'Or speak:', startMic:'🎙 Start', stopMic:'⏹ Stop',
    docs:'Required Documents', mistakes:'Common Mistakes',
    office:'Nearest Office', maps:'Open in Google Maps',
    days:'Processing time', fees:'Fees',
    uploadTitle:'Upload Document for Verification',
    uploadBtn:'Choose Image or PDF', loading:'Loading...',
    typeLabel:'Document type:', speak:'🔊 Listen' },
  telugu: { title:'జన్‌మిత్ర AI', sub:'మీ పౌర మార్గదర్శి',
    pick:'సేవ ఎంచుకోండి', getInfo:'సమాచారం పొందండి',
    orVoice:'లేదా మాట్లాడండి:', startMic:'🎙 ప్రారంభించు', stopMic:'⏹ ఆపు',
    docs:'అవసరమైన పత్రాలు', mistakes:'సాధారణ తప్పులు',
    office:'సమీప కార్యాలయం', maps:'గూగుల్ మ్యాప్స్‌లో తెరవండి',
    days:'ప్రాసెసింగ్ సమయం', fees:'రుసుము',
    uploadTitle:'పత్రాన్ని ధృవీకరించండి',
    uploadBtn:'చిత్రం లేదా PDF ఎంచుకోండి', loading:'లోడ్ అవుతోంది...',
    typeLabel:'పత్రం రకం:', speak:'🔊 వినండి' },
  hindi: { title:'जनमित्र AI', sub:'आपका नागरिक मार्गदर्शक',
    pick:'सेवा चुनें', getInfo:'जानकारी पाएं',
    orVoice:'या बोलें:', startMic:'🎙 शुरू', stopMic:'⏹ रोकें',
    docs:'आवश्यक दस्तावेज', mistakes:'सामान्य गलतियां',
    office:'निकटतम कार्यालय', maps:'Google Maps में खोलें',
    days:'प्रसंस्करण समय', fees:'शुल्क',
    uploadTitle:'दस्तावेज़ सत्यापित करें',
    uploadBtn:'चित्र या PDF चुनें', loading:'लोड हो रहा है...',
    typeLabel:'दस्तावेज़ प्रकार:', speak:'🔊 सुनें' }
};
 
const LANGS = { english:'English', telugu:'తెలుగు', hindi:'हिंदी' };
 
export default function App() {
  const [lang, setLang]       = useState('english');
  const [uiLangSelected, setUiLangSelected] = useState(false);
  const [service, setService] = useState('');
  const [question, setQuestion]= useState('');
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [isRec, setIsRec]     = useState(false);
  const [docType, setDocType] = useState('aadhaar');
  const recRef = useRef(null);
  const t = UI[lang];
 
  async function handleGetInfo() {
    if (!service) return;
    setLoading(true); setResult(null);
    let userLat=null, userLon=null;
    try {
      const pos = await new Promise((res,rej)=>
        navigator.geolocation.getCurrentPosition(res,rej,{timeout:5000}));
      userLat=pos.coords.latitude; userLon=pos.coords.longitude;
    } catch {}
 
    try {
      const { data } = await axios.post(`${API}/service-info`,
        { serviceId:service, language:lang, userQuestion:question||null, userLat, userLon });
      setResult(data);
      if (data.aiReply) speakText(data.aiReply, lang);
    } catch(e) {
      alert('Error: '+(e.response?.data?.error||e.message));
    }
    setLoading(false);
  }
 
  function speakText(text, language) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = { english:'en-IN', telugu:'te-IN', hindi:'hi-IN' }[language] || 'en-IN';
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
  }
 
  function toggleVoice() {
    if (isRec) { recRef.current?.stop(); setIsRec(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert('Use Chrome for voice input'); return; }
    const r = new SR();
    
    r.continuous = true;
    r.interimResults = true;
    
    if (uiLangSelected || service) {
      r.lang = { english:'en-IN', telugu:'te-IN', hindi:'hi-IN' }[lang] || 'en-IN';
    } 

    r.onresult = e => {
      let fullTranscript = '';
      for (let i = 0; i < e.results.length; i++) {
        fullTranscript += e.results[i][0].transcript;
      }
      const heard = fullTranscript.toLowerCase();
      setQuestion(heard);
      
      if (!uiLangSelected && !service) {
        if (/[\\u0C00-\\u0C7F]/.test(heard)) setLang('telugu');
        else if (/[\\u0900-\\u097F]/.test(heard)) setLang('hindi');
        else if (/[a-z]/i.test(heard)) setLang('english');
      }

      // Auto-match service from voice
      if (heard.match(/income|ఆదాయ|आय/)) setService('income_certificate');
      else if (heard.match(/caste|కుల|जाति/)) setService('caste_certificate');
      else if (heard.match(/ration|రేషన్|राशन/)) setService('ration_card');
      else if (heard.match(/voter|ఓటర్|मतदाता/)) setService('voter_id');
      else if (heard.match(/pan/i)) setService('pan_card');
    };
    r.onend = () => setIsRec(false);
    r.start(); setIsRec(true); recRef.current=r;
  }
 
  async function handleUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    setUploadLoading(true); setUploadResult(null);
    try {
      const { data:{uploadUrl,s3Key} } = await axios.post(`${API}/upload-url`,
        {fileName:file.name, fileType:file.type});
      await axios.put(uploadUrl, file, {headers:{'Content-Type':file.type}});
      const { data } = await axios.post(`${API}/process-document`,
        {s3Key, documentType:docType});
      setUploadResult(data);
    } catch(e) {
      setUploadResult({isValid:false,message:'Upload error: '+e.message,issues:[]});
    }
    setUploadLoading(false);
  }
 
  return (
    <div className='app'>
      {/* HEADER */}
      <header>
        <div>
          <h1>{t.title}</h1>
          <p>{t.sub}</p>
        </div>
        <div className='lang-btns'>
          {Object.entries(LANGS).map(([k,v]) => (
            <button key={k} onClick={()=>{setLang(k);setUiLangSelected(true);setResult(null);setQuestion('');}}
              className={lang===k?'lang-btn active':'lang-btn'}>{v}</button>
          ))}
        </div>
      </header>
 
      <main>
        {/* QUESTION INPUT */}
        <div className='input-row'>
          <select value={service} onChange={e=>setService(e.target.value)} className='svc-select'>
            <option value=''>{t.pick}</option>
            {Object.entries(SERVICES).map(([id,names])=>(
              <option key={id} value={id}>{names[lang]}</option>
            ))}
          </select>
          <input value={question} onChange={e=>setQuestion(e.target.value)}
            placeholder={lang==='telugu'?'మీ ప్రశ్న ఇక్కడ టైప్ చేయండి...':lang==='hindi'?'यहाँ अपना प्रश्न टाइप करें...':'Type your question here (optional)...'}
            className='q-input'/>
          <button onClick={handleGetInfo} disabled={loading||!service} className='btn-go'>
            {loading?t.loading:t.getInfo}
          </button>
          <button onClick={toggleVoice} className={isRec?'btn-mic active':'btn-mic'}>
            {isRec?t.stopMic:t.startMic}
          </button>
        </div>
 
        {/* AI REPLY BUBBLE */}
        {result?.aiReply && (
          <div className='ai-bubble'>
            <div className='ai-avatar'>🤖</div>
            <div className='ai-text'>
              <p>{result.aiReply}</p>
              <button onClick={()=>speakText(result.aiReply,lang)} className='speak-btn'>{t.speak}</button>
            </div>
          </div>
        )}
 
        {result && (
          <div className='results'>
            {/* DOCUMENTS CARD */}
            <div className='card'>
              <div className='card-hdr blue'>📄 {t.docs}</div>
              <ol className='list'>{result.service.requiredDocuments.map((d,i)=><li key={i}>{d}</li>)}</ol>
              <div className='meta'>
                <span>🕐 {t.days}: {result.service.processingDays}</span>
                <span>💰 {t.fees}: {result.service.fees}</span>
              </div>
            </div>
 
            {/* MISTAKES CARD */}
            <div className='card'>
              <div className='card-hdr orange'>⚠️ {t.mistakes}</div>
              <ul className='list'>{result.service.commonMistakes.map((m,i)=><li key={i}>{m}</li>)}</ul>
            </div>
 
            {/* OFFICE CARD */}
            {result.nearestOffice && (
              <div className='card wide'>
                <div className='card-hdr green'>🏢 {t.office}: {result.nearestOffice.officeName}</div>
                <div className='office-body'>
                  <p>📍 {result.nearestOffice.address}</p>
                  <p>📞 {result.nearestOffice.contactNumber}</p>
                  <p>🕐 {result.nearestOffice.timings}</p>
                  <a href={result.nearestOffice.mapsLink} target='_blank' rel='noreferrer'>
                    <button className='maps-btn'>🗺️ {t.maps}</button>
                  </a>
                </div>
              </div>
            )}
 
            {/* UPLOAD CARD */}
            <div className='card wide upload-card'>
              <div className='card-hdr purple'>📎 {t.uploadTitle}</div>
              <div className='upload-body'>
                <div className='type-row'>
                  <label>{t.typeLabel}</label>
                  <select value={docType} onChange={e=>setDocType(e.target.value)}>
                    <option value='aadhaar'>Aadhaar</option>
                    <option value='ration'>Ration Card</option>
                    <option value='pan'>PAN Card</option>
                    <option value='voter'>Voter ID</option>
                  </select>
                </div>
                <input type='file' accept='image/jpeg,image/png' id='doc-upload'
                  onChange={handleUpload} style={{display:'none'}}/>
                <label htmlFor='doc-upload' className='upload-lbl'>{t.uploadBtn}</label>
                {uploadLoading && <div className='upload-status info'>Analysing document...</div>}
                {uploadResult && (
                  <div className={`upload-status ${uploadResult.isValid?'ok':'warn'}`}>
                    <strong>{uploadResult.isValid?'✅':'❌'} {uploadResult.message}</strong>
                    {uploadResult.detectedName && <p>👤 Name: {uploadResult.detectedName}</p>}
                    {uploadResult.detectedAddress && <p>📍 Address: {uploadResult.detectedAddress}</p>}
                    {uploadResult.confidence>0 && <p>📊 Clarity: {uploadResult.confidence}%</p>}
                    {uploadResult.issues?.map((is,i)=><p key={i} className='issue'>⚠️ {is}</p>)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}