import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import dns from 'dns';
import sgMail from '@sendgrid/mail';

// Forzar IPv4 para evitar errores ENETUNREACH en entornos con IPv6 parcial (como Render)
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Configuración de Multer (Archivos en memoria)
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 } // 15MB
  });

  // Configuración de Nodemailer - Volvemos a lo sencillo (Gmail Directo)
  const emailUser = 'segurosfoncorp@gmail.com';
  const emailPass = 'xioaycxdutqpzfeu'; // REEMPLAZA AQUÍ CON TU NUEVA CLAVE SI ES NECESARIO
  const receiverEmail = (process.env.RECEIVER_EMAIL || emailUser).trim();

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: emailUser,
      pass: emailPass,
    },
    tls: {
      rejectUnauthorized: false,
      minVersion: 'TLSv1.2'
    },
    // Este bloque evita el error ENETUNREACH en Render
    lookup: (hostname: string, options: any, callback: any) => {
      dns.lookup(hostname, { family: 4 }, (err, address, family) => {
        callback(err, address, family);
      });
    },
    connectionTimeout: 60000,
    greetingTimeout: 60000,
    socketTimeout: 60000,
  } as any);

  // Verificar conexión al arrancar
  transporter.verify((error: any) => {
    if (error) console.error('[Server] Error SMTP:', error.message);
    else console.log('[Server] Gmail SMTP listo');
  });

  // API: Enviar pedido
  app.post('/api/send-order', upload.single('archivo'), async (req: any, res: any) => {
    try {
      if (!req.body.orderData) return res.status(400).json({ error: 'Faltan datos' });
      const orderData = JSON.parse(req.body.orderData);
      const { nombre, correo, total, productos, entregaTipo, metodoPago, cuotas, cedula, celular, sede, ciudad, direccion, barrio, localidad, costoEnvio } = orderData;

      const formatPrice = (p: number) => Math.round(p).toLocaleString('es-CO');
      const productListHtml = productos.map((p: any) => `<li>${p.name} (x${p.quantity}) - $${formatPrice(p.price)}</li>`).join('');

      const mailOptions = {
        from: `"Panini FonClaro" <${emailUser}>`,
        to: correo,
        bcc: `${receiverEmail}, gdelgadovisual@gmail.com, comercial@fonclarocorporativo.com.co`,
        subject: `Confirmación de Pedido - ${nombre}`,
        html: `
          <div style="font-family: Arial; max-width: 600px; border: 1px solid #eee; padding: 20px;">
            <h2 style="color: #e11d48;">Gracias por tu pedido</h2>
            <p><strong>Cliente:</strong> ${nombre}</p>
            <p><strong>Total:</strong> $${formatPrice(total)}</p>
            <hr>
            <h3>Detalles:</h3>
            <ul>${productListHtml}</ul>
          </div>
        `,
        attachments: req.file ? [{ filename: req.file.originalname, content: req.file.buffer }] : []
      };

      await transporter.sendMail(mailOptions);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Server Error]:', error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // API: Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Manejador para rutas de API no encontradas (SIEMPRE JSON)
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `Ruta de API no encontrada: ${req.method} ${req.url}` });
  });

  // Manejo de archivos estáticos y SPA
  const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
  
  if (isProd) {
    console.log('[Server] Modo PRODUCCIÓN detectado. Sirviendo archivos desde /dist');
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      // Evitar que las rutas de API caigan en el fallback de SPA
      if (req.url.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.log('[Server] Modo DESARROLLO detectado. Iniciando middleware de Vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  // Error handler global para asegurar respuestas JSON en errores inesperados
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('[Server] Error no manejado:', err);
    if (req.url.startsWith('/api/')) {
      return res.status(500).json({ error: 'Error inesperado en el servidor', details: err.message });
    }
    next(err);
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Corriendo en http://0.0.0.0:${PORT}`);
  });
}

startServer();
