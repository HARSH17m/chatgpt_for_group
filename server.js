import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const HUGGING_FACE_API_KEY = process.env.HUGGING_FACE_API_KEY;
const MODEL_NAME = "gpt2"; // You can replace with another chat-friendly model

app.use(express.static("public")); // Serve frontend files
app.use(express.json());

// Function to get response from Hugging Face
async function getHfResponse(message) {
  try {
    const response = await axios.post(
      `https://api-inference.huggingface.co/models/${MODEL_NAME}`,
      { inputs: message },
      {
        headers: {
          Authorization: `Bearer ${HUGGING_FACE_API_KEY}`,
        },
      }
    );
    // The response can be text or array depending on model
    return response.data[0]?.generated_text || "No response from model";
  } catch (error) {
    console.error("Hugging Face API error:", error.response?.data || error.message);
    return "Error processing request.";
  }
}

// Socket.io connection
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("chat message", async (msg) => {
    io.emit("chat message", { user: "You", message: msg });

    // Get AI response
    const aiResponse = await getHfResponse(msg);
    io.emit("chat message", { user: "AI", message: aiResponse });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
