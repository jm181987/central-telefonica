import http from 'node:http';
import {promises as fs} from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import {Server} from 'socket.io';
import Ari from 'ari-client';
import AsteriskManager from 'asterisk-manager';
import {z} from 'zod';
import {db} from './db.js';
import {config} from './config.js';
import {requireAuth,signToken} from './auth.js';

const app=express();
app.use(helmet());
app.use(cors());
app.use(express.json({limit:'256kb'}));
app.use('/api',rateLimit({windowMs:60_000,limit:120,standardHeaders:true,legacyHeaders:false}));

const server=http.createServer(app);
const io=new Server(server,{cors:{origin:true,credentials:true}});

let ari:any;
const ami:any=new (AsteriskManager as any)(config.ami.port,config.ami.host,config.ami.username,config.ami.password,true);
ami.keepConnected();

function amiAction(action:Record<string,unknown>):Promise<any>{
  return new Promise((resolve,reject)=>ami.action(action,(err:Error|null,res:any)=>err?reject(err):resolve(res)));
}

ami.on('managerevent',async(event:any)=>{
  io.emit('telephony:event',event);
  if(String(event.event||'').toLowerCase()==='cdr'){
    try{
      await db.query(
        'INSERT INTO cdr(uniqueid,src,dst,disposition,started_at,answered_at,ended_at,duration,billsec) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [event.uniqueid,event.source||event.src,event.destination||event.dst,event.disposition,event.starttime||null,event.answertime||null,event.endtime||null,Number(event.duration||0),Number(event.billableseconds||event.billsec||0)]
      );
    }catch(e){console.error('CDR insert failed',e);}
  }
});

async function connectAri(){
  ari=await (Ari as any).connect(config.ari.url,config.ari.username,config.ari.password);
  ari.on('StasisStart',(_e:any,c:any)=>io.emit('ari:event',{type:'StasisStart',channel:c}));
  ari.on('StasisEnd',(_e:any,c:any)=>io.emit('ari:event',{type:'StasisEnd',channel:c}));
  ari.start(config.ari.app);
}

function validExtension(value:string){return /^[1-9][0-9]{3}$/.test(value);}
function extensionBlock(extension:string,secret:string){
  return '\n['+extension+']\ntype=auth\nauth_type=userpass\nusername='+extension+'\npassword='+secret+
  '\n\n['+extension+']\ntype=aor\nmax_contacts=5\nremove_existing=yes\nqualify_frequency=30'+
  '\n\n['+extension+']\ntype=endpoint\ntransport=transport-wss\ncontext=from-internal\ndisallow=all\nallow=opus,ulaw,alaw,g722\nauth='+extension+'\naors='+extension+
  '\nwebrtc=yes\ndtls_auto_generate_cert=no\ndtls_cert_file=/etc/asterisk/tls/fullchain.pem\ndtls_private_key=/etc/asterisk/tls/privkey.pem\ndtls_verify=fingerprint\ndtls_setup=actpass\nmedia_encryption=dtls\nice_support=yes\nrtcp_mux=yes\nuse_avpf=yes\ndirect_media=no\ndtmf_mode=rfc4733\n';
}

app.get('/health',(_req,res)=>res.json({ok:true}));

app.post('/api/auth/login',async(req,res)=>{
  const body=z.object({email:z.string().email(),password:z.string().min(1)}).safeParse(req.body);
  if(!body.success)return res.status(400).json({error:'invalid_payload'});
  const q=await db.query('SELECT id,email,password_hash,role FROM users WHERE email=$1',[body.data.email]);
  const u=q.rows[0];
  if(!u||!(await bcrypt.compare(body.data.password,u.password_hash)))return res.status(401).json({error:'invalid_credentials'});
  res.json({token:signToken(u),user:{id:u.id,email:u.email,role:u.role}});
});

app.use('/api',requireAuth);

app.post('/api/calls/originate',async(req,res)=>{
  const b=z.object({number:z.string().regex(/^\+?[0-9]{3,20}$/),callerId:z.string().optional()}).safeParse(req.body);
  if(!b.success)return res.status(400).json({error:'invalid_number'});
  try{
    const r=await amiAction({action:'Originate',channel:'Local/'+b.data.number+'@ari-originate',context:'ari-originate',exten:b.data.number,priority:1,callerid:b.data.callerId||config.vono.username,async:'true',timeout:60000});
    res.status(202).json({ok:true,result:r});
  }catch(e:any){res.status(502).json({error:'originate_failed',message:e.message});}
});

app.get('/api/calls/active',async(_req,res)=>{
  try{
    const channels=await ari.channels.list();
    res.json(channels.map((c:any)=>({id:c.id,name:c.name,state:c.state,caller:c.caller,connected:c.connected,creationtime:c.creationtime})));
  }catch(e:any){res.status(502).json({error:'ari_failed',message:e.message});}
});

app.get('/api/calls/history',async(req,res)=>{
  const limit=Math.min(Number(req.query.limit||100),500);
  const src=String(req.query.src||'');
  const dst=String(req.query.dst||'');
  const q=await db.query(
    'SELECT * FROM cdr WHERE ($1=\'\' OR src ILIKE $1) AND ($2=\'\' OR dst ILIKE $2) ORDER BY started_at DESC NULLS LAST LIMIT $3',
    [src?'%'+src+'%':'',dst?'%'+dst+'%':'',limit]
  );
  res.json(q.rows);
});

app.post('/api/calls/hangup',async(req,res)=>{
  const b=z.object({channelId:z.string().min(1)}).safeParse(req.body);
  if(!b.success)return res.status(400).json({error:'invalid_payload'});
  try{await ari.channels.hangup({channelId:b.data.channelId});res.json({ok:true});}
  catch(e:any){res.status(502).json({error:'hangup_failed',message:e.message});}
});

app.post('/api/calls/transfer',async(req,res)=>{
  const b=z.object({channel:z.string().min(1),extension:z.string().regex(/^[1-9][0-9]{3}$/)}).safeParse(req.body);
  if(!b.success)return res.status(400).json({error:'invalid_payload'});
  try{const r=await amiAction({action:'Redirect',channel:b.data.channel,context:'from-internal',exten:b.data.extension,priority:1});res.json({ok:true,result:r});}
  catch(e:any){res.status(502).json({error:'transfer_failed',message:e.message});}
});

app.get('/api/extensions',async(_req,res)=>{
  const q=await db.query('SELECT id,extension,name,enabled,created_at FROM extensions ORDER BY extension');
  res.json(q.rows);
});

app.post('/api/extensions',async(req,res)=>{
  const b=z.object({extension:z.string(),name:z.string().min(1).max(120),secret:z.string().min(12).optional()}).safeParse(req.body);
  if(!b.success||!validExtension(b.data.extension))return res.status(400).json({error:'extension_must_be_1000_9999'});
  const secret=b.data.secret||crypto.randomBytes(18).toString('base64url');
  try{
    const hash=await bcrypt.hash(secret,12);
    const q=await db.query('INSERT INTO extensions(extension,name,sip_secret_hash) VALUES($1,$2,$3) RETURNING id,extension,name,enabled,created_at',[b.data.extension,b.data.name,hash]);
    await fs.mkdir('/shared/asterisk-generated',{recursive:true});
    await fs.appendFile('/shared/asterisk-generated/pjsip_extensions.conf',extensionBlock(b.data.extension,secret),{mode:0o600});
    await amiAction({action:'Command',command:'pjsip reload'});
    res.status(201).json({...q.rows[0],sip_secret:secret,warning:'Guardar esta contraseña ahora; no vuelve a mostrarse.'});
  }catch(e:any){res.status(409).json({error:'extension_create_failed',message:e.message});}
});

app.get('/api/trunks/vono/status',async(_req,res)=>{
  try{
    const r=await amiAction({action:'Command',command:'pjsip show registrations'});
    const raw=String(r.output||r.message||'');
    const line=raw.split('\n').find((x:string)=>x.toLowerCase().includes('vono'))||raw;
    const n=line.toLowerCase();
    const status=n.includes('registered')&&!n.includes('unregistered')?'online':(n.includes('rejected')||n.includes('unregistered'))?'offline':'unknown';
    res.json({status,host:config.vono.host,port:config.vono.port,detail:line});
  }catch(e:any){res.status(502).json({status:'unknown',error:e.message});}
});

app.get('/api/dids',async(_req,res)=>{
  const q=await db.query('SELECT * FROM did_routes ORDER BY did');
  res.json(q.rows);
});
app.post('/api/dids',async(req,res)=>{
  const b=z.object({did:z.string().min(3),destination_type:z.enum(['extension','ivr','queue','conference']),destination:z.string().min(1)}).safeParse(req.body);
  if(!b.success)return res.status(400).json({error:'invalid_payload'});
  const q=await db.query('INSERT INTO did_routes(did,destination_type,destination) VALUES($1,$2,$3) ON CONFLICT(did) DO UPDATE SET destination_type=EXCLUDED.destination_type,destination=EXCLUDED.destination RETURNING *',[b.data.did,b.data.destination_type,b.data.destination]);
  res.json(q.rows[0]);
});

io.use((socket,next)=>{
  try{
    const token=String(socket.handshake.auth?.token||'');
    if(!token)return next(new Error('unauthorized'));
    next();
  }catch{next(new Error('unauthorized'));}
});

server.listen(config.port,async()=>{
  console.log('API listening on '+config.port);
  try{await connectAri();console.log('ARI connected');}catch(e){console.error('ARI connection failed',e);}
});
