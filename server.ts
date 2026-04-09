import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import dns from 'dns';

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

  // Configuración de Nodemailer - Limpia y Robusta para Gmail
  const emailUser = process.env.EMAIL_USER?.trim() || 'gdelgadovisual@gmail.com';
  const emailPass = process.env.EMAIL_PASS?.trim().replace(/\s/g, '') || 'ehhqhdgpsejpvgqj';
  const receiverEmail = process.env.RECEIVER_EMAIL?.trim() || emailUser;

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // SSL/TLS
    auth: {
      user: emailUser,
      pass: emailPass,
    },
    family: 4, // Forzar IPv4 explícitamente
    connectionTimeout: 60000, // 60 segundos de paciencia
    greetingTimeout: 60000,
    socketTimeout: 60000,
  } as any);

  // API: Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API: Enviar pedido
  app.post('/api/send-order', upload.single('archivo'), async (req: any, res: any) => {
    try {
      if (!req.body.orderData) {
        return res.status(400).json({ error: 'Datos del pedido no recibidos' });
      }

      const orderData = JSON.parse(req.body.orderData);
      const { nombre, cedula, celular, correo, total, productos, entregaTipo, sede, ciudad, direccion, barrio, localidad, cuotas } = orderData;

      console.log(`[Server] Procesando pedido de: ${nombre}`);

      const productListHtml = productos.map((p: any) => 
        `<li style="margin-bottom: 5px;"><strong>${p.name}</strong> (x${p.quantity}) - $${p.price.toLocaleString()}</li>`
      ).join('');

      const entregaHtml = entregaTipo === 'sede' 
        ? `<p><strong>Entrega:</strong> Recogida en sede (${sede})</p>`
        : `<p><strong>Entrega:</strong> Domicilio en ${ciudad}<br><strong>Dirección:</strong> ${direccion}, ${barrio}, ${localidad}</p>`;

      const mailOptions: any = {
        from: `"Panini FONCLARO" <${emailUser}>`,
        to: receiverEmail,
        cc: correo,
        subject: `NUEVO PEDIDO PANINI - ${nombre}`,
        html: `
          <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
            <h2 style="color: #e11d48; border-bottom: 2px solid #e11d48; padding-bottom: 10px;">Resumen de Pedido</h2>
            <p><strong>Cliente:</strong> ${nombre}</p>
            <p><strong>Cédula:</strong> ${cedula}</p>
            <p><strong>Celular:</strong> ${celular}</p>
            <p><strong>Correo:</strong> ${correo}</p>
            <p><strong>Cuotas:</strong> ${cuotas}</p>
            ${entregaHtml}
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <h3>Productos:</h3>
            <ul>${productListHtml}</ul>
            <div style="background: #fdf2f2; padding: 15px; border-radius: 8px; text-align: right; margin-top: 20px;">
              <p style="margin: 0; font-size: 14px; color: #e11d48;">TOTAL FINAL</p>
              <p style="margin: 0; font-size: 24px; font-weight: bold;">$${total.toLocaleString()}</p>
            </div>
          </div>
        `,
        attachments: []
      };

      if (req.file) {
        mailOptions.attachments.push({
          filename: req.file.originalname,
          content: req.file.buffer
        });
      }

      await transporter.sendMail(mailOptions);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Server] Error enviando correo:', error);
      res.status(500).json({ error: 'Error al enviar el correo', details: error.message });
    }
  });

  // Manejo de archivos estáticos y SPA
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.url.startsWith('/api/')) return res.status(404).json({ error: 'API no encontrada' });
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Corriendo en http://0.0.0.0:${PORT}`);
  });
}

startServer();
