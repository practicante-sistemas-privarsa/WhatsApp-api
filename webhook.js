const axios = require('axios');
const { generateHash, toBase64, validateBuffer, isAllowedMimeType } = require('./utils');
const { log } = require('./logger');

const { WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, POWER_AUTOMATE_URL, POWER_AUTOMATE_API_KEY } = process.env;

// Descarga el archivo desde WhatsApp usando el media_id
async function downloadMedia(mediaId) {
  // Paso 1: obtener URL del archivo
  const metaRes = await axios.get(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` } }
  );
  const fileUrl = metaRes.data.url;

  // Paso 2: descargar el archivo como buffer binario
  const fileRes = await axios.get(fileUrl, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
  });

  return Buffer.from(fileRes.data);
}

// Envía el payload a Power Automate con reintentos
async function sendToPowerAutomate(payload, retries = 3) {
  const delays = [1000, 5000, 10000];
  for (let i = 0; i < retries; i++) {
    try {
      await axios.post(POWER_AUTOMATE_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': POWER_AUTOMATE_API_KEY,
        },
        timeout: 9000, // < 10 segundos
      });
      return true;
    } catch (err) {
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, delays[i]));
      } else {
        throw err;
      }
    }
  }
}

// Procesa un mensaje individual con archivo adjunto
async function processMediaMessage(msg, contact) {
  const mediaType = msg.type; // 'image' o 'document'
  const mediaData = msg[mediaType];
  const mimeType = mediaData.mime_type;

  // Ignorar tipos no permitidos
  if (!isAllowedMimeType(mimeType)) {
    console.log(`[SKIP] Tipo no permitido: ${mimeType}`);
    return;
  }

  const message_id = msg.id;
  const chat_id = contact.wa_id;
  const user_phone = contact.wa_id;
  const timestamp = new Date(parseInt(msg.timestamp) * 1000).toISOString();
  const caption = msg.caption || '';
  const file_name = mediaData.filename || `archivo_${msg.id}`;
  const media_id = mediaData.id;

  let fileBuffer, hash, base64;

  try {
    // Paso 3: Descargar archivo
    fileBuffer = await downloadMedia(media_id);

    // Paso 4 y 5: Validar, generar hash y base64
    validateBuffer(fileBuffer, mimeType);
    hash = generateHash(fileBuffer);
    base64 = toBase64(fileBuffer);

  } catch (err) {
    log({ message_id, phone: user_phone, timestamp, error: err.message });
    return; // No enviar nada si falla la descarga o validación
  }

  // Paso 6: Construir payload
  const payload = {
    message_id,
    chat_id,
    user_phone,
    timestamp,
    file_name,
    file_type: mimeType,
    caption,
    file_base64: base64,
    image_hash: hash,
  };

  try {
    await sendToPowerAutomate(payload);
    log({ message_id, phone: user_phone, timestamp, result: 'POST enviado OK' });
  } catch (err) {
    log({ message_id, phone: user_phone, timestamp, error: `POST fallido: ${err.message}` });
  }
}

// Handler principal del webhook
async function handleWebhook(req, res) {
  // Responder 200 inmediatamente a WhatsApp (requerido)
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        const messages = value.messages || [];
        const contacts = value.contacts || [];

        for (const msg of messages) {
          // Solo procesar imagen o documento
          if (!['image', 'document'].includes(msg.type)) continue;

          const contact = contacts.find(c => c.wa_id === msg.from) || { wa_id: msg.from };
          processMediaMessage(msg, contact); // No await → respuesta < 10s
        }
      }
    }
  } catch (err) {
    console.error('[ERROR webhook]', err.message);
  }
}

// Verificación del webhook (requerida por Meta)
function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
}

module.exports = { handleWebhook, verifyWebhook };
