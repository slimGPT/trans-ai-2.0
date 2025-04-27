let mediaRecorder;
let audioChunks = [];
let isRecording = false;
const recordButton = document.getElementById("record-button");
const statusElement = document.getElementById("status");
const messageElement = document.getElementById("message");
const transcriptElement = document.getElementById("transcript-preview");
const neonProgressBar = document.getElementById('neon-progress-bar');

// Initialize Speech Recognition
let recognition;
let isRecognizing = false; // Tracks if SpeechRecognition is running

// Check for browser compatibility right away
document.addEventListener('DOMContentLoaded', () => {
  // Make transcript area visible
  transcriptElement.innerText = "Initializing speech recognition...";
  transcriptElement.classList.add('active');
  
  // Check for network connectivity
  if (!navigator.onLine) {
    console.warn("Browser is offline, speech recognition may not work properly");
    transcriptElement.innerText = "Vous semblez être hors ligne. La transcription en direct pourrait ne pas fonctionner.";
    return;
  }
  
  try {
    // Check if SpeechRecognition is available
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.lang = 'fr-FR';
      recognition.interimResults = true;
      recognition.continuous = true;
      
      console.log("Speech recognition supported in this browser");
      transcriptElement.innerText = "Speech recognition initialized. Click 'Entrer en transe' to start speaking.";
      
      // Handle recognition results
      recognition.onresult = (event) => {
        console.log("Recognition result received");
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        console.log("Live transcript:", transcript);
        transcriptElement.innerText = transcript || "Listening...";
        transcriptElement.classList.add('active');
      };
      
      // Handle recognition errors
      recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        
        if (event.error === 'network') {
          transcriptElement.innerText = "Connexion au service de reconnaissance vocale impossible. Votre message sera quand même traité.";
          // Don't stop recording, we'll still use the audio recording even without live transcription
          console.log("Network error in speech recognition, continuing with audio recording only");
        } else {
          transcriptElement.innerText = `Erreur de reconnaissance vocale: ${event.error}`;
        }
        
        transcriptElement.classList.add('active');
      };
      
      // Handle recognition ending
      recognition.onend = () => {
        console.log("Speech recognition ended");
        if (isRecording) {
          // Restart recognition if still recording
          try {
            recognition.start();
            console.log("Speech recognition restarted");
            transcriptElement.innerText = "Listening...";
          } catch (e) {
            console.log("Could not restart recognition:", e);
            transcriptElement.innerText = "Speech recognition stopped unexpectedly.";
          }
        }
      };
      
      // Test recognition immediately
      try {
        // Try a quick listen to see if it works
        recognition.start();
        setTimeout(() => {
          if (recognition) {
            recognition.stop();
            transcriptElement.innerText = "Speech recognition ready. Click 'Entrer en transe' to start speaking.";
          }
        }, 1000);
      } catch (e) {
        console.error("Error in initial speech recognition test:", e);
        transcriptElement.innerText = "Speech recognition available but couldn't be started. Try clicking the button.";
      }
    } else {
      console.warn("Speech recognition not supported in this browser");
      transcriptElement.innerText = "Speech recognition not supported in this browser. Try Chrome or Edge.";
    }
  } catch (e) {
    console.error("Error initializing speech recognition:", e);
    transcriptElement.innerText = "Error initializing speech recognition. Try a different browser.";
  }
});

// Handle recording button click
recordButton.addEventListener("click", async () => {
  if (isRecording) {
    stopRecording();
    isRecordingNow = false;
    if (recognition && isRecognizing) recognition.stop();
    transcriptElement.style.display = 'none';
    liveTranscript = '';
    return;
  }
  
  try {
    await startRecording();
    if (recognition && !isRecognizing) recognition.start();
    isFinalizing = false;
    isRecordingNow = true;
    liveTranscript = '';
    transcriptElement.innerText = '';
    transcriptElement.classList.add('active');
    transcriptElement.style.display = 'block';
    neonProgressBar.style.display = 'none';
    messageElement.innerText = '';
    messageElement.className = 'message';
    messageElement.style.textAlign = '';
    messageElement.style.color = '';
    messageElement.style.textShadow = '';
    statusElement.innerText = '';
  } catch (error) {
    statusElement.innerText = "Erreur d'accès au microphone: " + error.message;
    transcriptElement.innerText = "Erreur du microphone: " + error.message;
    transcriptElement.classList.add('active');
    transcriptElement.style.display = 'block';
  }
});

// Start recording audio
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });
    
    audioChunks = [];
    mediaRecorder.ondataavailable = (event) => {
      audioChunks.push(event.data);
    };
    
    mediaRecorder.onstop = async () => {
      await processAudio();
    };
    
    mediaRecorder.start();
    isRecording = true;
    recordButton.textContent = "Arrêter la séance";
    statusElement.innerText = "Enregistrement en cours...";
  } catch (error) {
    console.error("Error accessing microphone:", error);
    statusElement.innerText = "Erreur d'accès au microphone";
  }
}

// Stop recording audio
function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;
  
  mediaRecorder.stop();
  mediaRecorder.stream.getTracks().forEach(track => track.stop());
  
  // Stop speech recognition if running
  if (recognition) {
    try {
      recognition.stop();
      console.log("Speech recognition stopped");
    } catch (e) {
      console.error("Error stopping speech recognition:", e);
    }
  }
  
  // Toggle UI state
  isRecording = false;
  recordButton.innerText = "Entrer en transe";
  recordButton.classList.remove("recording");
  statusElement.innerText = "Traitement en cours...";
  transcriptElement.innerText = "Traitement de votre message...";
  transcriptElement.classList.add('active');
  stopProgressAnimation();
  hideNeonProgressBar();
}

// Create WAV header
function createWavHeader(dataLength) {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);
  
  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // File length
  view.setUint32(4, 36 + dataLength, true);
  // WAVE identifier
  writeString(view, 8, 'WAVE');
  // Format chunk identifier
  writeString(view, 12, 'fmt ');
  // Format chunk length
  view.setUint32(16, 16, true);
  // Sample format (raw)
  view.setUint16(20, 1, true);
  // Channel count
  view.setUint16(22, 1, true);
  // Sample rate
  view.setUint32(24, 16000, true);
  // Byte rate (sample rate * block align)
  view.setUint32(28, 16000 * 2, true);
  // Block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // Bits per sample
  view.setUint16(34, 16, true);
  // Data chunk identifier
  writeString(view, 36, 'data');
  // Data chunk length
  view.setUint32(40, dataLength, true);
  
  return buffer;
}

// Helper function to write strings to DataView
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// --- Neon Progress Bar helpers ---
let gptProgressInterval = null;
function setNeonProgress(percent) {
  neonProgressBar.style.display = 'flex';
  neonProgressBar.style.width = '210px'; // 50% smaller, always centered
  neonProgressBar.innerHTML = '';
  const inner = document.createElement('div');
  inner.className = 'neon-bar-inner';
  inner.style.width = percent + '%';
  inner.style.transition = 'width 0.25s cubic-bezier(0.4,0,0.2,1)';
  neonProgressBar.appendChild(inner);
}
function fadeOutNeonBar() {
  neonProgressBar.style.transition = 'opacity 0.8s cubic-bezier(0.4,0,0.2,1)';
  neonProgressBar.style.opacity = '0';
  setTimeout(() => {
    neonProgressBar.style.display = 'none';
    neonProgressBar.style.opacity = '1';
    neonProgressBar.innerHTML = '';
    neonProgressBar.style.transition = '';
  }, 800);
}
function startGptProgressBar() {
  let percent = 0;
  setNeonProgress(0);
  gptProgressInterval = setInterval(() => {
    percent += Math.random() * 2 + 1.2;
    if (percent > 98) percent = 98;
    setNeonProgress(percent);
  }, 80);
}
function finishGptProgressBar() {
  if (gptProgressInterval) clearInterval(gptProgressInterval);
  setNeonProgress(100);
  setTimeout(() => fadeOutNeonBar(), 600);
}
// --- Live Transcription State ---
let liveTranscript = '';
let isFinalizing = false;
let isRecordingNow = false;

// --- Speech Recognition: show live transcript ---
function setupRecognitionLiveDisplay() {
  if (!recognition) return;
  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      liveTranscript += event.results[i][0].transcript + ' ';
    }
    if (isRecordingNow) {
      transcriptElement.innerText = liveTranscript ? `Transcription en direct : "${liveTranscript.trim()}"` : '';
      transcriptElement.classList.add('active');
      transcriptElement.style.opacity = '1';
      transcriptElement.style.color = '#00ffe0';
      transcriptElement.style.textShadow = '0 0 8px #00ffe0, 0 0 16px #00ffe0';
      transcriptElement.style.transition = 'color 0.5s, text-shadow 0.5s, opacity 0.5s';
      transcriptElement.style.display = 'block';
      transcriptElement.style.textAlign = 'center';
      transcriptElement.style.fontSize = '1.1em';
      transcriptElement.style.fontWeight = '400';
      transcriptElement.style.margin = '0.5em auto 0 auto';
      transcriptElement.style.maxWidth = '420px';
    }
  };
  // Track recognition state for safe start/stop
  recognition.onstart = () => { isRecognizing = true; };
  recognition.onend = () => { isRecognizing = false; };
}
setupRecognitionLiveDisplay();

// --- Override processAudio to use XMLHttpRequest for progress and simulate GPT progress ---
async function processAudio() {
  isRecordingNow = false;
  transcriptElement.style.display = 'none';
  statusElement.innerText = "Connexion avec l'au-delà...";
  statusElement.style.textAlign = 'center';
  setNeonProgress(0);
  neonProgressBar.style.display = 'flex';
  isFinalizing = true;
  // Create a blob from the recorded chunks with WebM format
  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");
  // Use XMLHttpRequest for upload progress
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/channel', true);
    xhr.responseType = 'json';
    let uploadDone = false;
    xhr.upload.onprogress = function (e) {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setNeonProgress(percent);
      }
    };
    xhr.upload.onloadend = function () {
      uploadDone = true;
      startGptProgressBar();
    };
    xhr.onload = function () {
      finishGptProgressBar();
      statusElement.innerText = '';
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = xhr.response;
        messageElement.innerText = data.message;
        messageElement.className = 'message poetic';
        messageElement.style.textAlign = 'center';
        messageElement.style.color = '#fff';
        messageElement.style.textShadow = '0 0 16px #fff, 0 0 32px #fff8, 0 0 2px #fff';
        messageElement.style.background = 'none';
        messageElement.style.border = 'none';
        transcriptElement.innerText = '';
        transcriptElement.style.display = 'none';
        isFinalizing = false;
        resolve();
      } else {
        transcriptElement.innerText = "Erreur: " + xhr.statusText;
        transcriptElement.classList.add('active');
        transcriptElement.style.color = '';
        transcriptElement.style.textShadow = '';
        transcriptElement.style.display = 'block';
        isFinalizing = false;
        finishGptProgressBar();
        reject(xhr.statusText);
      }
    };
    xhr.onerror = function () {
      transcriptElement.innerText = "Erreur: " + xhr.statusText;
      transcriptElement.classList.add('active');
      transcriptElement.style.color = '';
      transcriptElement.style.textShadow = '';
      transcriptElement.style.display = 'block';
      isFinalizing = false;
      finishGptProgressBar();
      reject(xhr.statusText);
    };
    xhr.send(formData);
  });
}

// --- Center message and transcript on finalize ---
function centerFinalDisplay() {
  messageElement.style.textAlign = 'center';
  transcriptElement.style.textAlign = 'center';
}

// Initialize page - always show transcript, just with lower opacity when not active
window.addEventListener('load', () => {
  // Always keep transcript visible, just with different opacity levels
  transcriptElement.classList.add('active');
});

// Add event listeners for online/offline status
window.addEventListener('online', () => {
  console.log("Browser is now online");
  if (!isRecording) {
    transcriptElement.innerText = "Connexion internet rétablie. La transcription devrait fonctionner.";
  }
});

window.addEventListener('offline', () => {
  console.log("Browser is now offline");
  transcriptElement.innerText = "Connexion internet perdue. La transcription pourrait ne pas fonctionner.";
  transcriptElement.classList.add('active');
});

function showNeonProgressBar() {
  neonProgressBar.style.display = 'flex';
  neonProgressBar.innerHTML = '';
  const inner = document.createElement('div');
  inner.className = 'neon-bar-inner';
  neonProgressBar.appendChild(inner);
}

function hideNeonProgressBar() {
  neonProgressBar.style.display = 'none';
  neonProgressBar.innerHTML = '';
}

// Add auto-fade functionality
function fadeOutElements() {
    setTimeout(() => {
        transcriptElement.style.opacity = '0';
        messageElement.style.opacity = '0';
        setTimeout(() => {
            transcriptElement.innerText = "Prêt pour votre prochain message...";
            messageElement.innerText = "";
            transcriptElement.style.opacity = '1';
        }, 1000);
    }, 10000); // 10 seconds
}