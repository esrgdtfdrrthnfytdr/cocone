document.addEventListener('DOMContentLoaded', function() {
    // --- ハンバーガーメニューの開閉処理 ---
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const closeBtn = document.getElementById('close-btn');
    const mobileMenu = document.getElementById('mobile-menu');

    if (hamburgerBtn && mobileMenu) {
        hamburgerBtn.addEventListener('click', function() {
            mobileMenu.classList.add('active');
        });

        closeBtn.addEventListener('click', function() {
            mobileMenu.classList.remove('active');
        });

        mobileMenu.addEventListener('click', function(e) {
            if (e.target === mobileMenu) {
                mobileMenu.classList.remove('active');
            }
        });
    }
});
// ==============以下デバッグ情報用===================


/**
 * デバッグモードの初期化
 * URLパラメータに '?mode=debug' が含まれていれば、
 * 画面にデバッグ用エリアを表示する。
 */
function initDebugMode() {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');

    if (mode === 'debug') {
        // bodyタグにクラスを追加してCSSで表示を切り替える
        document.body.classList.add('show-debug');
        logDebug("デバッグモードが有効化されました");
        logDebug("UserAgent: " + navigator.userAgent);
    }
}

/**
 * デバッグログ出力用関数
 * @param {string} message - 表示したいメッセージ
 */
function logDebug(message) {
    const debugConsole = document.getElementById('debug-console-output');
    if (debugConsole) {
        const timestamp = new Date().toLocaleTimeString();
        const line = document.createElement('div');
        line.textContent = `[${timestamp}] ${message}`;
        debugConsole.appendChild(line);
        // 最新のログが見えるように自動スクロール
        debugConsole.scrollTop = debugConsole.scrollHeight;
    }
    // 通常のコンソールにも出す
    console.log(`[Debug] ${message}`);
}

// ページ読み込み時に実行
document.addEventListener('DOMContentLoaded', initDebugMode);
