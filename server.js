// server.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
if (!GOOGLE_API_KEY) {
  console.error('Missing GOOGLE_API_KEY in environment');
  process.exit(1);
}

// Initialize Google GenAI SDK
const aiClient = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static('public'));

// Health check
app.get('/health', (req, res) => res.send({ ok: true }));

// In-memory room management
const rooms = {}; // { roomId: { members: [], aiQueue: [], aiBusy: false } }

io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);

  // Join room
  socket.on('joinRoom', ({ roomId, username }, callback) => {
    if (!roomId) roomId = `guest${Math.floor(Math.random() * 10000)}`;
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

  // Normal chat messages
  socket.on('chatMessage', ({ roomId, username, message }) => {
    io.to(roomId).emit('chatMessage', { username, message });
  });

  // AI tagged messages
  socket.on('aiMessage', ({ roomId, message, username }) => {
    if (!rooms[roomId]) return;
    const room = rooms[roomId];
    room.aiQueue.push({ socketId: socket.id, message, username });
    io.to(roomId).emit('aiQueueUpdate', room.aiQueue.map((_, i) => i + 1));

    if (!room.aiBusy) processAIQueue(roomId).catch(console.error);
  });

  socket.on('disconnect', () => {
    for (const rid in rooms) {
      const room = rooms[rid];
      room.members = room.members.filter(m => m.id !== socket.id);
      room.aiQueue = room.aiQueue.filter(q => q.socketId !== socket.id);
      io.to(rid).emit('updateMembers', room.members);
      io.to(rid).emit('aiQueueUpdate', room.aiQueue.map((_, i) => i + 1));
    }
  });
});

// AI queue processor using Google GenAI SDK
async function processAIQueue(roomId) {
  const room = rooms[roomId];
  if (!room || room.aiQueue.length === 0) {
    if (room) room.aiBusy = false;
    return;
  }

  room.aiBusy = true;
  const { socketId, message, username } = room.aiQueue.shift();
  io.to(roomId).emit('aiQueueUpdate', room.aiQueue.map((_, i) => i + 1));
  io.to(roomId).emit('aiTyping', true);

  try {
    console.log(`Google AI request -> room=${roomId} from=${username || socketId}`);
    console.log('Message:', message);

    // Call Google AI
    const response = await aiClient.models.generateContent({
      model: "gemini-2.5-flash",   // Update model if needed
      contents: [{ text: message.toString().trim() }]
    });

    const aiText = response.text || "AI failed to respond";
    io.to(roomId).emit('chatMessage', { username: 'AI', message: aiText });

  } catch (err) {
    console.error('Google AI SDK Error:', err);
    io.to(roomId).emit('chatMessage', { username: 'AI', message: `AI Error: ${err.message}` });
  } finally {
    io.to(roomId).emit('aiTyping', false);
    room.aiBusy = false;
    if (room.aiQueue.length > 0) {
      setTimeout(() => processAIQueue(roomId).catch(console.error), 200);
    }
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
