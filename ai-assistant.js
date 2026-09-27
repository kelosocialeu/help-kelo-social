const API_URL = "/api/ai";

function initKeloAssistant() {
  if (document.querySelector(".ai-bubble")) return;

  const clean = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const linkify = s => clean(s).replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\n/g, "<br>");

  const bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = "ai-bubble";
  bubble.setAttribute("aria-label", "Ouvrir l’assistant Kelo");
  bubble.innerHTML = '<span class="ai-bubble-icon" aria-hidden="true">✦</span><b>Assistant IA</b>';
  document.body.appendChild(bubble);

  const panel = document.createElement("aside");
  panel.className = "ai-panel";
  panel.setAttribute("aria-label", "Assistant Kelo");
  panel.innerHTML = '<div class="ai-head"><div><strong>Assistant Kelo</strong><small>Lexo AI · par Kalyx AI</small></div><button type="button" aria-label="Fermer">×</button></div><div class="ai-messages"><div class="ai-msg bot">Bonjour ! Je suis l’assistant IA de Kelo Social. Posez-moi votre question sur le compte, les publications, les paramètres, la sécurité, la certification ou l’AT Protocol.</div></div><form class="ai-form"><input placeholder="Posez votre question…" autocomplete="off" maxlength="1000"><button type="submit" aria-label="Envoyer">→</button></form>';
  document.body.appendChild(panel);

  const messagesEl = panel.querySelector(".ai-messages");
  const form = panel.querySelector(".ai-form");
  const input = form.querySelector("input");
  const sendButton = form.querySelector("button");
  const history = [];

  bubble.addEventListener("click", () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) input.focus();
  });
  panel.querySelector(".ai-head button").addEventListener("click", () => panel.classList.remove("open"));

  function addMessage(role, content) {
    const node = document.createElement("div");
    node.className = "ai-msg " + role;
    node.innerHTML = role === "bot" ? linkify(content) : clean(content);
    messagesEl.appendChild(node);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setLoading(loading) {
    input.disabled = loading;
    sendButton.disabled = loading;
    sendButton.textContent = loading ? "…" : "→";
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    const question = input.value.trim();
    if (!question || input.disabled) return;
    addMessage("user", question);
    history.push({ role: "user", content: question });
    input.value = "";
    setLoading(true);
    const loadingNode = document.createElement("div");
    loadingNode.className = "ai-msg bot";
    loadingNode.textContent = "Je réfléchis…";
    messagesEl.appendChild(loadingNode);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
      const response = await fetch(API_URL, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:history.slice(-10)})});
      const data = await response.json().catch(() => ({}));
      loadingNode.remove();
      if (!response.ok || !data.answer) throw new Error(data.error || "Réponse indisponible");
      history.push({ role:"assistant", content:data.answer });
      addMessage("bot", data.answer);
    } catch (error) {
      loadingNode.remove();
      addMessage("bot", "Je rencontre actuellement un problème de connexion avec l’assistant. Vous pouvez consulter le centre d’aide ou contacter le support à support@kelosocial.eu.");
      console.error("Assistant Kelo:", error);
    } finally {
      setLoading(false);
      input.focus();
    }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initKeloAssistant, {once:true});
else initKeloAssistant();


function initKeloTranslation(){
  if(!document.getElementById('google_translate_element')) return;
  window.googleTranslateElementInit=function(){
    if(window.google&&google.translate){new google.translate.TranslateElement({pageLanguage:'fr',autoDisplay:false,multilanguagePage:true},'google_translate_element');}
  };
  if(!document.querySelector('script[data-kelo-translate]')){const s=document.createElement('script');s.src='https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';s.async=true;s.dataset.keloTranslate='1';document.head.appendChild(s);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initKeloTranslation,{once:true});else initKeloTranslation();
