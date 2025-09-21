const socket = io();

const joinContainer = document.getElementById('join-container');
const chatContainer = document.getElementById('chat-container');
const usernameInput = document.getElementById('username');
const roomInput = document.getElementById('room');
const joinBtn = document.getElementById('joinBtn');
const joinMsg = document.getElementById('join-msg');
const messagesEl = document.getElementById('messages');
const membersEl = document.getElementById('members');
const messageInput = document.getElementById('message');
const sendBtn = document.getElementById('sendBtn');
const aiBtn = document.getElementById('aiBtn');
const aiStatusEl = document.getElementById('ai-status');

let roomId, username;

joinBtn.addEventListener('click', () => {
  username = usernameInput.value.trim();
  roomId = roomInput.value.trim() || `guest${Math.floor(Math.random()*10000)}`;

  if (!username) return alert("Enter a name");

  socket.emit('joinRoom', { roomId, username }, (res) => {
    if (!res.success) return joinMsg.textContent = res.message;

    joinContainer.classList.add('hidden');
    chatContainer.classList.remove('hidden');
    updateMembers(res.members);
  });
});

sendBtn.addEventListener('click', () => {
  const msg = messageInput.value.trim();
  if (!msg) return;
  appendMessage(username, msg);
  socket.emit('chatMessage', { roomId, username, message: msg });
  messageInput.value = '';
});

aiBtn.addEventListener('click', () => {
  const msg = messageInput.value.trim();
  if (!msg) return;
  socket.emit('aiMessage', { roomId, message: msg });
  messageInput.value = '';
});

socket.on('chatMessage', ({ username, message }) => {
  appendMessage(username, message);
});

socket.on('updateMembers', (members) => {
  updateMembers(members);
});

socket.on('aiQueueUpdate', (queue) => {
  aiStatusEl.textContent = queue.length > 0 ? `AI Queue: ${queue.join(', ')}` : '';
});

socket.on('aiTyping', (status) => {
  aiStatusEl.textContent = status ? 'AI is typing...' : '';
});

function appendMessage(user, text) {
  const el = document.createElement('div');
  el.classList.add('message');
  el.innerHTML = `<strong>${user}:</strong> ${text}`;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function updateMembers(members) {
  membersEl.innerHTML = `<strong>Members:</strong> ${members.map(m => m.username).join(', ')}`;
}
