import fetch from "node-fetch";
import fs from "fs";
import playwright from "playwright";

var i = 0;
const blankImage = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xC2, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x01, 0x3F, 0x10]);

if (!fs.existsSync("./captchas")) fs.mkdirSync("./captchas");

(async function() {
    const browser = await playwright.firefox.launch({"headless": false});
    const context = await browser.newContext({"viewport": null});
    await context.addInitScript('Object.defineProperty(navigator, "webdriver", {"get": () => false})');
    const page = await context.newPage();
    await page.goto("https://accounts.hcaptcha.com/demo?sitekey=4c672d35-0701-42b2-88c3-78380b0db560", {"waitUntil": "networkidle0"});

    await page.route("**/*", function(route, request) {
        if (request.url().startsWith("https://imgs.hcaptcha.com/")) route.fulfill({"body": blankImage});
        else route.continue();
    });

    page.on("response", async function(response) {
        if (response.url() === "https://hcaptcha.com/getcaptcha?s=4c672d35-0701-42b2-88c3-78380b0db560") {
            const resp = await response.json();
            const taskQuestion = resp.requester_question.en.replace(/Please click each image containing an? /, "");
            if (!fs.existsSync("./captchas/" + taskQuestion)) fs.mkdirSync("./captchas/" + taskQuestion);
            resp.tasklist.forEach(async function(task) {
                fs.writeFileSync(`./captchas/${taskQuestion}/${task.task_key}.jpg`, Buffer.from(await fetch(task.datapoint_uri).then(res => res.arrayBuffer())));
                i++;
                console.log(`Image ${i} - ${taskQuestion} - Saved Image ${task.task_key}!`);
            });
        }
    });

    await page.waitForSelector("[title='widget containing checkbox for hCaptcha security challenge']");
    await sleep(500);
    await page.click("[title='widget containing checkbox for hCaptcha security challenge']");

    var captchaFrame = await page.waitForSelector("[title='Main content of the hCaptcha challenge']", {timeout: 600000}).then(async frame => await frame.contentFrame());

    while (true) {
        await captchaFrame.click(".refresh");
        await sleep(1000);
    }
})();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
