import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { HfInference } from '@huggingface/inference';

dotenv.config();

const HUGGING_FACE_KEY = process.env.HUGGING_FACE_API_KEY;
if (!HUGGING_FACE_KEY) {
  console.error("Missing HUGGING_FACE_API_KEY in environment");
  process.exit(1);
}

const hf = new HfInference(HUGGING_FACE_KEY);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {}; // { roomId: { members: [], aiQueue: [], aiBusy: false } }

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Join room
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

  // Normal message
  socket.on('chatMessage', ({ roomId, username, message }) => {
    io.to(roomId).emit('chatMessage', { username, message });
  });

  // AI message request
  socket.on('aiMessage', ({ roomId, message }) => {
    if (!rooms[roomId]) return;
    const room = rooms[roomId];

    room.aiQueue.push({ socketId: socket.id, message });

    // Inform queue position
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

// AI Queue processor using Hugging Face
async function processAIQueue(roomId) {
  const room = rooms[roomId];
  if (!room || room.aiQueue.length === 0) {
    room.aiBusy = false;
    return;
  }

  room.aiBusy = true;
  const { socketId, message } = room.aiQueue.shift();

  // Update queue positions
  io.to(roomId).emit('aiQueueUpdate', room.aiQueue.map((_, i) => i + 1));

  // Typing indicator
  io.to(roomId).emit('aiTyping', true);

  try {
    // Call Hugging Face Inference API
    const response = await hf.textGeneration({
      model: 'gpt2', // you can replace with a Hugging Face hosted model like "gpt2-medium" or your own
      inputs: message,
      parameters: { max_new_tokens: 150 }
    });

    const aiMessage = Array.isArray(response) ? response[0].generated_text : response.generated_text;

    io.to(roomId).emit('chatMessage', { username: 'AI', message: aiMessage });

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
