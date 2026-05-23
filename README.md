# 🎬 SyncWatch

SyncWatch is a real-time, full-stack application that allows users to watch local video files together in perfect synchronization. It features a built-in chat system and a Peer-to-Peer (P2P) WebRTC video calling interface, allowing you to see and talk to your friends while watching a movie.

## ✨ Current Features (v1.0 Prototype)
* **Real-Time Video Synchronization:** If one person pauses, plays, or scrubs the timeline, the video instantly syncs for everyone in the room.
* **P2P WebRTC Video & Audio Calling:** Live camera and microphone feeds routed directly browser-to-browser with zero backend media bottleneck.
* **Live Chat Room:** Integrated text chat powered by STOMP WebSockets.
* **Mobile-Responsive UI:** Built-in safeguards for mobile autoplay policies, responsive camera toggles, and seamless fullscreen mode.
* **Zero-Lag Backend:** Spring Boot acts entirely as a lightweight signaling and matchmaking server, ensuring low latency.

## 🛠️ Tech Stack
**Frontend:**
* React (Vite)
* WebRTC API (STUN integration for P2P media)
* SockJS & STOMP.js (WebSocket client)

**Backend:**
* Java & Spring Boot
* Spring WebSocket & STOMP Messaging
* Plain-text JSON signaling (No heavy media servers required)

## 🚀 Getting Started

### Prerequisites
* Node.js & npm
* Java 17+ & Maven
* [Ngrok](https://ngrok.com/) (For testing WebRTC P2P connections across different networks)

### 1. Run the Spring Boot Backend
Navigate to the backend directory and start the Spring Boot application:
```bash
./mvnw spring-boot:run
```
*The WebSocket server will start on `http://localhost:8080/ws`.*

### 2. Run the React Frontend
Navigate to the frontend directory, install dependencies, and start the Vite development server:
```bash
npm install
npm run dev
```

### 3. Testing with Friends (Ngrok)
Because WebRTC requires secure contexts and actual network routing, the best way to test with a friend is to tunnel your local Spring Boot server using Ngrok:
```bash
ngrok http 8080
```
*Update your React WebSocket connection string to use the Ngrok `https://...` URL, build the React app, and place the compiled static files into the Spring Boot `/static` folder.*

Built by:
* **Abhijeet Soni** - github.com/abhijeetsonii