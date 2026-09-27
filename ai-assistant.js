const SUPABASE_FUNCTION_URL = "https://fbtloeehynqobbwcndru.supabase.co/functions/v1/help-ai";

const clean = s => String(s).replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
}[c]));

const linkify = s => clean(s)
  .replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
  .replace(/\n/g, "<br>");

const bubble = document.createElement("button");
bubble.className = "ai-bubble";
bubble.setAttribute("aria-label", "Ouvrir l’assistant Kelo");
bubble.innerHTML = "<span>✦</span><b>Assistant IA</b>";
document.body.appendChild(bubble);

const panel = document.createElement("aside");
panel.className = "ai-panel";
panel.innerHTML = '<div class="ai-head"><div><strong>Assistant Kelo</strong><small>Propulsé par Groq · GPT-OSS 120B</small></div><button aria-label="Fermer">×</button></div><div class="ai-messages"><div class="ai-msg bot">Bonjour ! Je suis l’assistant IA de Kelo Social. Posez-moi votre question sur le compte, les publications, les paramètres, la sécurité, la certification ou l’AT Protocol.</div></div><form class="ai-form"><input placeholder="Posez votre question…" autocomplete="off" maxlength="1000"><button aria-label="Envoyer">→</button></form>';
document.body.appendChild(panel);

const messagesEl = panel.querySelector(".ai-messages");
const form = panel.querySelector(".ai-form");
const input = form.querySelector("input");
const sendButton = form.querySelector("button");
const history = [];

bubble.onclick = () => {
  panel.classList.toggle("open");
  if (panel.classList.contains("open")) input.focus();
};

panel.querySelector(".ai-head button").onclick = () => panel.classList.remove("open");

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

form.onsubmit = async e => {
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
    const response = await fetch(SUPABASE_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history })
    });

    const data = await response.json().catch(() => ({}));
    loadingNode.remove();

    if (!response.ok || !data.answer) {
      throw new Error(data.error || "Réponse indisponible");
    }

    history.push({ role: "assistant", content: data.answer });
    addMessage("bot", data.answer);
  } catch (error) {
    loadingNode.remove();
    addMessage("bot", "Je rencontre actuellement un problème de connexion avec l’assistant. Vous pouvez continuer avec le centre d’aide ou consulter https://help.kelosocial.eu/contact.html pour contacter le support.");
    console.error("Assistant Kelo:", error);
  } finally {
    setLoading(false);
    input.focus();
  }
};