// static/js/test_student.js

let audioCtx, analyser, dataArray;
let isListening = false;
let detectedBits = "";
let state = "IDLE";
let dynamicThreshold = 30;

// 周波数設定（test_teacher.jsと完全一致）
// 19000Hz以上を使用
const FREQ_MARKER_MIN = 18800; const FREQ_MARKER_MAX = 19200; // Marker: 19000
const FREQ_BIT_0_MIN  = 19150; const FREQ_BIT_0_MAX  = 19450; // Bit 0: 19300
const FREQ_BIT_1_MIN  = 19550; const FREQ_BIT_1_MAX  = 19850; // Bit 1: 19700

const registerBtn = document.getElementById('register-btn');
const statusMsg = document.getElementById('status-msg');
const modal = document.getElementById('completion-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const debugFreq = document.getElementById('debug-freq');
const debugBits = document.getElementById('debug-bits');

if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
        if (registerBtn.classList.contains('is-processing')) return;
        try { await startMic(); } catch (e) { alert("マイクエラー: " + e); }
    });
}
if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', () => {
        if(modal) modal.classList.remove('active');
        resetUI();
    });
}

async function startMic() {
    registerBtn.textContent = '信号を探しています...';
    registerBtn.classList.add('is-processing');
    if(statusMsg) statusMsg.innerText = "マイク起動中...";
    if(debugBits) debugBits.innerText = ""; 

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const emptyBuffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = emptyBuffer;
    source.connect(audioCtx.destination);
    source.start(0);
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    
    const mediaSource = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.1; // 反応速度重視

    const filter = audioCtx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 17000; 

    mediaSource.connect(filter);
    filter.connect(analyser);
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    setTimeout(() => {
        analyser.getByteFrequencyData(dataArray);
        const avgNoise = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        dynamicThreshold = Math.max(10, avgNoise + 8); // 感度高め
        console.log("Calibration complete. Threshold:", dynamicThreshold);
        
        isListening = true;
        state = "IDLE";
        updateLoop();
    }, 500);
}

function getDominantFrequency() {
    analyser.getByteFrequencyData(dataArray);
    let maxVal = 0;
    let maxIndex = 0;
    const nyquist = audioCtx.sampleRate / 2;
    const minIndex = Math.floor(18000 * dataArray.length / nyquist); 

    for (let i = minIndex; i < dataArray.length; i++) {
        if (dataArray[i] > maxVal) {
            maxVal = dataArray[i];
            maxIndex = i;
        }
    }
    if (maxVal < dynamicThreshold) return 0; 
    return maxIndex * nyquist / dataArray.length;
}

function updateLoop() {
    if (!isListening) return;
    
    if (state === "IDLE") {
        const freq = getDominantFrequency();
        if (debugFreq) debugFreq.innerText = freq > 0 ? Math.round(freq) + " Hz" : "---";

        if (freq > FREQ_MARKER_MIN && freq < FREQ_MARKER_MAX) {
            console.log("🚀 START SIGNAL DETECTED");
            if(statusMsg) statusMsg.innerText = "受信開始...";
            startReceivingSequence();
        }
    }
    requestAnimationFrame(updateLoop);
}

function startReceivingSequence() {
    // 二重起動防止
    if (state !== "IDLE") return;
    state = "RECEIVING"; 
    
    // ★ここが修正点：前のデータを確実に消去する
    detectedBits = ""; 
    let bitCount = 0;
    if(debugBits) debugBits.innerText = "";

    // ★ここが修正点：待ち時間を「1.5秒」にする
    // Start(1.0s) + Buffer(0.5s) = 1.5s
    // これで前の音を絶対に拾わず、Bit1の真ん中を狙い撃ちします
    const INITIAL_WAIT = 1500; 

    const readBit = () => {
        let samples = [];      
        let sampleCount = 0;   
        const maxSamples = 20; 
        const sampleInterval = 20; // 20ms * 20回 = 400ms測定

        const takeSample = () => {
            const freq = getDominantFrequency();
            let bit = null;
            
            if (freq > FREQ_BIT_1_MIN && freq < FREQ_BIT_1_MAX) bit = "1";      
            else if (freq > FREQ_BIT_0_MIN && freq < FREQ_BIT_0_MAX) bit = "0"; 
            
            if (bit !== null) samples.push(bit);
            
            if (debugFreq) debugFreq.innerText = `Scan: ${Math.round(freq)} Hz -> ${bit || '?'}`;

            sampleCount++;

            if (sampleCount < maxSamples) {
                setTimeout(takeSample, sampleInterval);
            } else {
                const count1 = samples.filter(s => s === "1").length;
                const count0 = samples.filter(s => s === "0").length;
                
                let finalBit = "x";
                // 救済措置：1回でも検知できれば採用
                if (count1 === 0 && count0 === 0) {
                    finalBit = "x";
                } else if (count1 >= count0) {
                    finalBit = "1";
                } else {
                    finalBit = "0";
                }
                
                detectedBits += finalBit;
                bitCount++;
                console.log(`Bit ${bitCount}: ${finalBit} (1:${count1}, 0:${count0})`);
                if (debugBits) debugBits.innerText = detectedBits; 

                if (bitCount < 4) {
                    // 次のビットまで待機
                    // 1ビット1.0秒 - 測定0.4秒 = 残り0.6秒待機
                    setTimeout(readBit, 600); 
                } else {
                    finishReceiving();
                }
            }
        };
        takeSample();
    };

    setTimeout(readBit, INITIAL_WAIT); 
}

async function finishReceiving() {
    console.log("Final Result:", detectedBits);
    
    // xが含まれていたら即失敗にする
    if (detectedBits.includes("x")) {
        if(statusMsg) statusMsg.innerText = "受信失敗: 再試行します";
        if(debugBits) debugBits.innerHTML += " <span style='color:red'>[失敗]</span>";
        setTimeout(() => { resetUI(); }, 2000);
        return;
    }

    const val = parseInt(detectedBits, 2);
    if (isNaN(val)) {
        setTimeout(() => { resetUI(); }, 2000);
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
            // 成功したら監視を止める（stateをIDLEに戻さない）
        } else {
            alert(`コード不一致: 受信${val} (正解: ${result.correct_otp || '?'})`);
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
    state = "IDLE";
    isListening = true; 
}