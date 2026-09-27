const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const MODEL = "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const helpKnowledge = [
  "Compte : profil, connexion, inscription, photo, handle et informations du compte.",
  "Publications : posts, réponses/commentaires, republications, Feed et commentaires d’un post isolé.",
  "Paramètres : apparence, couleur/thème, langue, traduction, notifications et niveaux de l’algorithme.",
  "Sécurité et confidentialité : protection du compte, signalement, blocage, modération et confidentialité.",
  "Certification et vérification : certification distincte de la vérification ; vérifications humain, entreprise, association, institution, média, université et IA.",
  "AT Protocol : identité, handle, domaine et PDS."
];

const system = `Tu es l’assistant officiel du centre d’aide Kelo Social.
Tu réponds uniquement aux questions concernant Kelo Social et son centre d’aide.
Réponds en français, clairement et brièvement.
N’invente jamais une fonctionnalité, une procédure ou une information.
Tu n’as aucun accès aux comptes et ne peux effectuer aucune action sur un compte.
Ne demande jamais de mot de passe, code, clé API ou autre secret.
Si une intervention de l’équipe est nécessaire, dirige vers support@kelosocial.eu.

Connaissances officielles :
${helpKnowledge.join("\n")}

Ressources officielles :
https://help.kelosocial.eu/articles/compte.html
https://help.kelosocial.eu/articles/publications.html
https://help.kelosocial.eu/articles/parametres.html
https://help.kelosocial.eu/articles/securite.html
https://help.kelosocial.eu/articles/certification.html
https://help.kelosocial.eu/articles/at-protocol.html
https://help.kelosocial.eu/contact.html`;

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(body));
}

async function handleAI(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type"});
    return res.end();
  }
  if (req.method !== "POST") return json(res, 405, {error:"Méthode non autorisée."});

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("GROQ_API_KEY is missing.");
    return json(res, 503, {error:"L’assistant IA n’est pas configuré sur le serveur."});
  }

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20000) return json(res, 413, {error:"Requête trop volumineuse."});
  }

  let body;
  try { body = JSON.parse(raw || "{}"); } catch {
    return json(res, 400, {error:"Requête invalide."});
  }

  const messages = Array.isArray(body.messages)
    ? body.messages.filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-10)
    : [];

  if (!messages.length) return json(res, 400, {error:"Aucun message."});

  try {
    const response = await fetch(GROQ_URL, {
      method:"POST",
      headers:{"Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:MODEL,
        messages:[{role:"system",content:system},...messages],
        temperature:0.2,
        max_tokens:700,
        reasoning_effort:"low"
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Groq error:", response.status, data);
      return json(res, 502, {error:"Le service IA est temporairement indisponible."});
    }
    const answer = data?.choices?.[0]?.message?.content;
    if (!answer) return json(res, 502, {error:"Le service IA n’a pas renvoyé de réponse."});
    return json(res, 200, {answer,model:MODEL});
  } catch (error) {
    console.error("Groq request failed:", error);
    return json(res, 502, {error:"Le service IA est temporairement indisponible."});
  }
}

const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".ico":"image/x-icon"};

const server=http.createServer(async(req,res)=>{
  try {
    if (req.url === "/api/ai") return await handleAI(req,res);
    if (req.method !== "GET" && req.method !== "HEAD") return json(res,405,{error:"Méthode non autorisée."});
    const requested=decodeURIComponent((req.url||"/").split("?")[0]);
    const relative=requested==="/"?"index.html":requested.replace(/^\/+/,"");
    const file=path.resolve(ROOT,relative);
    if (!file.startsWith(ROOT+path.sep)) return json(res,403,{error:"Accès refusé."});
    fs.stat(file,(err,stat)=>{
      if(err||!stat.isFile()) return json(res,404,{error:"Page introuvable."});
      res.writeHead(200,{"Content-Type":mime[path.extname(file).toLowerCase()]||"application/octet-stream"});
      if(req.method==="HEAD") return res.end();
      fs.createReadStream(file).pipe(res);
    });
  } catch(error) {
    console.error(error);
    json(res,500,{error:"Erreur serveur."});
  }
});
server.listen(PORT,"0.0.0.0",()=>console.log(`Kelo Help Center listening on port ${PORT}`));