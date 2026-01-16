document.addEventListener('DOMContentLoaded', function() {
    
    const searchBtn = document.getElementById('search-btn');
    const classSelect = document.getElementById('class-select');
    const startDate = document.getElementById('start-date');
    const endDate = document.getElementById('end-date');

    if (searchBtn) {
        searchBtn.addEventListener('click', function() {
            // 簡易バリデーション
            if (!classSelect.value) {
                alert('クラスを選択してください');
                return;
            }
            if (!startDate.value || !endDate.value) {
                alert('開始日と終了日を選択してください');
                return;
            }

            // URLパラメータを作成
            const params = new URLSearchParams({
                class_name: classSelect.value,
                start_date: startDate.value,
                end_date: endDate.value
            });

            // 遷移 (例: /attendanceResult?class_name=R4A1&start_date=2025-11-01...)
            window.location.href = `/attendanceResult?${params.toString()}`;
        });
    }
});