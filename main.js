const audioToggleBtn = document.getElementById("audioToggleBtn");
let incluirAudio = true;
audioToggleBtn.addEventListener("click", () => {
  incluirAudio = !incluirAudio;
  audioToggleBtn.textContent = incluirAudio ? "🔊 Áudio: Ligado" : "🔇 Áudio: Desligado";
  audioToggleBtn.style.backgroundColor = incluirAudio ? "#4f545c" : "#ed4245";
});
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const usernameInput = document.getElementById("usernameInput");
const joinBtn = document.getElementById("joinBtn");

const startBtn = document.getElementById("startBtn");
const changeBtn = document.getElementById("changeBtn");
const stopBtn = document.getElementById("stopBtn");
const presetSelect = document.getElementById("presetSelect");
const statusText = document.getElementById("status");

const mainVideo = document.getElementById("mainVideo");
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const localThumb = document.getElementById("localThumb");
const remoteThumb = document.getElementById("remoteThumb");

const viewerCount = document.getElementById("viewerCount");
const viewersList = document.getElementById("viewers-list");

let socket;
let peerConnection;
let localStream = null;
let remoteStream = null;
let meuNome = "";
let focoAtual = "remote";

const configRTC = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

const presets = {
  "320p30": { width: 640, height: 360, frameRate: 30, maxBitrate: 500000 },
  "320p60": { width: 640, height: 360, frameRate: 60, maxBitrate: 700000 },
  "720p30": { width: 1280, height: 720, frameRate: 30, maxBitrate: 3500000 },
  "720p60": { width: 1280, height: 720, frameRate: 60, maxBitrate: 4500000 },
  "1080p30": { width: 1920, height: 1080, frameRate: 30, maxBitrate: 5000000 },
  "1080p60": { width: 1920, height: 1080, frameRate: 60, maxBitrate: 7000000 }
};

joinBtn.addEventListener("click", () => {
  const nome = usernameInput.value.trim();
  if (!nome) return alert("Digite um nome válido!");
  meuNome = nome;

  loginScreen.style.display = "none";
  appScreen.style.display = "flex";

  conectarWebSocket();
});

function conectarWebSocket() {
  socket = new WebSocket('wss://servidor-gugucord.onrender.com');
  
  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'register', name: meuNome }));
  };

  socket.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'viewers-update') {
      atualizarListaEspectadores(data.viewers);
    } else if (data.type === 'make-offer') {
      await criarPeerConnection();
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.send(JSON.stringify({ type: 'offer', offer }));
    } else if (data.type === 'offer') {
      await criarPeerConnection();
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.send(JSON.stringify({ type: 'answer', answer }));
    } else if (data.type === 'answer') {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } else if (data.type === 'candidate') {
      if (peerConnection) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error("Erro ao adicionar ICE candidate:", e);
        }
      }
    }
  };
}

function atualizarListaEspectadores(viewers) {
  viewerCount.textContent = viewers.length;
  viewersList.innerHTML = "";
  viewers.forEach(v => {
    const li = document.createElement("li");
    li.textContent = v;
    viewersList.appendChild(li);
  });
}

async function criarPeerConnection() {
  if (peerConnection) return;
  peerConnection = new RTCPeerConnection(configRTC);

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
    }
  };

  peerConnection.ontrack = (event) => {
    remoteStream = event.streams[0];
    remoteVideo.srcObject = remoteStream;
    remoteThumb.style.display = "block";

    if (!localStream || focoAtual === 'remote') {
      focoAtual = "remote";
      atualizarFocoVisual();
    }
  };

  if (localStream) {
    localStream.getTracks().forEach(track => {
      const sender = peerConnection.addTrack(track, localStream);
      if (track.kind === 'video') aplicarBitrate(sender);
    });
  }
}

function aplicarBitrate(sender) {
  const selectedPreset = presets[presetSelect.value];
  const parameters = sender.getParameters();
  if (!parameters.encodings) parameters.encodings = [{}];
  parameters.encodings[0].maxBitrate = selectedPreset.maxBitrate;
  sender.setParameters(parameters).catch(e => console.error(e));
}

function alternarFoco(quem) {
  if (quem === 'local' && localStream) {
    focoAtual = 'local';
  } else if (quem === 'remote' && remoteStream) {
    focoAtual = 'remote';
  }
  atualizarFocoVisual();
}

function atualizarFocoVisual() {
  if (focoAtual === 'local' && localStream) {
    mainVideo.srcObject = localStream;
  } else if (focoAtual === 'remote' && remoteStream) {
    mainVideo.srcObject = remoteStream;
  }
}

localThumb.addEventListener("click", () => alternarFoco('local'));
remoteThumb.addEventListener("click", () => alternarFoco('remote'));

async function capturarTela() {
  const chosen = presets[presetSelect.value];
  try {
    const novaStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: chosen.width },
        height: { ideal: chosen.height },
        frameRate: { ideal: chosen.frameRate }
      },
      audio: incluirAudio
    });

    if (localStream) {
      const videoTrack = novaStream.getVideoTracks()[0];
      const sender = peerConnection?.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) await sender.replaceTrack(videoTrack);

      localStream.getTracks().forEach(t => t.stop());
      localStream = novaStream;
    } else {
      localStream = novaStream;
      
      if (!peerConnection) {
        await criarPeerConnection();
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.send(JSON.stringify({ type: 'offer', offer }));
      } else {
        localStream.getTracks().forEach(track => {
          const sender = peerConnection.addTrack(track, localStream);
          if (track.kind === 'video') aplicarBitrate(sender);
        });
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.send(JSON.stringify({ type: 'offer', offer }));
      }
    }

    localVideo.srcObject = localStream;
    localThumb.style.display = "block";
    
    focoAtual = "local";
    atualizarFocoVisual();

    startBtn.style.display = "none";
    changeBtn.style.display = "inline-block";
    stopBtn.style.display = "inline-block";
    statusText.textContent = "Transmitindo...";

    localStream.getVideoTracks()[0].onended = () => pararTransmissao();

  } catch (err) {
    console.error("Erro ao capturar tela:", err);
  }
}

startBtn.addEventListener("click", capturarTela);
changeBtn.addEventListener("click", capturarTela);

function pararTransmissao() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  localVideo.srcObject = null;
  localThumb.style.display = "none";

  if (remoteStream) {
    focoAtual = "remote";
    atualizarFocoVisual();
  } else {
    mainVideo.srcObject = null;
  }

  if (!remoteStream && peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  startBtn.style.display = "inline-block";
  changeBtn.style.display = "none";
  stopBtn.style.display = "none";
  statusText.textContent = "Pronto";
}

stopBtn.addEventListener("click", pararTransmissao);

document.addEventListener('DOMContentLoaded', () => {
  const joinBtn = document.getElementById('joinBtn');
  const loginScreen = document.getElementById('loginScreen'); // Ajuste para o ID exato da sua tela de login no HTML
  const appScreen = document.getElementById('appScreen');     // Ajuste para o ID exato da sua tela principal no HTML
  const usernameInput = document.getElementById('usernameInput');

joinBtn.addEventListener("click", () => {
  const nome = usernameInput.value.trim();
  if (!nome) return alert("Digite um nome válido!");
  meuNome = nome;

  // 1. Alterna as telas de forma limpa
  loginScreen.style.display = "none";
  appScreen.style.display = "flex";

  // 2. Dá um respiro para o motor gráfico renderizar o HTML/CSS 
  // antes de iniciar a conexão de redepesada
  setTimeout(() => {
    conectarWebSocket();
 }, 50);
    });
  }
);
