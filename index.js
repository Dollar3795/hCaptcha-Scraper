import crypto from "crypto";
import fetch from "node-fetch";
import fs from "fs";
import playwright from "playwright";
import unhomoglyph from "unhomoglyph";
import {path} from "ghost-cursor";

const useClassifier = false; // USE CLASSIFIER (AI) BEFORE SAVING
const refreshInterval = 60; // IN SECONDS
const minimumProbability = 90; // MINIMUM PROBABILITY IN % FOR AI
const flag = false; // NOT GUARANTEED 100%; YOU WILL GET FLAGGED AFTER SOME MINUTES
const replaceImage = false; // REPLACE TASK IMAGES WITH BLANK IMAGE

const blankImage = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xC2, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x01, 0x3F, 0x10]);

if (!fs.existsSync("captchas")) fs.mkdirSync("captchas");
if (!fs.existsSync("captchas/flag")) fs.mkdirSync("captchas/flag");
if (!fs.existsSync("captchas/unflag")) fs.mkdirSync("captchas/unflag");
if (!fs.existsSync("captchas/unknown")) fs.mkdirSync("captchas/unknown");

(async function() {
    const browser = await playwright.chromium.launch({"headless": false});
    const context = await browser.newContext({"viewport": null});
    await context.addInitScript(`Object.defineProperty(navigator, "webdriver", {"get": () => ${flag}});`);
    const page = await context.newPage();
    await page.goto("https://accounts.hcaptcha.com/demo?sitekey=4c672d35-0701-42b2-88c3-78380b0db560", {"waitUntil": "networkidle"});

    if (replaceImage) {
            await page.route("**/*", function(route, request) {
            if (request.url().startsWith("https://imgs.hcaptcha.com/")) return route.fulfill({"body": blankImage});
            return route.continue();
        });
    }

    page.on("response", async function(response) {
        if (response.url() === "https://hcaptcha.com/getcaptcha?s=4c672d35-0701-42b2-88c3-78380b0db560") {
            const resp = await response.json();
            if (!resp) return;
            if (!resp.requester_question) return;
            if (!resp.tasklist) return;

            const taskQuestion = unhomoglyph(resp.requester_question.en.replace(/Please click each image containing an? /, "")).replace(/rn/g, "m");
            if (useClassifier) {
                const captchaData = await fetch("http://api.dollarnoob.com:6000/api/hCaptchaGrid", {"body": JSON.stringify({"images": resp.tasklist.map(task => task.datapoint_uri).concat(resp.requester_question_example)}), "headers": {"content-type": "application/json"}, "method": "POST"}).then(res => res.json()).catch(() => null);
                if (!captchaData) return;
                if (!captchaData.success) return;

                for (var i = 0; i < captchaData.predictions.length; i++) {
                    const prediction = captchaData.predictions[i];
                    if (prediction.probability >= minimumProbability) {
                        if (i > 8) {
                            if (taskQuestion === prediction.prediction) {
                                if (!fs.existsSync("captchas/unflag/" + prediction.prediction)) fs.mkdirSync("captchas/unflag/" + prediction.prediction);
                                fs.writeFileSync(`captchas/unflag/${prediction.prediction}/${crypto.randomUUID()}.jpg`, Buffer.from(await fetch(resp.requester_question_example[i - 9]).then(res => res.arrayBuffer())));
                                console.log(`\x1b[1m\x1b[32m[+] Unflagged Image Saved | Question: ${taskQuestion} | Prediction: ${prediction.prediction} | Probability: ${prediction.probability}%\x1b[0m`);
                            }
                            else console.log(`\x1b[1m\x1b[31m[-] Image Failed | Question: ${taskQuestion} | Prediction: ${prediction.prediction} | Probability: ${prediction.probability}%\x1b[0m`);
                        }
                        else {
                            if (!fs.existsSync("captchas/flag/" + prediction.prediction)) fs.mkdirSync("captchas/flag/" + prediction.prediction);
                            fs.writeFileSync(`captchas/flag/${prediction.prediction}/${crypto.randomUUID()}.jpg`, Buffer.from(await fetch(resp.tasklist[i].datapoint_uri).then(res => res.arrayBuffer())));
                            console.log(`\x1b[1m\x1b[32m[+] Flagged Image Saved | Question: ${taskQuestion} | Prediction: ${prediction.prediction} | Probability: ${prediction.probability}%\x1b[0m`);
                        }
                    }
                    else console.log(`\x1b[1m\x1b[31m[-] Image Passed | Question: ${taskQuestion} | Prediction: ${prediction.prediction} | Probability: ${prediction.probability}%\x1b[0m`);
                }
            }
            else {
                for (var i = 0; i < resp.tasklist.length; i++) {
                    const task = resp.tasklist[i];
                    const imageBuffer = Buffer.from(await fetch(task.datapoint_uri).then(res => res.arrayBuffer()));
                    if (!fs.existsSync("captchas/unknown/" + taskQuestion)) fs.mkdirSync("captchas/unknown/" + taskQuestion);
                    fs.writeFileSync(`captchas/unknown/${taskQuestion}/${crypto.randomUUID()}.jpg`, imageBuffer);
                    console.log(`\x1b[1m\x1b[32m[+] Unknown Image Saved | Question: ${taskQuestion}\x1b[0m`);
                }
            }
        }
    });

    const boxFrame = await page.waitForSelector("[title='widget containing checkbox for hCaptcha security challenge']").then(frame => frame.contentFrame());
    const boxBB = await boxFrame.waitForSelector("#anchor-wr").then(e => e.boundingBox());

    var cursorPos = {"x": 0, "y": 0};
    for (const pos of path({"x": 0, "y": 0}, {"x": boxBB.x + randomInt(0, boxBB.width), "y": boxBB.y + randomInt(0, boxBB.height)})) {
        cursorPos = pos;
        await page.mouse.move(pos.x, pos.y);
        await sleep(Math.random() * 25);
    }
    await page.mouse.down();
    await sleep(Math.random() * 100);
    await page.mouse.up();

    const captchaFrame = await page.waitForSelector("[title='Main content of the hCaptcha challenge']").then(frame => frame.contentFrame());
    const captchaBB = await captchaFrame.waitForSelector(".refresh").then(e => e.boundingBox());

    for (const pos of path(cursorPos, {"x": captchaBB.x + randomInt(0, captchaBB.width), "y": captchaBB.y + randomInt(0, captchaBB.height)})) {
        await page.mouse.move(pos.x, pos.y);
        await sleep(Math.random() * 10);
    }

    while (true) {
        await new Promise(resolve => setTimeout(resolve, refreshInterval * 1000));
        await page.mouse.down();
        await sleep(Math.random() * 100);
        await page.mouse.up();
    }
})();

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}