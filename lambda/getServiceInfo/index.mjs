import { DynamoDBClient, GetItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall, marshall } from '@aws-sdk/util-dynamodb';

const db = new DynamoDBClient({ region: 'us-east-1' });
const GROQ_API_KEY = process.env.GROQ_API_KEY;

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
async function generateAIReply(serviceData, userQuestion, language) {

  const langMap = {
    english: { inst: 'Reply in English.', tone: 'friendly and simple' },
    telugu: { inst: 'తెలుగులో జవాబు ఇవ్వండి.', tone: 'సరళంగా మరియు స్నేహంగా' },
    hindi: { inst: 'हिंदी में जवाब दीजिए.', tone: 'सरल और मित्रवत' }
  };

  const l = langMap[language] || langMap.english;

  const systemPrompt = `You are JanMitra AI, a civic guidance assistant helping
Indian citizens with government document processes in Hyderabad, India.
${l.inst} Be ${l.tone}. Keep response under 100 words.
Use only the service data provided. Do not make up information.
End with one practical tip from the common mistakes list.`;

  const userMsg = `User asked: "${userQuestion || 'What do I need?'}"

Service data:
${JSON.stringify({
    name: serviceData.serviceName,
    documents: serviceData.requiredDocuments,
    mistakes: serviceData.commonMistakes,
    days: serviceData.processingDays,
    fee: serviceData.fees
  }, null, 2)}`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg }
      ],
      temperature: 0.3,
      max_tokens: 300
    })
  });

  const data = await response.json();

  if (!data.choices || !data.choices.length) {
    console.error("Groq Error:", data);
    return serviceData.serviceName;
  }

  return data.choices[0].message.content;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  const body = JSON.parse(event.body || '{}');

  if (!body.serviceId) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: "serviceId is required" })
    };
  }

  const {
    serviceId,
    language = 'english',
    userQuestion,
    userLat,
    userLon
  } = body;

  // 1. Fetch service data
  const svcRes = await db.send(new GetItemCommand({
    TableName: 'JanMitra_Services',
    Key: marshall({ serviceId, language })
  }));
  if (!svcRes.Item) return {
    statusCode: 404, headers: CORS,
    body: JSON.stringify({ error: `Service '${serviceId}' not found for language '${language}'` })
  };
  const service = unmarshall(svcRes.Item);

  // 2. Find nearest applicable office
  const officesRes = await db.send(new ScanCommand({
    TableName: 'JanMitra_Offices',
    FilterExpression: 'officeType = :t',
    ExpressionAttributeValues: marshall({ ':t': service.applicableOffice })
  }));
  const offices = (officesRes.Items || []).map(unmarshall);
  let nearestOffice = null;
  if (offices.length > 0) {
    if (userLat && userLon) {
      offices.sort((a, b) =>
        haversine(userLat, userLon, Number(a.latitude), Number(a.longitude)) -
        haversine(userLat, userLon, Number(b.latitude), Number(b.longitude)));
    }
    nearestOffice = offices[0];
    const lat = Number(nearestOffice.latitude);
    const lon = Number(nearestOffice.longitude);
    nearestOffice.mapsLink = userLat && userLon
      ? `https://www.google.com/maps/dir/${userLat},${userLon}/${lat},${lon}`
      : `https://www.google.com/maps/search/${encodeURIComponent(nearestOffice.officeName)}`;
  }

  // 3. Generate AI conversational reply
  const aiReply = await generateAIReply(service, userQuestion, language);

  return {
    statusCode: 200, headers: CORS,
    body: JSON.stringify({ service, nearestOffice, aiReply })
  };
};
