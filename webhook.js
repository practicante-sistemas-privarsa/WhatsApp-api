const axios = require('axios');
const { generateHash, toBase64, validateBuffer, isAllowedMimeType } = require('./utils');
const { log } = require('./logger');
const { getSession, createSession, updateSession } = require('./sessions');

const {
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  POWER_AUTOMATE_URL,
  POWER_AUTOMATE_API_KEY,
} = process.env;

// ─── Enviar mensaje de texto al usuario ───────────────────────────────────────
async function sendWhatsAppMessage(phone, message) {
  await axios.post(
    `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: message },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

// ─── Descargar archivo desde WhatsApp ─────────────────────────────────────────
async function downloadMedia(mediaId) {
  const metaRes = await axios.get(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` } }
  );
  const fileUrl = metaRes.data.url;

  const fileRes = await axios.get(fileUrl, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` },
  });

  return Buffer.from(fileRes.data);
}

// ─── Enviar a Power Automate con reintentos ────────────────────────────────────
async function sendToPowerAutomate(payload, retries = 3) {
  const delays = [1000, 5000, 10000];
  for (let i = 0; i < retries; i++) {
    try {
      await axios.post(POWER_AUTOMATE_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': POWER_AUTOMATE_API_KEY,
        },
        timeout: 9000,
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

// ─── Procesar imagen recibida ──────────────────────────────────────────────────
async function processMediaMessage(msg, phone, session) {
  const mediaType = msg.type;
  const mediaData = msg[mediaType];
  const mimeType = mediaData.mime_type;

  if (!isAllowedMimeType(mimeType)) {
    await sendWhatsAppMessage(phone, 'Solo se aceptan imágenes (JPG, PNG) o archivos PDF.');
    return;
  }

  const message_id = msg.id;
  const timestamp = new Date(parseInt(msg.timestamp) * 1000).toISOString();
  const caption = msg.caption || '';
  const file_name = mediaData.filename || `archivo_${msg.id}`;
  const media_id = mediaData.id;

  let fileBuffer, hash, base64;

  try {
    fileBuffer = await downloadMedia(media_id);
    hash = generateHash(fileBuffer);
    base64 = toBase64(fileBuffer);
  } catch (err) {
    log({ message_id, phone, timestamp, error: err.message });
    await sendWhatsAppMessage(phone, 'No se pudo descargar el archivo. Intenta enviarlo de nuevo.');
    return;
  }

  // El folio de ruta viene de la sesión activa
  const payload = {
    message_id,
    chat_id: phone,
    user_phone: phone,
    timestamp,
    file_name,
    file_type: mimeType,
    caption,
    file_base64: base64,
    image_hash: hash,
    folio_ruta: session.folio, // ← nuevo campo ligado a la sesión
  };

  try {
    await sendToPowerAutomate(payload);
    updateSession(phone, { imageCount: session.imageCount + 1 });
    log({ message_id, phone, timestamp, result: `POST enviado OK | folio: ${session.folio}` });
    await sendWhatsAppMessage(phone, `✅ Imagen recibida y procesada (folio: ${session.folio}). Puedes enviar más imágenes o esperar a que la sesión finalice.`);
  } catch (err) {
    log({ message_id, phone, timestamp, error: `POST fallido: ${err.message}` });
    await sendWhatsAppMessage(phone, 'Ocurrió un error al procesar tu imagen. Intenta de nuevo.');
  }
}

// ─── Handler principal del webhook ────────────────────────────────────────────
async function handleWebhook(req, res) {
  res.sendStatus(200); // Responder inmediatamente a Meta

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        const messages = value.messages || [];

        for (const msg of messages) {
          const phone = msg.from;
          let session = getSession(phone);

          // ── Sin sesión activa → iniciar flujo ──
          if (!session) {
            createSession(phone);
            await sendWhatsAppMessage(
              phone,
              '👋 Bienvenido al Servicio de Carga de Acuses.\n\nFavor de indicar a qué *folio de ruta* pertenece su acuse.'
            );
            continue;
          }

          // ── Sesión en estado WAITING_FOLIO → esperar el folio ──
          if (session.state === 'WAITING_FOLIO') {
            if (msg.type !== 'text') {
              await sendWhatsAppMessage(phone, 'Por favor escribe el folio de ruta antes de enviar imágenes.');
              continue;
            }

            const folio = msg.text.body.trim();
            updateSession(phone, { state: 'RECEIVING_IMAGES', folio });

            await sendWhatsAppMessage(
              phone,
              `✅ Folio *${folio}* registrado.\n\nAhora puede proceder a enviar las imágenes de los acuses.\n\n⏱️ Tienes *10 minutos* para enviar tus archivos.`
            );
            continue;
          }

          // ── Sesión en estado RECEIVING_IMAGES → procesar imágenes ──
          if (session.state === 'RECEIVING_IMAGES') {
            if (['image', 'document'].includes(msg.type)) {
              await processMediaMessage(msg, phone, session);
            } else {
              await sendWhatsAppMessage(
                phone,
                `Estás en modo de carga de imágenes para el folio *${session.folio}*. Por favor envía tus archivos.`
              );
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[ERROR webhook]', err.message);
  }
}

// ─── Verificación del webhook (requerida por Meta) ────────────────────────────
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
