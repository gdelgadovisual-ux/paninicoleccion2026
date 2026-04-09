import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import multer from 'multer';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import dns from 'dns';

// Forzar IPv4 para evitar errores ENETUNREACH en entornos con IPv6 parcial (como Render)
dns.setDefaultResultOrder('ipv4first');

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Middleware para logs de peticiones
  app.use((req, res, next) => {
    console.log(`[Server] ${req.method} ${req.url}`);
    next();
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Configuración de Multer para recibir archivos en memoria
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 } // Límite de 15MB
  });

  // Configuración de Nodemailer
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  const receiverEmail = process.env.RECEIVER_EMAIL || emailUser || 'gdelgadovisual@gmail.com';
  const backupEmail = 'gd.tucreativo@gmail.com';

  if (!emailUser || !emailPass) {
    console.error('[Server] CRÍTICO: Faltan variables de entorno EMAIL_USER o EMAIL_PASS');
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // Use STARTTLS
    auth: {
      user: emailUser || 'gdelgadovisual@gmail.com',
      pass: emailPass?.replace(/\s/g, '') || 'kighcnkdwkxiepgs',
    },
    tls: {
      rejectUnauthorized: false // Ayuda en algunos entornos de red restrictivos
    }
  });

  // Verificar conexión con el servidor de correo al iniciar
  transporter.verify((error, success) => {
    if (error) {
      console.error('[Server] Error de configuración SMTP:', error);
    } else {
      console.log(`[Server] Servidor de correo listo (${emailUser})`);
    }
  });

  // API: Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', fullstack: true, mode: 'email', timestamp: new Date().toISOString() });
  });

  // API: Test endpoint
  app.get('/api/test', (req, res) => {
    res.json({ message: 'API is working', method: req.method, url: req.url });
  });

  // API: Endpoint para enviar pedido por correo
  app.post('/api/send-order', (req, res, next) => {
    console.log(`[Server] Recibida petición POST en /api/send-order`);
    upload.single('archivo')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        console.error('[Server] Multer Error:', err);
        return res.status(400).json({ error: 'Error en la subida del archivo', details: err.message });
      } else if (err) {
        console.error('[Server] Unknown Upload Error:', err);
        return res.status(500).json({ error: 'Error desconocido al procesar el archivo', details: err.message });
      }
      console.log(`[Server] Archivo procesado por Multer: ${req.file ? req.file.originalname : 'Ninguno'}`);
      next();
    });
  }, async (req: any, res: any) => {
    try {
      if (!req.body.orderData) {
        console.error('[Server] Error: Faltan los datos del pedido (orderData)');
        return res.status(400).json({ error: 'Faltan los datos del pedido (orderData)' });
      }
      const orderData = JSON.parse(req.body.orderData);
      const { nombre, cedula, celular, correo, total, productos, entregaTipo, sede, ciudad, direccion, barrio, localidad, cuotas } = orderData;

      console.log(`[Server] Procesando pedido para: ${nombre} <${correo}>`);

      const productListHtml = productos.map((p: any) => 
        `<li style="margin-bottom: 8px;">
          <strong style="color: #1f2937;">${p.name}</strong><br>
          <span style="color: #6b7280;">Cantidad: ${p.quantity} | Precio Unitario: $${p.price.toLocaleString()}</span>
        </li>`
      ).join('');

      const entregaHtml = entregaTipo === 'sede' 
        ? `<p><strong>Tipo de Entrega:</strong> Recogida en Sede</p><p><strong>Sede:</strong> ${sede}</p>`
        : `<p><strong>Tipo de Entrega:</strong> Domicilio</p>
           <p><strong>Ciudad:</strong> ${ciudad}</p>
           <p><strong>Dirección:</strong> ${direccion}</p>
           <p><strong>Barrio:</strong> ${barrio}</p>
           <p><strong>Localidad:</strong> ${localidad}</p>`;

      const mailOptions: any = {
        from: `"Panini FONCLARO" <${emailUser}>`,
        to: receiverEmail,
        cc: correo,
        bcc: backupEmail, // Copia de seguridad oculta
        replyTo: correo,
        subject: `NUEVO PEDIDO PANINI - ${nombre} - ${cedula}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; padding: 40px; border-radius: 20px; color: #374151;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #e11d48; margin: 0; font-size: 24px;">PANINI FONCLARO</h1>
              <p style="color: #6b7280; margin-top: 5px;">Confirmación de Pedido</p>
            </div>
            
            <p>Hola <strong>${nombre}</strong>,</p>
            <p>Hemos recibido tu pedido correctamente y está siendo procesado.</p>
            
            <div style="background: #f9fafb; padding: 20px; border-radius: 15px; margin: 25px 0;">
              <h3 style="margin-top: 0; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 10px;">Resumen del Cliente</h3>
              <p style="margin: 5px 0;"><strong>Cédula:</strong> ${cedula}</p>
              <p style="margin: 5px 0;"><strong>Celular:</strong> ${celular}</p>
              <p style="margin: 5px 0;"><strong>Correo:</strong> ${correo}</p>
              <p style="margin: 5px 0;"><strong>Cuotas:</strong> ${cuotas}</p>
              ${entregaHtml}
            </div>
            
            <h3 style="color: #111827;">Productos Solicitados:</h3>
            <ul style="padding-left: 20px; margin-bottom: 25px;">${productListHtml}</ul>
            
            <div style="background: #fff1f2; padding: 20px; border-radius: 15px; text-align: right;">
              <span style="color: #e11d48; font-size: 14px; font-weight: bold; display: block; margin-bottom: 5px;">TOTAL A PAGAR</span>
              <span style="font-size: 28px; font-weight: 900; color: #111827;">$${total.toLocaleString()}</span>
            </div>
            
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center;">
              <p>Este es un correo automático generado por el sistema de pedidos Panini FONCLARO.</p>
              <p>Si tienes alguna duda, responde a este correo o contacta al administrador.</p>
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
        console.log(`[Server] Adjuntando archivo: ${req.file.originalname}`);
      }

      const info = await transporter.sendMail(mailOptions);
      console.log(`[Server] Correo enviado exitosamente: ${info.messageId}`);
      console.log(`[Server] Destinatarios: TO=${receiverEmail}, CC=${correo}, BCC=${backupEmail}`);

      res.json({ 
        success: true, 
        message: 'Pedido enviado correctamente',
        messageId: info.messageId,
        recipient: receiverEmail
      });
    } catch (error: any) {
      console.error('[Server] ERROR CRÍTICO enviando correo:', error);
      res.status(500).json({ 
        error: 'Error al enviar el correo.', 
        details: error.message,
        code: error.code 
      });
    }
  });

  // Catch-all para rutas /api que no existen
  app.all('/api/*', (req, res) => {
    console.log(`[Server] 404 API: ${req.method} ${req.url}`);
    res.status(404).json({ 
      error: 'Ruta de API no encontrada', 
      method: req.method, 
      url: req.url 
    });
  });

  // Manejador de errores global
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('[Server] Error Crítico Global:', err);
    res.status(500).json({ 
      error: 'Error interno del servidor', 
      details: err.message 
    });
  });

  // Vite middleware para desarrollo
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // Servir index.html para cualquier ruta que no sea API
    app.get('*', (req, res) => {
      if (req.url.startsWith('/api/')) {
        return res.status(404).json({ error: 'Ruta de API no encontrada (GET)' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Manejador final para cualquier otro método (POST, etc) en rutas no encontradas
  app.all('*', (req, res) => {
    res.status(404).json({ 
      error: 'Ruta no encontrada', 
      method: req.method, 
      url: req.url,
      isApi: req.url.startsWith('/api/')
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
