import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
      socket: { remoteAddress: "127.0.0.1" },
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("search.cases", () => {
  it("returns results for matching name", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.search.cases({ name: "王小明" });

    expect(result).toHaveProperty("found");
    expect(result).toHaveProperty("searchedName", "王小明");
    expect(result).toHaveProperty("results");
    expect(result).toHaveProperty("disclaimer");
    expect(Array.isArray(result.results)).toBe(true);
  });

  it("returns empty results for non-matching name", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.search.cases({ name: "不存在的人名XYZ" });

    expect(result.found).toBe(false);
    expect(result.results).toHaveLength(0);
  });

  it("filters by area when provided", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.search.cases({ 
      name: "王", 
      area: "台北市" 
    });

    expect(result).toHaveProperty("results");
    // 如果有結果，確認都是台北市的
    if (result.results.length > 0) {
      result.results.forEach(r => {
        expect(r.case.location).toContain("台北");
      });
    }
  });
});

describe("search.areas", () => {
  it("returns available areas", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.search.areas();

    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toBe("全部地區");
  });
});

describe("report.submit", () => {
  it("submits a report successfully", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.report.submit({
      suspectName: "測試人員",
      location: "測試地點",
      description: "這是一個測試通報，用於驗證系統功能是否正常運作。",
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("通報已送出");
  });

  it("rejects report with short description", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.report.submit({
        suspectName: "測試",
        description: "太短",
      })
    ).rejects.toThrow();
  });
});
