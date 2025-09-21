// server.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

dotenv.config();

// Config
const HUGGING_FACE_KEY = process.env.HUGGING_FACE_API_KEY;
const HF_MODEL = process.env.HF_MODEL || 'gpt2';
const HF_MAX_TOKENS = parseInt(process.env.HF_MAX_TOKENS || '150', 10);

if (!HUGGING_FACE_KEY) {
  console.error('Missing HUGGING_FACE_API_KEY in environment');
  process.exit(1);
}

const HF_ENDPOINT = `https://api-inference.huggingface.co/models/${HF_MODEL}`;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Simple health check
app.get('/health', (req, res) => res.send({ ok: true, model: HF_MODEL }));

// In-memory rooms
const rooms = {}; // { roomId: { members: [], aiQueue: [], aiBusy: false } }

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

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

  socket.on('chatMessage', ({ roomId, username, message }) => {
    io.to(roomId).emit('chatMessage', { username, message });
  });

  socket.on('aiMessage', ({ roomId, message, username }) => {
    if (!rooms[roomId]) return;
    const room = rooms[roomId];
    room.aiQueue.push({ socketId: socket.id, message, username });
    io.to(roomId).emit('aiQueueUpdate', room.aiQueue.map((_, i) => i + 1));
    if (!room.aiBusy) processAIQueue(roomId).catch(err => console.error(err));
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

// AI queue processor (Hugging Face HTTP API)
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
    console.log(`HF request -> model=${HF_MODEL} room=${roomId} from=${username || socketId}`);
    console.log('Sending to HF:', { message, typeofMessage: typeof message });
    const resp = await fetch(HF_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HUGGING_FACE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: message,
        parameters: { max_new_tokens: HF_MAX_TOKENS }
      })
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`HF API Error (${resp.status}): ${text}`);
      io.to(roomId).emit('chatMessage', {
        username: 'AI',
        message: `HF API Error (${resp.status}): ${text}`
      });
    } else {
      // parse JSON safely
      let data;
      try {
        data = await resp.json();
      } catch (e) {
        const txt = await resp.text();
        console.warn('HF response not JSON; raw text:', txt);
        io.to(roomId).emit('chatMessage', { username: 'AI', message: txt });
        data = null;
      }

      if (data) {
        // Many HF text models return [{ generated_text: "..." }]
        let aiText = '';
        if (Array.isArray(data) && data[0]?.generated_text) {
          aiText = data[0].generated_text;
        } else if (data.generated_text) {
          aiText = data.generated_text;
        } else if (typeof data === 'string') {
          aiText = data;
        } else {
          aiText = JSON.stringify(data).slice(0, 1000);
        }

        io.to(roomId).emit('chatMessage', { username: 'AI', message: aiText });
      }
    }
  } catch (err) {
    console.error('Hugging Face AI Error:', err);
    io.to(roomId).emit('chatMessage', { username: 'AI', message: 'Error: AI failed to respond.' });
  } finally {
    io.to(roomId).emit('aiTyping', false);
    room.aiBusy = false;
    if (room.aiQueue.length > 0) {
      // small delay to avoid flooding
      setTimeout(() => processAIQueue(roomId).catch(e => console.error(e)), 200);
    }
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} — HF model: ${HF_MODEL}`);
});

