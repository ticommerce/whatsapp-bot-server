const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const app = express();
app.use(express.json());

let client;
let qrCodeData = null;

// Inicializar cliente
async function initWhatsAppClient() {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium'
    }
  });

  client.on('qr', async (qr) => {
    qrCodeData = await qrcode.toDataURL(qr);
    console.log('QR Code generado');
  });

  client.on('ready', () => {
    console.log('WhatsApp conectado');
    qrCodeData = null;
  });

  client.on('message', async (msg) => {
    try {
      const response = await fetch(process.env.BASE44_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: msg.from,
          name: (await msg.getContact()).pushname || 'Cliente',
          message: msg.body,
          timestamp: new Date().toISOString()
        })
      });

      const data = await response.json();
      if (data.response) {
        await msg.reply(data.response);
      }
    } catch (error) {
      console.error('Error procesando mensaje:', error);
    }
  });

  await client.initialize();
}

app.get('/qr', (req, res) => {
  if (qrCodeData) {
    res.json({ qr: qrCodeData });
  } else {
    res.json({ error: 'No QR disponible o ya conectado' });
  }
});

app.get('/status', (req, res) => {
  const isConnected = client && client.info ? true : false;
  res.json({ connected: isConnected });
});

app.post('/send', async (req, res) => {
  try {
    const { phone, message } = req.body;
    await client.sendMessage(`${phone}@c.us`, message);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`WhatsApp bot server running on port ${PORT}`);
  initWhatsAppClient();
});
