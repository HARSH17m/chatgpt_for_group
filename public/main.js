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

// Join room
joinBtn.addEventListener('click', () => {
  username = nameInput.value.trim();
  roomId = roomInput.value.trim() || undefined;

  if (!username) {
    alert('Enter your name!');
    return;
  }

  socket.emit('joinRoom', { roomId, username }, ({ success, roomId: rid, members, message }) => {
    if (!success) return alert(message);
    roomId = rid;
    startScreen.style.display = 'none';
    chatScreen.style.display = 'flex';
    document.getElementById('currentRoomId').textContent = roomId;
    updateMembers(members);
    input.focus();
  });
});

// Normal message
sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit('chatMessage', { roomId, username, message: msg });
  input.value = '';
  input.focus();
}

// AI message
aiBtn.addEventListener('click', () => {
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit('aiMessage', { roomId, username, message: msg });
  addMessage('You', `Q - ${msg}`); // Local echo
  input.value = '';
  input.focus();
});

// Receive normal message
socket.on('chatMessage', ({ username, message }) => {
  addMessage(username, message);
});

// Receive AI updates
socket.on('aiQueueUpdate', (queue) => {
  aiQueueEl.textContent = `AI Queue: ${queue.length}`;
});

socket.on('aiTyping', (isTyping) => {
  typingIndicator.style.display = isTyping ? 'block' : 'none';
});

socket.on('updateMembers', updateMembers);

// Add message to chat
function addMessage(user, message) {
  const msgEl = document.createElement('div');
  msgEl.classList.add('message', user === 'AI' ? 'ai' : 'user');

  const nameEl = document.createElement('strong');
  nameEl.textContent = user;
  msgEl.appendChild(nameEl);

  if (user === 'AI') {
    const html = marked.parse(message);
    const tempContainer = document.createElement('div');
    msgEl.appendChild(tempContainer);
    let i = 0;
    function typeWriter() {
      tempContainer.innerHTML = html.slice(0, i);
      i++;
      if (i <= html.length) setTimeout(typeWriter, 10);
    }
    typeWriter();
  } else {
    msgEl.innerHTML += message;
  }

  messagesEl.appendChild(msgEl);
  chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: "smooth" });
}

// Members
function updateMembers(members) {
  membersList.innerHTML = '';
  members.forEach(m => {
    const memberEl = document.createElement('div');
    memberEl.classList.add('member');
    memberEl.textContent = m.username;
    membersList.appendChild(memberEl);
  });
}

// Scroll button
chatContainer.addEventListener("scroll", () => {
  const nearBottom = chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 50;
  scrollBtn.classList.toggle("show", !nearBottom);
});

scrollBtn.addEventListener("click", () => {
  chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: "smooth" });
});
    
