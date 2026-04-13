

# Guía completa — API de WhatsApp a Power Automate

## PARTE 1 — Desplegar el servidor en Railway

1. Ve a [railway.app](https://railway.app) y crea una cuenta (puedes entrar con tu cuenta de GitHub)
2. Una vez dentro, clic en **"New Project"**
3. Selecciona **"Deploy from GitHub repo"**
4. Autoriza a Railway a acceder a tu GitHub y selecciona el repositorio `whatsapp-api`
5. Railway detecta automáticamente que es Node.js y empieza a desplegarlo
6. Cuando termine, ve a tu proyecto → pestaña **"Settings"** → sección **"Domains"** → clic en **"Generate Domain"**
7. Railway te da una URL pública tipo `https://whatsapp-api-production.up.railway.app` — **guarda esta URL**, la necesitarás después
8. Ve a la pestaña **"Variables"** y agrega estas variables una por una (por ahora deja los valores vacíos o con placeholders, los llenarás cuando tengas las credenciales):

```
WHATSAPP_ACCESS_TOKEN     →  (pendiente)
WHATSAPP_PHONE_NUMBER_ID  →  (pendiente)
WHATSAPP_TOKEN            →  inventas un texto, ej: mitoken123
POWER_AUTOMATE_URL        →  la URL del documento que ya tienes
POWER_AUTOMATE_API_KEY    →  (pendiente, se define con Power Automate)
PORT                      →  3000
```

> Cada vez que guardes una variable, Railway reinicia el servidor automáticamente.

---

## PARTE 2 — Configurar la app en Meta Developers

1. Ve a [developers.facebook.com](https://developers.facebook.com) e inicia sesión con la cuenta de trabajo
2. Entra a la app existente de WhatsApp Business que ya tiene tu empresa
3. En el menú izquierdo busca **"WhatsApp"** → **"API Setup"**
4. Ahí encontrarás dos datos que necesitas copiar:
   - **Access Token** (token temporal o permanente según cómo lo tengan configurado)
   - **Phone Number ID** (el número asociado a la cuenta)
5. Copia esos dos valores y pégalos en Railway en las variables `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`
6. Ahora ve a **"WhatsApp"** → **"Configuration"** en el menú izquierdo
7. En la sección **"Webhook"** clic en **"Edit"**
8. En **"Callback URL"** pon tu URL de Railway más `/webhook`:
   ```
   https://whatsapp-api-production.up.railway.app/webhook
   ```
9. En **"Verify Token"** pon exactamente el mismo valor que pusiste en la variable `WHATSAPP_TOKEN` en Railway (ej: `mitoken123`)
10. Clic en **"Verify and Save"** — Meta va a llamar a tu servidor para verificarlo, si todo está bien aparece una palomita verde
11. Después de verificar, en la sección **"Webhook fields"** busca **"messages"** y activa el toggle para suscribirte a ese evento

---

## PARTE 3 — Configurar Power Automate

1. Ve a [make.powerautomate.com](https://make.powerautomate.com) e inicia sesión con la cuenta de trabajo
2. Clic en **"Create"** → **"Automated cloud flow"**
3. En el buscador de triggers escribe **"HTTP"** y selecciona **"When an HTTP request is received"**
4. Clic en **"Create"**
5. Una vez dentro del flujo, clic en el trigger **"When an HTTP request is received"**
6. En el campo **"Request Body JSON Schema"** pega este esquema para que Power Automate reconozca los campos que le mandará tu API:

```json
{
  "type": "object",
  "properties": {
    "message_id": { "type": "string" },
    "chat_id": { "type": "string" },
    "user_phone": { "type": "string" },
    "timestamp": { "type": "string" },
    "file_name": { "type": "string" },
    "file_type": { "type": "string" },
    "caption": { "type": "string" },
    "file_base64": { "type": "string" },
    "image_hash": { "type": "string" }
  }
}
```

7. Guarda el flujo con **"Save"**
8. Después de guardar, el trigger te muestra la **"HTTP POST URL"** — esa es la URL de Power Automate que ya tenías en el documento, confirma que coincide
9. Agrega los pasos que necesites después del trigger (procesar el base64, guardar en SharePoint, responder al usuario, etc.)
10. Para que Power Automate le responda al usuario de WhatsApp, agrega una acción **"HTTP"** al final del flujo con estos datos:
    - **Method:** POST
    - **URI:** `https://whatsapp-api-production.up.railway.app/send-message`
    - **Headers:** `Content-Type: application/json`
    - **Body:**
    ```json
    {
      "phone": "@{triggerBody()?['user_phone']}",
      "message": "Tu documento fue procesado correctamente"
    }
    ```

---

## PARTE 4 — Definir el API Key de seguridad

1. Inventa una clave secreta, por ejemplo: `pk-whatsapp-2026-xyz`
2. Ponla en Railway en la variable `POWER_AUTOMATE_API_KEY`
3. En Power Automate, en el trigger **"When an HTTP request is received"** → busca la opción de agregar headers de entrada y agrega que espere el header `x-api-key` con ese mismo valor — esto asegura que solo tu servidor pueda activar el flujo

---

## PARTE 5 — Verificar que todo funciona

1. Desde WhatsApp envía una imagen al número de tu empresa
2. En Railway ve a la pestaña **"Logs"** de tu proyecto — deberías ver entradas como:
   ```
   [LOG] {"message_id":"wamid.xxx","phone":"521811...","result":"POST enviado OK"}
   ```
3. En Power Automate ve a **"My flows"** → tu flujo → **"Run history"** — deberías ver una ejecución exitosa
4. Si algo falla, los logs de Railway te dicen exactamente en qué paso

---

## Resumen del orden

```
GitHub (código) → Railway (servidor corriendo) → Meta (webhook registrado)
                                                         ↓
                                               WhatsApp manda mensajes
                                                         ↓
                                            Railway procesa y manda a Power Automate
                                                         ↓
                                            Power Automate responde al usuario
```

Cuando tengas las credenciales de Meta, los pasos críticos son el **2 de la Parte 2** (copiar tokens) y el **8-10** (registrar el webhook). Todo lo demás ya estará listo.
