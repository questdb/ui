import path from "path";
import fs from "fs";
import puppeteer from "puppeteer";
import type { Page } from "puppeteer";
import { Cluster } from "puppeteer-cluster";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const baseUrl = "http://localhost:3000/";

const removeTrailingSlash = (url: string) => url.replace(/\/$/, "");

const getIntraUrls = async ({ page }: { page: Page }) => {
  const allUrls: Set<string> = new Set();

  const urls: string[] = await page.evaluate(
    ({ baseUrl }) => {
      const links = Array.from(document.querySelectorAll("a"))
        .map((link) => link.href)
        .filter((href) => href.startsWith(baseUrl));
      return links;
    },
    { baseUrl }
  );

  urls.forEach((url) => allUrls.add(url));

  return Array.from(allUrls)
    .map((url) => url.replace(/#.*$/, ""))
    .map((url) => removeTrailingSlash(url));
};

const puppeteerOptions = {
  headless: true,
  defaultViewport: {
    width: 1920,
    height: 1080,
  },
};

const fileExists = async (p: string) => {
  try {
    fs.lstatSync(path.join(__dirname, p));
    return true;
  } catch (e) {
    return false;
  }
};

const getAllLinks = async () => {
  const browser = await puppeteer.launch(puppeteerOptions);
  const page = await browser.newPage();

  const queue = [removeTrailingSlash(baseUrl)];
  const urlsToScreenshot: Set<string> = new Set();

  while (queue.length) {
    const currentUrl = removeTrailingSlash(queue.shift());
    console.log(`visiting ${currentUrl}`);
    await page.goto(currentUrl);
    const urls = (await getIntraUrls({ page })).filter(
      (url) =>
        !queue.includes(url) &&
        !urlsToScreenshot.has(url) &&
        url !== removeTrailingSlash(baseUrl) &&
        url !== currentUrl
    );

    urlsToScreenshot.add(currentUrl);
    queue.unshift(...urls.filter((url) => !urlsToScreenshot.has(url)));
  }

  await browser.close();

  fs.writeFileSync(
    path.join(__dirname, "links"),
    Array.from(urlsToScreenshot).join("\n"),
    "utf8"
  );
};

const screenshot = async ({ urls }: { urls: string[] }) => {
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_PAGE,
    maxConcurrency: 10,
    // @ts-ignore
    puppeteerOptions,
  });

  await cluster.task(async ({ page, data: url }) => {
    await page.goto(url);

    const screenshotFileName = `${url
      .replace(baseUrl, "")
      .replace(new RegExp(/\//, "g"), "-")}.png`;

    console.log(`screenshotting ${url}`);
    await page.screenshot({
      path: path.join(__dirname, "checkpoints", screenshotFileName),
      fullPage: true,
    });
  });

  urls.forEach((url) => cluster.queue(url));

  await cluster.idle();
  await cluster.close();
};

const compareScreenshots = async ({
  checkpoints,
  baselines,
}: {
  checkpoints: string[];
  baselines: string[];
}) => {
  const queue = [...checkpoints];
  const diffs = [];
  while (queue.length) {
    const checkpoint = queue.shift();
    const baseline = baselines.find((baseline) => baseline === checkpoint);

    const checkpointPath = path.join(__dirname, "checkpoints", checkpoint);
    const baselinePath = path.join(__dirname, "baselines", checkpoint);

    if (!baseline) {
      console.log(`checkpoint ${checkpoint} has no baseline`);
      fs.copyFileSync(checkpointPath, baselinePath);
      continue;
    }

    const checkpointImg = PNG.sync.read(fs.readFileSync(checkpointPath));
    const baselineImg = PNG.sync.read(fs.readFileSync(baselinePath));

    if (
      checkpointImg.width !== baselineImg.width ||
      checkpointImg.height !== baselineImg.height
    ) {
      console.log("checkpoint and baseline are different sizes!");
      console.log({ checkpointPath, baselinePath });
      continue;
    }

    process.stdout.write(`Diffing ${checkpoint}\r`);

    const diff = new PNG({
      width: checkpointImg.width,
      height: checkpointImg.height,
    });

    const diffPixels = pixelmatch(
      checkpointImg.data,
      baselineImg.data,
      diff.data,
      checkpointImg.width,
      checkpointImg.height,
      {
        threshold: 0.4,
        includeAA: false,
      }
    );

    if (diffPixels > 500) {
      diffs.push(checkpoint);
      fs.writeFileSync(
        path.join(__dirname, "diffs", checkpoint),
        PNG.sync.write(diff)
      );
    }
  }

  if (diffs.length) {
    console.log("Diffs found:\n\n");
    diffs.forEach((diff) => {
      console.log(diff);
    });
  }
};

(async () => {
  if (!(await fileExists("links"))) {
    await getAllLinks();
  }

  await screenshot({
    urls: fs
      .readFileSync(path.join(__dirname, "links"), "utf8")
      .trim()
      .split("\n"),
  });

  await compareScreenshots({
    checkpoints: fs.readdirSync(path.join(__dirname, "checkpoints")),
    baselines: fs.readdirSync(path.join(__dirname, "baselines")),
  });
})();
