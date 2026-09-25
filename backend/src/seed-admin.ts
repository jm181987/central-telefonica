import bcrypt from 'bcryptjs';
import {db} from './db.js';
const email=process.env.ADMIN_EMAIL;
const password=process.env.ADMIN_PASSWORD;
if(!email||!password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
const hash=await bcrypt.hash(password,12);
await db.query("INSERT INTO users(email,password_hash,role) VALUES($1,$2,'admin') ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='admin'",[email,hash]);
console.log('Admin ready: '+email);
await db.end();
