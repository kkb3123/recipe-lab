import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const { version } = JSON.parse(read('../package.json'));
const recipes = JSON.parse(read('../public/index.html').match(/^const R=(.*);$/m)[1]);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const sha = git('rev-parse', 'HEAD');
const base = process.env.PR_BASE || process.env.PUSH_BASE || '';
const hasBase = /^[a-f0-9]{40}$/.test(base) && !/^0+$/.test(base);
const revision = hasBase ? `${base}..HEAD` : 'HEAD';
const count = hasBase ? '-30' : '-1';
const changes = git('log', count, '--format=%h %s', revision);
const testStatuses = { success: '통과', failure: '실패', cancelled: '취소', skipped: '실행되지 않음' };
const outcome = testStatuses[process.env.TEST_OUTCOME] ?? '결과 없음';
const logPath = process.env.RUNNER_TEMP ? `${process.env.RUNNER_TEMP}/recipe-lab-tests.log` : '';
const log = logPath && existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
const nodePass = log.match(/# pass (\d+)/)?.[1];
const nodeFail = log.match(/# fail (\d+)/)?.[1];
const browserPass = log.match(/(\d+) passed \(/)?.[1];
const browserFail = log.match(/(\d+) failed/)?.[1];
const counts = nodePass ? ` 무결성 ${nodePass}개 통과·${nodeFail ?? '?'}개 실패, 브라우저 ${browserPass ?? (browserFail ? 0 : '미실행')}개 통과·${browserFail ?? (browserPass ? 0 : '미실행')}개 실패.` : '';

console.log(`# 레시피 연구소 개발 기록

- 현재 버전 — \`${version}\` (\`${sha.slice(0, 7)}\`)
- 전체 레시피 — ${recipes.length}개
- 최신 개발 미리보기 — ${process.env.DEVELOPMENT_PREVIEW_URL}
- 자동 테스트 — ${outcome}.${counts} 세부 결과는 이 실행의 **Run tests** 로그를 참고하세요.

## 변경 사항

${(changes || '이 범위에 새 커밋이 없습니다.').split('\n').map(line => '    ' + line).join('\n')}

${read('../docs/development.md').trim()}
`);
