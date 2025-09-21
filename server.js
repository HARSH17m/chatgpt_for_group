import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error("Missing OPENAI_API_KEY in environment");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_KEY });

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
  socket.on('aiMessage', async ({ roomId, message }) => {
    if (!rooms[roomId]) return;
    const room = rooms[roomId];

    room.aiQueue.push({ socketId: socket.id, message });

    // Inform queue position
    io.to(roomId).emit('aiQueueUpdate', room.aiQueue.map((_, i) => i + 1));

    if (!room.aiBusy) processAIQueue(roomId);
  });

  socket.on('disconnect', () => {
    // Remove user from all rooms
    for (const roomId in rooms) {
      const room = rooms[roomId];
      room.members = room.members.filter(m => m.id !== socket.id);
      room.aiQueue = room.aiQueue.filter(q => q.socketId !== socket.id);
      io.to(roomId).emit('updateMembers', room.members);
    }
  });
});

// AI Queue processor
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
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: message }],
      max_tokens: 150,
    });

    const aiMessage = response.choices[0].message.content;

    io.to(roomId).emit('chatMessage', { username: 'AI', message: aiMessage });

  } catch (err) {
    console.error('AI Error:', err);
    io.to(roomId).emit('chatMessage', { username: 'AI', message: 'Error: AI failed to respond.' });
  }

  io.to(roomId).emit('aiTyping', false);
  room.aiBusy = false;

  // Process next in queue
  if (room.aiQueue.length > 0) processAIQueue(roomId);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
