import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();
const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error("Missing OPENAI_API_KEY in environment");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_KEY });

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const io = new Server(server);

const rooms = {}; // { roomId: { messages: [], assistantEnabled: true } }

function mkMsg(user, role, text) {
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
    user,
    role,
    text,
    ts: Date.now()
  };
}

function keepRecent(messages, n = 20) {
  return messages.slice(-n);
}

io.on('connection', socket => {
  console.log('New client connected:', socket.id);

  socket.on('join', ({ roomId = 'main', username = 'Guest' }) => {
    socket.join(roomId);
    socket.data.username = username;
    socket.data.roomId = roomId;

    if (!rooms[roomId]) {
      rooms[roomId] = { messages: [ mkMsg('system', 'system', 'Room created') ], assistantEnabled: true };
    }

    socket.emit('history', rooms[roomId].messages);
    io.to(roomId).emit('message', mkMsg('system','system', `${username} joined room ${roomId}`));
  });

  socket.on('set_assistant', ({ enabled }) => {
    const room = rooms[socket.data.roomId];
    if (!room) return;
    room.assistantEnabled = !!enabled;
    io.to(socket.data.roomId).emit('message', mkMsg('system','system', `Assistant active: ${room.assistantEnabled}`));
  });

  socket.on('chat_message', async text => {
    const username = socket.data.username || 'Guest';
    const roomId = socket.data.roomId || 'main';
    const room = rooms[roomId];
    if (!room) return;

    const userMsg = mkMsg(username, 'user', text);
    room.messages.push(userMsg);
    io.to(roomId).emit('message', userMsg);

    const shouldAssistant = room.assistantEnabled || text.startsWith('/gpt') || text.includes('@gpt');
    if (!shouldAssistant) return;

    io.to(roomId).emit('assistant_typing');

    const systemPrompt = {
      role: 'system',
      content: 'You are ChatGPT, a helpful assistant in this group chat. Keep replies short and friendly.'
    };

    const historyForModel = keepRecent(
      room.messages.filter(m => m.role === 'user' || m.role === 'assistant'),
      20
    ).map(m => {
      if (m.role === 'user') return { role: 'user', content: `${m.user}: ${m.text}` };
      else return { role: 'assistant', content: m.text };
    });

    const messagesPayload = [systemPrompt, ...historyForModel];

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo', // or whichever model you have access to
        messages: messagesPayload,
        max_tokens: 350
      });

      const assistantText = completion.choices?.[0]?.message?.content ?? "Sorry, I couldn't reply.";
      const assistantMsg = mkMsg('ChatGPT', 'assistant', assistantText);
      room.messages.push(assistantMsg);
      io.to(roomId).emit('message', assistantMsg);
    } catch (err) {
      console.error("OpenAI error:", err);
      io.to(roomId).emit('message', mkMsg('system', 'system', 'Assistant error: ' + (err.message || 'unknown')));
    } finally {
      io.to(roomId).emit('assistant_done');
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
      
