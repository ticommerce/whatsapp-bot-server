import { Client, LocalAuth } from 'whatsapp-web.js';
import express from 'express';
import qrcode from 'qrcode';

const app = express();
app.use(express.json());

let qrCodeData = null;
let isReady = false;
let clientInfo = null;

// Cliente de WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  }
});

// Generar QR
client.on('qr', async (qr) => {
  console.log('📱 QR generado');
  qrCodeData = await qrcode.toDataURL(qr);
  isReady = false;
});

// Conectado
client.on('ready', () => {
  console.log('✅ WhatsApp conectado');
  isReady = true;
  qrCodeData = null;
  clientInfo = client.info;
});

// Desconectado
client.on('disconnected', () => {
  console.log('❌ WhatsApp desconectado');
  isReady = false;
  qrCodeData = null;
});

// Recibir mensajes
client.on('message', async (msg) => {
  if (msg.from.includes('@g.us')) return; // Ignorar grupos
  
  const contact = await msg.getContact();
  const webhookUrl = process.env.BASE44_WEBHOOK_URL;
  
  if (!webhookUrl) {
    console.error('⚠️ BASE44_WEBHOOK_URL no configurada');
    return;
  }

  // Delay anti-ban (1-3 segundos)
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

  // Enviar a Base44
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: msg.from,
        name: contact.pushname || contact.name || 'Sin nombre',
        message: msg.body,
        timestamp: new Date(msg.timestamp * 1000).toISOString()
      })
    });
  } catch (error) {
    console.error('Error enviando a Base44:', error);
  }
});

// Iniciar cliente
client.initialize();

// ===== ENDPOINTS API =====

// Obtener QR
app.get('/qr', (req, res) => {
  if (isReady) {
    return res.json({ connected: true, message: 'Ya está conectado' });
  }
  if (qrCodeData) {
    return res.json({ qr: qrCodeData });
  }
  res.json({ message: 'QR aún no generado, espera unos segundos' });
});

// Estado de conexión
app.get('/status', (req, res) => {
  res.json({
    connected: isReady,
    phoneNumber: clientInfo?.wid?.user || null,
    platform: clientInfo?.platform || null
  });
});

// Enviar mensaje
app.post('/send', async (req, res) => {
  const { to, message } = req.body;
  
  if (!isReady) {
    return res.status(503).json({ error: 'WhatsApp no conectado' });
  }

  try {
    // Delay anti-ban
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    await client.sendMessage(to, message);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    whatsapp: isReady ? 'connected' : 'disconnected'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
