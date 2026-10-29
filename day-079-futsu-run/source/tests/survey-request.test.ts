import { describe, expect, it } from "vitest";
import { publicSurveyUrl } from "../src/lib/survey-request";

describe("public survey request destinations", () => {
  it("leaves missing and malformed destinations unconfigured", () => {
    for (const value of [
      undefined,
      "",
      "   ",
      "not a url",
      "/survey",
      "//forms.google.com/example",
    ])
      expect(publicSurveyUrl(value)).toBeNull();
  });
  it("accepts valid external HTTPS form and DM links", () => {
    expect(publicSurveyUrl("https://forms.gle/example")).toBe(
      "https://forms.gle/example",
    );
    expect(publicSurveyUrl("https://www.instagram.com/example/")).toBe(
      "https://www.instagram.com/example/",
    );
    expect(
      publicSurveyUrl("https://example.com/form?q=hello%20world#topic"),
    ).toBe("https://example.com/form?q=hello%20world#topic");
  });
  it("rejects active-content and insecure URL schemes", () => {
    for (const value of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "http://forms.gle/example",
      "file:///etc/passwd",
      "mailto:team@example.com",
      "ftp://example.com/form",
    ])
      expect(publicSurveyUrl(value)).toBeNull();
  });
  it("rejects credentials embedded in HTTPS links", () => {
    for (const value of [
      "https://user:password@example.com/form",
      "https://forms.google.com@evil.example/form",
      "https://user@example.com",
    ])
      expect(publicSurveyUrl(value)).toBeNull();
  });
});
