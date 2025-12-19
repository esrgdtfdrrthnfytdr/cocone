// let audioCtx;
// let bgmBuffer = null;
// let bgmSource = null;
// let osc = null;
// let isScanning = false; // 送信中フラグ

// // 設定
// const BGM_URL = '/static/sounds/bgm.wav'; 
// const FREQ_START = 21000;
// const FREQ_1 = 20000;
// const FREQ_0 = 19000;
// const BIT_DURATION = 1.0;

// // 初期化：BGM読み込み
// window.addEventListener('load', async () => {
//     try {
//         window.AudioContext = window.AudioContext || window.webkitAudioContext;
//         audioCtx = new AudioContext();
        
//         const response = await fetch(BGM_URL);
//         const arrayBuffer = await response.arrayBuffer();
//         bgmBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
//         console.log("BGM Ready");
//     } catch (e) {
//         console.error("BGM Load Error:", e);
//         showError("BGMの読み込みに失敗しました");
//     }
// });

// // ボタンイベント (ID: submit-btn に合わせました)
// const submitBtn = document.getElementById('submit-btn');
// const classSelect = document.getElementById('class-select');
// const errorMessage = document.getElementById('error-message');

// if (submitBtn) {
//     submitBtn.addEventListener('click', async () => {
//         // 送信中なら停止
//         if (isScanning) {
//             stopSound();
//             return;
//         }
        
//         // クラス未選択ならエラー
//         const selectedValue = classSelect.value;
//         if (!selectedValue) {
//             showError('クラスを選択してください');
//             return;
//         }

//         clearError();
        
//         // 音響コンテキスト再開 (iOS対策)
//         if (audioCtx && audioCtx.state === 'suspended') {
//             await audioCtx.resume();
//         }

//         // 1. OTP取得
//         try {
//             const res = await fetch('/api/generate_otp', { method: 'POST' });
//             const data = await res.json();
//             console.log("OTP:", data);
            
//             // 2. UI更新 & 再生開始
//             startScanningUI(selectedValue);
//             playMixedSound(data.otp_binary);

//         } catch(e) {
//             showError("サーバー通信エラー");
//             console.error(e);
//         }
//     });
// }

// function startScanningUI(className) {
//     isScanning = true;
//     submitBtn.textContent = '停止する';
//     submitBtn.classList.add('is-processing'); // 波紋アニメーション
//     classSelect.disabled = true;
// }

// function stopScanningUI() {
//     isScanning = false;
//     submitBtn.textContent = '出席確認';
//     submitBtn.classList.remove('is-processing');
//     classSelect.disabled = false;
// }

// function showError(msg) {
//     if(errorMessage) {
//         errorMessage.textContent = msg;
//         errorMessage.classList.add('show');
//     }
// }
// function clearError() {
//     if(errorMessage) {
//         errorMessage.textContent = '';
//         errorMessage.classList.remove('show');
//     }
// }

// // 音の再生ロジック
// function playMixedSound(binaryStr) {
//     if (!bgmBuffer) return;
    
//     // --- BGM ---
//     bgmSource = audioCtx.createBufferSource();
//     bgmSource.buffer = bgmBuffer;
//     bgmSource.loop = true;
//     const bgmGain = audioCtx.createGain();
//     bgmGain.gain.value = 0.4;
//     bgmSource.connect(bgmGain);
//     bgmGain.connect(audioCtx.destination);

//     // --- 信号 ---
//     osc = audioCtx.createOscillator();
//     const oscGain = audioCtx.createGain();
//     oscGain.gain.value = 0.1;
//     osc.connect(oscGain);
//     oscGain.connect(audioCtx.destination);

//     const startTime = audioCtx.currentTime;

//     // スケジュール
//     osc.frequency.setValueAtTime(FREQ_START, startTime);
//     for (let i = 0; i < binaryStr.length; i++) {
//         const bit = binaryStr[i];
//         const time = startTime + BIT_DURATION + (i * BIT_DURATION);
//         osc.frequency.setValueAtTime((bit === '1' ? FREQ_1 : FREQ_0), time);
//     }

//     const totalDuration = BIT_DURATION + (binaryStr.length * BIT_DURATION);
//     const endTime = startTime + totalDuration;

//     bgmSource.start(startTime);
//     osc.start(startTime);

//     // 信号終了
//     osc.stop(endTime);
//     // BGMは少し長く流して、自動停止
//     bgmSource.stop(endTime + 5.0);
    
//     // 自動停止時の処理
//     osc.onended = () => {
//         // UIは少し遅らせて戻す
//         setTimeout(() => stopSound(), 5000);
//     };
// }

// function stopSound() {
//     if(osc) { try{ osc.stop(); }catch(e){} osc = null; }
//     if(bgmSource) { try{ bgmSource.stop(); }catch(e){} bgmSource = null; }
//     stopScanningUI();
// }

//ロジック部分はteacherとstudentに分離


// ハンバーガーメニュー (共通機能)
document.addEventListener('DOMContentLoaded', () => {
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const closeBtn = document.getElementById('close-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (hamburgerBtn && mobileMenu) {
        hamburgerBtn.addEventListener('click', () => mobileMenu.classList.add('active'));
        closeBtn.addEventListener('click', () => mobileMenu.classList.remove('active'));
    }
});