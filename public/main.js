// main.js
const socket = io();

// Screens
const startScreen = document.getElementById('startScreen');
const chatScreen = document.getElementById('chatScreen');

// Inputs and buttons
const nameInput = document.getElementById('name');
const roomInput = document.getElementById('room');
const joinBtn = document.getElementById('joinBtn');
const messagesEl = document.getElementById('messages');
const input = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const aiBtn = document.getElementById('aiBtn');
const chatContainer = document.getElementById("chatContainer");
const scrollBtn = document.getElementById("scrollDownBtn");

// AI & members UI
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
    if (!success) {
      alert(message);
      return;
    }

    roomId = rid;
    startScreen.style.display = 'none';
    chatScreen.style.display = 'flex';
    // Display room ID for sharing
    document.getElementById('currentRoomId').textContent = roomId;
    updateMembers(members);
  });
});

// Send normal message
sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit('chatMessage', { roomId, username, message: msg });
  input.value = '';
}

// Send AI message
aiBtn.addEventListener('click', () => {
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit('aiMessage', { roomId, username, message: msg });
  input.value = '';
});

// Listen for chat messages
socket.on('chatMessage', ({ username, message }) => {
  addMessage(username, message);
});

// Listen for AI queue updates
socket.on('aiQueueUpdate', (queue) => {
  aiQueueEl.textContent = `AI Queue: ${queue.length}`;
});

// Listen for AI typing
socket.on('aiTyping', (isTyping) => {
  typingIndicator.style.display = isTyping ? 'block' : 'none';
});

// Listen for member updates
socket.on('updateMembers', updateMembers);

// ============================
// Helper to add messages
// ============================
function addMessage(user, message) {
  const msgEl = document.createElement('div');
  msgEl.classList.add('message', user === 'AI' ? 'ai' : 'user');

  // AI message with Markdown + animation
  if (user === 'AI') {
    // Convert markdown -> HTML
    const html = marked.parse(message);

    // Optional animation block
    let i = 0;
    const tempContainer = document.createElement('div');
    msgEl.appendChild(tempContainer);

    function typeWriter() {
      // Add one character at a time
      tempContainer.innerHTML = html.slice(0, i);
      i++;
      if (i <= html.length) {
        setTimeout(typeWriter, 10); // adjust speed here
      }
    }
    typeWriter();
  } else {
    // Normal user message (plain text)
    msgEl.textContent = `${user}: ${message}`;
  }

  messagesEl.appendChild(msgEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ============================
// Helper to update members list
// ============================
function updateMembers(members) {
  membersList.innerHTML = '';
  members.forEach(m => {
    const memberEl = document.createElement('div');
    memberEl.classList.add('member');
    memberEl.textContent = m.username;
    membersList.appendChild(memberEl);
  });
}

// Show button only if user scrolls up
chatContainer.addEventListener("scroll", () => {
  const nearBottom = chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 50;
  if (nearBottom) {
    scrollBtn.classList.remove("show");
  } else {
    scrollBtn.classList.add("show");
  }
});

// Scroll down when button clicked
scrollBtn.addEventListener("click", () => {
  chatContainer.scrollTo({
    top: chatContainer.scrollHeight,
    behavior: "smooth"
  });
});

