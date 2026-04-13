import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const emailUser = 'segurosfoncorp@gmail.com';
const emailPass = 'xioaycxdutqpzfeu';

console.log('Probando conexión con:', emailUser);
console.log('Longitud de la clave:', emailPass.length);
console.log('Primeros 3 caracteres:', emailPass.substring(0, 3));
console.log('Últimos 3 caracteres:', emailPass.substring(emailPass.length - 3));

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: emailUser,
    pass: emailPass,
  },
  family: 4,
  connectionTimeout: 10000,
} as any);

transporter.verify((error, success) => {
  if (error) {
    console.error('ERROR de conexión:', error.message);
    process.exit(1);
  } else {
    console.log('CONEXIÓN EXITOSA');
    process.exit(0);
  }
});
