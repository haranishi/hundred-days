import { test, expect } from "@playwright/test";

test("drag reversals follow the latest deliberate movement before the gate", async ({page}) => {
  await page.goto("/");
  await page.getByRole("button", {name:"みんなと走る",exact:true}).click();
  const left=page.getByRole("button", {name:"左のゲート：言う",exact:true});
  const right=page.getByRole("button", {name:"右のゲート：言わない",exact:true});
  await expect(left).toBeEnabled();
  await page.mouse.move(300,430);await page.mouse.down();
  await expect(right).toHaveAttribute("aria-pressed","true");
  await page.mouse.move(180,430,{steps:6});
  await expect(left).toHaveAttribute("aria-pressed","true");
  // This remains left of the initial x300, but the last movement is clearly right.
  await page.mouse.move(260,430,{steps:4});
  await expect(right).toHaveAttribute("aria-pressed","true");
  // Tiny movement is not a fresh swipe in the other direction.
  await page.mouse.move(255,430);
  await expect(right).toHaveAttribute("aria-pressed","true");
  await page.mouse.move(170,430,{steps:4});
  await expect(left).toHaveAttribute("aria-pressed","true");
  await page.mouse.up();
  await expect(page.locator(".race-viewport")).toHaveAttribute("data-question","1");
});
