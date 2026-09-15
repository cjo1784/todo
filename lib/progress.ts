// 진행률(%) = done / total * 100, Math.round(반올림, .5는 올림)한 정수. total 0이면 0.
export function calcProgress(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}
