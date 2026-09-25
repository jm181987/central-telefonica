import React,{useEffect,useRef,useState} from 'react';
import ReactDOM from 'react-dom/client';
import {io} from 'socket.io-client';
import {Inviter,Registerer,SessionState,UserAgent} from 'sip.js';
import './index.css';

type Cdr={id:number,src:string,dst:string,disposition:string,started_at:string,duration:number};
type Channel={id:string,name:string,state:string,caller?:any,connected?:any};

function App(){
  const [token,setToken]=useState(localStorage.getItem('token')||'');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [trunk,setTrunk]=useState<any>({status:'unknown'});
  const [active,setActive]=useState<Channel[]>([]);
  const [cdr,setCdr]=useState<Cdr[]>([]);
  const [number,setNumber]=useState('');
  const [ext,setExt]=useState('1000');
  const [sipPass,setSipPass]=useState('');
  const [phone,setPhone]=useState('offline');
  const uaRef=useRef<UserAgent|null>(null);
  const sessionRef=useRef<any>(null);
  const remoteAudio=useRef<HTMLAudioElement|null>(null);

  const api=async(path:string,init:RequestInit={})=>{
    const headers:any={'Content-Type':'application/json',...(init.headers||{})};
    if(token)headers.Authorization='Bearer '+token;
    const r=await fetch(path,{...init,headers});
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.message||data.error||'Error');
    return data;
  };

  const refresh=async()=>{if(!token)return; try{const [t,a,h]=await Promise.all([api('/api/trunks/vono/status'),api('/api/calls/active'),api('/api/calls/history?limit=100')]);setTrunk(t);setActive(a);setCdr(h);}catch(e){console.error(e)}};

  useEffect(()=>{refresh(); if(!token)return; const s=io({auth:{token}});s.on('telephony:event',refresh);s.on('ari:event',refresh);return()=>s.close()},[token]);

  const login=async(e:React.FormEvent)=>{e.preventDefault();const d=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})});localStorage.setItem('token',d.token);setToken(d.token)};

  const connectPhone=async()=>{
    const domain=location.host;
    const uri=UserAgent.makeURI('sip:'+ext+'@'+domain);
    if(!uri)return;
    const ua=new UserAgent({
      uri,
      authorizationUsername:ext,
      authorizationPassword:sipPass,
      transportOptions:{server:'wss://'+location.host+'/ws'},
      sessionDescriptionHandlerFactoryOptions:{constraints:{audio:true,video:false}},
      delegate:{onInvite:(invitation:any)=>{
        sessionRef.current=invitation;
        invitation.stateChange.addListener((state:any)=>{if(state===SessionState.Established)attachAudio(invitation)});
        invitation.accept(); setPhone('en llamada');
      }}
    });
    await ua.start(); await new Registerer(ua).register(); uaRef.current=ua;setPhone('registrado');
  };

  const attachAudio=(session:any)=>{
    const pc=session.sessionDescriptionHandler?.peerConnection;
    if(!pc||!remoteAudio.current)return;
    const stream=new MediaStream();
    pc.getReceivers().forEach((r:RTCRtpReceiver)=>{if(r.track)stream.addTrack(r.track)});
    remoteAudio.current.srcObject=stream;remoteAudio.current.play().catch(()=>{});
  };

  const call=async()=>{
    if(!uaRef.current)return alert('Conecte el softphone');
    const uri=UserAgent.makeURI('sip:'+number+'@'+location.host); if(!uri)return;
    const inviter=new Inviter(uaRef.current,uri,{sessionDescriptionHandlerOptions:{constraints:{audio:true,video:false}}});
    sessionRef.current=inviter;
    inviter.stateChange.addListener((state:any)=>{setPhone(String(state));if(state===SessionState.Established)attachAudio(inviter)});
    await inviter.invite();
  };
  const hangup=async()=>{const s=sessionRef.current;if(!s)return;if(s.state===SessionState.Established)await s.bye();else await s.cancel?.();setPhone('registrado')};

  const csv=()=>{const rows=[['fecha','origen','destino','estado','duracion'],...cdr.map(x=>[x.started_at,x.src,x.dst,x.disposition,String(x.duration)])];const blob=new Blob([rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n')],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='cdr.csv';a.click();URL.revokeObjectURL(a.href)};

  if(!token)return <main className="min-h-screen grid place-items-center p-6"><form onSubmit={login} className="card w-full max-w-md space-y-4"><h1 className="text-3xl font-black">Central Telefónica</h1><p className="text-slate-400">Acceso administrativo PBX</p><input className="input w-full" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/><input className="input w-full" type="password" placeholder="Contraseña" value={password} onChange={e=>setPassword(e.target.value)}/><button className="btn w-full">Ingresar</button></form></main>;

  return <main className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
    <header className="flex flex-wrap gap-4 justify-between items-center"><div><h1 className="text-3xl font-black">Central Telefónica</h1><p className="text-slate-400">Asterisk + VONO</p></div><div className="flex gap-2"><span className={'badge '+(trunk.status==='online'?'bg-emerald-500/20 text-emerald-300':'bg-rose-500/20 text-rose-300')}>VONO: {trunk.status}</span><button className="btn2" onClick={()=>{localStorage.removeItem('token');setToken('')}}>Salir</button></div></header>
    <section className="grid lg:grid-cols-3 gap-6">
      <div className="card space-y-4"><h2 className="font-bold text-xl">Softphone WebRTC</h2><div className="grid grid-cols-2 gap-2"><input className="input" value={ext} onChange={e=>setExt(e.target.value)} placeholder="Extensión"/><input className="input" type="password" value={sipPass} onChange={e=>setSipPass(e.target.value)} placeholder="Clave SIP"/></div><button className="btn2 w-full" onClick={connectPhone}>Conectar ({phone})</button><input className="input w-full text-2xl text-center" value={number} onChange={e=>setNumber(e.target.value)} placeholder="Número"/><div className="grid grid-cols-2 gap-2"><button className="btn" onClick={call}>Llamar</button><button className="btn2" onClick={hangup}>Colgar</button></div><audio ref={remoteAudio} autoPlay/></div>
      <div className="card lg:col-span-2"><div className="flex justify-between mb-4"><h2 className="font-bold text-xl">Llamadas activas</h2><button className="btn2" onClick={refresh}>Actualizar</button></div><div className="space-y-2">{active.length?active.map(c=><div key={c.id} className="bg-slate-950 rounded-xl p-3 flex justify-between"><span>{c.name}</span><span className="text-cyan-300">{c.state}</span></div>):<p className="text-slate-500">Sin llamadas activas</p>}</div></div>
    </section>
    <section className="card overflow-x-auto"><div className="flex justify-between mb-4"><h2 className="font-bold text-xl">Historial CDR</h2><button className="btn2" onClick={csv}>Exportar CSV</button></div><table className="w-full text-sm"><thead className="text-slate-400"><tr><th className="text-left p-2">Fecha</th><th>Origen</th><th>Destino</th><th>Estado</th><th>Duración</th></tr></thead><tbody>{cdr.map(x=><tr key={x.id} className="border-t border-slate-800"><td className="p-2">{x.started_at?new Date(x.started_at).toLocaleString():''}</td><td className="text-center">{x.src}</td><td className="text-center">{x.dst}</td><td className="text-center">{x.disposition}</td><td className="text-center">{x.duration}s</td></tr>)}</tbody></table></section>
  </main>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
