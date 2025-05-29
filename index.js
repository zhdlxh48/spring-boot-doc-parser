import axios from "axios";
import jsdom from "jsdom";
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ProgressBar } from './progress-utils.js';

// Create export directory with timestamp
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const exportDir = `${__dirname}/export/${timestamp}`;
const articlesDir = `${exportDir}/articles`; // Will be created in the export folder

function recursiveDepthSearch(elem, depth, data) {
    const a = elem.querySelector("a");
    data = { title: a.textContent, href: a.href, external: a.classList.contains("link-external") };

    const childElems = elem.querySelectorAll(`ul.nav-list > li.nav-item[data-depth="${depth}"]`);
    if (childElems.length == 0) {
        return data;
    }

    data.childData = [];
    for (const childElem of childElems) {
        const retData = recursiveDepthSearch(childElem, depth + 1)
        data.childData = [...data.childData, retData];
    }

    return data;
}

function recursiveAnchorProcess(callback, data) {
    if (data.childData !== undefined) {
        for (const childData of data.childData) {
            recursiveAnchorProcess(callback, childData);
        }
    }

    callback(data);
}

async function getHtmlData(url) {
    const response = await axios.get(url, {
        headers: {
            'Accept': 'text/html',
            // 브라우저인 것처럼 보이기 위해 User-Agent 설정
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    });
    return response.data;
}

function convertHtmlToDOM(html) {
    return new jsdom.JSDOM(html).window.document;
}

/**
 * Spring Boot 공식 문서에서 네비게이션 데이터를 추출하는 함수
 * @param {string} baseURL - 스크래핑할 Spring Boot 문서의 기본 URL
 */
async function getSpringBootDocsNavData(baseURL) {
    // URL 끝에 슬래시가 있으면 제거하여 일관된 형식 유지
    if (baseURL.endsWith("/")) {
        baseURL = baseURL.slice(0, -1);
    }

    try {
        // 1. Spring Boot 문서 페이지에 HTTP GET 요청
        const htmlData = await getHtmlData(baseURL);

        // 2. 응답으로 받은 HTML을 DOM으로 파싱
        const sbDocDOM = convertHtmlToDOM(htmlData);

        // 3. 네비게이션 메뉴 요소 선택
        const rootNavElem = sbDocDOM.querySelector("nav.nav-menu");

        // 4. 재귀적으로 네비게이션 트리 구조 추출
        const refinedData = recursiveDepthSearch(rootNavElem, 1, { childData: [] });

        // 5. 추출된 데이터 구조 확인을 위한 로그 출력 (중첩된 객체 모두 표시)
        // console.dir(refinedData, { depth: null });

        // 6. 모든 링크에 대해 상대 경로를 절대 경로로 변환
        recursiveAnchorProcess((data) => {
            if (data.href) {
                // 상대 경로인 경우 baseURL을 앞에 추가
                data.href = baseURL + (data.href.startsWith('/') ? '' : '/') + data.href;
            }
        }, refinedData);

        return refinedData;
    } catch (error) {
        // 9. 에러 발생 시 상세 정보 출력 후 에러 전파
        console.error('Spring Boot 문서를 가져오는 중 오류가 발생했습니다:', error);
        throw error;
    }
}

function getArticleTitle(articleElem) {
    return articleElem.querySelector("h1#page-title").textContent.trim();
}

function getArticleBreadcrumbs(articleElem) {
    const breadcrumbs = [];
    articleElem.querySelectorAll("nav.breadcrumbs > ul > li").forEach(li => {
        breadcrumbs.push(li.textContent.trim());
    });
    return breadcrumbs.join(" > ");
}

async function getSpringBootDocsArticleData(url) {
    try {
        const htmlData = await getHtmlData(url);
        const docDOM = convertHtmlToDOM(htmlData);
        const articleElem = docDOM.querySelector("article.doc");

        if (!articleElem) {
            throw new Error('문서 요소를 찾을 수 없습니다.');
        }

        const title = getArticleTitle(articleElem);
        const breadcrumbs = getArticleBreadcrumbs(articleElem);
        const content = articleElem.innerHTML;

        return {
            url,
            title,
            breadcrumbs,
            content
        };
    } catch (error) {
        console.error(`\n❌ 문서 처리 중 오류 발생 (${url}):`, error.message);
        throw error;
    }
}

async function main() {
    console.log('📜 문서를 저장할 디렉토리가 존재하지 않으면 생성합니다...');
    try {
        await fs.mkdir(exportDir, { recursive: true });
        await fs.mkdir(articlesDir, { recursive: true });
        console.log('✅ 문서를 저장할 디렉토리가 생성되었습니다\n');
    } catch (err) {
        if (err.code !== 'EEXIST') throw err;
        console.log('📜 문서를 저장할 디렉토리가 이미 존재합니다.');
    }

    console.log('🚀 Spring Boot 문서 스크래핑을 시작합니다...\n');

    // 1. 네비게이션 데이터 추출
    console.log('📂 네비게이션 데이터를 추출하는 중...');
    const refinedData = await getSpringBootDocsNavData("https://docs.spring.io/spring-boot");
    console.log('✅ 네비게이션 데이터 추출 완료\n');

    // 2. 네비게이션 데이터를 파일로 저장
    console.log('📂 네비게이션 데이터를 파일로 저장하는 중...');
    await fs.writeFile(`${exportDir}/nav-data.json`, JSON.stringify(refinedData, null, 2), 'utf8');
    console.log(`✅ 네비게이션 데이터를 파일로 저장했습니다: ${exportDir}/nav-data.json\n`);

    // 3. 추출할 문서 URL 수집
    console.log('📄 문서 URL을 수집하는 중...');
    const articleUrls = [];
    recursiveAnchorProcess((data) => {
        if (data.href && !data.external) {
            articleUrls.push(data.href);
        }
    }, refinedData);

    // 4. 진행 상황 추적을 위한 프로그레스 바 초기화
    const progress = new ProgressBar(articleUrls.length);
    let completedCount = 0;

    console.log(`📄 총 ${articleUrls.length}개의 문서를 처리합니다.\n`);

    // 5. 문서 처리 (병렬 처리 제한)
    const BATCH_SIZE = 5; // 동시에 처리할 문서 수
    const articleDataArr = [];

    for (let i = 0; i < articleUrls.length; i += BATCH_SIZE) {
        const batch = articleUrls.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(url =>
            getSpringBootDocsArticleData(url)
                .then(articleData => {
                    completedCount++;
                    progress.update(completedCount);
                    return articleData;
                })
                .catch(error => {
                    console.error(`\n❌ 문서 처리 중 오류 발생 (${url}):`, error.message);
                    completedCount++;
                    progress.update(completedCount);
                    return null; // 오류 발생 시 null 반환
                })
        );

        const batchResults = await Promise.all(batchPromises);
        // null이 아닌 결과만 추가
        articleDataArr.push(...batchResults.filter(Boolean));

        // 배치 간 약간의 지연 추가 (서버 부하 방지)
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 6. 결과 저장
    console.log('\n💾 문서 데이터를 저장하는 중...');

    const allArticleData = {};
    const savePromises = articleDataArr.map((articleData, index) => {
        // 모든 문서 데이터 전용용
        allArticleData[articleData.title] = {
            url: articleData.url,
            breadcrumbs: articleData.breadcrumbs,
            content: articleData.content
        };

        // 파일명에서 유효하지 않은 문자 제거
        const safeTitle = articleData.title.replace(/[^\w\s-]/g, '_');
        const filename = `${articlesDir}/${index + 1}_${safeTitle}.json`;
        return fs.writeFile(filename, JSON.stringify(articleData, null, 2), 'utf8');
    });
    await Promise.all(savePromises);

    // 모든 문서 데이터를 JSON 파일로 저장
    await fs.writeFile(`${exportDir}/articles.json`, JSON.stringify(allArticleData, null, 2), 'utf8');

    console.log(`\n🎉 모든 작업이 완료되었습니다! 총 ${articleDataArr.length}개의 문서가 저장되었습니다.`);
    console.log(`📂 저장 위치: ${exportDir}`);
    console.log(`📄 네비게이션 데이터: ${exportDir}/nav-data.json`);
    console.log(`📄 문서 데이터: ${articlesDir}/`);
    console.log(`📄 모든 문서 데이터: ${exportDir}/articles.json`);
}

main();
