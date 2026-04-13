require('dotenv').config();
const express = require('express');
const { handleWebhook, verifyWebhook } = require('./webhook');
const { sendMessage } = require('./sender');

const app = express();
app.use(express.json());

// Verificación del webhook (GET - requerido por Meta)
app.get('/webhook', verifyWebhook);

// Recepción de mensajes (POST)
app.post('/webhook', handleWebhook);

// Envío de mensajes hacia el usuario (usado por Power Automate)
app.post('/send-message', sendMessage);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
