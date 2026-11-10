const { getConfig } = require("expo/config");
const { configurationErrors } = require("../config/nativeGoogle.cjs");

require("@expo/env").load(process.cwd(), { silent: true });
const platform = process.argv[2];
const { exp } = getConfig(process.cwd());
const errors = configurationErrors(exp, platform);
if (errors.length) {
  errors.forEach((message) => console.error(message));
  process.exitCode = 1;
} else {
  console.log(`${platform} 앱 식별자: ${platform === "ios" ? exp.ios.bundleIdentifier : exp.android.package}`);
  console.log("로컬 설정 형식 확인 완료. Firebase 앱 등록과 Android 서명 SHA-1은 별도로 확인해야 합니다.");
}
