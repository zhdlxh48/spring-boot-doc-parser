export class ProgressBar {
    constructor(total, width = 30) {
        this.init(total, width);
    }

    init(total, width = 30) {
        this.total = total;
        this.current = 0;
        this.width = width;
        this.startTime = Date.now();
        this.isComplete = false;
    }

    // 진행률 업데이트
    update(current) {
        // 완료 시 자동으로 정리
        if (this.current >= this.total && !this.isComplete) {
            this.isComplete = true;
            this.complete();
        }

        this.current = current;
        this.render();
    }

    // 진행률 증가
    increment(step = 1) {
        this.update(Math.min(this.current + step, this.total));
    }

    // 진행률 렌더링
    render() {
        const progress = Math.min(this.current / this.total, 1);
        const filledWidth = Math.round(this.width * progress);
        const emptyWidth = this.width - filledWidth;

        // 진행률 바
        const filledBar = '█'.repeat(filledWidth);
        const emptyBar = '░'.repeat(emptyWidth);

        // 진행률 퍼센트
        const percent = Math.round(progress * 100);

        // 경과 시간 계산
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

        // 상태 아이콘 (진행중/완료)
        const statusIcon = progress >= 1 ? '✅' : '🔄';

        // 진행 상황 표시
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(
            `${statusIcon} [${filledBar}${emptyBar}] ${percent}% (${this.current}/${this.total}) | ⏱️ ${elapsed}s`
        );

        // 완료 시 개행
        if (progress >= 1) {
            process.stdout.write('\n');
        }
    }

    // 완료 처리
    complete() {
        this.current = this.total;
        this.render();
    }
}
