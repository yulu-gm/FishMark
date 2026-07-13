const BACKGROUND_SWITCHES = [
  "disable-background-timer-throttling",
  "disable-renderer-backgrounding",
  "disable-backgrounding-occluded-windows"
];

function configurePaintableOffscreenTestApp(app) {
  for (const chromiumSwitch of BACKGROUND_SWITCHES) {
    app.commandLine.appendSwitch(chromiumSwitch);
  }
}

function createPaintableOffscreenTestWindow(BrowserWindow) {
  return new BrowserWindow({
    width: 1280,
    height: 900,
    show: true,
    skipTaskbar: true,
    x: -10000,
    y: -10000,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
}

module.exports = {
  configurePaintableOffscreenTestApp,
  createPaintableOffscreenTestWindow
};
