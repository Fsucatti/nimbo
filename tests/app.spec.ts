import { expect, test } from "@playwright/test";
import { mockServices, PLACE_URL, watchErrors } from "./mocks";

test("shows the current weather for the place in the link", async ({ page }) => {
  const errors = watchErrors(page);
  await mockServices(page);
  await page.goto(PLACE_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Buenos Aires" })).toBeVisible();
  await expect(page.locator(".hero-temp")).toBeVisible();
  await expect(page.locator(".hero-summary p").first()).toHaveText(/\.$/);
  await expect(page.getByRole("region", { name: "Next 24 hours" }).getByText("Now")).toBeVisible();
  await expect(page).toHaveTitle("Buenos Aires weather – Nimbo");
  expect(errors).toEqual([]);
});

test("a first visit without a link opens on the visitor's approximate area", async ({ page }) => {
  await mockServices(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Madrid" })).toBeVisible();
  await expect(page.getByText("approximate area")).toBeVisible();
  await expect(page).toHaveURL(/lat=40\.4168/);
});

test("search finds places and opens the chosen one", async ({ page }) => {
  await mockServices(page);
  await page.goto(PLACE_URL);
  const search = page.getByRole("combobox", { name: "Search for a place" });
  await search.fill("Cordoba");
  const options = page.getByRole("option");
  await expect(options.first()).toContainText("Córdoba");
  await expect(options.nth(1)).toContainText("Spain");
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Córdoba" })).toBeVisible();
  await expect(page).toHaveURL(/country=Spain/);
});

test("units switch to Fahrenheit and stay after a reload", async ({ page }) => {
  await mockServices(page);
  await page.goto(PLACE_URL);
  const temperature = page.locator(".hero-temp");
  const celsius = await temperature.getAttribute("aria-label");
  expect(celsius).toContain("Celsius");
  await page.getByRole("button", { name: "Units and display" }).click();
  await page.getByRole("button", { name: "°F" }).click();
  await expect(temperature).toHaveAttribute("aria-label", /Fahrenheit/);
  await page.reload();
  await expect(page.locator(".hero-temp")).toHaveAttribute("aria-label", /Fahrenheit/);
});

test("a place can be saved and reopened from the list", async ({ page }) => {
  await mockServices(page);
  await page.goto(PLACE_URL);
  await page.getByRole("button", { name: "Save Buenos Aires" }).click();
  await expect(page.getByRole("button", { name: "Remove Buenos Aires from saved places" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Saved places", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Saved places" });
  await expect(panel.getByText("Buenos Aires", { exact: true })).toBeVisible();
  await expect(panel.locator(".saved-temp")).toHaveText("22°");
  await panel.getByRole("button", { name: "Remove Buenos Aires" }).click();
  await expect(panel.getByText("Save a place with the star")).toBeVisible();
});

test("the hourly chart moves with the arrow keys and has a table view", async ({ page }) => {
  await mockServices(page);
  await page.goto(PLACE_URL);
  const readout = page.locator(".readout-time strong");
  await expect(readout).toHaveText("Now");
  await page.getByRole("group", { name: /Hourly forecast chart/ }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(readout).not.toHaveText("Now");
  await page.locator("#hourly").getByRole("button", { name: "Show table" }).click();
  await expect(page.locator("#hourly table tbody tr")).toHaveCount(49);
});

test("chart tracks can be turned on and off", async ({ page }) => {
  await mockServices(page);
  await page.goto(PLACE_URL);
  const pressure = page.getByRole("button", { name: "Pressure" });
  await expect(pressure).toHaveAttribute("aria-pressed", "false");
  await pressure.click();
  await expect(page.locator(".track-label", { hasText: "Pressure at sea level" })).toBeVisible();
  await page.getByRole("button", { name: "7 days" }).click();
  await expect(page.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
});

test("a day opens to show its hours and details", async ({ page }) => {
  await mockServices(page);
  await page.goto(PLACE_URL);
  const firstDay = page.locator(".day-row").first();
  await firstDay.click();
  await expect(firstDay).toHaveAttribute("aria-expanded", "true");
  const details = page.locator(".day-details");
  await expect(details.getByText("Sunrise")).toBeVisible();
  await expect(details.getByRole("img", { name: /Hourly temperature and precipitation/ })).toBeVisible();
});

test("air quality shows its category and pollutants", async ({ page }) => {
  await mockServices(page);
  await page.goto(PLACE_URL);
  const air = page.locator("#air");
  await air.scrollIntoViewIfNeeded();
  await expect(air.locator(".air-category")).toHaveText(/Good|Moderate/);
  await expect(air.getByText("Fine particles (PM2.5)")).toBeVisible();
  await air.getByRole("button", { name: "European AQI" }).click();
  await expect(air.locator(".aqi-name")).toHaveText("European AQI");
});

test("climate compares the season with 30 years of normals", async ({ page }) => {
  const log = await mockServices(page);
  await page.goto(PLACE_URL);
  const climate = page.locator("#climate");
  await climate.scrollIntoViewIfNeeded();
  await expect(climate.getByText("Last 30 days", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(climate.getByText("A year ago today")).toBeVisible();
  // 30 years of normals plus the same day last year.
  expect(log.archive).toBe(31);
  // Normals are kept in the browser, so a second visit needs no archive requests for them.
  await page.reload();
  await page.locator("#climate").scrollIntoViewIfNeeded();
  await expect(page.locator("#climate").getByText("Last 30 days", { exact: true })).toBeVisible({ timeout: 15_000 });
  expect(log.archive).toBe(32);
});

test("the model comparison lists every model for the chosen day", async ({ page }) => {
  await mockServices(page);
  await page.goto(PLACE_URL);
  const models = page.locator("#models");
  await models.scrollIntoViewIfNeeded();
  await expect(models.getByText("ECMWF IFS")).toBeVisible();
  await expect(models.locator(".model-item")).toHaveCount(9);
  await models.getByRole("button", { name: /GFS/ }).click();
  await expect(models.locator(".model-focus-line")).toBeVisible();
});

test("the sea section appears for coastal places, with tides", async ({ page }) => {
  await mockServices(page, { coastal: true });
  await page.goto(PLACE_URL);
  const sea = page.locator("#sea");
  await sea.scrollIntoViewIfNeeded();
  await expect(sea.getByRole("heading", { name: "At sea" })).toBeVisible();
  await expect(sea.locator(".tides li").first()).toContainText(/High water|Low water/);
});

test("the sea section stays hidden inland", async ({ page }) => {
  await mockServices(page);
  await page.goto(PLACE_URL);
  await expect(page.locator(".day-row").first()).toBeVisible();
  await expect(page.locator("#sea")).toHaveCount(0);
});

test("the radar loads its frames and offers the forecast for a clicked point", async ({ page }) => {
  const log = await mockServices(page);
  await page.goto(PLACE_URL);
  const radar = page.locator("#radar");
  await radar.scrollIntoViewIfNeeded();
  await expect(radar.getByRole("button", { name: "Play the last hour" })).toBeEnabled({ timeout: 15_000 });
  await page.locator(".radar-map canvas").click({ position: { x: 200, y: 160 } });
  await page.getByRole("button", { name: "Show the weather here" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Rosario" })).toBeVisible();
  expect(log.nominatim).toBe(1);
});

test("when the forecast fails, it explains and offers to try again", async ({ page }) => {
  await mockServices(page);
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 503, body: "busy" }));
  await page.goto(PLACE_URL);
  await expect(page.getByRole("alert")).toContainText("The weather service had a problem", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("unknown pages still open the app", async ({ page }) => {
  await mockServices(page);
  const response = await page.goto("/some/old/link");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("the phone layout has no sideways scroll and the sections fit @mobile", async ({ page }) => {
  const errors = watchErrors(page);
  await mockServices(page, { coastal: true });
  await page.goto(PLACE_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Buenos Aires" })).toBeVisible();
  for (const id of ["hourly", "days", "now", "air", "sun-moon", "plan", "climate", "models", "sea"]) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
  }
  await expect(page.locator("#climate").getByText("Last 30 days", { exact: true })).toBeVisible({ timeout: 15_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
