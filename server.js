const http=require("http");
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");

const PORT=Number(process.env.PORT||3000);
const ROOT=__dirname;
const GROQ_URL="https://api.groq.com/openai/v1/chat/completions";
const MODEL="openai/gpt-oss-120b";
const SUPABASE_URL=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
const SUPABASE_SECRET_KEY=process.env.SUPABASE_SECRET_KEY||"";
const sessions=new Map();
const attempts=new Map();

const fallbackKnowledge=[
"Compte : profil, connexion, inscription, photo, handle et informations du compte.",
"Publications : posts, réponses/commentaires, republications, Feed et commentaires d’un post isolé.",
"Paramètres : apparence, couleur/thème, langue, traduction, notifications et niveaux de l’algorithme.",
"Sécurité et confidentialité : protection du compte, signalement, blocage, modération et confidentialité.",
"Certification et vérification : certification distincte de la vérification ; vérifications humain, entreprise, association, institution, média, université et IA.",
"AT Protocol : identité, handle, domaine et PDS."
];

function send(res,status,body,headers={}){
 res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers});
 res.end(JSON.stringify(body));
}
function cookies(req){
 return Object.fromEntries(String(req.headers.cookie||"").split(";").map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf("=");return i<0?[x,""]:[x.slice(0,i),decodeURIComponent(x.slice(i+1))];}));
}
function isAdmin(req){
 const token=cookies(req).kelo_admin, s=token&&sessions.get(token);
 if(!s)return false;
 if(s< Date.now()){sessions.delete(token);return false;}
 return true;
}
function supabaseReady(res){
 if(!SUPABASE_URL||!SUPABASE_SECRET_KEY){send(res,503,{error:"Supabase n’est pas configuré sur le serveur."});return false;}
 return true;
}
async function sb(pathname,options={}){
 return fetch(SUPABASE_URL+pathname,{...options,headers:{apikey:SUPABASE_SECRET_KEY,Authorization:"Bearer "+SUPABASE_SECRET_KEY,"Content-Type":"application/json",...(options.headers||{})}});
}
async function body(req,max=20000){
 let raw="";
 for await(const chunk of req){raw+=chunk;if(raw.length>max)throw new Error("too_large");}
 try{return JSON.parse(raw||"{}");}catch{return null;}
}
async function knowledge(){
 if(!SUPABASE_URL||!SUPABASE_SECRET_KEY)return fallbackKnowledge;
 try{
  const r=await sb("/rest/v1/help_knowledge?select=title,content,category&published=eq.true&order=created_at.asc");
  const d=await r.json().catch(()=>[]);
  return r.ok&&Array.isArray(d)&&d.length?d.map(x=>"["+x.category+"] "+x.title+": "+x.content):fallbackKnowledge;
 }catch{return fallbackKnowledge;}
}

async function ai(req,res){
 if(req.method!=="POST")return send(res,405,{error:"Méthode non autorisée."});
 const key=process.env.GROQ_API_KEY;
 if(!key)return send(res,503,{error:"L’assistant IA n’est pas configuré sur le serveur."});
 const b=await body(req);
 const messages=Array.isArray(b.messages)?b.messages.filter(x=>x&&(x.role==="user"||x.role==="assistant")&&typeof x.content==="string").slice(-10):[];
 if(!messages.length)return send(res,400,{error:"Aucun message."});
 const k=await knowledge();
 const system="Tu es Lexo AI, l’assistant officiel du centre d’aide Kelo Social, par Kalyx AI.\nRéponds uniquement aux questions concernant Kelo Social et son centre d’aide. Réponds en français, clairement et brièvement. N’invente jamais une fonctionnalité. Tu n’as aucun accès aux comptes. Ne demande jamais de mot de passe, code, clé API ou secret. Si une intervention humaine est nécessaire, dirige vers support@kelosocial.eu.\n\nBase de connaissances :\n"+k.join("\n");
 try{
  const r=await fetch(GROQ_URL,{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({model:MODEL,messages:[{role:"system",content:system},...messages],temperature:.2,max_tokens:700,reasoning_effort:"low"})});
  const d=await r.json().catch(()=>({}));
  const answer=d&&d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content;
  if(!r.ok||!answer)return send(res,502,{error:"Le service IA est temporairement indisponible."});
  send(res,200,{answer,model:MODEL});
 }catch(e){console.error(e);send(res,502,{error:"Le service IA est temporairement indisponible."});}
}

async function contact(req,res){
 if(req.method!=="POST")return send(res,405,{error:"Méthode non autorisée."});
 if(!supabaseReady(res))return;
 const b=await body(req,10000);
 const name=String(b.name||"").trim().slice(0,100),email=String(b.email||"").trim().slice(0,200),subject=String(b.subject||"").trim().slice(0,160),message=String(b.message||"").trim().slice(0,5000);
 if(!name||!email||!subject||!message)return send(res,400,{error:"Tous les champs sont obligatoires."});
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return send(res,400,{error:"Adresse e-mail invalide."});
 const r=await sb("/rest/v1/help_contacts",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({name,email,subject,message})});
 if(!r.ok)return send(res,502,{error:"Impossible d’enregistrer votre demande."});
 send(res,201,{ok:true});
}

async function replyContact(req,res){
 if(req.method!=="POST")return send(res,405,{error:"Méthode non autorisée."});
 if(!isAdmin(req))return send(res,401,{error:"Non autorisé."});
 const key=process.env.RESEND_API_KEY;
 if(!key)return send(res,503,{error:"Resend n’est pas configuré sur le serveur."});
 const b=await body(req,12000);
 const to=String(b.email||"").trim().slice(0,200),subject=String(b.subject||"").trim().slice(0,160),message=String(b.message||"").trim().slice(0,8000);
 if(!to||!subject||!message||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(to))return send(res,400,{error:"Destinataire, sujet et message obligatoires."});
 const esc=x=>String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
 try{
  const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({from:"Kelo Social <support@kelosocial.eu>",to:[to],subject:subject.startsWith("Re:")?subject:"Re: "+subject,text:message,html:"<div style=\"font-family:Arial,sans-serif;line-height:1.6;color:#101828;white-space:pre-wrap\">"+esc(message)+"</div>",reply_to:"support@kelosocial.eu"})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)return send(res,502,{error:d.message||"Impossible d’envoyer l’e-mail."});
  return send(res,200,{ok:true,id:d.id||null});
 }catch(e){console.error(e);return send(res,502,{error:"Impossible d’envoyer l’e-mail."});}
}

async function admin(req,res,route){
 if(route==="/api/admin/login"){
  if(req.method!=="POST")return send(res,405,{error:"Méthode non autorisée."});
  if(!supabaseReady(res))return;
  const ip=req.socket.remoteAddress||"unknown",now=Date.now(),a=attempts.get(ip)||{n:0,t:now+900000};
  if(a.t<now){a.n=0;a.t=now+900000;}
  if(a.n>=10)return send(res,429,{error:"Trop de tentatives. Réessayez plus tard."});
  const b=await body(req,5000),password=String(b.password||"");
  if(!password)return send(res,400,{error:"Mot de passe requis."});
  const r=await sb("/rest/v1/rpc/verify_help_admin_password",{method:"POST",body:JSON.stringify({candidate:password})});
  const raw=await r.text().catch(()=>"");
  let value=false;try{value=JSON.parse(raw);}catch{}
  const ok=r.ok&&(value===true||value===1||value==="true"||(value&&value.verify_help_admin_password===true));
  if(!ok){
   a.n++;attempts.set(ip,a);
   console.error("Supabase admin login RPC:",r.status,raw);
   if(!r.ok){if(r.status===404)return send(res,503,{error:"La fonction Supabase verify_help_admin_password est introuvable. Relancez le SQL du fichier supabase-schema.sql dans Supabase."});if(r.status===401||r.status===403)return send(res,503,{error:"La clé Supabase utilisée par Render n’a pas les droits nécessaires. Vérifiez SUPABASE_SECRET_KEY."});return send(res,503,{error:"Supabase refuse la vérification du mot de passe. Vérifiez la fonction SQL et SUPABASE_SECRET_KEY dans Render."});}
   return send(res,401,{error:"Mot de passe incorrect."});
  }
  a.n=0;attempts.set(ip,a);
  const token=crypto.randomBytes(32).toString("hex");sessions.set(token,Date.now()+28800000);
  return send(res,200,{ok:true},{"Set-Cookie":"kelo_admin="+token+"; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800"});
 }
 if(route==="/api/admin/logout"){
  const token=cookies(req).kelo_admin;if(token)sessions.delete(token);
  return send(res,200,{ok:true},{"Set-Cookie":"kelo_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"});
 }
 if(!isAdmin(req))return send(res,401,{error:"Non autorisé."});
 if(route==="/api/admin/session")return send(res,200,{ok:true});
 if(route==="/api/admin/contact-reply")return replyContact(req,res);
 if(route==="/api/admin/contacts"&&req.method==="GET"){
  const r=await sb("/rest/v1/help_contacts?select=*&order=created_at.desc");return send(res,r.status,await r.json().catch(()=>[]));
 }
 if(route==="/api/admin/knowledge"){
  if(req.method==="GET"){const r=await sb("/rest/v1/help_knowledge?select=*&order=created_at.desc");return send(res,r.status,await r.json().catch(()=>[]));}
  const b=await body(req),id=String(b.id||"");
  if(req.method==="POST"){
   const item={title:String(b.title||"").trim().slice(0,200),content:String(b.content||"").trim().slice(0,20000),category:String(b.category||"Général").trim().slice(0,80),published:b.published!==false};
   if(!item.title||!item.content)return send(res,400,{error:"Titre et contenu obligatoires."});
   const r=await sb("/rest/v1/help_knowledge",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify(item)});return send(res,r.status,await r.json().catch(()=>[]));
  }
  if(req.method==="PATCH"){
   if(!id)return send(res,400,{error:"ID manquant."});
   const item={};if(b.title!==undefined)item.title=String(b.title).trim().slice(0,200);if(b.content!==undefined)item.content=String(b.content).trim().slice(0,20000);if(b.category!==undefined)item.category=String(b.category).trim().slice(0,80);if(b.published!==undefined)item.published=Boolean(b.published);
   const r=await sb("/rest/v1/help_knowledge?id=eq."+encodeURIComponent(id),{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify(item)});return send(res,r.status,await r.json().catch(()=>[]));
  }
  if(req.method==="DELETE"){
   if(!id)return send(res,400,{error:"ID manquant."});
   const r=await sb("/rest/v1/help_knowledge?id=eq."+encodeURIComponent(id),{method:"DELETE",headers:{Prefer:"return=minimal"}});return send(res,r.status,{ok:r.ok});
  }
 }
 return send(res,404,{error:"Route admin introuvable."});
}

const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".ico":"image/x-icon"};
http.createServer(async(req,res)=>{
 try{
  const route=decodeURIComponent((req.url||"/").split("?")[0]);
  if(route==="/admin"){
   res.writeHead(302,{Location:"/admin.html", "Cache-Control":"no-store"});
   return res.end();
  }
  if(route==="/api/ai")return ai(req,res);
  if(route==="/api/contact")return contact(req,res);
  if(route.startsWith("/api/admin/"))return admin(req,res,route);
  if(req.method!=="GET"&&req.method!=="HEAD")return send(res,405,{error:"Méthode non autorisée."});
  const rel=route==="/"?"index.html":route.replace(/^\/+/, ""),file=path.resolve(ROOT,rel);
  if(!file.startsWith(ROOT+path.sep))return send(res,403,{error:"Accès refusé."});
  fs.stat(file,(err,st)=>{if(err||!st.isFile())return send(res,404,{error:"Page introuvable."});res.writeHead(200,{"Content-Type":mime[path.extname(file).toLowerCase()]||"application/octet-stream","Cache-Control":"no-cache"});if(req.method==="HEAD")return res.end();fs.createReadStream(file).pipe(res);});
 }catch(e){console.error(e);send(res,500,{error:"Erreur serveur."});}
}).listen(PORT,"0.0.0.0",()=>console.log("Kelo Help Center listening on "+PORT));
