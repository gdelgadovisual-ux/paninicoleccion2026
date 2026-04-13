import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import dns from 'dns';

// FORZADO DE IPv4 A NIVEL GLOBAL - Crucial para Render
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 } 
  });

  const emailUser = 'segurosfoncorp@gmail.com';
  const emailPass = 'xioaycxdutqpzfeu';
  const receiverEmail = (process.env.RECEIVER_EMAIL || emailUser).trim();

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // Puerto 465 requiere secure: true
    auth: {
      user: emailUser,
      pass: emailPass,
    },
    tls: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2'
    },
    // FORZADO DE IPv4 EN LA CONEXIÓN - Evita ENETUNREACH
    lookup: (hostname: string, options: any, callback: any) => {
      dns.lookup(hostname, { family: 4 }, (err, address, family) => {
        if (!err) console.log(`[SMTP-DNS] Conectando a ${hostname} vía IPv${family}: ${address}`);
        callback(err, address, family);
      });
    },
    connectionTimeout: 60000,
  } as any);

  // API: Enviar pedido
  app.post('/api/send-order', upload.single('archivo'), async (req: any, res: any) => {
    try {
      const orderData = JSON.parse(req.body.orderData);
      const { nombre, correo, total, productos, entregaTipo, metodoPago } = orderData;

      const mailOptions = {
        from: `"Panini FonClaro" <${emailUser}>`,
        to: `${correo}`,
        bcc: `${receiverEmail}, gdelgadovisual@gmail.com, comercial@fonclarocorporativo.com.co`,
        subject: `Pedido Panini - ${nombre}`,
        html: `<h1>Pedido de ${nombre}</h1><p>Total: $${total}</p>`,
        attachments: req.file ? [{ filename: req.file.originalname, content: req.file.buffer }] : []
      };

      const info = await transporter.sendMail(mailOptions);
      res.json({ success: true, messageId: info.messageId });
    } catch (error: any) {
      console.error('[Error SMTP]:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
  if (isProd) {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.url.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => console.log(`Servidor en puerto ${PORT}`));
}

startServer();
