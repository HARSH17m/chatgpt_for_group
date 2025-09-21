import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

dotenv.config();

const HUGGING_FACE_KEY = process.env.HUGGING_FACE_API_KEY;
const HF_MODEL = process.env.HF_MODEL || "gpt2";

if (!HUGGING_FACE_KEY) {
  console.error("Missing HUGGING_FACE_API_KEY in environment");
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {}; // { roomId: { members: [], aiQueue: [], aiBusy: false } }

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('joinRoom', ({ roomId, username }, callback) => {
    if (!rooms[roomId]) rooms[roomId] = { members: [], aiQueue: [], aiBusy: false };

    const room = rooms[roomId];

    if (room.members.length >= 4) {
      return callback({ success: false, message: 'Room full' });
    }

    room.members.push({ id: socket.id, username });
    socket.join(roomId);
    io.to(roomId).emit('updateMembers', room.members);
    callback({ success: true, roomId, members: room.members });
  });

  socket.on('chatMessage', ({ roomId, username, message }) => {
    io.to(roomId).emit('chatMessage', { username, message });
  });

  socket.on('aiMessage', ({ roomId, message }) => {
    if (!rooms[roomId]) return;
    const room = rooms[roomId];

    room.aiQueue.push({ socketId: socket.id, message });

    io.to(roomId).emit('aiQueueUpdate', room.aiQueue.map((_, i) => i + 1));

    if (!room.aiBusy) processAIQueue(roomId);
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      room.members = room.members.filter(m => m.id !== socket.id);
      room.aiQueue = room.aiQueue.filter(q => q.socketId !== socket.id);
      io.to(roomId).emit('updateMembers', room.members);
    }
  });
});

// AI Queue processor using Hugging Face HTTP API
async function processAIQueue(roomId) {
  const room = rooms[roomId];
  if (!room || room.aiQueue.length === 0) {
    room.aiBusy = false;
    return;
  }

  room.aiBusy = true;
  const { socketId, message } = room.aiQueue.shift();

  io.to(roomId).emit('aiQueueUpdate', room.aiQueue.map((_, i) => i + 1));
  io.to(roomId).emit('aiTyping', true);

  try {
    const response = await fetch('https://api-inference.huggingface.co/models/${HF_MODEL}', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HUGGING_FACE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: message,
        parameters: { max_new_tokens: 100 }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`HF API Error (${response.status}): ${errorText}`);
      io.to(roomId).emit('chatMessage', { username: 'AI', message: `HF API Error (${response.status}): ${errorText}` });
    } else {
      const data = await response.json();
      const aiMessage = Array.isArray(data)
        ? data[0]?.generated_text || "AI failed to respond."
        : data.generated_text || "AI failed to respond.";
      io.to(roomId).emit('chatMessage', { username: 'AI', message: aiMessage });
    }


  } catch (err) {
    console.error('Hugging Face AI Error:', err);
    io.to(roomId).emit('chatMessage', { username: 'AI', message: 'Error: AI failed to respond.' });
  }

  io.to(roomId).emit('aiTyping', false);
  room.aiBusy = false;

  if (room.aiQueue.length > 0) processAIQueue(roomId);
}
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));



