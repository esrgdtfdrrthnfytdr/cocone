let audioCtx, analyser, dataArray;
let isListening = false;
let detectedBits = "";
let state = "IDLE";

// 周波数設定 (Teacherに合わせる)
const FREQ_START_MIN = 16800;
const FREQ_START_MAX = 17200;

// UI要素
const registerBtn = document.getElementById('register-btn');
const statusMsg = document.getElementById('status-msg');
const debugFreq = document.getElementById('debug-freq');
const debugBits = document.getElementById('debug-bits');

// テスト用正解定義
const TARGET_BINARY = "1111";

if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
        if (registerBtn.classList.contains('is-processing')) return;
        try {
            await startMic();
        } catch (e) {
            alert("マイクエラー: " + e);
        }
    });
}

async function startMic() {
    registerBtn.textContent = '信号待機中...';
    registerBtn.classList.add('is-processing');
    if(statusMsg) statusMsg.innerText = "マイク起動: '1111'を待っています";
    if(debugBits) debugBits.innerText = "";

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // iOS対策(無音再生)
    const emptyBuffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = emptyBuffer;
    source.connect(audioCtx.destination);
    source.start(0);
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const mediaSource = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048; 
    analyser.smoothingTimeConstant = 0.5;

    const filter = audioCtx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 16000; 
    mediaSource.connect(filter);
    filter.connect(analyser);
    
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    isListening = true;
    state = "IDLE";
    updateLoop();
}

function getDominantFrequency() {
    analyser.getByteFrequencyData(dataArray);
    let maxVal = 0;
    let maxIndex = 0;
    const nyquist = audioCtx.sampleRate / 2;
    const minIndex = Math.floor(16000 * dataArray.length / nyquist);

    for (let i = minIndex; i < dataArray.length; i++) {
        if (dataArray[i] > maxVal) {
            maxVal = dataArray[i];
            maxIndex = i;
        }
    }
    if (maxVal < 30) return 0; 
    return maxIndex * nyquist / dataArray.length;
}

function updateLoop() {
    if (!isListening) return;
    requestAnimationFrame(updateLoop);
    const freq = getDominantFrequency();
    if (debugFreq) debugFreq.innerText = Math.round(freq) + " Hz";

    // スタート信号検知
    if (state === "IDLE" && freq > FREQ_START_MIN && freq < FREQ_START_MAX) {
        console.log("Start detected!");
        if(statusMsg) statusMsg.innerText = `受信開始! (${Math.round(freq)}Hz)`;
        startReceivingSequence();
    }
}

function startReceivingSequence() {
    if (state !== "IDLE") return;
    state = "RECEIVING";
    detectedBits = "";
    let bitCount = 0;

    const readBit = () => {
        const freq = getDominantFrequency();
        let bit = "?";
        
        // Bit判定 (1=19000Hz, 0=18000Hz)
        if (freq > 18800 && freq < 19200) bit = "1";      
        else if (freq > 17800 && freq < 18200) bit = "0"; 
        
        if (debugBits) debugBits.innerText += (bit === "?" ? "_" : bit) + " ";
        if (bit === "?") bit = "0"; // エラー訂正
        
        detectedBits += bit;
        bitCount++;
        
        if (bitCount < 4) {
            setTimeout(readBit, 500); 
        } else {
            finishReceiving();
        }
    };
    
    // タイミング調整 (Start 0.5s + 待機 0.25s)
    setTimeout(readBit, 750);
}

function finishReceiving() {
    state = "IDLE";
    isListening = false; // 受信停止
    registerBtn.classList.remove('is-processing');
    registerBtn.textContent = '出席登録(テスト)';

    console.log("Result Binary:", detectedBits);

    // ★ サーバー通信なしで判定 ★
    if (detectedBits === TARGET_BINARY) {
        alert("【テスト成功】\n正しく '1111' を受信しました！");
        if(statusMsg) {
            statusMsg.innerText = "受信成功: 1111";
            statusMsg.style.color = "green";
            statusMsg.style.fontWeight = "bold";
        }
        if(debugBits) debugBits.innerHTML += "<br>✅ MATCHED!";
    } else {
        alert(`【テスト失敗】\n期待値: ${TARGET_BINARY}\n受信値: ${detectedBits}\n\n周波数や距離を調整して再試行してください。`);
        if(statusMsg) {
            statusMsg.innerText = `不一致: ${detectedBits}`;
            statusMsg.style.color = "red";
        }
    }
}