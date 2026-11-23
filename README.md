# 레시피 연구소

운영 스냅샷을 바탕으로 정리한 정적 레시피 사이트입니다. GitHub 저장소 이름은 `recipe-lab`입니다.

## 실행과 테스트

Node.js 22와 Python 3에서 실행합니다.

```sh
npm ci
npx playwright install chromium
npm test
npm start
```

로컬 주소는 http://127.0.0.1:4197/ 입니다. 시스템 Chromium이 있다면 `RECIPE_LAB_CHROMIUM=/usr/bin/chromium npm test`로 실행할 수 있습니다. GitHub Actions는 푸시와 풀 리퀘스트에서 무결성 검사 4개와 브라우저 검사 8개를 실행합니다.

## 보존 범위

기존 레시피 51개를 전체 레코드 해시로 검증합니다. 즐겨찾기 `recipeLabFavorites`는 숫자 ID 배열이며 장보기 `recipeLabShoppingV13`은 `재료명|단위`별 `{label, done}` 객체입니다. 기존 브라우저 데이터는 운영과 같은 출처에서 유지됩니다. PWA 매니페스트와 아이콘을 유지하며 서비스 워커를 추가하지 않았습니다.

[사진 라이선스 점검](docs/photo-license-audit.md)과 [GitHub 및 Netlify 연결 절차](docs/release-preparation.md)를 참고하세요.
