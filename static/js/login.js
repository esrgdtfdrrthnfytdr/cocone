document.addEventListener('DOMContentLoaded', function() {
    
    const loginBtn = document.getElementById('login-btn');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const errorMsgArea = document.getElementById('login-error-msg');

    function showError(msg) {
        if (errorMsgArea) errorMsgArea.textContent = msg;
        emailInput.classList.add('input-error');
        passwordInput.classList.add('input-error');
    }

    function clearError() {
        if (errorMsgArea) errorMsgArea.textContent = '';
        emailInput.classList.remove('input-error');
        passwordInput.classList.remove('input-error');
    }

    // 入力時にエラー解除
    emailInput.addEventListener('input', clearError);
    passwordInput.addEventListener('input', clearError);

    if (loginBtn) {
        loginBtn.addEventListener('click', function() {
            clearError();

            const email = emailInput.value;
            const password = passwordInput.value;

            // バリデーション
            if (!email || !password) {
                showError('※ メールアドレスとパスワードを入力してください');
                return;
            }

            // ログイン処理シミュレーション
            console.log('Login attempt:', email);
            
            // 成功とみなして遷移
            window.location.href = 'rollCall.html'; // 出欠席絞り込み画面へ
        });
    }
});