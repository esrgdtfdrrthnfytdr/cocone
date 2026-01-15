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

            // 検索処理のシミュレーション
            console.log('検索条件:', {
                class: classSelect.value,
                start: startDate.value,
                end: endDate.value
            });

            // 遷移（結果画面としての attendanceStatus.html へ）
            // 実際はクエリパラメータなどを付与して遷移します
            window.location.href = 'attendanceStatus.html';
        });
    }
});