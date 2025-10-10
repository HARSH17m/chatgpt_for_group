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

// Helper: scroll to bottom
function scrollToBottom() {
  chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
}

// Join room
joinBtn.addEventListener('click', () => {
  username = nameInput.value.trim();
  roomId = roomInput.value.trim() || undefined;
  if(!username){ alert('Enter your name!'); return; }

  socket.emit('joinRoom', { roomId, username }, ({ success, roomId: rid, members, message }) => {
    if(!success){ alert(message); return; }
    roomId = rid;
    startScreen.style.display = 'none';
    chatScreen.style.display = 'flex';
    input.focus();
    document.getElementById('currentRoomId').textContent = roomId;
    updateMembers(members);
  });
});

// Send normal message
sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keypress', (e) => { if(e.key==='Enter') sendMessage(); });

function sendMessage(){
  const msg = input.value.trim();
  if(!msg) return;
  const msgEl = document.createElement('div');
  msgEl.classList.add('message', 'user');
  msgEl.textContent = `${username}: ${msg} 🕒`; // clock symbol while sending
  messagesEl.appendChild(msgEl);
  scrollToBottom();
  input.value = '';
  input.focus();
  socket.emit('chatMessage', { roomId, username, message: msg });
  // simulate delivered tick after emit
  setTimeout(()=>{ msgEl.textContent = `${username}: ${msg} ✔`; }, 300);
}

// Send AI message
aiBtn.addEventListener('click', () => {
  const msg = input.value.trim();
  if(!msg) return;
  const question = `Q - ${username}: ${msg}`;
  addMessage(username, question, true); // show question instantly
  input.value = '';
  input.focus();
  socket.emit('aiMessage', { roomId, username, message: msg });
});

// Listen for chat messages
socket.on('chatMessage', ({ username, message }) => { addMessage(username, message); });

// AI queue
socket.on('aiQueueUpdate', (queue) => { aiQueueEl.textContent = `AI Queue: ${queue.length}`; });

// AI typing
socket.on('aiTyping', (isTyping) => {
  typingIndicator.style.display = isTyping ? 'flex' : 'none';
});

// Update members
socket.on('updateMembers', updateMembers);

function addMessage(user, message, isQuestion=false){
  const msgEl = document.createElement('div');
  msgEl.classList.add('message', user==='AI'?'ai':'user');

  if(user==='AI'){
    // typewriter + markdown
    const html = marked.parse(message);
    let i=0;
    const tempContainer = document.createElement('div');
    msgEl.appendChild(tempContainer);
    function typeWriter(){
      tempContainer.innerHTML = html.slice(0,i);
      i++;
      if(i<=html.length) setTimeout(typeWriter,10);
    }
    typeWriter();
  } else {
    msgEl.textContent = isQuestion ? message : `${user}: ${message}`;
  }

  messagesEl.appendChild(msgEl);
  scrollToBottom();
}

function updateMembers(members){
  membersList.innerHTML = '';
  members.forEach(m=>{
    const memberEl = document.createElement('div');
    memberEl.classList.add('member');
    memberEl.textContent = m.username;
    membersList.appendChild(memberEl);
  });
}

// Scroll button
chatContainer.addEventListener("scroll",()=>{
  const nearBottom = chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 50;
  if(nearBottom) scrollBtn.classList.remove("show");
  else scrollBtn.classList.add("show");
});

scrollBtn.addEventListener("click",()=>{ scrollToBottom(); });

// Disable send button if input empty
input.addEventListener("input",()=>{ sendBtn.disabled = !input.value.trim(); });
sendBtn.disabled = true;
