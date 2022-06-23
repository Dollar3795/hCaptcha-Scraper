import crypto from "crypto";
import fetch from "node-fetch";
import fs from "fs";
import playwright from "playwright";
import unhomoglyph from "unhomoglyph";

const minimumProbability = 90;
const flag = true; // BROKEN
const blankImage = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xC2, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x01, 0x3F, 0x10]);

if (!fs.existsSync("captchas")) fs.mkdirSync("captchas");
if (!fs.existsSync("captchas/flag")) fs.mkdirSync("captchas/flag");
if (!fs.existsSync("captchas/unflag")) fs.mkdirSync("captchas/unflag");

(async function() {
    const browser = await playwright.chromium.launch({"headless": true});
    const context = await browser.newContext({"viewport": null});
    await context.addInitScript(`Object.defineProperty(navigator, "webdriver", {"get": () => ${flag}});`);
    const page = await context.newPage();
    await page.goto("https://accounts.hcaptcha.com/demo?sitekey=4c672d35-0701-42b2-88c3-78380b0db560", {"waitUntil": "networkidle"});

    await page.route("**/*", function(route, request) {
        if (request.url().startsWith("https://imgs.hcaptcha.com/")) return route.fulfill({"body": blankImage});
        return route.continue();
    });

    page.on("response", async function(response) {
        if (response.url() === "https://hcaptcha.com/getcaptcha?s=4c672d35-0701-42b2-88c3-78380b0db560") {
            const resp = await response.json();
            if (!resp) return;
            if (!resp.requester_question) return;
            if (!resp.tasklist) return;

            const taskQuestion = unhomoglyph(resp.requester_question.en.replace(/Please click each image containing an? /, "")).replace(/rn/g, "m");
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
    });

    await page.waitForSelector("[title='widget containing checkbox for hCaptcha security challenge']");
    await page.click("[title='widget containing checkbox for hCaptcha security challenge']");

    const captchaFrame = await page.waitForSelector("[title='Main content of the hCaptcha challenge']").then(frame => frame.contentFrame());

    while (true) {
        await new Promise(resolve => setTimeout(resolve, 60000));
        await captchaFrame.click(".refresh");
    }
})();