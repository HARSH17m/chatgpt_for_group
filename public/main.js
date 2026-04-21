const socket = io();

const startScreen = document.getElementById('startScreen');
const chatScreen = document.getElementById('chatScreen');
const nameInput = document.getElementById('name');
const roomInput = document.getElementById('room');
const joinBtn = document.getElementById('joinBtn');
const messagesEl = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const aiBtn = document.getElementById('aiBtn');
const chatContainer = document.getElementById("chatContainer");
const scrollBtn = document.getElementById("scrollDownBtn");
const aiQueueEl = document.getElementById('aiQueue');
const typingIndicator = document.getElementById('typingIndicator');
const membersList = document.getElementById('membersList');

let username = '';
let roomId = '';

joinBtn.onclick = () => {
  username = nameInput.value.trim();
  roomId = roomInput.value.trim() || undefined;

  if (!username) return alert("Enter name");

  socket.emit('joinRoom', { roomId, username }, ({ success, roomId: rid, members }) => {
    if (!success) return;
    roomId = rid;

    startScreen.style.display = "none";
    chatScreen.style.display = "flex";

    document.getElementById("currentRoomId").textContent = roomId;
    updateMembers(members);
  });
};

sendBtn.onclick = sendMessage;
input.addEventListener("keypress", e => {
  if (e.key === "Enter") sendMessage();
});

function sendMessage() {
  const msg = input.value.trim();
  if (!msg) return;

  socket.emit("chatMessage", { roomId, username, message: msg });
  input.value = "";
}

aiBtn.onclick = () => {
  const msg = input.value.trim();
  if (!msg) return;

  socket.emit("aiMessage", { roomId, username, message: msg });
  addMessage("You", "Q - " + msg);
  input.value = "";
};

socket.on("chatMessage", ({ username, message }) => {
  addMessage(username, message);
});

socket.on("aiQueueUpdate", q => {
  aiQueueEl.textContent = "AI Queue: " + q.length;
});

socket.on("aiTyping", t => {
  typingIndicator.style.display = t ? "block" : "none";
});

socket.on("updateMembers", updateMembers);

function addMessage(user, message) {
  const msgEl = document.createElement("div");
  msgEl.classList.add("message", user === "AI" ? "ai" : "user");

  const name = document.createElement("strong");
  name.textContent = user;

  const text = document.createElement("div");

  if (user === "AI") {
    const html = marked.parse(message);
    let i = 0;

    function type() {
      text.innerHTML = html.slice(0, i);
      i++;
      if (i <= html.length) setTimeout(type, 8);
    }
    type();
  } else {
    text.textContent = message;
  }

  msgEl.appendChild(name);
  msgEl.appendChild(text);
  messagesEl.appendChild(msgEl);

  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function updateMembers(members) {
  membersList.innerHTML = "";
  members.forEach(m => {
    const el = document.createElement("div");
    el.classList.add("member");
    el.textContent = m.username;
    membersList.appendChild(el);
  });
}

chatContainer.addEventListener("scroll", () => {
  const nearBottom = chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 50;
  scrollBtn.classList.toggle("show", !nearBottom);
});

scrollBtn.onclick = () => {
  chatContainer.scrollTop = chatContainer.scrollHeight;
};
