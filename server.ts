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

  // Configuración de Nodemailer - La forma más simple y estándar
  const emailUser = 'segurosfoncorp@gmail.com';
  const emailPass = 'kzbjdruuwmnocvfk'; // ASEGÚRATE DE QUE ESTA SEA LA NUEVA CLAVE DE 16 CARACTERES
  const receiverEmail = (process.env.RECEIVER_EMAIL || emailUser).trim();

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });

  // Verificar conexión al arrancar
  transporter.verify((error: any) => {
    if (error) {
      console.error('[Server] Error SMTP (Conexión):', error.message);
    } else {
      console.log('[Server] ¡Gmail SMTP está listo y conectado!');
    }
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
          <div style="font-family: Arial; max-width: 600px; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
            <h2 style="color: #e11d48; border-bottom: 2px solid #e11d48; padding-bottom: 10px;">Gracias por tu pedido</h2>
            <p>Hola <strong>${nombre}</strong>, hemos recibido tu pedido correctamente.</p>
            <p><strong>Total a pagar:</strong> $${formatPrice(total)}</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <h3>Resumen de Productos:</h3>
            <ul>${productListHtml}</ul>
            <p style="font-size: 12px; color: #666; margin-top: 20px;">Este es un correo automático, por favor no respondas a este mensaje.</p>
          </div>
        `,
        attachments: req.file ? [{ filename: req.file.originalname, content: req.file.buffer }] : []
      };

      console.log(`[Server] Intentando enviar correo a: ${correo}`);
      const info = await transporter.sendMail(mailOptions);
      console.log('[Server] Correo enviado con éxito:', info.messageId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Server Error al enviar]:', error.message);
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
