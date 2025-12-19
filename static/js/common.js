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