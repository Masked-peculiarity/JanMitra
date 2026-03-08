# JanMitra AI 🤖
### Voice-First Multilingual Civic Guidance System

JanMitra AI helps rural and semi-urban citizens in Hyderabad district prepare correctly before applying for government certificates and services — guiding them in their own language, verifying their documents, and finding the nearest office.

**Live Demo:** [janmitra-ai.vercel.app](https://janmitra-ai1-pxiceyjo8-masked-peculiaritys-projects.vercel.app)  
**Region:** Hyderabad District, Telangana  
**Languages:** English • తెలుగు (Telugu) • हिंदी (Hindi)

---

## The Problem

Millions of citizens travel to Mandal offices with incomplete documents, wrong forms, or the wrong office entirely — and are turned away. JanMitra AI fixes this before they leave home.

---

## Features

- 🎙️ **Voice Input & Output** — fully voice-driven, works for users who cannot type or read
- 🌐 **3-Language Support** — English, Telugu, Hindi with auto language detection from voice
- 📋 **Service Guidance** — documents required, processing time, fees, common mistakes
- 🏢 **Nearest Office Finder** — haversine-based location matching with Google Maps directions
- 📄 **Document Verification** — OCR-based detection of document type, name, address, and clarity score
- 🤖 **AI Insights** — Groq LLaMA 3.3 generates contextual guidance in the user's language
- 💰 **Zero Monthly Cost** — entire stack runs on free tier

---

## Services Covered

| Service | Office | Processing Time | Fee |
|---|---|---|---|
| Income Certificate | Mandal Office | 7–15 days | Free |
| Caste Certificate | Mandal Office | 15–30 days | Free |
| Ration Card | eSeva / MeeSeva | 30–45 days | ₹5 |
| Voter ID Card | eSeva / MeeSeva | 30–45 days | Free |
| PAN Card | eSeva / MeeSeva | Instant–20 days | Free / ₹107 |

---

## Tech Stack

**Frontend:** React.js hosted on Vercel, with browser-based voice input (Web Speech API) and Google Translate TTS for multilingual speech — no installation required.

**Backend:** AWS Lambda (Node.js 20.x) behind API Gateway, with DynamoDB for service data, S3 for document storage, and OCR.space for text extraction.

**AI Layer:** Groq LLaMA 3.3-70b-versatile for multilingual civic guidance responses and document insights — entire stack runs on free tier at zero monthly cost.

---

## Architecture

```
React (Vercel)
      │
      ▼
API Gateway (HTTP API)
      │
      ├── POST /service-info      → Lambda: getServiceInfo
      │                                     DynamoDB + Groq AI
      │
      ├── POST /upload-url        → Lambda: getPresignedUrl
      │                                     S3 Presigned URL
      │
      └── POST /process-document  → Lambda: processDocument
                                            S3 + OCR.space + Groq AI
```

---

## Project Structure

```
JanMitra/
├── JanMitra-frontend/          # React app
│   ├── src/
│   │   ├── App.js              # Main component — chat, voice, upload
│   │   ├── App.css             # Styling
│   │   └── index.js
│   ├── public/
│   │   └── index.html          # Google Fonts (Noto Sans Telugu/Devanagari)
│   ├── package.json
│   └── .env.example
│
├── lambda/
│   ├── getServiceInfo/
│   │   └── index.mjs           # DynamoDB fetch + nearest office + Groq reply
│   ├── getPresignedUrl/
│   │   └── index.mjs           # S3 presigned URL generation
│   └── processDocument/
│       └── index.mjs           # OCR.space + document parsing + Groq insight
│
├── data/
│   ├── seed_services.json      # 15 records (5 services × 3 languages)
│   ├── seed_offices.json       # 6 Hyderabad office records
│   └── import_data.py          # DynamoDB import script
│
└── README.md
```

---

## AWS Setup

**Region:** `us-east-1`

**DynamoDB Tables:**
- `JanMitra_Services` — PK: `serviceId`, SK: `language`
- `JanMitra_Offices` — PK: `officeId`

**S3 Bucket:** `janmitra-docs-hyd-2026`
- CORS: `PUT`, `GET` allowed from `*`

**Lambda Functions:**
| Function | Runtime | Timeout | Memory |
|---|---|---|---|
| janmitra-getServiceInfo | Node.js 20.x | 30s | 128MB |
| janmitra-getPresignedUrl | Node.js 20.x | 15s | 128MB |
| janmitra-processDocument | Node.js 20.x | 45s | 128MB |

**API Gateway:** HTTP API, stage `$default`, auto-deploy ON

---

## Environment Variables

**Lambda (set in AWS Console → Configuration → Environment Variables):**
```
GROQ_API_KEY      = your_groq_api_key
OCR_SPACE_KEY     = your_ocr_space_key
```

**Frontend (set in Vercel → Settings → Environment Variables):**
```
REACT_APP_API_BASE = https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com
```

For local development, create `JanMitra-frontend/.env`:
```
REACT_APP_API_BASE=https://your-api-gateway-url.execute-api.us-east-1.amazonaws.com
```

---

## Local Setup

```bash
# Clone repo
git clone https://github.com/YOUR_USERNAME/JanMitra.git
cd JanMitra/JanMitra-frontend

# Install dependencies
npm install

# Add environment variable
cp .env.example .env
# Edit .env and add your API Gateway URL

# Run locally
npm start
```

---

## Seed DynamoDB

```bash
cd data
pip install boto3
aws configure   # enter your IAM credentials
python import_data.py
```

---

## Deployment

**Frontend → Vercel:**
1. Connect GitHub repo to Vercel
2. Set Root Directory to `JanMitra-frontend`
3. Add `REACT_APP_API_BASE` environment variable
4. Deploy — auto-deploys on every `git push`

**Lambda → AWS Console:**
1. Create function → Node.js 20.x
2. Paste code from `lambda/functionName/index.mjs`
3. Set timeout and environment variables
4. Add IAM policies (DynamoDB read, S3 full access)

---

## Current Limitations

- Covers Hyderabad district only (6 offices, 5 services)
- Document verification uses OCR-based detection — not yet cross-checked against government records
- Telugu voice input works on Chrome (Android/Windows with Telugu language pack)
- Demo data used for prototype — production will use government-verified database

---

## Roadmap

**Phase 1 (1–3 months)**
- Sarvam AI TTS for native Telugu/Hindi pronunciation
- WhatsApp Bot via Twilio for non-smartphone users
- Real Mandal data for all 67 Hyderabad mandals

**Phase 2 (3–6 months)**
- Expand to 5 Telangana districts
- Application status tracker via MeeSeva portal
- Offline PWA mode for low-connectivity areas

**Phase 3 (6–12 months)**
- All 33 Telangana districts + Andhra Pradesh
- DigiLocker integration — auto-fetch Aadhaar, PAN, RC
- Government database integration for real-time document authentication
- Urdu, Marathi, Tamil language support

---

## Team

| Role | Responsibility |
|---|---|
| P1 — AWS Lead | Lambda, IAM, DynamoDB, S3, Groq integration |
| P2 — Frontend Lead | React UI, voice I/O, language switching |
| P3 — Data Lead | Seed data, OCR pipeline, document parsing |
| P4 — DevOps Lead | GitHub, Vercel, API Gateway, environment config |

---

## Cost Analysis

| Service | Free Tier | Monthly Cost |
|---|---|---|
| AWS Lambda | 1M requests/month | ₹0 |
| DynamoDB | 25GB + 200M requests | ₹0 |
| S3 | 5GB storage | ₹0 |
| API Gateway | 1M calls/month | ₹0 |
| Groq LLaMA 3.3 | 14,400 req/day | ₹0 |
| OCR.space | 25,000 pages/month | ₹0 |
| Vercel Hosting | CDN + HTTPS | ₹0 |
| Google TTS | Unlimited | ₹0 |
| **Total** | | **₹ 0 / month** |

---

## License


MIT License — built for the AWS Hackathon 2026.
