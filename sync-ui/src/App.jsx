import { useEffect, useRef, useState } from 'react';
import SockJS from 'sockjs-client/dist/sockjs.min.js';
import { Client } from '@stomp/stompjs';

function App() {
  const videoRef = useRef(null);
  const stompClientRef = useRef(null);
  const chatEndRef = useRef(null); 
  const isProcessingMessage = useRef(false); // THE LOCK
  const theaterContainerRef = useRef(null); // Ref for the entire player container
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null); // Fixes a React stale-state bug where the latest stream isn't always available in event handlers
  const peerConnectionref = useRef(null);
  
  const [remoteStream, setRemoteStream] = useState(null);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [videoUrl, setVideoUrl] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [username, setUsername] = useState("");
  const [hasJoined, setHasJoined] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoStopped, setIsVideoStopped] = useState(false);
  // Keep this ref synced with the state so our WebRTC functions always see the camera
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  //WebRTC signalling helper 
  const sendSignal = (payload) => {
    if (stompClientRef.current?.connected) {
      stompClientRef.current.publish({
        destination: '/app/signal',
        body: JSON.stringify({ sender: username, ...payload })
      });
    }
  };

  // --- WEBRTC: INITIALIZE CONNECTION ---
  const initWebRTC = () => {
    if (peerConnectionRef.current) return; // Already initialized

    // Google's free public STUN server to find your public IPs
    const rtcConfig = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };
    
    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionRef.current = pc;

    // 1. Add our camera/mic to the connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // 2. When the STUN server finds an internet path, send it to the friend
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({ type: 'candidate', data: event.candidate });
      }
    };

    // 3. When your friend's video arrives, save it to state!
    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };
  };

  // --- WEBRTC: START THE CALL (Generate Offer) ---
  const startCall = async () => {
    if (!localStreamRef.current) {
      alert("Please enable your camera first!");
      return;
    }
    initWebRTC();
    setInCall(true);
    const pc = peerConnectionRef.current;
    
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    sendSignal({ type: 'offer', data: offer });
  };

  // --- WEBRTC: TOGGLE MEDIA ---
  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoStopped(!videoTrack.enabled);
      }
    }
  };

  // --- WEBRTC: END CALL ---
  const endCall = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    setInCall(false);
    // Clear the friend's video from the screen
    setRemoteStream(null);
    // Tell the other person we hung up
    sendSignal({ type: 'end_call' });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Toggle video call panel with Alt + V (ignoring if user is typing in chat input)
      if (e.altKey && e.code === 'KeyV') {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
          return; // Don't trigger if they are typing a chat message
        }
        e.preventDefault();
        setShowVideoCall(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Function to handle triggering fullscreen on the container
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      theaterContainerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    // 1. THE FIX: Do absolutely nothing until the user clicks "Join Party"
    if (!hasJoined) {
      return;
    }
    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      onConnect: () => {
        setIsConnected(true);
        client.subscribe('/topic/room', async (message) => {
          const data = JSON.parse(message.body);
          
          // --- CHAT LOGIC ---
          if (data.content) {
            setMessages((prev) => [...prev, data]);
            return;
          } 
          
          // --- WEBRTC SIGNALING LOGIC ---
          if (data.type) {
            if (data.sender === username) return; // Ignore our own signals
            
            if (data.type === 'end_call') {
              if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
                peerConnectionRef.current = null;
              }
              setInCall(false);
              ['remoteVideo', 'remoteVideoFloat'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.srcObject = null;
              });
              return;
            }

            if (data.type === 'offer') {
              setInCall(true);
              initWebRTC();
              await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.data));
              const answer = await peerConnectionRef.current.createAnswer();
              await peerConnectionRef.current.setLocalDescription(answer);
              sendSignal({ type: 'answer', data: answer });
            } else if (data.type === 'answer') {
              await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.data));
              
            } else if (data.type === 'candidate') {
              if (peerConnectionRef.current) {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.data));
              }
            }
            return;
          }

          // --- VIDEO SYNC LOGIC ---
          if (data.action) {
            if (!videoRef.current || data.sender === username) return;
            isProcessingMessage.current = true;
            if (Math.abs(videoRef.current.currentTime - data.timestamp) > 0.5) {
              videoRef.current.currentTime = data.timestamp;
            }
            if (data.action === 'PLAY') videoRef.current.play().catch(() => {});
            else if (data.action === 'PAUSE') videoRef.current.pause();
            
            setTimeout(() => { isProcessingMessage.current = false; }, 50);
          }
        });
        client.publish({
            destination: '/app/chat', 
            body: JSON.stringify({
              sender: "SYSTEM",
              content: `👋 ${username} has joined the room.`
            })
          });
      },
    });

    client.activate();
    stompClientRef.current = client;
    return () => client.deactivate();
  }, [hasJoined, username]); // Added username to dependency to ensure check works

  const sendAction = (action) => {
    // --- THE FIX: PREVENT ECHO ---
    // If we are currently processing a server command, don't send a message back
    if (isProcessingMessage.current) return;

    if (stompClientRef.current?.connected && videoRef.current) {
      stompClientRef.current.publish({
        destination: '/app/sync',
        // Now sending 'sender' so others can identify us
        body: JSON.stringify({ 
            sender: username, 
            action, 
            timestamp: videoRef.current.currentTime 
        })
      });
    }
  };

  // --- WEBRTC: CAMERA ACCESS ---
  const startLocalStream = async () => {
    try {
      // 1. Ask the browser for camera and mic permissions
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      
      // 2. Save it to our React state
      setLocalStream(stream);
    } catch (err) {
      console.error("Error accessing media devices:", err);
      alert("Could not access camera/microphone. Please ensure you have granted permissions.");
    }
  };

  // --- WEBRTC: ROUTING THE VIDEO TO THE UI ---
  useEffect(() => {
    // 1. Route Your Camera
    if (localStream) {
      const previewVideo = document.getElementById('previewVideo');
      const sidebarLocal = document.getElementById('localVideo');
      const floatingLocal = document.getElementById('localVideoFloat');

      if (previewVideo && previewVideo.srcObject !== localStream) previewVideo.srcObject = localStream;
      if (sidebarLocal && sidebarLocal.srcObject !== localStream) sidebarLocal.srcObject = localStream;
      if (floatingLocal && floatingLocal.srcObject !== localStream) floatingLocal.srcObject = localStream;
    }

    // 2. Route Friend's Camera (THE FIX!)
    if (remoteStream) {
      const sidebarRemote = document.getElementById('remoteVideo');
      const floatingRemote = document.getElementById('remoteVideoFloat');

      if (sidebarRemote && sidebarRemote.srcObject !== remoteStream) {
        sidebarRemote.srcObject = remoteStream;
        // Force mobile browsers to play the media
        sidebarRemote.play().catch(err => console.warn("Mobile autoplay prevented:", err)); 
      }
      
      if (floatingRemote && floatingRemote.srcObject !== remoteStream) {
        floatingRemote.srcObject = remoteStream;
        // Force mobile browsers to play the media
        floatingRemote.play().catch(err => console.warn("Mobile autoplay prevented:", err));
      }
    }
    
  // Don't forget to add remoteStream to the dependency array here!
  }, [localStream, remoteStream, hasJoined, isFullscreen, showVideoCall]);

  const sendChat = () => {
    if (chatInput.trim() && stompClientRef.current?.connected) {
      stompClientRef.current.publish({
        destination: '/app/chat',
        body: JSON.stringify({ sender: username, content: chatInput })
      });
      setChatInput("");
    }
  };
  // --- VIEW 1: JOIN SCREEN (The Lobby) ---
  if (!hasJoined) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#0a0a0a', color: 'white', fontFamily: '"Inter", sans-serif' }}>
        <h1 style={{ color: '#00d4ff', margin: '0 0 10px 0', fontSize: '2.5rem', letterSpacing: '-1px' }}>
          🎥 SyncWatch
        </h1>
        <p style={{ color: '#888', marginBottom: '30px' }}>Check your camera, then join the party.</p>
        
        <div style={{ padding: '30px', background: '#111', border: '1px solid #222', borderRadius: '16px', boxShadow: '0 20px 50px rgba(0,0,0,0.6)', width: '320px', textAlign: 'center' }}>
          
          {/* Camera Preview Box */}
          <div style={{ width: '100%', height: '180px', background: '#000', borderRadius: '8px', overflow: 'hidden', marginBottom: '20px', position: 'relative', border: '1px solid #333' }}>
            <video id="previewVideo" autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
            
            {/* Show 'Enable Camera' if stream isn't active yet */}
            {!localStream && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}>
                <button 
                  onClick={startLocalStream} 
                  style={{ background: '#28a745', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Enable Camera
                </button>
              </div>
            )}
          </div>

          <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', color: '#e0e0e0' }}>Enter your name</h3>
          <input 
            type="text" 
            placeholder="Username..." 
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && username.trim() && setHasJoined(true)}
            style={{ padding: '12px', width: '100%', marginBottom: '15px', borderRadius: '8px', border: '1px solid #333', background: '#222', color: 'white', boxSizing: 'border-box', outline: 'none', fontSize: '1rem' }}
          />
          <button 
            onClick={() => username.trim() && setHasJoined(true)}
            style={{ width: '100%', padding: '12px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '1rem', transition: '0.2s' }}
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
      
      {/* Left Column: The Cinema Stage (THIS GETS FULLSCREENED) */}
      <div ref={theaterContainerRef} style={{ flex: 3, display: 'flex', flexDirection: 'column', padding: isFullscreen ? '0' : '30px', position: 'relative', background: '#0a0a0a' }}>
        
        {/* Header - Hidden in Fullscreen */}
        {!isFullscreen && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            
            {/* LEFT SIDE: Logo & Mobile Camera Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '700', letterSpacing: '-0.5px' }}>
                <span style={{ color: '#00d4ff' }}>Sync</span>Watch {isConnected ? '🟢' : '🔴'}
              </h2>
              <button 
                onClick={() => setShowVideoCall(prev => !prev)}
                style={{ background: '#222', color: '#ccc', border: '1px solid #444', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', transition: '0.2s' }}
              >
                {showVideoCall ? '📷 Hide Cameras' : '📷 Show Cameras'}
              </button>
            </div>

            {/* RIGHT SIDE: File Picker */}
            <div style={{ background: '#1a1a1a', padding: '5px 15px', borderRadius: '20px', fontSize: '0.8rem', border: '1px solid #333' }}>
              File: <input type="file" accept="video/*" onChange={(e) => setVideoUrl(URL.createObjectURL(e.target.files[0]))} style={{ color: '#888', fontSize: '0.7rem' }} />
            </div>
            
          </div>
        )}

        {/* Video Player Container */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', borderRadius: isFullscreen ? '0' : '12px', overflow: 'hidden', boxShadow: isFullscreen ? 'none' : '0 20px 50px rgba(0,0,0,0.8)', border: isFullscreen ? 'none' : '1px solid #222', position: 'relative' }}>
          {videoUrl ? (
            <video 
              ref={videoRef} src={videoUrl} controls width="100%"
              style={{ maxHeight: isFullscreen ? '100vh' : '80vh', objectFit: 'contain' }}
              onPlay={() => sendAction('PLAY')} onPause={() => sendAction('PAUSE')} onSeeked={() => sendAction('PAUSE')}
            />
          ) : (
            <div style={{ textAlign: 'center', color: '#444' }}>
              <div style={{ fontSize: '3rem', marginBottom: '10px' }}>🎬</div>
              <p>Select a movie to start the show</p>
            </div>
          )}

          {/* Custom Fullscreen Button */}
          <button 
            onClick={toggleFullscreen}
            style={{ position: 'absolute', bottom: '60px', right: '20px', zIndex: 10, background: 'rgba(0,0,0,0.7)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '8px 12px', borderRadius: '5px', cursor: 'pointer', backdropFilter: 'blur(5px)' }}
          >
            {isFullscreen ? "Exit Fullscreen" : "⛶ Fullscreen"}
          </button>

          {/* FLOATING VIDEO CALL (Only visible in Fullscreen + Alt+V enabled) */}
          {isFullscreen && showVideoCall && (
            <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 100, display: 'flex', gap: '10px', background: 'rgba(10, 10, 10, 0.6)', padding: '10px', borderRadius: '12px', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <video id="localVideoFloat" autoPlay playsInline muted style={{ width: '120px', height: '90px', borderRadius: '8px', objectFit: 'cover', transform: 'scaleX(-1)', background: '#222' }} />
              <video id="remoteVideoFloat" autoPlay playsInline style={{ width: '120px', height: '90px', borderRadius: '8px', objectFit: 'cover', background: '#222' }} />
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Chat & Video Sidebar (Hidden when Fullscreen is active) */}
      {!isFullscreen && (
        <div style={{ width: '350px', backgroundColor: '#111', borderLeft: '1px solid #222', display: 'flex', flexDirection: 'column', boxShadow: '-10px 0 30px rgba(0,0,0,0.5)' }}>
          
          <div style={{ padding: '20px', borderBottom: '1px solid #222' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Room Chat</h3>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: '5px', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#00ff88', marginRight: '8px' }}></div>
                <small style={{ color: '#666' }}>{username}</small>
              </div>
              <small style={{ color: '#444' }}>Alt+V to toggle cameras</small>
            </div>
          </div>

          {/* SIDEBAR VIDEO CALL AREA (Side-by-side) */}
          {showVideoCall && (
            <div style={{ padding: '15px', borderBottom: '1px solid #222', background: '#151515' }}>
              <div style={{ display: 'flex', gap: '10px', height: '100px' }}>
                {/* Local Camera */}
                <div style={{ flex: 1, position: 'relative', background: '#222', borderRadius: '8px', overflow: 'hidden' }}>
                  <video id="localVideo" autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                  <span style={{ position: 'absolute', bottom: '4px', left: '6px', fontSize: '10px', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '4px' }}>You</span>
                </div>
                {/* Remote Camera */}
                <div style={{ flex: 1, position: 'relative', background: '#222', borderRadius: '8px', overflow: 'hidden' }}>
                  <video id="remoteVideo" autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <span style={{ position: 'absolute', bottom: '4px', left: '6px', fontSize: '10px', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '4px' }}>Friend</span>
                </div>
              </div>
              {/* If stream is active, show Start Call. If not, show Enable Camera */}
              {localStream ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                  
                  {/* Start / End Call Button */}
                  {!inCall ? (
                    <button onClick={startCall} style={{ background: '#007bff', border: 'none', padding: '8px', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                      Start Video Call
                    </button>
                  ) : (
                    <button onClick={endCall} style={{ background: '#dc3545', border: 'none', padding: '8px', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                      End Video Call
                    </button>
                  )}

                  {/* Mute and Stop Video Buttons */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={toggleAudio} style={{ flex: 1, background: isAudioMuted ? '#dc3545' : '#444', border: 'none', padding: '6px', color: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                      {isAudioMuted ? 'Unmute' : 'Mute'}
                    </button>
                    <button onClick={toggleVideo} style={{ flex: 1, background: isVideoStopped ? '#dc3545' : '#444', border: 'none', padding: '6px', color: 'white', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                      {isVideoStopped ? 'Turn on Video' : 'Stop Video'}
                    </button>
                  </div>
                  
                </div>
              ) : (
                 <button onClick={startLocalStream} style={{ width: '100%', marginTop: '10px', background: '#28a745', border: 'none', padding: '8px', color: 'white', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                   Enable Camera
                 </button>
              )}
            </div>
          )}

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
      )}
    </div>
    </>
  );
}
export default App;