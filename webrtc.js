// Substitua pela URL do seu servidor WebSocket hospedado no Render
const WS_URL = 'https://servidor-gugucord.onrender.com'; 
const ws = new WebSocket(WS_URL);

const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

let peerConnection;
let localStream;

ws.onopen = () => {
  console.log("Conectado ao servidor de sinalização do Render!");
};

// Gerencia as mensagens recebidas pelo WebSocket (Sinalização)
ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);

  if (!peerConnection) {
    createPeerConnection();
  }

  if (data.type === 'offer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    
    ws.send(JSON.stringify({
      type: 'answer',
      answer: answer
    }));
  } 
  else if (data.type === 'answer') {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  } 
  else if (data.type === 'ice-candidate') {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (e) {
      console.error("Erro ao adicionar ICE candidate:", e);
    }
  }
};

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(rtcConfig);

  // Quando encontrar rotas de rede, envia para o par via WebSocket
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({
        type: 'ice-candidate',
        candidate: event.candidate
      }));
    }
  };

  // Quando receber vídeo/áudio do outro usuário, joga na tag de vídeo remota
  peerConnection.ontrack = (event) => {
    const remoteVideo = document.getElementById('remoteVideo');
    const mainVideo = document.getElementById('mainVideo');
    const remoteThumb = document.getElementById('remoteThumb');

    if (remoteVideo && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      mainVideo.srcObject = event.streams[0]; // Joga na tela principal
      remoteThumb.style.display = 'block'; // Mostra a miniatura do colega
    }
  };

  // Se já houver stream local capturado, adiciona na conexão
  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }
}

async function startScreenShare() {
  try {
    // Pega a qualidade selecionada no select do HTML
    const preset = document.getElementById('presetSelect').value;
    let maxFps = preset.includes('60') ? 60 : 30;
    let maxHeight = preset.includes('1080') ? 1080 : preset.includes('720') ? 720 : 320;

    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: maxFps, max: maxFps },
        height: { ideal: maxHeight }
      },
      audio: true
    });

    // Exibe a própria tela na miniatura local
    const localVideo = document.getElementById('localVideo');
    const localThumb = document.getElementById('localThumb');
    if (localVideo) {
      localVideo.srcObject = localStream;
      localThumb.style.display = 'block';
    }

    if (!peerConnection) {
      createPeerConnection();
    }

    // Adiciona as trilhas de vídeo/áudio na conexão WebRTC
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // Cria e envia a Oferta
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    ws.send(JSON.stringify({
      type: 'offer',
      offer: offer
    }));

    document.getElementById('status').innerText = "Transmitindo...";

  } catch (err) {
    console.error("Erro ao iniciar compartilhamento:", err);
  }
}
