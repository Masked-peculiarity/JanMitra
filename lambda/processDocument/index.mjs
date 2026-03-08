
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const s3          = new S3Client({ region: 'us-east-1' });
const CORS        = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const BUCKET      = 'janmitra-docs-hyd-2026';
const OCR_KEY     = process.env.OCR_SPACE_KEY;
const GROQ_KEY    = process.env.GROQ_API_KEY;
const HYD_WORDS   = ['hyderabad', 'secunderabad', 'telangana', 'andhra', '500'];

// ── 1. Download file from S3 as base64 ───────────────────────────────────
async function downloadBase64(s3Key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return {
    base64:      Buffer.concat(chunks).toString('base64'),
    contentType: res.ContentType || 'image/jpeg'
  };
}

// ── 2. Run OCR via OCR.space ─────────────────────────────────────────────
async function runOCR(base64, contentType) {
  if (!OCR_KEY) {
    console.warn('OCR_SPACE_KEY not set — skipping OCR');
    return '';
  }

  const body = new URLSearchParams();
  body.append('base64Image',       `data:${contentType};base64,${base64}`);
  body.append('apikey',            OCR_KEY);
  body.append('language',          'eng');
  body.append('isOverlayRequired', 'false');
  body.append('detectOrientation', 'true');
  body.append('scale',             'true');
  body.append('OCREngine',         '2');   // Engine 2 is better for ID cards

  const res  = await fetch('https://api.ocr.space/parse/image', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString()
  });

  const data = await res.json();
  console.log('OCR raw response:', JSON.stringify(data).substring(0, 500));

  if (data.IsErroredOnProcessing) {
    console.error('OCR error:', data.ErrorMessage);
    return '';
  }

  return data.ParsedResults?.map(r => r.ParsedText || '').join('\n') || '';
}

// ── 3. Detect document type from extracted text ──────────────────────────
function detectDocType(textLower) {
  const signatures = {
    aadhaar: ['aadhaar', 'uid', 'unique identification', 'uidai', 'government of india'],
    ration:  ['ration',  'civil supplies', 'food security', 'apl', 'bpl'],
    pan:     ['permanent account number', 'income tax department'],
    voter:   ['election commission', 'elector', 'epic', 'voter'],
  };
  let best = 'unknown', max = 0;
  for (const [type, words] of Object.entries(signatures)) {
    const hits = words.filter(w => textLower.includes(w)).length;
    if (hits > max) { max = hits; best = type; }
  }
  return best;
}

// ── 4. Extract name from text lines ─────────────────────────────────────
function extractName(lines) {
  const skip = ['government', 'india', 'authority', 'identification',
                'unique', 'aadhaar', 'commission', 'election',
                'income', 'tax', 'department', 'republic'];

  // Pattern: "Firstname Lastname" or "Firstname Middle Lastname"
  const nameRegex = /^[A-Z][a-z]+(?: [A-Z][a-z]+){1,3}$/;

  for (const line of lines) {
    const t = line.trim();
    if (nameRegex.test(t) && !skip.some(w => t.toLowerCase().includes(w))) {
      return t;
    }
  }

  // Fallback — line after "Name" label
  const nameIdx = lines.findIndex(l => l.trim().match(/^Name[:\s]*$/i));
  if (nameIdx >= 0 && lines[nameIdx + 1]) return lines[nameIdx + 1].trim();

  return null;
}

// ── 5. Extract address from text lines ──────────────────────────────────
function extractAddress(lines) {
  const pincodeRegex = /\b[1-9]\d{5}\b/;
  const addrWords    = ['h.no', 'house', 'flat', 'door', 'street', 'road',
                        'nagar', 'colony', 'mandal', 'hyderabad', 'secunderabad',
                        'telangana', 'village', 'ward', 's/o', 'w/o', 'd/o'];
  const addressLines = [];
  let collecting = false;

  for (const line of lines) {
    const tl = line.toLowerCase().trim();
    if (!tl) continue;

    if (tl.match(/^address[:\s]*$/i)) { collecting = true; continue; }

    if (collecting) {
      addressLines.push(line.trim());
      if (pincodeRegex.test(line) || addressLines.length >= 4) collecting = false;
    } else if (addrWords.some(w => tl.includes(w)) || pincodeRegex.test(line)) {
      addressLines.push(line.trim());
    }
  }

  if (!addressLines.length) return null;
  return [...new Set(addressLines)].slice(0, 4).join(', ');
}

// ── 6. Generate AI insight using Groq ───────────────────────────────────
async function generateInsight(docData, language) {
  // Fallback strings in case Groq fails
  const fallback = {
    english: buildFallbackText(docData, 'english'),
    telugu:  buildFallbackText(docData, 'telugu'),
    hindi:   buildFallbackText(docData, 'hindi'),
  };

  if (!GROQ_KEY) return fallback[language] || fallback.english;

  const langInstr = {
    english: 'Reply in simple English.',
    telugu:  'తెలుగులో జవాబు ఇవ్వండి.',
    hindi:   'हिंदी में जवाब दीजिए।'
  };

  const systemPrompt = `You are JanMitra AI, a civic assistant for Hyderabad citizens.
${langInstr[language] || langInstr.english}
Analyze the document verification result and give a SHORT helpful insight (under 80 words).
Tell the user: what document was detected, if their address is valid for Hyderabad Mandal office, 
and one practical next step. Be warm and simple.`;

  const userMsg = `Document verification result:
- Detected type: ${docData.detectedType}
- Expected type: ${docData.expectedType}
- Name found: ${docData.detectedName || 'not detected'}
- Address found: ${docData.detectedAddress || 'not detected'}
- Address in Hyderabad: ${docData.addressInHyderabad}
- Document clarity: ${docData.confidence}%
- Issues: ${docData.issues.length > 0 ? docData.issues.join('; ') : 'none'}
- Valid: ${docData.isValid}`;

  try {
    const res  = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model:       'llama-3.3-70b-versatile',
        max_tokens:  200,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMsg }
        ]
      })
    });

    const data = await res.json();
    console.log('Groq insight response:', JSON.stringify(data).substring(0, 300));

    if (data.error || !data.choices?.length) {
      console.error('Groq error:', data.error);
      return fallback[language] || fallback.english;
    }

    return data.choices[0].message.content;

  } catch (err) {
    console.error('Groq fetch error:', err.message);
    return fallback[language] || fallback.english;
  }
}

// ── 7. Fallback insight without Groq ────────────────────────────────────
function buildFallbackText(d, lang) {
  if (lang === 'telugu') {
    if (!d.isValid) return `పత్రం సమస్యలు: ${d.issues.join('. ')}`;
    return `✅ ${d.detectedType?.toUpperCase()} గుర్తించబడింది.${d.detectedName ? ' పేరు: ' + d.detectedName + '.' : ''}${d.addressInHyderabad ? ' హైదరాబాద్ చిరునామా ధృవీకరించబడింది.' : d.addressInHyderabad === false ? ' ⚠️ చిరునామా హైదరాబాద్ వెలుపల.' : ''}`;
  }
  if (lang === 'hindi') {
    if (!d.isValid) return `दस्तावेज़ समस्याएं: ${d.issues.join('. ')}`;
    return `✅ ${d.detectedType?.toUpperCase()} पहचाना गया।${d.detectedName ? ' नाम: ' + d.detectedName + '.' : ''}${d.addressInHyderabad ? ' हैदराबाद पता सत्यापित।' : d.addressInHyderabad === false ? ' ⚠️ पता हैदराबाद से बाहर।' : ''}`;
  }
  if (!d.isValid) return `Document issues: ${d.issues.join('. ')}`;
  return `✅ ${d.detectedType?.toUpperCase()} detected.${d.detectedName ? ' Name: ' + d.detectedName + '.' : ''}${d.addressInHyderabad ? ' Hyderabad address confirmed.' : d.addressInHyderabad === false ? ' ⚠️ Address outside Hyderabad.' : ''}`;
}

// ── MAIN HANDLER ─────────────────────────────────────────────────────────
export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const { s3Key, documentType, language = 'english' } = JSON.parse(event.body || '{}');
  const expectedType = documentType || 'aadhaar';

  // Step 1: Check file exists + get metadata
  let fileSize, contentType, fileName;
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: s3Key }));
    fileSize    = head.ContentLength;
    contentType = head.ContentType?.toLowerCase() || '';
    fileName    = s3Key.split('/').pop().toLowerCase();

    // Fix octet-stream — infer from filename
    if (contentType === 'application/octet-stream' || !contentType) {
      const ext    = fileName.split('.').pop();
      const extMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf' };
      contentType  = extMap[ext] || 'image/jpeg';
    }
  } catch (err) {
    return {
      statusCode: 500, headers: CORS,
      body: JSON.stringify({
        isValid: false,
        message: 'Could not access uploaded file. Please upload again.',
        issues:  ['File not found in S3']
      })
    };
  }

  // Step 2: Basic file validation
  const issues = [];
  const ACCEPTED = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
  if (!ACCEPTED.includes(contentType)) {
    issues.push(`Invalid file type (${contentType}). Upload a JPG or PNG.`);
  }
  if (fileSize < 10 * 1024) {
    issues.push(`File too small (${Math.round(fileSize / 1024)}KB). Upload a clear full photo.`);
  }
  if (fileSize > 10 * 1024 * 1024) {
    issues.push(`File too large. Please compress and re-upload.`);
  }

  // If basic validation fails — return immediately, skip OCR
  if (issues.length > 0) {
    return {
      statusCode: 200, headers: CORS,
      body: JSON.stringify({
        isValid: false, detectedType: null, detectedName: null,
        detectedAddress: null, addressInHyderabad: null,
        confidence: 0, issues,
        message:  issues.join('. '),
        aiInsight: buildFallbackText({ isValid: false, issues, detectedType: null }, language),
        reminder: ''
      })
    };
  }

  // Step 3: Download + OCR
  let fullText = '';
  try {
    const { base64, contentType: ct } = await downloadBase64(s3Key);
    fullText = await runOCR(base64, ct);
    console.log('OCR text (first 400 chars):', fullText.substring(0, 400));
  } catch (err) {
    console.error('OCR pipeline error:', err.message);
    // Don't fail — continue with empty text, file validation still works
  }

  const fullTextLower = fullText.toLowerCase();
  const lines         = fullText.split('\n').map(l => l.trim()).filter(Boolean);

  // Step 4: Extract info
  const detectedType    = fullText.length > 30 ? detectDocType(fullTextLower) : expectedType;
  const detectedName    = extractName(lines);
  const detectedAddress = extractAddress(lines);

  // Step 5: Hyderabad check
  const addressInHyderabad = detectedAddress
    ? HYD_WORDS.some(k => detectedAddress.toLowerCase().includes(k))
    : fullText.length > 30
      ? HYD_WORDS.some(k => fullTextLower.includes(k))
      : null;  // null = couldn't determine

  // Step 6: Build issues from OCR results
  if (detectedType !== 'unknown' && detectedType !== expectedType) {
    issues.push(`This looks like a ${detectedType} card, not ${expectedType}`);
  }
  if (addressInHyderabad === false) {
    issues.push('Address is outside Hyderabad — may be rejected at Mandal office');
  }
  if (fullText.length > 0 && fullText.length < 40) {
    issues.push('Document image unclear — upload a clearer well-lit photo');
  }

  const confidence = fullText.length > 200 ? 95
                   : fullText.length > 100 ? 80
                   : fullText.length > 40  ? 65
                   : 100; // if no OCR, base on file validation only

  const isValid = issues.length === 0;

  // Step 7: Generate AI insight in user's language
  const docData = {
    isValid, detectedType, expectedType, detectedName,
    detectedAddress, addressInHyderabad, confidence, issues
  };

  const aiInsight = await generateInsight(docData, language);

  const reminders = {
    aadhaar: 'Carry original Aadhaar + 1 photocopy. Address must match current residence.',
    ration:  'Carry original Ration Card. All family Aadhaar numbers must be linked.',
    pan:     'Carry original PAN. Name must exactly match your Aadhaar spelling.',
    voter:   'Carry original Voter ID. Apply at your residential constituency only.',
  };

  return {
    statusCode: 200, headers: CORS,
    body: JSON.stringify({
      isValid,
      detectedType,
      detectedName,
      detectedAddress,
      addressInHyderabad,
      confidence,
      issues,
      message:   isValid ? `${detectedType?.toUpperCase()} document verified successfully.` : issues.join('. '),
      aiInsight,                          // ← new field — AI reply in user's language
      reminder:  reminders[expectedType] || ''
    })
  };
};