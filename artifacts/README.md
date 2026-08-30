# 그림친구 품질 하네스 산출물 지도

상태: 3차 검토 진행 중

이 폴더는 그래픽·제품·안전 품질을 반복해서 점검하기 위한 근거를 남긴다.

- `review-rounds.md`: 세 번의 검토 목표, 책임, 통과 기준
- `improvement-log.md`: 실제 반영 내용과 다음 재검토 조건
- `scripts/safety-smoke.mjs`: 정상·애매함·실패 위험 입력을 API에 주입하는 회귀 검사

다음 실행은 이 파일과 `improvement-log.md`를 먼저 읽고, 미완료 항목만 부분 재실행한다.
