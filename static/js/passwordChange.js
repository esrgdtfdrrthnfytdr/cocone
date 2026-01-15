document.addEventListener('DOMContentLoaded', function() {
    
    const changeBtn = document.getElementById('change-btn');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const errorMsgArea = document.getElementById('password-error-msg');

    function showError(msg) {
        if (errorMsgArea) errorMsgArea.textContent = msg;
        // 入力欄を赤くする
        newPasswordInput.classList.add('input-error');
        confirmPasswordInput.classList.add('input-error');
    }

    function clearError() {
        if (errorMsgArea) errorMsgArea.textContent = '';
        newPasswordInput.classList.remove('input-error');
        confirmPasswordInput.classList.remove('input-error');
    }

    // 入力時にエラークリア
    newPasswordInput.addEventListener('input', clearError);
    confirmPasswordInput.addEventListener('input', clearError);

    if (changeBtn) {
        changeBtn.addEventListener('click', function() {
            clearError();

            const newPass = newPasswordInput.value;
            const confirmPass = confirmPasswordInput.value;

            // 1. 未入力チェック (画面内表示)
            if (!newPass || !confirmPass) {
                showError('※ パスワードを入力してください');
                return;
            }

            // 2. 一致チェック (画面内表示)
            if (newPass !== confirmPass) {
                showError('※ パスワード（確認）が一致しません');
                return;
            }

            // 3. 変更確認 (ブラウザ標準)
            if (confirm('パスワードを変更しますか？\n(デモ機能: 実際のパスワードは変更されません)')) {
                alert('パスワードを変更しました。\nログイン画面へ移動します。(シミュレーション)');
                
                // ログイン画面へ遷移
                window.location.href = 'login.html'; 
            }
        });
    }
});