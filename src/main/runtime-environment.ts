import path from "node:path";

const DEV_APP_NAME = "Yulora Dev";
const DEV_USER_DATA_DIRNAME = "Yulora-dev";

type AppLike = {
  setName: (name: string) => void;
  getPath: (name: "appData") => string;
  setPath: (name: "userData", value: string) => void;
};

export function shouldRequestSingleInstanceLock(env: NodeJS.ProcessEnv): boolean {
  void env;
  return true;
}

export function configureMainProcessRuntime(app: AppLike, env: NodeJS.ProcessEnv): void {
  if (!isDevRuntime(env)) {
    return;
  }

  app.setName(DEV_APP_NAME);
  app.setPath("userData", path.join(app.getPath("appData"), DEV_USER_DATA_DIRNAME));
}

function isDevRuntime(env: NodeJS.ProcessEnv): boolean {
  return typeof env.VITE_DEV_SERVER_URL === "string" && env.VITE_DEV_SERVER_URL.length > 0;
}
