import { afterAll, describe, expect, it } from "bun:test";

import { getAppPublicOrigin } from "../app-public-origin.ts";

const previousNodeEnv = process.env.NODE_ENV;
const previousAppPublicOrigin = process.env.APP_PUBLIC_ORIGIN;

function setEnv(nodeEnv, appPublicOrigin) {
  if (nodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = nodeEnv;
  }

  if (appPublicOrigin === undefined) {
    delete process.env.APP_PUBLIC_ORIGIN;
  } else {
    process.env.APP_PUBLIC_ORIGIN = appPublicOrigin;
  }
}

afterAll(() => {
  setEnv(previousNodeEnv, previousAppPublicOrigin);
});

describe("getAppPublicOrigin", () => {
  it("accepts stats.cleoai.cloud in production", () => {
    setEnv("production", "https://stats.cleoai.cloud");

    expect(getAppPublicOrigin()).toBe("https://stats.cleoai.cloud");
  });

  it("accepts stats-dev.cleoai.cloud in production", () => {
    setEnv("production", "https://stats-dev.cleoai.cloud");

    expect(getAppPublicOrigin()).toBe("https://stats-dev.cleoai.cloud");
  });

  it("rejects unapproved hostnames in production", () => {
    setEnv("production", "https://preview.example.com");

    expect(() => getAppPublicOrigin()).toThrow(
      /APP_PUBLIC_ORIGIN must use one of stats\.cleoai\.cloud, stats-dev\.cleoai\.cloud in production/,
    );
  });
});
