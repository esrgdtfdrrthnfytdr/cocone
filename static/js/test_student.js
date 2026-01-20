// static/js/test_student.js (最終安定化バージョン)

let audioCtx, analyser, dataArray;
let isListening = false;
let detectedBits = "";
let state = "IDLE";
let dynamicThreshold = 35;

// 周波数設定
const FREQ_MARKER_MIN = 18800, FREQ_MARKER_MAX = 19250; 
const FREQ_BIT_0_MIN = 18250, FREQ_BIT_0_MAX = 18750; 
const FREQ_BIT_1_MIN = 19250, FREQ_BIT_1_MAX = 19750;

const registerBtn = document.getElementById('register-btn');
const statusMsg = document.getElementById('status-msg');
const modal = document.getElementById('completion-modal');
const debugFreq = document.getElementById('debug-freq');
const debugBits = document.getElementById('debug-bits');

if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
        if (registerBtn.classList.contains('is-processing')) return;
        try { await startMic(); } catch (e) { alert("マイクエラー: " + e); }
    });
}

async function startMic() {
    registerBtn.textContent = '信号を探しています...';
    registerBtn.classList.add('is-processing');
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    const emptyBuffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = emptyBuffer;
    source.connect(audioCtx.destination);
    source.start(0);

    const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    
    const mediaSource = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.2; // 反応を速くする

    const filter = audioCtx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 16000; 

    mediaSource.connect(filter);
    filter.connect(analyser);
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    setTimeout(() => {
        analyser.getByteFrequencyData(dataArray);
        const avgNoise = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        dynamicThreshold = Math.max(30, avgNoise + 15); // 感度を少し上げる
        isListening = true;
        updateLoop();
    }, 600);
}

function getDominantFrequency() {
    analyser.getByteFrequencyData(dataArray);
    let maxVal = 0, maxIndex = 0;
    const nyquist = audioCtx.sampleRate / 2;
    const minIndex = Math.floor(16000 * dataArray.length / nyquist);

    for (let i = minIndex; i < dataArray.length; i++) {
        if (dataArray[i] > maxVal) { maxVal = dataArray[i]; maxIndex = i; }
    }
    if (maxVal < dynamicThreshold) return 0; 
    return maxIndex * nyquist / dataArray.length;
}

function updateLoop() {
    if (!isListening) return;
    requestAnimationFrame(updateLoop);
    const freq = getDominantFrequency();
    if (debugFreq) debugFreq.innerText = freq > 0 ? Math.round(freq) + " Hz" : "---";

    if (state === "IDLE" && freq > FREQ_MARKER_MIN && freq < FREQ_MARKER_MAX) {
        if(statusMsg) statusMsg.innerText = "受信開始...";
        startReceivingSequence();
    }
}

function startReceivingSequence() {
    if (state !== "IDLE") return;
    state = "RECEIVING";
    detectedBits = "";
    let bitCount = 0;

    const readBit = () => {
        let samples = [];      
        let sampleCount = 0;   
        const maxSamples = 12;  // サンプル数を増やす
        const sampleInterval = 30; // 測定をより高速にする

        const takeSample = () => {
            const freq = getDominantFrequency();
            let bit = null;
            if (freq > FREQ_BIT_1_MIN && freq < FREQ_BIT_1_MAX) bit = "1";
            else if (freq > FREQ_BIT_0_MIN && freq < FREQ_BIT_0_MAX) bit = "0";
            
            if (bit !== null) samples.push(bit);
            sampleCount++;

            if (sampleCount < maxSamples) {
                setTimeout(takeSample, sampleInterval);
            } else {
                const count1 = samples.filter(s => s === "1").length;
                const count0 = samples.filter(s => s === "0").length;
                
                let finalBit = "x";
                // ★救済ロジック：1回でも検知された方を採用する
                if (count1 > 0 && count1 >= count0) finalBit = "1";
                else if (count0 > 0 && count0 > count1) finalBit = "0";
                
                detectedBits += finalBit;
                bitCount++;
                console.log(`Bit ${bitCount}: ${finalBit} (1検知:${count1}, 0検知:${count0})`);
                if (debugBits) debugBits.innerText += finalBit + " ";

                if (bitCount < 4) {
                    setTimeout(readBit, 80); 
                } else {
                    finishReceiving();
                }
            }
        };
        takeSample();
    };
    setTimeout(readBit, 450); // スタート信号後の食い込み防止
}

async function finishReceiving() {
    const val = parseInt(detectedBits, 2);
    if (detectedBits.includes("x") || isNaN(val)) {
        if(statusMsg) statusMsg.innerText = "受信失敗";
        setTimeout(() => { resetUI(); }, 1500);
        return;
    }
    try {
        const res = await fetch('/api/check_attend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ otp_value: val })
        });
        const result = await res.json();
        if (result.status === "success") {
            if (modal) modal.classList.add('active');
            if(statusMsg) statusMsg.innerText = "登録完了";
        } else {
            alert(`コード不一致: ${val}`);
            resetUI();
        }
    } catch(e) {
        alert("通信エラー");
        resetUI();
    }
}

function resetUI() {
    registerBtn.textContent = '出席登録';
    registerBtn.classList.remove('is-processing');
    if(statusMsg) statusMsg.innerText = "";
    if(debugBits) debugBits.innerText = "";
    state = "IDLE";
    isListening = false;
}