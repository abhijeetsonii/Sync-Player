import { useEffect, useRef, useState } from 'react';
import SockJS from 'sockjs-client/dist/sockjs.min.js';
import { Client } from '@stomp/stompjs';

function App() {
  const videoRef = useRef(null);
  const stompClientRef = useRef(null);
  const chatEndRef = useRef(null); // For auto-scrolling chat
  
  const [isConnected, setIsConnected] = useState(false);
  const [videoUrl, setVideoUrl] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [username, setUsername] = useState("");
  const [hasJoined, setHasJoined] = useState(false);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      onConnect: () => {
        setIsConnected(true);
        client.subscribe('/topic/room', (message) => {
          const data = JSON.parse(message.body);
          
          if (data.content) {
            setMessages((prev) => [...prev, data]);
          } else { 
            if (!videoRef.current) return;
            if (Math.abs(videoRef.current.currentTime - data.timestamp) > 0.5) {
              videoRef.current.currentTime = data.timestamp;
            }
            if (data.action === 'PLAY') {
              videoRef.current.play().catch(() => {});
            } else if (data.action === 'PAUSE') {
              videoRef.current.pause();
            }
          }
        });
      },
    });

    client.activate();
    stompClientRef.current = client;
    return () => client.deactivate();
  }, []);

  const sendAction = (action) => {
    if (stompClientRef.current?.connected && videoRef.current) {
      stompClientRef.current.publish({
        destination: '/app/sync',
        body: JSON.stringify({ action, timestamp: videoRef.current.currentTime })
      });
    }
  };

  const sendChat = () => {
    if (chatInput.trim() && stompClientRef.current?.connected) {
      stompClientRef.current.publish({
        destination: '/app/chat',
        body: JSON.stringify({ sender: username, content: chatInput })
      });
      setChatInput("");
    }
  };

  // --- VIEW 1: JOIN SCREEN ---
  if (!hasJoined) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Arial' }}>
        <h1 style={{ color: '#007bff' }}>🎥 SyncWatch</h1>
        <div style={{ padding: '30px', border: '1px solid #ddd', borderRadius: '10px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          <h3>Enter your name to join</h3>
          <input 
            type="text" 
            placeholder="Username..." 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && username.trim() && setHasJoined(true)}
            style={{ padding: '10px', width: '250px', marginBottom: '10px', display: 'block' }}
          />
          <button 
            onClick={() => username.trim() && setHasJoined(true)}
            style={{ width: '100%', padding: '10px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
          >
            Join Party
          </button>
        </div>
      </div>
    );
  }

  // --- VIEW 2: THEATER VIEW (Video + Chat) ---
  return (
    <>
    <style>{`
      body, html, #root {
        margin: 0 !important;
        padding: 0 !important;
        background-color: #000000 !important;
        width: 100%;
        height: 100%;
      }
    `}</style>

    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#0a0a0a', color: '#e0e0e0', fontFamily: '"Inter", sans-serif' }}>
      
      {/* Left Column: The Cinema Stage */}
      <div style={{ flex: 3, display: 'flex', flexDirection: 'column', padding: '30px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', letterSpacing: '-0.5px' }}>
            <span style={{ color: '#00d4ff' }}>Sync</span>Watch {isConnected ? '🟢' : '🔴'}
          </h2>
          <div style={{ background: '#1a1a1a', padding: '5px 15px', borderRadius: '20px', fontSize: '0.8rem', border: '1px solid #333' }}>
            File: <input type="file" accept="video/*" onChange={(e) => setVideoUrl(URL.createObjectURL(e.target.files[0]))} style={{ color: '#888', fontSize: '0.7rem' }} />
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.8)', border: '1px solid #222' }}>
          {videoUrl ? (
            <video 
              ref={videoRef} src={videoUrl} controls width="100%"
              style={{ maxHeight: '80vh' }}
              onPlay={() => sendAction('PLAY')} onPause={() => sendAction('PAUSE')} onSeeked={() => sendAction('PAUSE')}
            />
          ) : (
            <div style={{ textAlign: 'center', color: '#444' }}>
              <div style={{ fontSize: '3rem', marginBottom: '10px' }}>🎬</div>
              <p>Select a movie to start the show</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Chat Sidebar */}
      <div style={{ flex: 1, backgroundColor: '#111', borderLeft: '1px solid #222', display: 'flex', flexDirection: 'column', boxShadow: '-10px 0 30px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid #222' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Room Chat</h3>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: '5px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00ff88', marginRight: '8px' }}></div>
              <small style={{ color: '#666' }}>{username}</small>
          </div>
        </div>

        {/* Messages Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {messages.map((msg, i) => {
            const isMe = msg.sender === username;
            const isSystem = msg.sender === "SYSTEM";

            if (isSystem) return <div key={i} style={{ textAlign: 'center', fontSize: '0.75rem', color: '#555', fontStyle: 'italic', margin: '10px 0' }}>{msg.content}</div>;

            return (
              <div key={i} style={{ alignSelf: isMe ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '2px', textAlign: isMe ? 'right' : 'left', marginLeft: '5px' }}>{msg.sender}</div>
                <div style={{ 
                  background: isMe ? '#007bff' : '#2a2a2a', 
                  color: '#fff', 
                  padding: '8px 14px', 
                  borderRadius: isMe ? '15px 15px 2px 15px' : '15px 15px 15px 2px',
                  fontSize: '0.9rem',
                  lineHeight: '1.4',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                }}>
                  {msg.content}
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area */}
        <div style={{ padding: '20px', borderTop: '1px solid #222' }}>
          <div style={{ display: 'flex', background: '#252525', borderRadius: '25px', padding: '5px 5px 5px 15px', border: '1px solid #333' }}>
            <input 
              value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendChat()}
              placeholder="Say something..."
              style={{ flex: 1, background: 'transparent', border: 'none', color: 'white', outline: 'none', fontSize: '0.9rem' }}
            />
            <button 
              onClick={sendChat} 
              style={{ backgroundColor: '#007bff', border: 'none', color: 'white', borderRadius: '50%', width: '35px', height: '35px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s' }}
            >
              ➔
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

export default App;