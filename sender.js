const axios = require('axios');

const { WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;

async function sendMessage(req, res) {
  const { phone, message } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: 'Faltan campos: phone, message' });
  }

  try {
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

    res.json({ status: 'enviado', phone, message });
  } catch (err) {
    console.error('[ERROR send-message]', err.response?.data || err.message);
    res.status(500).json({ error: 'No se pudo enviar el mensaje' });
  }
}

module.exports = { sendMessage };
