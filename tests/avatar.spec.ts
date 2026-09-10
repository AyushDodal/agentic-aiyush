import { expect, test, type Page } from '@playwright/test';

const mockHealth = { status: 'ok', resume_ready: true, mode: 'openai', voice: 'openai', documents: ['fixture.md'], chunks: 2 };

async function setup(page: Page) {
  await page.route('**/api/health', (route) => route.fulfill({ json: mockHealth }));
  await page.route('**/api/chat', (route) => route.fulfill({ json: {
    answer: 'I build Python services and document retrieval systems.', grounded: true, mode: 'openai',
    sources: [{ id: 'fixture-1', document: 'fixture.md', page: 1, text: 'Fictional test fixture: Python services and document retrieval systems.' }],
  } }));
  await page.goto('/');
  await expect(page.getByText('Resume connected')).toBeVisible();
  await page.getByRole('switch', { name: 'Spoken answers' }).click();
}

test('avatar renders pixels, moves, and fits the viewport', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await setup(page);
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement) => {
    const gl = node.getContext('webgl2');
    if (!gl) return 0;
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let visible = 0;
    for (let index = 0; index < pixels.length; index += 16) if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 80 && pixels[index + 3] > 20) visible++;
    return visible;
  })).toBeGreaterThan(1000);
  const before = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await canvas.hover({ position: { x: 30, y: 40 } });
  await expect.poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())).not.toBe(before);
  const bounds = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
  expect(bounds.content).toBeLessThanOrEqual(bounds.viewport);
  const title = await page.getByRole('heading', { name: 'Ayush Dodal.', exact: true }).boundingBox();
  const scene = await canvas.boundingBox();
  expect(title!.y + title!.height).toBeLessThan(scene!.y + scene!.height / 2);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-initial.png`, fullPage: true });
});

test('conversation, sources, download, settings and reset work', async ({ page }, testInfo) => {
  await setup(page);
  await page.getByRole('button', { name: 'Experience', exact: true }).click();
  await expect(page.getByText('I build Python services and document retrieval systems.', { exact: true })).toBeVisible();
  await page.getByText('1 resume source', { exact: true }).click();
  await expect(page.getByText('Fictional test fixture: Python services and document retrieval systems.', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Your question' }).fill('Tell me more about that.');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByText('Tell me more about that.', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download conversation' }).click();
  expect((await download).suggestedFilename()).toBe('conversation-with-ayush.txt');
  await page.getByRole('button', { name: 'Voice and animation settings' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('combobox', { name: 'Voice provider' }).selectOption('browser');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.screenshot({ path: `test-results/${testInfo.project.name}-conversation.png`, fullPage: true });
  await page.getByRole('button', { name: 'New conversation' }).click();
  await expect(page.getByRole('button', { name: 'Experience', exact: true })).toBeVisible();
  await expect(page.getByText('Tell me more about that.', { exact: true })).not.toBeVisible();
});

test('failed requests retain the question and can be retried', async ({ page }) => {
  await setup(page);
  await page.route('**/api/chat', (route) => route.fulfill({ status: 503, json: { detail: 'Temporarily unavailable.' } }));
  await page.getByRole('textbox', { name: 'Your question' }).fill('What did you study?');
  await page.getByRole('button', { name: 'Send question' }).click();
  await expect(page.getByRole('alert')).toContainText('Temporarily unavailable.');
  await expect(page.getByRole('textbox', { name: 'Your question' })).toHaveValue('What did you study?');
  await page.route('**/api/chat', (route) => route.fulfill({ json: { answer: 'My resume records my education.', sources: [], mode: 'openai' } }));
  await page.getByRole('button', { name: 'Retry question' }).click();
  await expect(page.getByText('My resume records my education.', { exact: true })).toBeVisible();
});

test('reset discards in-flight answers', async ({ page }) => {
  await setup(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/chat', async (route) => { await pending; await route.fulfill({ json: { answer: 'Stale response', sources: [], mode: 'openai' } }).catch(() => {}); });
  await page.getByRole('button', { name: 'Experience', exact: true }).click();
  await expect(page.getByText('Looking through my resume')).toBeVisible();
  await page.getByRole('button', { name: 'New conversation' }).click();
  release();
  await expect(page.getByText('Stale response', { exact: true })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Experience', exact: true })).toBeEnabled();
});

test('microphone denial leaves text input usable', async ({ page }) => {
  await page.addInitScript(() => {
    if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')) });
  });
  await setup(page);
  await page.getByRole('button', { name: 'Start voice question' }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone access was denied');
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeEnabled();
});

test('oversized recordings are rejected without an upload', async ({ page }) => {
  let uploads = 0;
  await page.route('**/api/transcribe', (route) => { uploads++; return route.fulfill({ json: { text: 'Must not be sent' } }); });
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => ({ getTracks: () => [{ stop() {} }] }) });
    class FakeRecorder {
      static isTypeSupported() { return true; }
      state = 'inactive';
      mimeType = 'audio/webm';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = 'recording';
        setTimeout(() => this.ondataavailable?.({ data: new Blob([new Uint8Array(4_000_001)], { type: 'audio/webm' }) }), 10);
      }
      stop() { this.state = 'inactive'; setTimeout(() => this.onstop?.(), 0); }
    }
    Object.defineProperty(window, 'MediaRecorder', { value: FakeRecorder });
  });
  await setup(page);
  await page.getByRole('button', { name: 'Start voice question' }).click();
  await expect(page.getByRole('alert')).toContainText('The recording is too large');
  await expect(page.getByRole('textbox', { name: 'Your question' })).toBeEnabled();
  expect(uploads).toBe(0);
});
